export const meta = {
  name: 'market-scout',
  description: 'Comparative product/market research — fan out web searches per candidate, fetch sources, adversarially verify claims, score every candidate against a weighted rubric, return a ranked scorecard with citations.',
  whenToUse: 'When you need to evaluate and rank N candidates (tools, models, vendors, competitors) against explicit criteria. Pass either a free-form brief or a structured {subject, candidates, criteria} object as args. The caller renders the returned scorecard as a report or writes it to a user-specified path.',
  phases: [
    { title: 'Scope', detail: 'Resolve subject, candidates, weighted criteria, and per-candidate search angles' },
    { title: 'Search', detail: 'parallel WebSearch agents — one per (candidate × angle)' },
    { title: 'Fetch', detail: 'URL-dedup, fetch top sources, extract candidate/criterion-tagged claims' },
    { title: 'Verify', detail: '3-vote adversarial verification per claim (need 2/3 refutes to kill)' },
    { title: 'Score', detail: 'Score each candidate × criterion from verified claims, weight, rank' },
  ],
}

// market-scout: Scope → pipeline(Search → URL-dedup → Fetch+Extract) → 3-vote Verify → Score
// Ported from the deep-research harness; adds candidate/criterion tagging + a weighted scorecard.
// args may be a string (free brief) OR { subject, candidates:[...], criteria:[{id,label,weight,check}] }.

const ANGLES_PER_CANDIDATE = 3   // search angles generated per candidate
const VOTES_PER_CLAIM = 3
const REFUTATIONS_REQUIRED = 2
const MAX_FETCH = 24             // global cap on sources fetched
const MAX_VERIFY_CLAIMS = 30

// ─── Schemas ───
const SCOPE_SCHEMA = {
  type: "object", required: ["subject", "candidates", "criteria", "angles"],
  properties: {
    subject: { type: "string" },
    strategy: { type: "string" },
    candidates: { type: "array", minItems: 2, maxItems: 8, items: {
      type: "object", required: ["name"],
      properties: { name: { type: "string" }, note: { type: "string" } },
    }},
    criteria: { type: "array", minItems: 2, maxItems: 8, items: {
      type: "object", required: ["id", "label", "weight"],
      properties: {
        id: { type: "string" },
        label: { type: "string" },
        weight: { type: "number" },            // relative importance, any positive scale
        check: { type: "string" },             // what evidence would satisfy this criterion
      },
    }},
    angles: { type: "array", minItems: 2, items: {
      type: "object", required: ["candidate", "label", "query"],
      properties: {
        candidate: { type: "string" },
        label: { type: "string" },
        query: { type: "string" },
      },
    }},
  },
}
const SEARCH_SCHEMA = {
  type: "object", required: ["results"],
  properties: {
    results: { type: "array", maxItems: 6, items: {
      type: "object", required: ["url", "title", "relevance"],
      properties: {
        url: { type: "string" },
        title: { type: "string" },
        snippet: { type: "string" },
        relevance: { enum: ["high", "medium", "low"] },
      },
    }},
  },
}
const EXTRACT_SCHEMA = {
  type: "object", required: ["claims", "sourceQuality"],
  properties: {
    sourceQuality: { enum: ["primary", "secondary", "blog", "forum", "unreliable"] },
    publishDate: { type: "string" },
    claims: { type: "array", maxItems: 6, items: {
      type: "object", required: ["claim", "quote", "criterionId", "importance"],
      properties: {
        claim: { type: "string" },
        quote: { type: "string" },
        criterionId: { type: "string" },        // which rubric criterion this bears on
        importance: { enum: ["central", "supporting", "tangential"] },
      },
    }},
  },
}
const VERDICT_SCHEMA = {
  type: "object", required: ["refuted", "evidence", "confidence"],
  properties: {
    refuted: { type: "boolean" },
    evidence: { type: "string" },
    confidence: { enum: ["high", "medium", "low"] },
    counterSource: { type: "string" },
  },
}
const SCORE_SCHEMA = {
  type: "object", required: ["summary", "ranking", "matrix", "caveats"],
  properties: {
    summary: { type: "string" },
    ranking: { type: "array", items: {
      type: "object", required: ["candidate", "weightedScore", "rationale"],
      properties: {
        candidate: { type: "string" },
        weightedScore: { type: "number" },
        rationale: { type: "string" },
      },
    }},
    matrix: { type: "array", items: {
      type: "object", required: ["candidate", "criterionId", "score", "evidence"],
      properties: {
        candidate: { type: "string" },
        criterionId: { type: "string" },
        score: { type: "number" },               // 0-5; -1 if no evidence
        confidence: { enum: ["high", "medium", "low", "none"] },
        evidence: { type: "string" },
        sources: { type: "array", items: { type: "string" } },
      },
    }},
    caveats: { type: "string" },
    openQuestions: { type: "array", items: { type: "string" } },
  },
}

