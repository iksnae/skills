# iksnae/skills

Reusable agent skills and tools — original work, generalized from months of real-world use.

Skills follow the open [Agent Skills standard](https://agentskills.io) (`SKILL.md` + YAML frontmatter) and work with **Claude Code, OpenAI Codex, pi, Cursor, GitHub Copilot, Gemini CLI, opencode, Goose, Amp**, and any other compatible harness.

## Install

### Universal installer (any harness)

```bash
npx skills add iksnae/skills        # auto-detects your installed agents
```

### Claude Code plugin

```
/plugin marketplace add iksnae/skills
/plugin install iksnae-skills@iksnae
```

### This repo's own installer

```bash
npx @iksnae/skills list                 # see what's available
npx @iksnae/skills add graphify certify # installs into ~/.claude/skills and ~/.agents/skills
npx @iksnae/skills add --all --project  # everything into ./.claude and ./.agents
npx @iksnae/skills add certify --to ~/.pi/agent/skills   # explicit target
```

### Manual (Codex, pi, Cursor, opencode, Goose, Amp, ...)

Clone or copy any `skills/<name>/` directory into the shared skills path:

```bash
# global
git clone https://github.com/iksnae/skills /tmp/iksnae-skills
cp -R /tmp/iksnae-skills/skills/* ~/.agents/skills/
# or per-project: .agents/skills/
```

Harness-specific paths also work: `~/.codex/skills` (Codex), `~/.pi/agent/skills` (pi), `~/.cursor/skills` (Cursor), `~/.gemini/skills` (Gemini), `~/.config/opencode/skills` (opencode).

## Skills

### Knowledge & analysis

| Skill | What it does |
|---|---|
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
skills/<name>/SKILL.md               # one directory per skill (Agent Skills standard)
.claude-plugin/                      # Claude Code marketplace + plugin manifests
bin/cli.mjs                          # npx installer
```

## Portability notes

- Skills are written to be **model-invoked by their `description`** — no harness-specific invocation required.
- Claude-specific frontmatter (`allowed-tools`, slash-command hints) is advisory; other harnesses ignore it safely.
- `market-scout` bundles an optional Claude Code Workflow script; the skill works without it everywhere else.
- Media skills shell out to bundled Python scripts in each skill's `scripts/` dir and read credentials from environment variables (`OPENAI_API_KEY`) — harness-agnostic.

## License

MIT © iksnae
