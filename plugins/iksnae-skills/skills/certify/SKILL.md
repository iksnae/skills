---
name: certify
description: Run code certification on a repository, scoring every code unit across 9 quality dimensions (correctness, maintainability, readability, testability, security, architectural fitness, operational quality, performance, change risk). Produces a graded report card with per-unit scores, identifies D/F-grade units, and generates a prioritized remediation plan. Works for Go and TypeScript/Vue codebases. Keywords - certify, certification, grade, score, quality, audit, remediation, report card, lint, test, complexity.
---

# Code Certification

## Purpose

Certify a codebase by discovering all code units, collecting multi-source evidence, scoring each unit across 9 quality dimensions, and producing a graded report card. Optionally generate a prioritized remediation plan for failing units.

This skill replicates the `certify` CLI tool's pipeline using Claude as the analysis engine, with direct tool access to the codebase.

## When to Use

- "Certify this repo" / "run certification"
- "Grade this codebase"
- "What's the quality score?"
- "Find the worst code units"
- "Create a remediation plan for low-quality code"
- After completing a major refactoring phase
- Before a release

## Procedure

### Step 1: Identify Target Repository

Determine which submodule or directory to certify. Check for language markers:

```bash
# Go project?
ls <target>/go.mod

# TypeScript/Node project?
ls <target>/package.json

# Check for existing certification config
ls <target>/.certification/config.yml
```

Read any existing `.certification/config.yml` for scope include/exclude patterns.

### Step 2: Discover Code Units

A **code unit** is a certifiable element: a Go function, method, or type declaration; or a TypeScript/Vue file, function, or component.

**Unit ID format:** `<language>://<path>[#<symbol>]`
- `go://internal/service/sync.go#Apply`
- `ts://src/parser/tokenize.ts#tokenizeDialogue`

#### Go Discovery

Find all non-test `.go` files, parse each to extract:
- **Functions** (standalone `func Name(...)`) → `UnitTypeFunction`
- **Methods** (func with receiver `func (r *Type) Name(...)`) → `UnitTypeMethod`
- **Type declarations** (`type Name struct/interface`) → `UnitTypeClass`

Skip: `vendor/`, `node_modules/`, `testdata/`, `.*` directories, `*_test.go` files.

```bash
# List all Go source files in scope
find <target> -name '*.go' -not -name '*_test.go' -not -path '*/vendor/*' -not -path '*/node_modules/*' -not -path '*/testdata/*' -not -path '*/.*/*' | head -50

# Count total Go files
find <target> -name '*.go' -not -name '*_test.go' -not -path '*/vendor/*' -not -path '*/node_modules/*' | wc -l
```

#### TypeScript/Vue Discovery

Find all `.ts`, `.tsx`, `.vue` files. Each file is a unit (`UnitTypeFile` or `UnitTypeModule`).

Skip: `node_modules/`, `dist/`, `.nuxt/`, `.output/`, `*.d.ts`, `*.test.ts`, `*.spec.ts`.

```bash
find <target> -name '*.ts' -o -name '*.tsx' -o -name '*.vue' | grep -v node_modules | grep -v dist | grep -v '.nuxt' | grep -v '.output' | grep -v '.d.ts' | grep -v '.test.' | grep -v '.spec.' | head -50
```

### Step 3: Collect Evidence

For each unit, collect evidence from multiple sources. Evidence has a **kind**, **source**, **passed** flag, **metrics** map, and **confidence** (0.0–1.0).

#### Evidence Kind: Lint

```bash
# Go: golangci-lint (preferred) or go vet
cd <target> && golangci-lint run --out-format json ./... 2>&1 | head -200
cd <target> && go vet ./... 2>&1

# TypeScript: ESLint
cd <target> && npx eslint --format json . 2>&1 | head -200
```

Attribute lint findings to specific files/units by file path and line range.

**Metrics to extract:**
- `lint_errors` — count of error-severity findings per unit
- `lint_warnings` — count of warning-severity findings per unit

#### Evidence Kind: Test

```bash
# Go: JSON test output
cd <target> && CGO_ENABLED=0 go test -json -count=1 ./... 2>&1 | tail -100

# TypeScript: Vitest
cd <target> && npx vitest run --reporter=json 2>&1 | tail -100
```

**Metrics to extract:**
- `test_pass_count` — tests passed for this unit's package
- `test_fail_count` — tests failed
- `test_total_count` — total tests

#### Evidence Kind: Metrics (Complexity & Size)

For Go, compute **cyclomatic complexity** per function:
- Base complexity = 1
- +1 for each: `if`, `for`, `range`, `case` (non-default), `&&`, `||`, `select`