// ─── Phase 0: Scope ───
phase("Scope")
const RAW = (typeof args === "string") ? args.trim()
  : (args && typeof args === "object") ? JSON.stringify(args) : ""
if (!RAW) {
  return { error: "No brief provided. Pass args: a string brief OR {subject, candidates, criteria}." }
}
const givenObj = (args && typeof args === "object") ? args : null

const scope = await agent(
  "You are scoping a comparative product/market research run.\n\n" +
  "## Input brief\n" + RAW + "\n\n" +
  "## Task\n" +
  "1. State the SUBJECT being compared in one line.\n" +
  "2. List the CANDIDATES to evaluate (2-8). If the brief names them, use those; otherwise infer the strongest realistic field.\n" +
  "3. Define the CRITERIA as a weighted rubric (2-8 items). If the brief gives criteria/weights, honor them verbatim; otherwise derive sensible ones. Each criterion needs a stable id (kebab-case), a label, a numeric weight (relative importance), and a `check` describing what evidence satisfies it.\n" +
  "4. Generate " + ANGLES_PER_CANDIDATE + " web-search ANGLES per candidate — distinct queries (e.g. official specs/pricing, independent benchmarks, practitioner/contrarian reports). Tag each angle with its candidate name (matching the candidates list exactly).\n\n" +
  "Make queries specific enough to surface high-signal sources. Structured output only.",
  { label: "scope", schema: SCOPE_SCHEMA }
)
if (!scope) return { error: "Scope agent returned no result — cannot plan the comparison." }

const criteriaById = new Map(scope.criteria.map(c => [c.id, c]))
const totalWeight = scope.criteria.reduce((s, c) => s + (c.weight > 0 ? c.weight : 0), 0) || 1
log("Subject: " + scope.subject)
log("Candidates: " + scope.candidates.map(c => c.name).join(", "))
log("Criteria: " + scope.criteria.map(c => c.id + "×" + c.weight).join(", "))
log("Angles: " + scope.angles.length + " searches queued")

// ─── Dedup state — accumulates as searchers complete ───
const normURL = u => {
  try {
    const p = new URL(u)
    return (p.hostname.replace(/^www\./, "") + p.pathname.replace(/\/$/, "")).toLowerCase()
  } catch { return String(u).toLowerCase() }
}
const seen = new Map()
const dupes = []
const budgetDropped = []
const relRank = { high: 0, medium: 1, low: 2 }
let fetchSlots = MAX_FETCH

// ─── Prompts ───
const SEARCH_PROMPT = (angle) =>
  "## Web Searcher — candidate: " + angle.candidate + " · angle: " + angle.label + "\n\n" +
  "Comparison subject: \"" + scope.subject + "\"\n" +
  "Search query: `" + angle.query + "`\n\n" +
  "## Task\nUse WebSearch with the query above (or a refined version). Return the top 4-6 results most relevant to evaluating **" + angle.candidate + "**.\n" +
  "Skip SEO spam/content farms. Include a short snippet on why each result matters. Structured output only."

