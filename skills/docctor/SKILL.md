---
name: docctor
description: >
  Author, structure, build, and host Apple DocC documentation — API
  reference from symbol comments, conceptual articles, step-by-step
  tutorials, and static documentation sites. Use when working with
  Swift or Objective-C documentation: writing /// doc comments,
  assembling a .docc documentation catalog, curating Topics groups,
  authoring .tutorial files, wiring the swift-docc-plugin, previewing
  docs, or publishing a doccarchive to GitHub Pages or a static host.
  Triggers - DocC, .docc, doccarchive, swift-docc, swift-docc-plugin,
  generate-documentation, @Metadata, @Tutorials, Topics curation,
  symbol linking, TechnologyRoot. Do NOT use for non-Apple doc systems
  (Jazzy, MkDocs, Sphinx, Docusaurus), for general Swift code review
  (use swifty), or for SwiftUI/HIG design review (use swift-design).
---

# DocCtor

DocCtor is the working reference for Apple's **DocC** documentation
compiler. It covers the four things you actually do with DocC — write
symbol docs, assemble a catalog, curate the reading order, and build a
site — plus the tutorial format and the full directive catalog in
`references/`.

DocC turns Markdown-based markup into rich documentation for Swift and
Objective-C frameworks and packages. One toolchain produces three kinds
of output from a **documentation catalog** (a `.docc` directory): API
**reference** generated from source comments, conceptual **articles**,
and interactive **tutorials**. The compiled result is a self-contained
`.doccarchive` — render JSON, assets, and a single-page web app.

## When to use this

- Documenting a Swift/Objective-C framework, package, or app module.
- Writing or fixing `///` symbol documentation and its parameters,
  returns, throws, and cross-references.
- Building a `.docc` catalog: landing page, articles, extension files,
  resources.
- Imposing a task-oriented reading order with `## Topics` curation.
- Authoring `.tutorial` files (table of contents + step-by-step pages).
- Wiring `swift-docc-plugin`, previewing locally, or publishing a
  static site to GitHub Pages or another host.

**Boundaries.** This is a documentation-authoring skill, not a code
review or design skill. For Swift idiom and concurrency review, use
`swifty`; for SwiftUI/HIG design, use `swift-design`. For non-Apple doc
generators (Jazzy, MkDocs, Sphinx, Docusaurus), this does not apply.

## Version and tooling baseline

- DocC ships with **Xcode 13 / Swift 5.5**. A documentation catalog in
  a SwiftPM package requires `swift-tools-version:5.5` or later.
- `swift-docc-plugin` requires **Swift 5.6+**. Dependency line:
  ```swift
  .package(url: "https://github.com/swiftlang/swift-docc-plugin", from: "1.1.0"),
  ```
  Pin higher (e.g. `from: "1.4.0"`) if you want recent fixes; it
  resolves within 1.x either way.
- Repos live under `swiftlang/` now (`swiftlang/swift-docc`,
  `swiftlang/swift-docc-plugin`); old `apple/…` URLs redirect.
- `@Metadata` inside a doc comment is Swift-DocC **6.1+** and only
  supports `@Available`; put every other metadata directive in an
  extension file.

## Quick start

Add the plugin to `Package.swift`, then build or preview:

```shell
# Build a DocC archive for a target
swift package generate-documentation --target MyFramework

# Preview live (the sandbox blocks the local server, so disable it)
swift package --disable-sandbox preview-documentation --target MyFramework
# → http://localhost:8000/documentation/myframework
```

In Xcode: **Product ▸ Build Documentation** (⌃⇧⌘D). The full toolchain —
static hosting, GitHub Pages, `xcodebuild docbuild`, `docc` CLI — is in
[`references/building-and-hosting.md`](references/building-and-hosting.md).

## 1 · Symbol documentation comments

Use `///` (single-line) or `/** … */` (multi-line). The **first
paragraph is the abstract**; content after a blank line becomes the
**Discussion**.

```swift
/// Eat the provided specialty sloth food.
///
/// Sloths love to eat while they move slowly through their rainforest
/// habitats. When they eat, a sloth's `energyLevel` increases by the
/// food's `energy`. See ``Sloth`` for the full lifecycle.
///
/// - Parameters:
///   - food: The food for the sloth to eat.
///   - quantity: The quantity of the food for the sloth to eat.
/// - Returns: The sloth's energy level after eating.
/// - Throws: ``SlothError/tooMuchFood`` if the quantity is above 100.
mutating public func eat(_ food: Food, quantity: Int) throws -> Int {
```

