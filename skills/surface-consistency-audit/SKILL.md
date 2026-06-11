---
name: surface-consistency-audit
description: Cross-check that the same fact reads identically across every presentation surface of an application — CLI, API endpoints, the web UI/TUI, and the underlying data/projections — and flag any drift. The technique that catches duplicated items (one error rendered as two), vocabulary drift across surfaces, and classifier disagreements (one surface says "ok", another says "degraded" for the same state). Produces a drift report naming each discrepancy, the surfaces that disagree, and the suspected source. Use to verify read-model truthfulness. Do NOT use for behavioral end-to-end QA (use dogfood-qa) or code-structure review (use a code-review skill).
---

# Surface Consistency Audit

When every human view of an application is a projection of the same durable
data, a load-bearing fact must read **identically** wherever it appears. When
two surfaces disagree, one of them is lying — and a lying surface erodes user
trust faster than a missing feature. This skill hunts that drift.

It is a member technique of [dogfood-qa](../dogfood-qa/SKILL.md) and can also run
standalone as a read-model truthfulness check.

## The method

First, **discover the surfaces** the target app exposes — its CLI commands, API
endpoints, web routes / TUI screens, and where the ground-truth data lives
(database, event log, projections, receipts). Then pick each **load-bearing
fact**, read it from every surface, and compare.

| Surface | How to read |
|---|---|
| **CLI** | the status/list/cost/health commands that print the fact |
| **API** | the endpoints that return the fact as JSON |
| **Web UI / TUI** | the rendered value on the relevant screen/route |
| **Underlying data** | the source of truth — DB rows, event log, projections, receipts |

Facts worth checking (extend per change): item counts · attention / needs-action
counts · current state + phase · blocked count · spend / per-unit cost · entity
names · configured vs last-observed values · health/readiness status · remote
connection status.

A fact is **clean** only when all surfaces agree. Any mismatch is a finding.

## Drift taxonomy (name the source, not just the symptom)

- **Count mismatch** — a derived count ≠ ground truth (e.g. a queue showing
  `attentionCount: 2` vs an underlying `errorCount: 1`). Usual source: a
  read-model that merges a **summary** item and a **per-event** item for the
  same underlying fact without deduping (the summary often carries a sentinel
  value that defeats the dedup key).
- **Vocabulary drift** — the same entity named differently across surfaces (one
  surface says `builder`, another says `build`). Source: no single source of
  truth for the label set; fix by pointing every surface at one canonical list.
- **Stale projection** — UI/API reads a persisted projection built by older code;
  ground truth disagrees. Source: projection not rebuilt; check the projection's
  last-processed marker vs the source's latest marker.
- **Classifier disagreement** — two surfaces classify the same state differently
  (one says `status: ok`, another says `degraded — local fallback`). Source: the
  classification lives in two places instead of one shared classifier.

## Output

A drift report listing, per discrepancy: the fact, each surface's value, the
verdict (which is wrong), and the suspected source from the taxonomy. Confirmed
drifts graduate to issues via [dogfood-qa](../dogfood-qa/SKILL.md)'s finding
contract. The audit reports observations only — it does not fix.

## What the audit catches

Cross-surface comparison reliably surfaces: duplicated items (a summary-vs-event
double-source), vocabulary drift plus unlabeled configured-vs-observed values,
and classifier disagreement (one surface reporting `ok` while another reports
`degraded` for the same unconnected remote). These are invisible to single-
surface testing and to code review; only reading the same fact from every
surface side by side exposes them.