const criteriaList = scope.criteria.map(c => "- `" + c.id + "` — " + c.label + (c.check ? " (" + c.check + ")" : "")).join("\n")
const FETCH_PROMPT = (source, candidate) =>
  "## Source Extractor — candidate under study: " + candidate + "\n\n" +
  "Comparison subject: \"" + scope.subject + "\"\n" +
  "**URL:** " + source.url + "\n**Title:** " + source.title + "\n\n" +
  "## Rubric criteria (tag each claim with one id)\n" + criteriaList + "\n\n" +
  "## Task\n1. Use WebFetch to retrieve the page.\n" +
  "2. Assess source quality: primary (vendor docs / institution / the maker), secondary (independent reporting/benchmark), blog, forum, or unreliable.\n" +
  "3. Extract 2-6 FALSIFIABLE claims about **" + candidate + "** that bear on the rubric. Each claim must:\n" +
  "   - be concrete and checkable (a number, capability, price, limitation — not vibes)\n" +
  "   - include a direct supporting quote\n" +
  "   - be tagged with the single best-fitting `criterionId` from the rubric above\n" +
  "   - be rated central/supporting/tangential\n" +
  "4. Note publish date if shown.\n\n" +
  "If fetch fails / paywalled / irrelevant, return claims: [] and sourceQuality: \"unreliable\". Structured output only."

const VERIFY_PROMPT = (claim, v) =>
  "## Adversarial Claim Verifier (voter " + (v + 1) + "/" + VOTES_PER_CLAIM + ")\n\n" +
  "Be SKEPTICAL. Try to REFUTE this claim. ≥" + REFUTATIONS_REQUIRED + "/" + VOTES_PER_CLAIM + " refutations kill it.\n\n" +
  "## Comparison subject\n" + scope.subject + "\n\n" +
  "## Claim under review (about " + claim.candidate + ", criterion " + claim.criterionId + ")\n\"" + claim.claim + "\"\n\n" +
  "**Source:** " + claim.sourceUrl + " (" + claim.sourceQuality + ")\n" +
  "**Supporting quote:** \"" + claim.quote + "\"\n\n" +
  "## Checklist\n" +
  "1. Is the claim actually supported by the quote, or an overreach/misread?\n" +
  "2. WebSearch for contradicting evidence — does a credible source dispute or heavily qualify it?\n" +
  "3. Is source quality sufficient for the claim's strength? (vendor marketing ≠ independent proof)\n" +
  "4. Is it outdated for a fast-moving field? (check dates)\n" +
  "5. Cherry-picked benchmark / press release / forum speculation?\n\n" +
  "**refuted=true** if: unsupported / contradicted / weak-source-for-strong-claim / outdated / marketing fluff.\n" +
  "**refuted=false** ONLY if well-supported, current, and source quality matches claim strength.\n" +
  "Default to refuted=true if uncertain. Structured output only; evidence MUST be specific."

// ─── Pipeline: search → dedup → fetch+extract (no barrier) ───
const searchResults = await pipeline(
  scope.angles,

  angle => agent(SEARCH_PROMPT(angle), {
    label: "search:" + angle.candidate + "/" + angle.label, phase: "Search", schema: SEARCH_SCHEMA
  }).then(r => {
    if (!r) return null
    log(angle.candidate + "/" + angle.label + ": " + r.results.length + " results")
    return { candidate: angle.candidate, results: r.results }
  }),

  searchResult => {
    const sorted = [...searchResult.results].sort((a, b) => relRank[a.relevance] - relRank[b.relevance])
    const novel = sorted.filter(r => {
      const key = normURL(r.url)
      if (seen.has(key)) { dupes.push({ ...r, dupOf: seen.get(key) }); return false }
      if (fetchSlots <= 0 && relRank[r.relevance] >= 1) { budgetDropped.push(r); return false }
      seen.set(key, { candidate: searchResult.candidate, title: r.title })
      fetchSlots--
      return true
    })
    if (novel.length < searchResult.results.length) {
      log(searchResult.candidate + ": " + novel.length + " novel (" + (searchResult.results.length - novel.length) + " filtered)")
    }
    return parallel(
      novel.map(source => () => {
        let host = "unknown"
        try { host = new URL(source.url).hostname.replace(/^www\./, "") } catch {}
        return agent(FETCH_PROMPT(source, searchResult.candidate), {
          label: "fetch:" + host, phase: "Fetch", schema: EXTRACT_SCHEMA,
        }).then(ext => {
          if (!ext) return null   // user-skip → drop (filtered below), don't mislabel unreliable
          return {
            url: source.url, title: source.title, candidate: searchResult.candidate,
            sourceQuality: ext.sourceQuality, publishDate: ext.publishDate,
            claims: ext.claims.map(c => ({
              ...c, candidate: searchResult.candidate,
              sourceUrl: source.url, sourceQuality: ext.sourceQuality,
            })),
          }
        }).catch(e => {
          log("fetch failed: " + source.url + " — " + (e.message || e))
          return { url: source.url, title: source.title, candidate: searchResult.candidate, sourceQuality: "unreliable", claims: [] }
        })
      })
    )
  }
)

