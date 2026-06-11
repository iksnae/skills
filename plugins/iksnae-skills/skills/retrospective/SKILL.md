---
name: retrospective
description: Read a project's recorded activity (git history, CI runs, issue/PR tracker, or any structured event log) and produce a retrospective report covering what shipped, what halted, recurring failure patterns, escalations, and improvement candidates. Use at the close of any iteration, sprint, release, or project phase, or on demand when the user wants to see "what's been happening." Output is a markdown report grounded entirely in recorded evidence — no speculation, no synthesis from outside the record. Turning a retro's findings into tracked work items (issues, tickets) is separate follow-up work.
---

# Retrospective

This skill reads what already happened (the project's recorded
activity) and produces an honest report of where things went well,
where they halted, and where the user should look next.

## Purpose and boundaries

The retro commits to:

- Reading recent recorded events grouped by activity / phase / outcome
- Surfacing **drift signals** with citations (commit SHAs, CI run IDs,
  issue/PR numbers, event IDs, paths)
- Naming concrete improvement candidates that can later be promoted to
  tracked work items
- Calibrated tone: operational, not celebratory or defeatist

It does **not** commit to:

- Storytelling beyond what the record shows
- Praising or blaming individuals or models — observations are
  about the system, not the people running it
- Implementing fixes inside the retro (those are candidates;
  promotion to tracked work is a separate step)
- Speculating about why something happened without recorded evidence

## Inputs

Required — at least one **evidence source**, in order of preference:

- A structured event log, if the project keeps one (e.g. a
  line-delimited JSON ledger of task/pipeline events).
- Otherwise, reconstruct the record from: `git log` for the window,
  CI run history (`gh run list`), and the issue/PR tracker
  (`gh issue list`, `gh pr list`).

Optional:

- **Time window** — retros default to "since the last retro" (which
  the user can establish by passing the prior retro's date).
  Otherwise: the last 100 events or the last 7 days, whichever is
  shorter.
- **Scope filter** — when the record spans multiple projects or
  components, optionally filter by name/label.
- **Output path** — defaults to `retros/<YYYY-MM-DD>.md`; honor
  whatever path the user specifies, or return the report inline if
  no path is given.

## Output

A markdown file (or inline report) in this shape:

```
# Retrospective — <window>

| Field | Value |
|---|---|
| Window | YYYY-MM-DD to YYYY-MM-DD |
| Project | <name or path> |
| Events analyzed | <count> |
| Work items in window | <count> |

## Summary

Three sentences: (1) what shipped, (2) what halted, (3) the single
most actionable drift signal.

## What shipped

| Work item | Outcome | Stages completed | Notes |
|---|---|---|---|
| <id>: <title> | done/merged | plan, build, test, review | one-line |

## What halted

| Work item | Halt stage | Reason | First halt evidence |
|---|---|---|---|
| <id>: <title> | test | CI failed after 3 attempt(s) | <run/event ID> |

## Drift signals

Patterns observed across multiple events. Each signal includes:

| ID | Signal | Frequency | Evidence | Improvement candidate |
|---|---|---|---|---|
| D-1 | <one-line> | N occurrences in window | <IDs/SHAs/links> | <one-line of what to do> |

## Escalations + needs-attention

| Work item | Type | Action required |
|---|---|---|

## Improvement candidates

Numbered list of candidates the user should consider promoting to
tracked work items (issues, tickets). Each entry references a drift
signal ID from above.

1. **<title>** — addresses D-<n>. Acceptance: <one-line>.
```

If the evidence source includes tool/skill/automation usage records,
add a usage table (invocations / succeeded / failed per tool) and
treat repeated failures as drift signals.

## Workflow

### Step 1: Load the record

If a structured event log exists, read it and parse line by line
(typically one JSON event per line with a type, payload, and
timestamp). Otherwise gather: `git log --since=<window>`, CI run
history, and issues/PRs updated in the window.

### Step 2: Determine the window

If the user supplied a since-date, use it. Otherwise, take the most
recent 100 events or the last 7 days, whichever is shorter. Always
note the actual window in the output's Window field — never
generalize beyond it.

### Step 3: Group by outcome

- **Shipped**: work items that reached a terminal success state in
  the window (merged, released, marked done with passing checks).
- **Halted**: work items where the record shows a failure or block
  without subsequent recovery.
- **In flight**: work items neither shipped nor halted within the
  window.

### Step 4: Identify drift signals

Patterns worth surfacing (at least 2 occurrences):

- **Repeated test/CI failures with the same shape** — same failing
  job, same flaky test, same class of error.
- **Review-rework loops** — items that needed multiple rounds of
  changes-requested or repeated build retries.
- **Retry/iteration caps hit** — automated runs ending incomplete
  because they exhausted their attempt budget.
- **Tooling misses** — tools, scripts, or automations invoked but
  failing to resolve or load.
- **Malformed-output failures** — structured outputs (JSON, tool
  calls) that repeatedly failed to parse.
- **Permission/policy denials** — commands or actions blocked by
  configured policy.

For each signal: cite the evidence (IDs, SHAs, links), count the
frequency, propose a one-line improvement candidate.

### Step 5: Write the report

Follow the output template exactly. Every claim cites a piece of
recorded evidence (event ID, commit SHA, run ID, or issue/PR number).
No speculation.

### Step 6: Self-check

- Every "shipped" row's outcome appears in the record
- Every "halted" row has a first-halt evidence reference
- Every drift signal references at least 2 pieces of evidence
- Improvement candidates reference drift signal IDs from the same retro

## Illustrating this artifact

A retrospective benefits from a **cycle diagram** (what we did →
what we learned → what we'll change) or a **signal-to-candidate
map** when retro findings will be promoted to work items. Default
to a `mermaid` fence; retros are internal documents, so heavy visual
polish is unnecessary. See
[`illustrate-doc`](../illustrate-doc/SKILL.md).

## Failure modes to avoid

- **Storytelling beyond evidence.** If the record doesn't show why
  something halted, the retro doesn't either. Write "halt reason
  not recorded" — that itself is an improvement candidate.
- **Single-event drift signals.** A pattern requires multiple events.
  A single weird event is a note, not a drift signal.
- **Celebratory framing.** "Great work this iteration!" is not
  operational. Observations of what shipped are.
- **Praising or blaming individual actors.** "X did this well" or
  "the planner messed up" — the retro is about the system, not
  actors. Frame as: "the path for X took Y attempts."

## Verification

The retro is complete when:

- The report exists at the agreed path (or was returned inline)
- The Summary section is three sentences and references the drift
  signal cited in the Improvement candidates section
- Every drift signal table row cites at least 2 pieces of evidence
- The Improvement candidates list references the drift signal IDs
  from the body
