# janitor

> Clean the mess without making a bigger one — turn rough, tangled, or half-finished work into something smaller, clearer, and safer, one low-risk patch at a time.

![Janitor — a calm custodian leaning on a mop in a room he's just made orderly](assets/janitor-hero.png)

## What it does

`janitor` improves existing code, tests, docs, and workflows through disciplined, reversible steps — never a grandstanding rewrite. Its guiding question is "what is the smallest cleanup that makes this safer to work on tomorrow?" It prefers boring fixes, adds tests *before* risky changes, removes complexity rather than adding abstractions, and refuses to combine behavior changes with cleanup.

Every cleanup comes back in a fixed shape: a one-sentence **Goal**, a **Mess Inventory** (each item with severity, area, why it's messy, and the cleanup action), a **Safe Cleanup Plan** ordered tests-first, explicit **Guardrails** naming what must not change, a **Patch Strategy** sequenced from first patch to "do not touch yet," the concrete **Tests To Add**, and a clear **Done Criteria**.

## When to use it

- After [grumpy](grumpy.md) (or any review) hands you a list of smells and you want the safe subset cleaned now, with the risky ones correctly deferred.
- Whenever code needs to be made simpler, clearer, or more maintainable without changing what it does — dead code, duplicate logic, confusing names, oversized files, mixed responsibilities, brittle tests, noisy logs, migration leftovers.
- Before a feature lands on top of a messy seam, to make the next change less scary.

When NOT to use it: when you need to *find* what's wrong (use `grumpy`), when you genuinely want a from-scratch rewrite, or when the task is a behavior change in disguise — Janitor will flag a status-code or output change and route it to [development-loop](development-loop.md) rather than smuggle it into a refactor commit.

## Install

```
/plugin marketplace add iksnae/skills
npx skills add iksnae/skills
npx @iksnae/skills add janitor
# or copy skills/janitor/ into ~/.agents/skills/
```

## How it runs

1. **State the goal** — one sentence on what gets safer, and what stays exactly as-is.
2. **Inventory the mess** — `high` / `medium` / `low` items, each with the area, why it's messy, and the cleanup action.
3. **Plan tests-first** — characterize current behavior before touching it, then rename, extract seams, remove dead code, simplify control flow, improve errors, update docs, validate.
4. **Set guardrails** — name the public behavior, file format, CLI flags, and fixtures that must not change.
5. **Sequence the patches** — first patch, second, optional, and an explicit "do not touch yet" for anything that's really a behavior change or needs a design decision.
6. **Prove it's done** — green build/tests, a new regression test around the seam, unchanged public behavior.

## Output

A single markdown cleanup plan, applied. From the nightjar run, the guardrail that kept it honest and the resulting seam:

```markdown
## Guardrails
- The CLI list preview lives in a different package and uses a different
  policy (cap 40 with a trailing "..."). It only looks similar; the shared
  knowledge stops at "first line." Left alone on purpose.

## Result
+func snippet(content string) string { ... }   // both copies collapse to one
go build/vet/test → ok
```

## Demo: nightjar

Handed Grumpy's inventory of nightjar, Janitor did **not** reach for the headline blocker. The read-modify-write race needs a locking decision and concurrency tests — that's development-loop work, not a sweep — so Janitor explicitly parked it under "do not touch yet," alongside the two findings that were really behavior changes (the 500→404 fix and the frozen index count). What it *did* clean was the one genuinely safe item: the "first line, capped at 64" preview logic duplicated character-for-character in two places in the `server` package. It wrote `TestSnippetFirstLineAndCap` to pin the current output *first*, then extracted a single `snippet` helper and a named `snippetWidth` constant, leaving the API list and web index byte-identical. It deliberately left the CLI's *similar-looking* preview alone — different package, different policy (cap 40 with `...`) — because merging them would cross a boundary to save four lines. `go build && go vet && go test` stayed green throughout. Full write-up: [demos/janitor-nightjar.md](demos/janitor-nightjar.md)