```bash
# Use gocognit or manual AST inspection
cd <target> && gocognit -top 20 . 2>/dev/null || echo "gocognit not installed"

# Alternative: golangci-lint includes complexity
cd <target> && golangci-lint run --enable gocognit,funlen --out-format json ./... 2>&1 | head -100
```

**Metrics to extract per unit:**
- `complexity` — cyclomatic complexity
- `code_lines` — lines of code (excluding blanks/comments)
- `total_lines` — total lines
- `comment_lines` — comment lines
- `todo_count` — TODO/FIXME markers

#### Evidence Kind: Structural (AST Analysis)

Read source files and analyze structure. For Go functions, determine:

| Metric | What it measures |
|--------|-----------------|
| `param_count` | Number of function parameters |
| `return_count` | Number of return values |
| `max_nesting_depth` | Deepest if/for/switch nesting |
| `naked_returns` | Bare returns in named-return functions |
| `errors_ignored` | `_ = err` or `_, _ = f()` patterns |
| `panic_calls` | `panic()` calls in production code |
| `os_exit_calls` | `os.Exit()` calls |
| `defer_in_loop` | `defer` inside for/range loops |
| `context_not_first` | `context.Context` param not in first position |
| `global_mutable_count` | Package-level `var` declarations (mutable) |
| `has_init_func` | File contains `init()` function |
| `has_doc_comment` | Exported symbol has doc comment |

```bash
# Quick structural scan for a specific file
grep -c 'panic(' <file>
grep -c 'os.Exit' <file>
grep -c 'func init()' <file>
grep -n '_ =' <file>
```

#### Evidence Kind: Git History

```bash
cd <target> && git log --format='%H%x09%an%x09%ad' --date=short | head -20
cd <target> && git log --since="90 days ago" --oneline | wc -l
cd <target> && git log --format='%an' | sort | uniq -c | sort -rn | head -10
```

**Metrics:**
- `commit_count` — total commits
- `recent_commits` — commits in last 90 days
- `contributor_count` — unique authors
- `repo_age_days` — days since first commit

### Step 4: Evaluate Policy Rules

Apply policy rules to evidence. Each rule targets a **dimension** and has a **threshold**. If a metric exceeds the threshold, it's a **violation**.

#### Default Policy Rules

| Rule ID | Dimension | Metric | Threshold | Severity |
|---------|-----------|--------|-----------|----------|
| `complexity_limit` | Maintainability | `complexity` | 15 | error |
| `func_length` | Readability | `code_lines` | 80 | warning |
| `param_count` | Maintainability | `param_count` | 5 | warning |
| `nesting_depth` | Readability | `max_nesting_depth` | 4 | warning |
| `no_panic` | Correctness | `panic_calls` | 0 | error |
| `no_os_exit` | Correctness | `os_exit_calls` | 0 | warning |
| `errors_handled` | Correctness | `errors_ignored` | 0 | error |
| `doc_comments` | Readability | `has_doc_comment` (exported) | — | info |
| `no_defer_loop` | Correctness | `defer_in_loop` | 0 | warning |
| `context_first` | Maintainability | `context_not_first` | 0 | info |
| `no_naked_return` | Readability | `naked_returns` | 0 | info |

### Step 5: Score Dimensions

Score each unit across **9 dimensions** on a 0.0–1.0 scale. Start at 1.0 and apply penalties based on evidence:

#### Dimension Scoring

| Dimension | Evidence Sources | Penalty Rules |
|-----------|-----------------|---------------|
| **Correctness** | Lint errors, test failures, panic calls, errors ignored | −0.15 per lint error, −0.25 per test failure, −0.20 per panic |
| **Maintainability** | Complexity, param count, global mutables | −0.10 per 5 CC over 10, −0.05 per param over 4 |
| **Readability** | Code lines, nesting depth, doc comments, naked returns | −0.10 per 20 lines over 60, −0.05 per nesting over 3 |
| **Testability** | Test coverage, test existence, test failures | −0.30 if no tests for package, −0.15 per failure |
| **Security** | Panic calls, os.Exit, hardcoded values | −0.20 per panic, −0.10 per os.Exit |
| **Architectural Fitness** | Global mutables, init funcs, context ordering | −0.15 per global mutable, −0.10 per init func |
| **Operational Quality** | Error handling, defer patterns, logging | −0.10 per ignored error, −0.15 per defer-in-loop |
| **Performance** | Algorithmic complexity, nested loops | −0.10 for O(n²), −0.20 for O(n³) |
| **Change Risk** | Git churn, contributor count, recent changes | Based on git history patterns |

