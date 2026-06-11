---
name: repo-audit
description: Perform a read-only health audit of a repository and produce a markdown findings report. Use when asked to assess a repo's health, perform due diligence on a codebase, or get a picture of an unfamiliar project before touching any code, proposing a roadmap, or opening any PR. The audit assesses dependencies, build/CI configuration, documentation coverage, test posture, license + governance, and surface-level code health. Output is a single markdown report scoped strictly to observations and findings (no fixes, no PRs, no code changes). Remediation is separate follow-up work.
---

# Repository Audit

This skill produces a **read-only health audit** of a single
repository. It is the default opening move on an unfamiliar codebase:
before proposing work, observe.

## Purpose and boundaries

The audit produces evidence, not action. It commits to:

- A concrete, repository-specific picture of the asset's current state
- Findings tagged by domain (deps / build-ci / docs / tests / license / code)
- Severity calibration (`blocker` / `attention` / `note`) per finding
- A short prioritized recommendation list at the end

It does **not** contain:

- Code changes (remediation is separate follow-up work)
- Open PRs or branches (the audit is observation, not intervention)
- Roadmap-level planning (that is a separate exercise the audit can feed)
- Praise, marketing language, or vague reassurance

## Inputs

One required input:

- **Target repository** — `<owner>/<repo>` reachable via `gh api` /
  `git clone`, or a local checkout. Only read access is needed; no
  write operations are performed by this skill.

Optional inputs:

- **Output path** — where to write the report. Defaults to
  `audit/<repo>.md` in the current working directory; honor whatever
  path the user specifies.
- **Audit scope** — a one-line statement of why this audit is being
  performed. Defaults to "initial health audit."

## Output

A single markdown file at the output path, matching the template at
`references/audit-template.md`.

## Workflow

### Step 1: Load the template

Read `references/audit-template.md` first. It defines section order,
table schemas, and the severity vocabulary. Work from the template,
not from memory.

### Step 2: Gather observations

Use only **read-only operations**. For a remote repository, the valid
surfaces:

- `gh api repos/<owner>/<repo>` — repository metadata (default
  branch, visibility, language, latest push)
- `gh api repos/<owner>/<repo>/contents/<path>` — file content
  (base64-encoded) and directory listings
- `gh api repos/<owner>/<repo>/commits` — recent commit history
- `gh issue list --repo <owner>/<repo>` — open issues
- `gh pr list --repo <owner>/<repo>` — open PRs
- `gh release list --repo <owner>/<repo>` — releases

For a local checkout, read files directly — but never modify them.

Do not clone the repo unless asked. The audit is a surface-level view;
deep code analysis (logic review, security review) is a separate
exercise.

For each domain below, gather enough evidence to score it with a
severity. Write the evidence as part of the finding — a finding without
evidence is a guess.

#### Domain 1: Dependencies

- For Node: read `package.json`, count direct dependencies, identify
  unpinned ranges (`^`, `~`) on dependencies critical to the build.
- For Go: read `go.mod`, check Go version, count direct require lines.
- For Python: read `requirements.txt` / `pyproject.toml`.
- For Ruby: read `Gemfile` / `Gemfile.lock`.

Flag: lockfile drift (lockfile newer than package manifest), missing
lockfile when one is expected, deprecated runtime versions
(Node < 18, Go < 1.21, Python < 3.10).

#### Domain 2: Build + CI

- Read `.github/workflows/*.yml` if present.
- Identify build, test, lint, deploy workflows.
- Check action versions (deprecated actions are an attention finding).
- Check runner OS / version pins.

Flag: no CI configured, deprecated action versions, missing test
workflow.

#### Domain 3: Documentation

- Read `README.md` — is it informative? Does it cover install, run, deploy?
- Look for `CONTRIBUTING.md`, `LICENSE`, `CODE_OF_CONDUCT.md`.
- Check `docs/` directory if present.

Flag: missing README, README that doesn't explain how to run the
project, no LICENSE file.

#### Domain 4: Tests

- Look for `test/` or `tests/` or `*_test.go` or `__tests__/` or
  `spec/` directories.
- If a test script is declared in `package.json` / `Makefile`,
  note it.
- Estimate test density qualitatively (no tests / sparse / present /
  comprehensive).

Flag: no tests, no test-runner configured, tests present but no CI
gate.

#### Domain 5: License + governance

- Check `LICENSE` file exists and is one of the standard SPDX
  identifiers.
- Check `.github/CODEOWNERS` exists for repos with multiple
  contributors.

Flag: no license, ambiguous license, missing CODEOWNERS for shared
repos.

#### Domain 6: Code health (surface)

- Look at recent commit cadence — daily, weekly, dormant?
- Count open issues and PRs.
- Check if the default branch shows recent activity.

Flag: dormant for >90 days with open issues / PRs, default branch
behind contributors' branches, large unreviewed PRs.

### Step 3: Score severity

Apply this vocabulary consistently:

- **`blocker`** — actively prevents working with the repository
  safely. Example: no LICENSE on a repo you're being asked to ship
  artifacts into.
- **`attention`** — does not block work but should be addressed soon.
  Example: deprecated GitHub Action version with a known sunset date.
- **`note`** — observation worth recording but not requiring action
  now. Example: README mentions a feature that the current code
  doesn't implement (might be roadmap, might be drift).

Severity is per finding, not per domain. A domain can contain
findings at multiple severities.

### Step 4: Write the report

Follow `references/audit-template.md` exactly. Populate header
metadata (repo, branch, audit date, scope), the per-domain finding
tables, and the closing prioritized recommendation list.

The recommendation list is at most five items, each one line, ordered
by severity then by remediation effort. Each recommendation names the
finding ID it addresses.

### Step 5: Self-check before submitting

Before declaring the audit complete, verify:

- The output file exists at the agreed path.
- Every domain section has at least one finding (an empty domain
  should explicitly say "No findings.").
- Every finding has an ID (`F<domain>-<n>`, e.g. `F-deps-1`).
- The recommendation list references finding IDs from the body.
- The report contains the literal phrase "This audit is read-only —
  no code changes were proposed in this document."

## Illustrating this artifact

A repo audit benefits from a **findings severity matrix** when ≥5
findings land, or a **findings-by-domain** breakdown (dependencies /
build-CI / docs / tests / license / code-health) when the audit
spans multiple domains. Default to a `mermaid` pie or quadrant
chart; the data does the work, so heavy visual polish is usually NOT
warranted. See [`illustrate-doc`](../illustrate-doc/SKILL.md).

## Failure modes to avoid

- **Marketing-grade praise.** "Excellent codebase!" / "world-class
  CI." The audit is operational, not flattering. Observations only.
- **Speculation without evidence.** If you didn't read the file,
  don't claim the project does or doesn't have it. Use the gh API
  to verify.
- **Recommendations the audit didn't justify.** Every recommendation
  ties to a finding ID; findings without recommendations are fine,
  recommendations without findings are out of scope.
- **Crossing the read-only boundary.** This skill does not open
  PRs, push branches, or modify files in the target repo. If you
  find yourself wanting to fix something, that is signal to start a
  separate remediation task — never extend this audit to remediate.
