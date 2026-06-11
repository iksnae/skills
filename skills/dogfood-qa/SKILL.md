---
name: dogfood-qa
description: Run an end-to-end behavioral QA pass on an application by dogfooding it — exercise the real workflow the way a user would, against real dependencies (not fakes), cross-check every presentation surface (CLI · API · web/TUI · underlying data) for drift, and file each gap as an issue with root cause and a verification plan, then re-verify after fixes land. Use when you want to QA an application by RUNNING it, not reading it — the pass that surfaces duplicated items, onboarding breaks, and surface-vs-surface disagreements that code review misses. Do NOT use for diff/PR review (use a code-review skill), single-feature acceptance, or pure code-structure review.
---

# Dogfood QA

An application's most valuable QA is to **run it like a user and watch where it
leaks.** Reading the code finds bugs the author can imagine; running the app
end-to-end finds the gaps between the parts — the ones that only appear with
real state, real data, and real dependencies. This skill is that pass, made
repeatable.

It is the counterpart to read-only review: code review reads structure;
**dogfood-qa exercises the running product** and files what breaks.

## Purpose and boundaries

It commits to:

- Driving a real workflow on a real target with real dependencies — never fakes.
- Cross-checking that every surface tells the **same truth** (see
  [surface-consistency-audit](../surface-consistency-audit/SKILL.md)).
- Filing each gap as an issue with a **root cause** (file:line), a failure
  scenario, a fix direction, and a verification plan.
- Re-verifying after fixes land — the loop is not done until the finding is
  confirmed gone against the running system.

It does **not**:

- Fix the bugs it finds (it files them; remediation is a separate cycle).
- Review a diff or PR (use a code-review skill).
- Assert green from logs alone — every claim is checked against the live system.

## The loop

### 1 · Target — pick what to exercise, and discover its surfaces
- Choose the application (or a representative end-to-end scenario within it).
- **Discover the surfaces first**: enumerate the CLI commands, TUI screens, API
  endpoints, and web routes the app exposes, plus where it keeps durable state
  (DB, files, logs). You cross-check against these later.
- Confirm readiness honestly: dependencies reachable, credentials present,
  remotes connected (not a degraded local fallback), config set. Record any
  manual nudge required to reach a ready state — *those are findings too*.

### 2 · Exercise — run the real workflow
- Drive a full cycle end-to-end with real dependencies, the way a user would —
  onboarding/setup through to the meaningful outcome.
- Drive any web/TUI surface for real (a browser or terminal harness): walk every
  state and every action that real state reaches.
- **Watch for friction:** anything that required a manual step, a workaround, or
  a nudge to proceed is a gap against the zero-intervention bar — log it as you go.
- **Inject failures** (see [chaos-qa](../chaos-qa/SKILL.md)): the happy path only
  proves the happy path. Fault-inject the app's dependencies on a throwaway copy
  to confirm the resilience mechanisms hold under stress.

### 3 · Cross-check the surfaces
Invoke **surface-consistency-audit**: for each load-bearing fact (counts,
queues/attention, state/phase, costs, names, status), read it from every surface
the app exposes — CLI, API, web/TUI, and the underlying data — and flag any
disagreement. One error must read as one error on every surface.

### 4 · File findings — one issue per gap
For each confirmed gap, open an issue against the app's repo with:

```
Title: [bug|enhancement] <one-line symptom>
- Summary + where it surfaces (which surface, which command/route)
- Repro (exact commands / clicks)
- Root cause (file:line; the mechanism, not the symptom)
- Fix direction (not prescribing implementation)
- Regression-test gap (the test that would have caught it)
- Severity + provenance ("found during dogfood QA of <target>, <date>")
```

Label by type + severity. Prefer **structural** fixes over papering symptoms
with retries (a manual nudge means the flow has a hole).

### 5 · Verify fixes
After a fix lands, re-run the exact repro against the **rebuilt** binary /
fresh pull and confirm the finding is gone. If a "closed" fix still reproduces
(e.g. a dedup that only catches identical items, not the summary-vs-event pair),
**reopen** the issue with the precise residual root cause.

## Definition of done

- The chosen workflow ran end-to-end on a real target with real dependencies.
- Every load-bearing fact was cross-checked across all surfaces.
- Each gap is an issue with root cause + verification plan.
- Every manual nudge required to proceed is captured as a finding.
- Findings that were fixed during the pass are re-verified against the live system.
- An optional run report is written summarizing the pass.

## Why running beats reading

Behavioral dogfooding surfaces gaps that static review can't imagine: a
duplicated queue item (one underlying error rendered as two), onboarding that
can't reach its first milestone for a particular input shape, a status field
that reports healthy for an unconnected remote, vocabulary that drifts between
surfaces. Running the product surfaces these; reading it would surface few.