#### Weighted Average

Compute overall score as weighted average of dimensions:

| Dimension | Weight |
|-----------|--------|
| Correctness | 0.20 |
| Maintainability | 0.15 |
| Readability | 0.10 |
| Testability | 0.15 |
| Security | 0.10 |
| Architectural Fitness | 0.10 |
| Operational Quality | 0.10 |
| Performance | 0.05 |
| Change Risk | 0.05 |

### Step 6: Assign Grades

| Grade | Score Range |
|-------|-------------|
| A | ≥ 93% |
| A- | ≥ 90% |
| B+ | ≥ 87% |
| B | ≥ 80% |
| C | ≥ 70% |
| D | ≥ 60% |
| F | < 60% |

#### Status Assignment

| Status | Condition |
|--------|-----------|
| `certified` | Grade ≥ B, no error/critical violations |
| `certified_with_observations` | Grade ≥ B, has warning violations |
| `probationary` | Grade C or D |
| `decertified` | Grade F or has critical violations |

### Step 7: Generate Report Card

Produce a report card summarizing the certification run. Output to `.certification/REPORT_CARD.md`:

```markdown
# 📊 Certification Report Card

**Repository:** <name>
**Generated:** <date>
**Overall Grade:** 🟢 B (82.5%)
**Pass Rate:** 85.3% (2830/3320 units passing)

## Grade Distribution

| Grade | Count | Percentage |
|-------|------:|------------|
| A     |   450 | 13.6%      |
| A-    |   320 | 9.6%       |
| B+    |   280 | 8.4%       |
| B     |  1780 | 53.6%      |
| C     |   320 | 9.6%       |
| D     |    21 | 0.6%       |
| F     |     2 | 0.1%       |

## Top Issues

| Unit | Grade | Score | Issue |
|------|:-----:|------:|-------|
| ... | D | 62.1% | complexity 45, 120 lines |

## By Language

| Language | Units | Avg Score | Pass Rate |
|----------|------:|----------:|----------:|
| Go       |  3200 | 84.2%     | 87.1%     |
| TypeScript | 120 | 76.3%   | 72.5%     |
```

### Step 8: Generate Remediation Plan (Optional)

If there are D or F grade units, create a prioritized remediation plan:

```markdown
# Remediation Plan

## Priority 1: Critical (F-grade units)
...

## Priority 2: High (D-grade units with error violations)
...

## Priority 3: Medium (D-grade units with warning violations)
...

## Estimated Impact
- Fixing P1 items: F→B projected, overall grade impact +X%
- Fixing P2 items: D→C projected, overall grade impact +X%
```

Group remediation items by:
1. **Root cause** — same underlying issue across units (e.g., "high complexity in bot/commands")
2. **Effort** — S/M/L estimate
3. **Impact** — projected score improvement

## Output Files

| File | Content |
|------|---------|
| `.certification/REPORT_CARD.md` | Report card with grades and distribution |
| `.certification/badge.json` | JSON badge data (grade, score, pass rate) |
| `specs/remediation-plan.md` | Prioritized remediation plan (if D/F units exist) |

## Adapting for Project Type

### Go Projects
- Use `CGO_ENABLED=0 go test` if CGO issues exist (check AGENTS.md)
- Run `golangci-lint` with project's `.golangci.yml` config
- Respect `new: true` for grandfathered violations
- Check `code/` subdirectory for nested Go modules (monorepo / nested-module pattern)

### TypeScript/Vue Projects
- Run `pnpm lint` for ESLint
- Run `pnpm typecheck` for TypeScript errors
- Check all apps build: `pnpm build:web`
- Note: Nuxt auto-imports mean fewer explicit imports to track
- Storybook stories are dev-only, weight accordingly

## Scoring Calibration Notes

These notes capture lessons from certifying a multi-module Go workspace:

1. **SQLite/CGO test failures** tank testability scores globally — consider excluding known-failing packages or noting them separately
2. **certify's `HasGoMod()` only checks repo root** — repos with `go.mod` in a subdirectory (e.g. a `code/` folder) need the path specified
3. **Error wrapping matters** — bare `return err` counts against correctness; wrap with `fmt.Errorf("context: %w", err)`
4. **Global mutable vars** are constitutional violations in this workspace — severity should be `error` not `warning`
5. **Pre-existing lint violations** grandfathered with `new: true` shouldn't count against current certification
6. **File > 500 lines** is a workspace rule (AGENTS.md) — score as maintainability violation