Rules that matter:

- **Abstract**: one plain-text sentence, ideally ≤150 characters, no
  links or jargon. Every public symbol earns at least an abstract.
- **Parameters**: use the grouped `- Parameters:` list for multiple
  parameters; use `- Parameter name:` for a single one. Indent
  continuation lines (4 spaces under `Parameters:`, 2 under a single
  `Parameter`).
- **Inline code** is single backticks: `` `energyLevel` ``. **Symbol
  links** are double backticks: `` ``Sloth`` `` (see §5).
- **Code listings** are fenced blocks with a language id; indent with
  **spaces, not tabs**, so DocC keeps the indentation.
- **Asides** attach as block quotes: `> Note:`, `> Important:`,
  `> Warning:`, `> Tip:`, `> Experiment:`.

## 2 · The documentation catalog (`.docc`)

A catalog is a directory ending in `.docc`, placed in the target's
source directory. Reach for one when you need a landing page, articles,
tutorials, or asset resources — plain source comments alone do not need
a catalog.

```
Sources/MyFramework/
├── MyFramework.swift
└── MyFramework.docc/                 # the documentation catalog
    ├── MyFramework.md                # landing page — title is ``MyFramework``
    ├── GettingStarted.md             # a free-form article
    ├── Sloth.md                      # symbol extension file — title is ``Sloth``
    ├── theme-settings.json           # optional appearance customization
    ├── Info.plist                    # optional bundle metadata
    ├── Resources/                    # images, videos, downloadable archives
    │   ├── sloth.png
    │   └── sloth~dark@2x.png
    └── Tutorials/
        ├── Table Of Contents.tutorial
        └── Creating-Custom-Sloths.tutorial
```

Two content-file types share the `.md` extension — the **first heading
tells them apart**:

- **Article** — first heading is plain text (`# Getting Started`). The
  filename never appears; DocC uses the title. URL = lowercased filename
  with punctuation/whitespace runs collapsed to `-`.
