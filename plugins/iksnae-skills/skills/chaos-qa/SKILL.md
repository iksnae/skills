---
name: chaos-qa
description: Run an adversarial chaos-engineering GameDay against any application — inject controlled failures into its real dependencies (upstream APIs/services, data stores, network, disk, concurrency, locks) and verify the resilience mechanisms (retries, timeouts, fallbacks, idempotency, locking, graceful degradation) actually hold under stress, finding the breaks that consistency and happy-path QA miss. Grounds the generic chaos-engineering method (hypothesis → inject → observe steady-state recovery) in concrete fault vectors discovered against the target. Member technique of dogfood-qa. Do NOT use for read-model truth-checking (use surface-consistency-audit) or happy-path behavioral QA (use dogfood-qa); chaos is about failure injection.
---

# Chaos QA

Surface-consistency QA asks *"do the surfaces agree?"*; behavioral dogfood QA
asks *"does the happy path work?"*. **Chaos QA asks *"what breaks when a
dependency fails?"*** — and just as importantly, *"do the resilience mechanisms
the app claims to have actually hold?"*. It is the failure-injection member of
[dogfood-qa](../dogfood-qa/SKILL.md).

Cloud chaos toolkits (Chaos Mesh / Gremlin / Toxiproxy / AWS FIS) are
k8s/cloud-oriented. The method here is the same, but the vectors are whatever
the **target application** actually depends on. So before injecting, discover
the dependency surface: upstream APIs/LLM providers, databases/queues, the
filesystem and any append-only logs, network reachability, concurrent access,
and on-disk locks. Inject faults into those layers with config edits, fault-
injecting test doubles, proxies, and direct file/process manipulation — no
cluster required.

## Method (per the chaos-engineering discipline)

1. **State the steady state** — the resilience mechanism that *should* hold.
2. **Inject the failure** — on a **throwaway copy** (blast radius — never a
   production environment, real user data, or a connected live remote).
3. **Observe** — recover gracefully? park/surface for attention? fail *loud*
   (never silently-wrong)? hang? crash? corrupt state?
4. **Analyze + file** — a break files an issue via dogfood-qa's finding
   contract; a hold is recorded as a validated mechanism.

## Building the recipe — discover the target's fault vectors

First map what the app talks to and where it keeps state, then design an
injection per dependency. The table below is a **starter pattern**; replace each
row with the target's real dependencies.

> **Lesson that shapes any recipe:** find the command/path that actually
> exercises the dependency. A deterministic state advance may "succeed" against
> a dead endpoint because it never calls it — only the code path that makes the
> real call is a valid provider-fault vector. And a real upstream often can't be
> forced to emit malformed/empty responses on demand, so **a fault-injecting
> test double or proxy is the chaos vector**, not just a dead real endpoint.

| Vector | Inject | Steady-state hypothesis |
|---|---|---|
| **Upstream API / service faults** | a fault-injecting double or proxy returning errors / malformed payloads / empty bodies / timeouts, driven through the code path that actually calls it | retries exhaust → work parks / surfaces cleanly; malformed-but-recoverable payloads are repaired; cost/quota caps hold; **no crash, no silent "succeeded"** |
| **Upstream unreachable** | point the base URL at a dead address (e.g. `127.0.0.1:9`) and run a calling command under a `timeout` | error surfaced cleanly; **no hang** (bounded); work parks |
| **Data-store / log corruption** | append a garbage line, or chop the last N bytes of an append-only file (torn write = crash mid-append) | tolerate a torn *trailing* record; never brick read paths (status/health/listing) on one bad line |
| **Remote down** | point at a dead remote, run push/pull/sync | fails *loud*; read paths stay operational via local fallback |
| **Concurrency** | N parallel writers / two simultaneous exclusive acquisitions | writes stay valid, 0 interleaving; the second exclusive acquisition is refused |
| **Lock contention** | hold the lock/flock, run a command that needs it | serializes / times out gracefully |

Run a `timeout` around any external/network vector — **a hang is a finding** (an
unbounded dependency call).

## Setup (blast radius)

Create a disposable environment per vector — a temp directory, a fresh
init/seed, fake credentials. One throwaway environment per vector keeps
experiments isolated. Tear them down after; never inject into a real
environment, real user data, or a connected production remote.

## Output

A GameDay report: per vector, the hypothesis, the injected failure, observed
behavior, and verdict (held / broke). Breaks graduate to issues via dogfood-qa's
finding contract; holds are recorded as validated resilience so regressions are
noticeable.

## What chaos catches that others miss

Failure injection finds **failure domains** that surface-consistency and
behavioral happy-path QA both miss — e.g. a single torn line in an append-only
log bricking a status read because the reader aborts on the first parse error
with no torn-trailing tolerance, or a "success" reported against a dead endpoint
because the success path never actually called it. State a steady-state
hypothesis, inject, and let the observed behavior decide held vs broke.