const allSources = searchResults.flat().filter(Boolean)
// Keep only claims tagged with a real criterion; drop orphans.
const allClaims = allSources.flatMap(s => s.claims).filter(c => criteriaById.has(c.criterionId))
const impRank = { central: 0, supporting: 1, tangential: 2 }
const qualRank = { primary: 0, secondary: 1, blog: 2, forum: 3, unreliable: 4 }

const rankedClaims = [...allClaims]
  .sort((a, b) => (impRank[a.importance] - impRank[b.importance]) || (qualRank[a.sourceQuality] - qualRank[b.sourceQuality]))
  .slice(0, MAX_VERIFY_CLAIMS)

log("Fetched " + allSources.length + " sources → " + allClaims.length + " tagged claims → verifying top " + rankedClaims.length)

if (rankedClaims.length === 0) {
  return {
    subject: scope.subject, candidates: scope.candidates, criteria: scope.criteria,
    summary: "No verifiable claims extracted from " + allSources.length + " sources. Comparison inconclusive.",
    ranking: [], matrix: [],
    stats: { candidates: scope.candidates.length, sources: allSources.length, claims: 0, dupes: dupes.length },
  }
}

// ─── Verify: 3-vote adversarial (barrier — pool must be assembled first) ───
phase("Verify")
const voted = (await parallel(
  rankedClaims.map(claim => () =>
    parallel(
      Array.from({ length: VOTES_PER_CLAIM }, (_, v) => () =>
        agent(VERIFY_PROMPT(claim, v), {
          label: "v" + v + ":" + claim.candidate + "/" + claim.claim.slice(0, 30),
          phase: "Verify", schema: VERDICT_SCHEMA,
        })
      )
    ).then(verdicts => {
      const valid = verdicts.filter(Boolean)
      const refuted = valid.filter(v => v.refuted).length
      const survives = valid.length >= REFUTATIONS_REQUIRED && refuted < REFUTATIONS_REQUIRED
      log("\"" + claim.candidate + ": " + claim.claim.slice(0, 40) + "…\": " + (valid.length - refuted) + "-" + refuted + " " + (survives ? "✓" : "✗"))
      return { ...claim, verdicts: valid, refutedVotes: refuted, survives }
    })
  )
)).filter(Boolean)

const confirmed = voted.filter(c => c.survives)
const killed = voted.filter(c => !c.survives)
log("Verify done: " + voted.length + " claims → " + confirmed.length + " confirmed, " + killed.length + " killed")

if (confirmed.length === 0) {
  return {
    subject: scope.subject, candidates: scope.candidates, criteria: scope.criteria,
    summary: "All " + voted.length + " claims refuted by adversarial verification. Sources too weak to rank candidates.",
    ranking: [], matrix: [],
    refuted: killed.map(c => ({ claim: c.claim, candidate: c.candidate, source: c.sourceUrl })),
    stats: { candidates: scope.candidates.length, sources: allSources.length, claims: allClaims.length, verified: voted.length, confirmed: 0, killed: killed.length },
  }
}

