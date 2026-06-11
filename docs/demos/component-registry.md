# Component registry — nightjar title card

Minimal registry for the nightjar title-card demo spec. Builtins
(AbsoluteFill, Sequence, etc.) are not listed.

### Wordmark

The `nightjar` wordmark rendered in monospace, flat fill, no shadow.

- props: `{ frame: number, opacity: number }`

### AccentRule

A single 2px-tall horizontal rule in the signal accent, drawn by
interpolating its width from a left anchor.

- props: `{ frame: number, width: number }`
