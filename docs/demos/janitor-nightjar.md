*Produced by the `janitor` skill (disciplined cleanup) against `demo/nightjar` (a fictional terminal pastebin), 2026-06-30. This is the cleanup half of the Grumpy→Janitor pair: Grumpy found the smells ([grumpy-nightjar.md](grumpy-nightjar.md)); Janitor picked the one cleanup that was safe to do right now and left the rest for the skills that own them. The change was applied — `go build && go vet && go test` stayed green.*

# Janitor Cleanup — nightjar

## Goal

Remove the duplicated paste-preview logic in the `server` package behind one
helper, with zero change to what any surface outputs.

## Mess Inventory

### 1. [medium] Duplication — Two identical preview blocks in one package

**Mess:** The "first line of content, capped at 64 chars" logic appears twice,
character-for-character, inside `internal/server/server.go` — once building the
JSON list items (`handlePastes`) and once building the web index rows
(`handleIndex`).

**Why it matters:** It's duplicated *knowledge*: how nightjar previews a paste.
Two copies means the API list and the web index can silently disagree the day
someone changes one and not the other. This is the cheap, safe end of what
Grumpy flagged as drift risk (#3, #4 in the review) — same disease, smallest
dose.

**Cleanup:** Extract one `snippet(content string) string` plus a named
`snippetWidth` constant; call it from both sites.

### 2. [low] Naming — `64` is an unlabeled magic width

**Mess:** The cap appears as a bare `64` in both copies.

**Why it matters:** It reads as a coincidence rather than a deliberate preview
width.

**Cleanup:** Name it `snippetWidth = 64`, folded into cleanup #1.

## Safe Cleanup Plan

1. **Add a characterization test first.** `TestSnippetFirstLineAndCap` pins the
   current output — short line, first-line-only, cap-at-width, first-line-then-cap,
   empty — *before* touching the duplicated code, so the extraction can only pass
   if behavior is identical.
2. **Extract the seam.** Add `snippet` and `snippetWidth` next to the existing
   `writeJSONError` helper (the package already has a "one place that knows X"
   convention — this follows it).
3. **Replace both call sites** with `snippet(p.Content)`.
4. **Run validation.** `go build ./... && go vet ./... && go test ./...` — green.

## Guardrails

What must not change, and didn't:

- The JSON list `snippet` field bytes for any input.
- The web index row text for any input.
- The CLI `list` preview — it lives in a **different package** (`cmd/nj`) and
  uses a **different policy** (cap 40 with a trailing `...`). It only *looks*
  similar; the shared knowledge stops at "first line." Pulling it into this
  helper would mean crossing a package boundary and merging two different
  preview rules to save four lines. Not worth it — left alone on purpose.
- Public HTTP behavior, status codes, the on-disk `pastes.json` format.

## Patch Strategy

```txt
First patch:     snippet() + snippetWidth, both server call sites, + test  ← done
Second patch:    (none — this cleanup is self-contained)
Optional patch:  if cmd/nj ever shares the exact same preview policy, hoist
                 snippet into a shared package; not before.
Do not touch yet:
  - the read-modify-write race in store.Add/Remove (Grumpy #1) — needs a
    locking decision and concurrency tests, not a sweep. Hand to development-loop.
  - Get-bypasses-Load / 500-vs-404 (Grumpy #4) — that's a behavior change
    (status code), not a cleanup. Don't smuggle it into a refactor commit.
  - the frozen indexCount (Grumpy #3) — also a behavior fix; same reason.
```

## Tests Added

```txt
TestSnippetFirstLineAndCap()   // 5 cases pinning first-line + 64-cap behavior
```

## Result

```diff
+const snippetWidth = 64
+
+func snippet(content string) string {
+	s := content
+	if i := strings.IndexByte(s, '\n'); i >= 0 {
+		s = s[:i]
+	}
+	if len(s) > snippetWidth {
+		s = s[:snippetWidth]
+	}
+	return s
+}
```

Both 8-line copies collapse to `snippet(p.Content)`. Net change:
`+41 / −16` across `server.go` and `server_test.go` — and the package now has
exactly one definition of how a paste previews.

```
go build ./...   ok
go vet ./...     ok
go test ./...    ok   (server, store)
```

## Done Criteria

```txt
Done when:
- existing tests pass                                  ✓
- a new test pins the preview behavior                 ✓
- both server preview sites call one helper            ✓
- API list and web index output are byte-identical     ✓ (no behavior change)
- the CLI variant is left alone, with a reason         ✓
```

## Closing

Swept the duplicate, named the magic number, wrote the test that keeps it swept —
and left the race for someone with a locking plan. One safe patch; the next change
to this preview is now a one-liner.
