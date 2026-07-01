# DocC directive reference

Directives are `@Name(arguments) { … }`. This catalogs the ones you use
when authoring reference pages and articles. Tutorial-only directives
(`@Tutorials`, `@Chapter`, `@Steps`, …) live in
[`tutorials.md`](tutorials.md).

Sources verified from the swift-docc repo docs
(`Sources/docc/DocCDocumentation.docc/`) are marked ✓. Layout and
page-config directives documented only on
<https://developer.apple.com/documentation/docc> are given with their
documented syntax — confirm exact argument labels there before relying
on an unusual one.

## Configuration and metadata

### `@Metadata { … }` ✓
Container placed directly after a page's title. Holds the child
directives below. Inside a `///` doc comment only `@Available` is
allowed (Swift-DocC 6.1+); everything else must live in an extension
file. When `@Metadata` appears in both the comment and the extension,
the extension wins.

Full child-directive set: `DocumentationExtension`, `TechnologyRoot`,
`DisplayName`, `PageImage`, `PageKind`, `PageColor`, `CallToAction`,
`TitleHeading`, `SupportedLanguage`, `AlternateRepresentation`,
`Available`, `DeprecationSummary`, `Redirected`.

```markdown
# ``SlothCreator``

@Metadata {
    @DisplayName("Sloth Creator", style: symbol)
    @TitleHeading("Framework")
    @PageKind(article)
    @PageImage(purpose: card, source: "hero", alt: "A sloth.")
    @PageColor(purple)
    @Available(iOS, introduced: "15.0")
    @Redirected(from: "old/path/to/page")
}
```

- **`@DocumentationExtension(mergeBehavior:)`** ✓ — `override` replaces
  the in-source docs. Default is append; writing `append` explicitly is
  redundant and warns.
- **`@TechnologyRoot`** ✓ — designates this article as the catalog's
  top-level page. Use it for catalogs that document no framework symbols.
- **`@DisplayName(_:style:)`** ✓ — override the displayed name; add
  `style: symbol` for a monospaced treatment.
- **`@TitleHeading(_:)`** ✓ — the small "eyebrow"/kicker text shown
  above the title.
- **`@PageKind(_:)`** — `article` or `sampleCode`.
- **`@PageImage(purpose:source:alt:)`** — `purpose:` is `icon` or
  `card`.
- **`@PageColor(_:)`** — a named accent: `purple`, `blue`, `green`,
  `orange`, `yellow`, `gray`, etc.
- **`@CallToAction(url:|file:, purpose:, label:)`** — a prominent button;
  `purpose:` is `download` or `link`. Common on sample-code pages.
- **`@SupportedLanguage(_:)`** — restrict a page to `swift` or `objc`.
- **`@Available(_:introduced:)`** and **`@DeprecationSummary { … }`** —
  availability annotations.
- **`@Redirected(from:)`** ✓ — register an alias URL (a `@Metadata`
  child from DocC 6.0; previously top-level).

### `@Options { … }`
Page- or bundle-level rendering options. Placed at the top of a page, or
apply bundle-wide with `@Options(scope: global)` on the landing page.
Children include `@AutomaticSeeAlso(…)`, `@AutomaticTitleHeading(…)`, and
`@TopicsVisualStyle(…)`.

## Layout and content directives

These work on articles and landing pages.

### `@Row` / `@Column(size:)`
Grid layout. `size:` sets relative column width (default 1).

```markdown
@Row {
    @Column {
        ### Fast
        The quick path.
    }
    @Column(size: 2) {
        ### Slow
        The wider column, twice the width.
    }
}
```

### `@TabNavigator { @Tab("Title") { … } }`
Tabbed content sections on a single page.

### `@Links(visualStyle:) { … }`
Render a curated group of links. `visualStyle:` is `list`,
`compactGrid`, or `detailedGrid`.

```markdown
@Links(visualStyle: detailedGrid) {
    - ``SlothGenerator``
    - ``Habitat``
}
```

### `@Image(source:alt:)` ✓ and `@Video(source:poster:)` ✓
Embed media. Image ext: png/jpg/jpeg/svg/gif. Video ext: mov/mp4 with a
poster image. Reference the **base asset name** only (no `~dark`, `@2x`,
or extension).

### `@Small { … }`
Fine-print / footnote-sized text (attribution, legal notes).

### `@Comment { … }` ✓
Author-only note stripped from the rendered output. HTML comments
(`<!-- … -->`) work too.

### `@Snippet(path:slice:)` ✓
Embed a compiler-verified code snippet. Put `.swift` files in a
top-level `Snippets/` directory (parallel to `Sources`). Hide lines
between `// snippet.hide` and `// snippet.show`; name a slice with
`// snippet.sliceName` and embed it with
`@Snippet(path: "example-snippet", slice: "setup")`. Snippets compile
with `swift run example-snippet`.

## Formatting outside directives ✓

- Bold `**text**`, italics `_text_`, inline code `` `code` ``.
- Fenced code blocks take a language id; indent with spaces, not tabs.
- Lists need ≥2 items and cannot hold images or code between items.
- Term lists: `- term Name: Definition`.
- Asides as block quotes: `> Note:`, `> Important:`, `> Warning:`,
  `> Tip:`, `> Experiment:`. Single-line form: `- Note: …`.
- Tables: header row, a separator row (≥3 `-` per column), then cells,
  all `|`-separated. Alignment via `:---`, `:---:`, `---:`. Column-span
  with adjacent `||`; row-span with `^` in the cell below. Cells hold a
  single line only — no lists, code, asides, or directives.
- Escape special characters with `\`.
