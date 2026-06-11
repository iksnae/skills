---
name: market-scout
description: >
  Comparative product/market research with adversarial fact-checking.
  Evaluates and ranks N candidates (tools, models, vendors, competitors)
  against an explicit weighted rubric, fanning out web searches per
  candidate, verifying every claim by 3-vote adversarial review, and
  emitting a cited scorecard. Use when you must pick or justify a choice
  between alternatives — e.g. which LLM to drive a pipeline, which
  library/vendor to adopt, or a competitive landscape scan. Pass either a
  free-form brief or a structured {subject, candidates, criteria} object.
  This skill is a deep-research fan-out harness specialized for
  head-to-head comparison; for single-topic narrative research, use a
  general research approach instead.
---

# market-scout

A two-layer skill. **This file is only the launcher and scope gate** — the
fan-out/verify/score engine is the bundled Claude Code Workflow script
[`market-scout.workflow.js`](market-scout.workflow.js) in this skill
directory. Copy it to `.claude/workflows/market-scout.js` to invoke it by
name, or run it directly via the Workflow tool's `scriptPath`. Your job
here is to scope the comparison well, run the workflow, then deliver the
result.

## 1 — Scope gate (do this BEFORE running anything)

A comparison is only as good as its rubric. If the request is missing any
of the following, ask the user 2–3 sharp clarifying questions first — do
not guess:

- **Candidates** — the specific alternatives to compare (or a clear field
  to infer them from). "Compare some databases" is too vague.
- **Criteria + weights** — what actually matters, in priority order. Reuse
  an existing rubric the user already has if one applies.
- **Constraints** — budget, region, license posture, must-have
  capabilities, the incumbent/baseline to beat.

When the request is already specific (a known rubric, named candidates),
skip the questions and proceed.

## 2 — Run the workflow

Pass a structured object when you have one (preferred — it pins the rubric
so the workflow doesn't re-derive it):

```
Workflow({
  name: "market-scout",
  args: {
    subject: "Single all-rounder model to drive an agent pipeline",
    candidates: [{ name: "model-a" }, { name: "model-b" }, ...],
    criteria: [
      { id: "tool-use", label: "Reliable read-only tool use, no refusals", weight: 5, check: "function-calling benchmarks; refusal reports" },
      { id: "json", label: "Emits parseable structured JSON", weight: 4 },
      { id: "price", label: "$/Mtok via the target API", weight: 3 },
      ...
    ]
  }
})
```

Or pass a free-form brief string and let the Scope phase derive candidates
and a rubric:

```
Workflow({ name: "market-scout", args: "Rank current all-rounder models to replace model-a for an agent pipeline, weighting tool-use reliability highest…" })
```

It runs in the background (Scope → Search → Fetch → Verify → Score) and
returns a structured object: `{ subject, candidates, criteria, summary,
ranking[], matrix[], caveats, openQuestions[], refuted[], sources[], stats }`.
Watch live with `/workflows`.

## 3 — Deliver the scorecard

After the workflow completes, render the result as a markdown report and
either return it to the user directly or write it to a path the user
specifies (e.g. `research/market-scout/<subject-slug>-<YYYY-MM-DD>.md`).
A complete report contains:

- YAML frontmatter (date, subject)
- A **subject** line stating what was compared
- A **ranked scorecard table** (candidate × criterion with weighted
  totals)
- The executive **summary**
- A **caveats / limitations** section
- The refuted-claims list (for transparency)
- The cited **sources** (at least 3 URLs; more is better)

## Notes

- The workflow is the reusable engine; this skill is the policy around it.
  To tune fan-out width, votes, or fetch budget, edit the consts at the
  top of `market-scout.workflow.js` — not this file.
- Verification is adversarial and defaults to refuting on uncertainty, so a
  thin-evidence run will legitimately return few confirmed claims. That is
  signal, not failure — surface it in caveats rather than padding the
  scorecard.
