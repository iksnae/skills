# DocC tutorials

Tutorials are interactive, buildable, step-by-step lessons. Files use
the `.tutorial` extension (not `.md`) and live in a `Tutorials/`
subdirectory of the catalog. There are two file kinds.

Reach for a tutorial (over an article) when the reader should follow
along and build something, seeing code and UI evolve step by step.

## Kind A — the table of contents

A `@Tutorials(name:)` file is the tutorials landing page. It holds a
required `@Intro`, one or more `@Chapter` blocks (each linking to
individual tutorial pages with `@TutorialReference`), optional `@Volume`
groupings, and an optional `@Resources` section. DocC sums each page's
`time` and adds a "Get Started" button automatically.

```
@Tutorials(name: "SlothCreator") {
    @Intro(title: "Meet SlothCreator") {
        Create, catalog, and care for sloths using SlothCreator.
        Get started by building the demo app _Slothy_.
        @Image(source: slothcreator-intro, alt: "Three iPhones side by side.")
    }

    @Volume(name: "Getting Started") {
        Build sloths, care for them, and interact with them.

        @Chapter(name: "SlothCreator Essentials") {
            @Image(source: chapter1, alt: "A wireframe of an app.")
            Create custom sloths and edit their attributes and powers.
            @TutorialReference(tutorial: "doc:Creating-Custom-Sloths")
        }
    }

    @Resources {
        Explore more resources for learning about sloths.
        @Videos(destination: "https://www.example.com/sloth-videos/") {
            Watch cute videos of sloths.
            - [Treetop Breakfast](https://www.example.com/sloth-videos/breakfast/)
        }
        @Downloads(destination: "https://www.example.com/wallpaper/") {
            Download the cutest sloth wallpaper.
        }
    }
}
```

`@Volume` is optional; with a single group you can put `@Chapter`s
directly under `@Tutorials`.

## Kind B — an individual tutorial page

A `@Tutorial(time:projectFiles:)` file. Structure: a required `@Intro`,
one or more `@Section(title:)` blocks, and an optional trailing
`@Assessments`. Each section starts with a required `@ContentAndMedia`
(optionally an `@Stack` of 1–3 of them), then a `@Steps` block of
`@Step`s.

```
@Tutorial(time: 20, projectFiles: SlothCreator.zip) {
    @Intro(title: "Create a Custom Sloth") {
        Build a sloth and give it a power.
        @Image(source: intro.png, alt: "A sloth illustration.")
    }

    @Section(title: "Create the model") {
        @ContentAndMedia {
            Start from an empty package.
            @Image(source: section1.png, alt: "An empty Xcode project.")
        }

        @Steps {
            @Step {
                Add a Sloth type.
                @Code(name: "Sloth.swift", file: 01-01-sloth.swift)
            }
            @Step {
                Give it an energy level.
                @Code(name: "Sloth.swift", file: 01-02-sloth.swift) {
                    @Image(source: preview-01-02.png, alt: "Result preview.")
                }
            }
        }
    }

    @Assessments {
        @MultipleChoice {
            Which type arranges views vertically?
            @Choice(isCorrect: false) {
                A state variable.
                @Justification(reaction: "Try again!") {
                    That stores data; it doesn't arrange views.
                }
            }
            @Choice(isCorrect: true) {
                A `VStack`.
                @Justification(reaction: "That's right.") {
                    A VStack arranges views in a vertical line.
                }
            }
        }
    }
}
```

## Directive parameters

| Directive | Required | Notes |
|---|---|---|
| `@Tutorials(name:)` | `name` | TOC root. Holds `@Intro`, `@Chapter`+, optional `@Volume`, `@Resources`. |
| `@Volume(name:)` | `name` | Groups chapters; optional `@Image`. |
| `@Chapter(name:)` | `name` | Holds `@TutorialReference`+ and an optional `@Image`. |
| `@TutorialReference(tutorial:)` | `tutorial` | Link as `"doc:PageFileName"`. |
| `@Tutorial(time:projectFiles:)` | — | `time` minutes (Int, optional); `projectFiles` downloadable archive (optional). |
| `@Intro(title:)` | `title` | First element; holds `@Image`/`@Video`. |
| `@Section(title:)` | `title` | First child must be `@ContentAndMedia`. |
| `@ContentAndMedia` | — | Text plus `@Image`/`@Video`. |
| `@Stack` | — | 1–3 horizontally arranged `@ContentAndMedia`. |
| `@Steps` / `@Step` | — | `@Step` holds text plus one of `@Code`/`@Image`/`@Video`. |
| `@Code(name:file:previousFile:reset:)` | `name`, `file` | `name` = filename shown; `file` = a `.swift` in the catalog. May contain an `@Image` result preview. |
| `@Image(source:alt:)` | `source`, `alt` | png/jpg/jpeg/svg/gif. |
| `@Video(source:poster:)` | `source`, `poster` | video mov/mp4; poster image. |
| `@XcodeRequirement` | — | Declares a required Xcode version. |
| `@Assessments` → `@MultipleChoice` → `@Choice(isCorrect:)` → `@Justification(reaction:)` | see table | End-of-page quiz. |

## `@Code` diffing

DocC automatically diffs each step's code file against the previous
step's, highlighting the change. There is no diff on a section's first
step. Two attributes tune this:

- **`previousFile:`** — override the diff base (compare against a
  different file than the immediately preceding step).
- **`reset: true`** — disable diffing for this step and show the file
  fresh. The attribute is `reset`, not `resetToStep`.

Recommended code-file naming:
`[TutorialOrNumber]-[SectionNumber]-[StepNumber]-[Descriptive].swift`,
e.g. `01-02-sloth.swift`. Prefix tutorial media (e.g. `tutorial_…`) to
keep it distinct from reference-doc assets.

## Gotchas

- `@Step`s **auto-number** — never prefix them with numbers yourself.
- Every `@Image`/`@Video` needs a real `alt` description for
  accessibility.
- A section's `@ContentAndMedia` must come **before** its `@Steps`.
- Files are `.tutorial`, not `.md`; a tutorial saved as `.md` will not
  be recognized as a tutorial.
