# docctor

> A working reference for Apple's DocC — write symbol docs, assemble a catalog, curate the reading order, author tutorials, and ship a documentation site.

![docctor](assets/docctor.png)

## What it does

`docctor` is the field reference for building documentation with Apple's
DocC compiler. It covers the four things you actually do — write `///`
symbol documentation, assemble a `.docc` documentation catalog, curate a
task-oriented reading order with `## Topics`, and build or host the
result — plus the full `.tutorial` file format and the complete
`@`-directive catalog.

The skill body carries the core authoring workflow inline (symbol
comments, catalog structure, articles, tutorials, curation, linking, and
asset naming). Three reference files hold the exhaustive material:
`references/directives.md` (every metadata, layout, and content
directive), `references/tutorials.md` (TOC vs page, steps, assessments,
`@Code` diffing), and `references/building-and-hosting.md` (the
swift-docc-plugin, the `docc` CLI, previewing, static hosting, GitHub
Pages, `xcodebuild docbuild`, and appearance theming).

Every syntax example is drawn from Apple's and Swift.org's current
documentation, with version baselines noted (DocC ships with Xcode 13 /
Swift 5.5; the plugin needs Swift 5.6+).

## When to use it

- Documenting a Swift or Objective-C framework, package, or app module.
- Writing or fixing `///` symbol docs — parameters, returns, throws,
  cross-references.
- Building a `.docc` catalog: landing page, articles, extension files,
  resources.
- Imposing a reading order that reads like a task list rather than an
  alphabetical dump.
- Authoring `.tutorial` files, from the table of contents to individual
  step-by-step pages.
- Wiring `swift-docc-plugin`, previewing locally, or publishing a
  static site to GitHub Pages.

When NOT to use it: for non-Apple documentation systems (Jazzy, MkDocs,
Sphinx, Docusaurus), for general Swift idiom and concurrency review (use
`swifty`), or for SwiftUI and Human Interface Guidelines design review
(use `swift-design`).

## Install

```
/plugin marketplace add iksnae/skills
npx skills add iksnae/skills
npx @iksnae/skills add docctor
# or copy skills/docctor/ into ~/.agents/skills/
```