- **Extension file** — first heading is a symbol link
  (`` # ``Sloth`` ``). It appends to (or overrides) that symbol's
  in-source docs and curates its members. **The filename is ignored** —
  the symbol link in the heading determines the page. If that link can't
  resolve, DocC warns and skips the file.

The landing-page title must match the compiled **module/product name**
exactly. `Info.plist` is optional; when absent, pass
`--fallback-display-name` / `--fallback-bundle-identifier` to the CLI.

## 3 · Articles

```markdown
# Getting Started with Sloths

Create a sloth and assign personality traits and abilities.

## Overview

Sloths are complex creatures that require careful creation and a
suitable habitat.
```

- Line 1: `#` + plain-text title.
- Next non-blank line: single-sentence abstract.
- Then `## Overview` and further `##`/`###` sections.

Add metadata after the title inside `@Metadata { … }`. The most common
directives:

```markdown
# ``SlothCreator``

@Metadata {
    @DisplayName("Sloth Creator")
    @TechnologyRoot                    // makes this the catalog's top page
    @PageKind(article)                 // article | sampleCode
    @PageImage(purpose: card, source: "hero", alt: "…")
    @PageColor(purple)
    @Available(iOS, introduced: "15.0")
}
```

Use `@TechnologyRoot` when the catalog documents **no framework
symbols** (a pure-article or marketing catalog) and you must designate
the landing page yourself. An article that contains a `## Topics`
section becomes a **collection** — a navigable grouping page you link to
with `<doc:CollectionFileName>`. Full `@Metadata` child list and every
layout directive (`@Row`/`@Column`, `@TabNavigator`, `@Links`, `@Small`,
`@CallToAction`, …) are in
[`references/directives.md`](references/directives.md).

## 4 · Tutorials

Tutorials use the `.tutorial` extension (not `.md`) and come in two
kinds: a **table of contents** (`@Tutorials(name:)`) and **individual
pages** (`@Tutorial(time:)`). The step/section/assessment structure, the
`@Code` diffing behavior, and file-naming conventions are covered in
full in [`references/tutorials.md`](references/tutorials.md). Skeleton of
a page:

```
@Tutorial(time: 20) {
    @Intro(title: "Create a Custom Sloth") {
        Build a sloth and give it a power.
        @Image(source: intro.png, alt: "A sloth illustration.")
    }
    @Section(title: "Create the model") {
        @ContentAndMedia {
            Start from an empty package.
            @Image(source: section1.png, alt: "…")
        }
        @Steps {
            @Step {
                Add a Sloth type.
                @Code(name: "Sloth.swift", file: 01-01-sloth.swift)
            }
        }
    }
}
```

## 5 · Curation and linking

With no `## Topics` section DocC groups a page's children automatically
by symbol kind (alphabetical). Add `## Topics` to impose a
**task-oriented** order instead:

```markdown
# ``SlothCreator``

Catalog sloths you find in nature and create adorable virtual ones.

## Topics

### Creating Sloths
- ``SlothGenerator``
- ``Habitat``

### Caring for Sloths
- ``Activity``
- ``CareSchedule``
```

Group headers are `###`; each item is `-` plus a symbol link. Curate a
type's members in an **extension file** whose heading is the type link
(`` # ``SlothCreator/Sloth`` ``); links there resolve relative to the
module, so start nested paths with the top-level type name.

Link syntax:

| Target | Syntax |
|---|---|
| Symbol | `` ``Sloth`` `` · `` ``Sloth/eat(_:quantity:)`` `` |
| Absolute symbol path | `` ``/SlothCreator/Sloth/eat(_:quantity:)`` `` |
| Overload disambiguation | `` ``update(_:)-(Int)`` ``, `-method`, `-func`, `-init` |
| Article / tutorial | `<doc:GettingStarted>` · `<doc:tutorials/BaseName>` |
| Heading anchor | `<doc:OtherPage#Some-heading>` · `<doc:#Same-page-heading>` |
| Web | `[Apple](https://www.apple.com)` |

## Assets

Name asset files `base[~appearance][@scale].ext`, ext in
png/jpg/jpeg/svg/gif — e.g. `sloth.png`, `sloth~dark.png`,
`sloth~dark@2x.png`. In markup, reference **only the base name**:
`![A sloth](sloth)` or `@Image(source: sloth, alt: "…")`. Ship at least
standard + `@2x` and light + dark variants. Quote any source name that
contains whitespace, `,`, or `:`.

## Best practices

- Every public symbol gets an abstract; add Discussion plus
  Parameters/Returns/Throws for anything non-trivial.
- Lead the landing page with a `## Topics` structure that reads like a
  task list, not an alphabetical dump. Match its title to the module
  name exactly.
- Articles carry concepts and how-tos; tutorials carry guided,
  buildable, hands-on learning; extension files organize a type's
  members or override/append its source docs.
- Keep symbol curation in extension files — the filename is irrelevant,
  the heading symbol link is what routes the page.
- Prefer compiler-verified `@Snippet`s (top-level `Snippets/` dir) over
  inline code you have to keep in sync by hand.
- When the site is not served from the domain root, always build with
  `--transform-for-static-hosting` and `--hosting-base-path`.

## Common failure modes

- **Extension file silently dropped** — the heading symbol link didn't
  resolve, or two articles share a filename. Check the build warnings.
- **Landing page not recognized** — title doesn't match the module name,
  or a pure-article catalog is missing `@TechnologyRoot`.
- **Preview fails to serve** — you didn't pass `--disable-sandbox`; the
  sandbox blocks the local server's network access.
- **Broken static site** — missing `--hosting-base-path` (usually the
  repo name) when hosting under a subpath like GitHub Pages.
- **Tabs in code listings** collapse indentation — use spaces.
- **Manually numbered tutorial steps** — `@Step`s auto-number; don't
  prefix them yourself.

## References

- [`references/directives.md`](references/directives.md) — full
  `@`-directive catalog: metadata, page presentation, layout, content.
- [`references/tutorials.md`](references/tutorials.md) — the `.tutorial`
  file format, TOC vs page, steps, assessments, `@Code` diffing.
- [`references/building-and-hosting.md`](references/building-and-hosting.md)
  — plugin setup, CLI, previewing, static hosting, GitHub Pages,
  `xcodebuild docbuild`, appearance customization.

Primary sources: <https://www.swift.org/documentation/docc/>,
<https://developer.apple.com/documentation/docc>,
<https://github.com/swiftlang/swift-docc>,
<https://github.com/swiftlang/swift-docc-plugin>.
