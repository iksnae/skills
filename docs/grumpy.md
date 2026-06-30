# grumpy

> The skeptical senior reviewer who has seen this movie before — point it at code, a diff, a plan, an API, a schema, or an agent's output and it tells you where this is going to hurt later.

## What it does

`grumpy` reviews work from the perspective of hard-earned engineering experience. It is not here to be impressed; it is here to find what will break, rot, confuse the next maintainer, or betray a proven pattern. It attacks the design, implementation, interfaces, tests, naming, coupling, lifecycle, and failure modes — never the person — and it refuses to nitpick style unless the style reveals deeper confusion.

Every review comes back in a fixed shape: a blunt **Verdict** naming the central risk, a **Smell Inventory** of concrete issues (each with severity, category, what, why, where, and a fix), **Pattern Violations**, **Missing Failure Cases** the author probably forgot, **Test Gaps** named as concrete test functions, a **Refactor Recommendation** (smallest responsible fix first, cleaner long-term shape second, and an explicit "do not do"), and one sharp closing sentence.

## When to use it

- Reviewing a diff, PR, or freshly written module before it lands.
- Pressure-testing a plan, architecture doc, API, schema, or migration for the failure modes the author is too close to see.
- Sanity-checking another agent's output when you want adversarial scrutiny, not a rubber stamp.
- Pairing with [janitor](janitor.md): Grumpy finds the smells, Janitor cleans the one that's safe to clean now.

When NOT to use it: when you want the work *changed* rather than judged (use `janitor` or [development-loop](development-loop.md)), or when you need encouragement — Grumpy frames risk, it does not cheerlead. It also won't invent requirements or assume unfamiliar code is wrong just because it's unfamiliar.

## Install

```
/plugin marketplace add iksnae/skills
npx skills add iksnae/skills
npx @iksnae/skills add grumpy
# or copy skills/grumpy/ into ~/.agents/skills/
```

## How it runs

1. **Read for risk, not for style** — look for over/under-engineering, leaky abstractions, hidden coupling, concurrency hazards, error-handling and observability gaps, weak tests, API and data-model drift, security footguns, performance traps, and happy-path-only code.
2. **Render the verdict** — a blunt summary of where the work stands and the single central risk.
3. **Inventory the smells** — each as `blocker` / `major` / `minor` / `nit` with category, problem, why it matters, where it lives, and the fix.
4. **Name what's missing** — violated patterns, forgotten failure cases, and the specific tests that should exist (as real test-function names).
5. **Recommend the smallest responsible fix** — then the cleaner long-term shape, then an explicit list of what *not* to do.
6. **Close with one sharp sentence.**

## Output

A single markdown review. From the nightjar run, the verdict and one inventory entry:

```markdown
## Verdict
It builds, it vets, it tests green, and it will still lose your data...
The central risk is a read-modify-write store with no concurrency control
and no atomic write — everything else here is paint on top of that.

### 1. [blocker] Concurrency — Store is a read-modify-write race
**Problem:** Store.Add does Load() → append → Save() with nothing holding a
lock between the read and the write...
**Fix:** Serialize writes. Minimum: a sync.Mutex... Better: an owning
goroutine with a command channel.
```

## Demo: nightjar

Grumpy reviewed nightjar — the demo pastebin — and went straight past the green test suite to the thing the tests don't cover: `Store.Add` and `Store.Remove` are read-modify-write over a single JSON file with no lock, and the HTTP server reaches them concurrently. That's the blocker, and it lines up exactly with the ~19% silent write loss the [chaos run](chaos-qa.md) measured. From there it found a non-atomic `Save` that a mid-write crash turns into a corrupt store, an index header count frozen at startup that disagrees with the live table on the same page, and a `Get` that reimplements `Load` and has already drifted — returning a raw `os.ErrNotExist` that the API maps to 500 instead of 404. Each finding cites `file:line`, names the missing test, and gives the minimum fix before the cleaner one. Crucially, it separated the *behavior* fixes (500→404, the stale count) from the one *cleanup* that was safe to sweep — which it handed to Janitor. Full review: [demos/grumpy-nightjar.md](demos/grumpy-nightjar.md)
