# Building, previewing, and hosting DocC

## The SwiftPM plugin

Add `swift-docc-plugin` to `Package.swift`:

```swift
.package(url: "https://github.com/swiftlang/swift-docc-plugin", from: "1.1.0"),
```

Requires `swift-tools-version:5.6` or later. The plugin adds the
`generate-documentation` and `preview-documentation` package commands.

## Building an archive

```shell
# Whole package (all documentable targets)
swift package generate-documentation

# One target or product
swift package generate-documentation --target MyFramework
swift package generate-documentation --product ArgumentParser
```

Write the archive to a chosen directory (the plugin needs explicit
write permission):

```shell
swift package --allow-writing-to-directory ./docs \
    generate-documentation --target MyFramework --output-path ./docs
```

## Previewing locally

```shell
swift package --disable-sandbox preview-documentation --target MyFramework
```

`--disable-sandbox` is required — the SwiftPM sandbox blocks the local
preview server's network access. The server runs at, for example,
`http://localhost:8000/documentation/myframework`. On macOS DocC watches
the catalog and recompiles on change; on other platforms restart the
command to pick up edits.

## Extended types

Documentation for extensions on types from other modules:

```shell
swift package generate-documentation --include-extended-types
swift package generate-documentation --exclude-extended-types
```

Available on Swift 5.8+ / plugin 1.2+. From Swift 5.9 / plugin 1.3 it is
on by default, so `--exclude-extended-types` is the opt-out.

## Static hosting

When the docs are not served from a domain root, transform for static
hosting and set the base path:

```shell
swift package --allow-writing-to-directory ./docs \
    generate-documentation --target MyFramework --output-path ./docs \
    --transform-for-static-hosting --hosting-base-path MyFramework
```

`--hosting-base-path` is the subpath the site lives under (often the
repository name). Omitting it is the usual cause of a broken static
site (missing CSS/JS, dead links).

## Publishing to GitHub Pages

```shell
swift package --allow-writing-to-directory ./docs \
    generate-documentation --target MyTarget \
    --disable-indexing \
    --transform-for-static-hosting \
    --hosting-base-path MyRepo \
    --output-path ./docs
```

Commit the `./docs` directory and push; point GitHub Pages at it. The
result is served at:

```
https://<username>.github.io/<repo>/documentation/<target>
```

Hosting a `.doccarchive` on a custom server additionally needs
web-server routing/redirect rules (see Apple's "Distributing
documentation to other developers").

## The standalone `docc` CLI

Used when you invoke DocC directly (for example, previewing a catalog
without a full package build):

```shell
docc preview MyPackage.docc \
    --fallback-display-name MyPackage \
    --fallback-bundle-identifier com.example.MyPackage \
    --fallback-bundle-version 1
```

The `--fallback-*` flags supply values that would otherwise come from
`Info.plist`.

## Xcode / xcodebuild

GUI: **Product ▸ Build Documentation** (⌃⇧⌘D) opens the archive in the
documentation window.

Command line:

```shell
xcodebuild docbuild -scheme MeetingNotes -derivedDataPath ~/MeetingNotesBuild

xcodebuild docbuild \
  -scheme TARGET_NAME \
  -derivedDataPath PATH \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```

The archive lands at
`<derivedDataPath>/Build/Products/<config>/*.doccarchive`.

## Appearance customization

Add `theme-settings.json` to the **catalog root** to restyle the site.
Common keys:

- `theme.color.*` — CSS custom properties, with `dark` / `light`
  variants.
- `theme.typography.html-font` / `html-font-mono`.
- `theme.aside`, `theme.button`, `theme.code`, `theme.border-radius`.
- `theme.icons.*` — override sidebar SVGs by `id`.
- `meta.title` — a suffix for the HTML `<title>`.
- `features.docs.quickNavigation`, `features.docs.onThisPageNavigator`.

An optional `favicon.ico` (or `.svg`) in the catalog root sets the site
favicon.

## Info.plist keys

Optional, in the catalog root. Fallbacks exist via CLI flags, so a
plist is often unnecessary.

- `CFBundleDisplayName` — display name.
- `CFBundleIdentifier` — bundle id.
- `CFBundleVersion` — version.
- `CDDefaultCodeListingLanguage` — default fenced-code language.
- `CDAppleDefaultAvailability` — default platform availability.