// ─── Score: build the weighted scorecard from confirmed evidence ───
phase("Score")
// Group confirmed claims by candidate then criterion so the scorer sees a clean grid.
const byCand = new Map()
for (const c of confirmed) {
  if (!byCand.has(c.candidate)) byCand.set(c.candidate, new Map())
  const m = byCand.get(c.candidate)
  if (!m.has(c.criterionId)) m.set(c.criterionId, [])
  m.get(c.criterionId).push(c)
}
const evidenceBlock = scope.candidates.map(cand => {
  const m = byCand.get(cand.name) || new Map()
  const lines = scope.criteria.map(cr => {
    const cs = m.get(cr.id) || []
    if (!cs.length) return "  - " + cr.id + ": (no verified evidence)"
    return "  - " + cr.id + ":\n" + cs.map(c =>
      "      · \"" + c.claim + "\" — " + c.sourceUrl + " (" + c.sourceQuality + ", vote " + (c.verdicts.length - c.refutedVotes) + "-" + c.refutedVotes + ")"
    ).join("\n")
  }).join("\n")
  return "### " + cand.name + "\n" + lines
}).join("\n")

const rubricBlock = scope.criteria.map(c =>
  "- `" + c.id + "` — " + c.label + " · weight " + c.weight + (c.check ? " · " + c.check : "")
).join("\n")

const report = await agent(
  "## Synthesis: comparative scorecard\n\n" +
  "**Subject:** " + scope.subject + "\n\n" +
  "Below is the VERIFIED evidence per candidate × criterion (claims that survived " + VOTES_PER_CLAIM + "-vote adversarial review).\n\n" +
  "## Weighted rubric\n" + rubricBlock + "\n\n" +
  "## Verified evidence\n" + evidenceBlock + "\n\n" +
  "## Instructions\n" +
  "1. For each candidate × criterion, assign score 0-5 from the verified evidence (5 = strongly satisfies, 0 = clearly fails, -1 = no evidence). Set confidence high/medium/low, or none when score is -1.\n" +
  "2. Cite the source URLs you scored from in each matrix cell.\n" +
  "3. Compute weightedScore per candidate = Σ(score × criterion.weight) / Σ(weight), treating -1 cells as 0 but flagging them in the rationale. Rank descending.\n" +
  "4. Write a 3-5 sentence executive summary naming the winner and the runner-up to watch.\n" +
  "5. Caveats: thin-evidence cells, time-sensitivity, vendor-only sourcing.\n" +
  "6. 2-4 open questions worth a follow-up run.\n\nStructured output only.",
  { label: "score", schema: SCORE_SCHEMA }
)

if (!report) {
  // Salvage verified evidence rather than discarding the run.
  return {
    subject: scope.subject, candidates: scope.candidates, criteria: scope.criteria,
    summary: "Scoring step skipped/failed — returning " + confirmed.length + " verified claims unscored.",
    ranking: [], matrix: [],
    confirmed: confirmed.map(c => ({ candidate: c.candidate, criterionId: c.criterionId, claim: c.claim, source: c.sourceUrl })),
    stats: { candidates: scope.candidates.length, sources: allSources.length, claims: allClaims.length, verified: voted.length, confirmed: confirmed.length, killed: killed.length },
  }
}

return {
  subject: scope.subject,
  candidates: scope.candidates,
  criteria: scope.criteria,
  ...report,
  refuted: killed.map(c => ({ candidate: c.candidate, claim: c.claim, vote: (c.verdicts.length - c.refutedVotes) + "-" + c.refutedVotes, source: c.sourceUrl })),
  sources: allSources.map(s => ({ url: s.url, candidate: s.candidate, quality: s.sourceQuality, claimCount: s.claims.length })),
  stats: {
    candidates: scope.candidates.length,
    criteria: scope.criteria.length,
    angles: scope.angles.length,
    sourcesFetched: allSources.length,
    claimsExtracted: allClaims.length,
    claimsVerified: voted.length,
    confirmed: confirmed.length,
    killed: killed.length,
    urlDupes: dupes.length,
    budgetDropped: budgetDropped.length,
  },
}
