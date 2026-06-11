# iksnae/skills

Reusable [Claude Code](https://claude.com/claude-code) skills, commands, and tools — original work, generalized from months of real-world use.

## Install

### As a Claude Code plugin (recommended)

```
/plugin marketplace add iksnae/skills
/plugin install iksnae-skills@iksnae
```

### Via npx

```bash
npx @iksnae/skills list                 # see what's available
npx @iksnae/skills add graphify certify # install into ~/.claude/skills
npx @iksnae/skills add --all --project  # install everything into ./.claude
```

## Skills

### Knowledge & analysis

| Skill | What it does |
|---|---|
| `graphify` | Turn any folder (code, docs, papers, media) into a navigable knowledge graph with community detection, query/path/explain tools, and HTML/JSON/Neo4j exports. |
| `certify` | Score every code unit in a repo across 9 quality dimensions; produces a graded report card and prioritized remediation plan. |
| `repo-audit` | Health / due-diligence audit of an unfamiliar repository — the default opening move on a new codebase. |
| `market-scout` | Comparative research: fan out searches per candidate, adversarially verify claims, return a ranked, cited scorecard. Includes a bundled Workflow script. |

### Engineering practice

| Skill | What it does |
|---|---|
| `development-loop` | Language-agnostic iterative loop (plan → implement → review → refactor) grounded in Clean Code/Architecture, SOLID/DRY, and Strangler refactoring. |
| `retrospective` | Evidence-only retrospectives for any iteration, sprint, or release — every claim cites a commit, run, or issue. |

### QA & red-teaming

| Skill | What it does |
|---|---|
| `chaos-qa` | Adversarial chaos QA: hypothesize → inject faults (dead deps, corrupt state, races) → observe → file findings. |
| `dogfood-qa` | Run the app end-to-end like a real user; log friction and defects with re-verify discipline. |
| `surface-consistency-audit` | Audit fact consistency across an app's surfaces (CLI/TUI/API/web): stale projections, vocabulary drift, count mismatches. |

### Media generation

| Skill | What it does |
|---|---|
| `image-generate` | Generate images via the OpenAI Images API with optional project style-brief injection (DESIGN.md/BRAND.md), receipts, and parallel batching. |
| `illustrate-doc` | Decide when and how to illustrate a document, then orchestrate the media skills to do it. |
| `article-audio` | Convert an article to narrated audio (OpenAI TTS) with a pronunciation-config hook. |
| `remotion-author` | Author Remotion video specs with linting. |
| `remotion-render` | Render Remotion compositions with receipts; bundles the spec linter. |
| `remotion-with-image` | Composite workflow: generated imagery inside Remotion videos. |

Media scripts live in each skill's `scripts/` directory and use environment variables for credentials (`OPENAI_API_KEY`).

## Layout

```
.claude-plugin/marketplace.json      # plugin marketplace catalog
plugins/iksnae-skills/               # the plugin: skills/ + manifest
bin/cli.mjs                          # npx installer
```

## License

MIT © iksnae
