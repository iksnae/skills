# TypeScript / JavaScript Tree Shaking & Bundle Optimization Guide

> A comprehensive guide to removing unused JavaScript and TypeScript code through ESM, bundlers, side-effect declarations, code splitting, minification, and package design.

---

# Table of Contents

1. Introduction
2. What Tree Shaking Means in JS/TS
3. Why ESM Matters
4. CommonJS vs ESM
5. Bundlers
6. TypeScript Compiler Settings
7. `sideEffects`
8. Pure Annotations
9. Minification
10. Code Splitting
11. Dynamic Imports
12. Barrel Files
13. Package Design
14. Framework-Specific Notes
15. Node.js Backend Bundling
16. Measuring Bundle Size
17. Debugging Tree Shaking
18. Common Mistakes
19. Recommended Configs
20. Vokda Package Recommendations
21. Summary

---

# Introduction

Tree shaking in JavaScript and TypeScript means removing code that is imported, bundled, or present in source files but never actually used by the final application.

Unlike Go or Swift, JavaScript tree shaking usually depends heavily on bundlers.

Common tools include:

```text
Vite
Rollup
esbuild
Webpack
Rspack
Turbopack
SWC
tsup
unbuild
```

The most important rule:

> Tree shaking works best with static ES modules.

---

# What Tree Shaking Removes

Tree shaking can remove:

```text
unused exports
unused functions
unused classes
unused constants
unused modules
unused re-exports
unused branches
unused development-only code
unused dependencies
```

Example:

```ts
export function used() {
  return "used"
}

export function unused() {
  return "unused"
}
```

```ts
import { used } from "./lib"

console.log(used())
```

A bundler may remove:

```ts
unused()
```

from the final bundle.

---

# Why ESM Matters

Tree shaking depends on static analysis.

ESM is statically analyzable:

```ts
import { parse } from "./parser"
export { analyze } from "./analyze"
```

The bundler can see exactly what is imported and exported.

CommonJS is harder:

```js
const lib = require("./lib")
lib[someDynamicName]()
```

The bundler cannot easily know what is used.

---

# CommonJS vs ESM

Prefer:

```ts
import { thing } from "package"
```

Avoid:

```ts
const pkg = require("package")
```

Prefer:

```ts
export function parse() {}
export function analyze() {}
```

Avoid:

```ts
module.exports = {
  parse,
  analyze,
}
```

For libraries, ship ESM when possible.

---

# Bundlers

## Rollup

Rollup is one of the strongest tree-shaking bundlers.

It is commonly used for:

```text
libraries
SDKs
component packages
CLIs
framework tooling
```

Rollup removes unused exports and modules, and its docs describe tree-shaking as removing files not used by entry points or files without side effects.

Basic config:

```ts
// rollup.config.ts

import typescript from "@rollup/plugin-typescript"

export default {
  input: "src/index.ts",
  output: [
    {
      file: "dist/index.js",
      format: "esm",
      sourcemap: true,
    },
  ],
  plugins: [typescript()],
  treeshake: true,
}
```

Advanced:

```ts
export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "esm",
    preserveModules: true,
    preserveModulesRoot: "src",
  },
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    tryCatchDeoptimization: false,
  },
}
```

Use advanced settings carefully.

---

## esbuild

esbuild is extremely fast and supports tree shaking when bundling or outputting ESM/IIFE.

Example:

```bash
esbuild src/index.ts \
  --bundle \
  --format=esm \
  --platform=browser \
  --minify \
  --tree-shaking=true \
  --outfile=dist/index.js
```

For Node:

```bash
esbuild src/server.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --target=node20 \
  --minify \
  --tree-shaking=true \
  --outfile=dist/server.js
```

esbuild is conservative about side effects. It removes code only when it can prove the code is safe to remove.

---

## Webpack

Webpack tree shaking relies on:

```text
usedExports
sideEffects
production mode
minification
ESM
```

Webpack docs distinguish `usedExports` from `sideEffects`; `sideEffects` can be more powerful because it lets Webpack skip entire modules and subtrees.

Basic production config:

```js
// webpack.config.js

module.exports = {
  mode: "production",
  entry: "./src/index.ts",
  output: {
    filename: "bundle.js",
    path: __dirname + "/dist",
  },
  optimization: {
    usedExports: true,
    sideEffects: true,
    minimize: true,
  },
}
```

---

## Vite

Vite uses Rollup for production builds.

Typical config:

```ts
// vite.config.ts

import { defineConfig } from "vite"

export default defineConfig({
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: true,
    rollupOptions: {
      treeshake: true,
    },
  },
})
```

Vite is usually a strong default for apps.

---

## tsup

`tsup` is a convenient wrapper around esbuild.

Good for libraries and CLIs.

```ts
// tsup.config.ts

import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: true,
  treeshake: true,
  target: "node20",
})
```

---

# TypeScript Compiler Settings

TypeScript itself does not bundle or tree-shake.

It emits JavaScript.

Use TypeScript to preserve ESM for bundlers.

Recommended:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "strict": true
  }
}
```

Important:

```json
"module": "ESNext"
```

This preserves ESM syntax for bundlers.

Avoid compiling libraries directly to CommonJS if tree shaking matters.

---

# `sideEffects`

The `sideEffects` field in `package.json` tells bundlers whether files can be safely removed.

Best case:

```json
{
  "sideEffects": false
}
```

This means:

> If an exported module is unused, the bundler can drop it.

But only use this when your package truly has no import-time side effects.

---

# Side Effect Examples

Side-effect-free:

```ts
export function add(a: number, b: number) {
  return a + b
}
```

Has side effects:

```ts
console.log("loaded")
```

```ts
window.myGlobal = {}
```

```ts
document.body.classList.add("ready")
```

```ts
registerPlugin(...)
```

```ts
import "./global.css"
```

---

# Selective Side Effects

If most files are side-effect-free but some are not:

```json
{
  "sideEffects": [
    "./src/polyfills.ts",
    "./src/register.ts",
    "./src/**/*.css"
  ]
}
```

This is common for UI libraries.

---

# Pure Annotations

Bundlers and minifiers recognize pure annotations:

```ts
const result = /* @__PURE__ */ createThing()
```

If `result` is unused, the call may be removed.

Useful for:

```ts
const Component = /* @__PURE__ */ memo(function Component() {
  return null
})
```

```ts
export const schema = /* @__PURE__ */ createSchema({})
```

Use carefully. You are promising the call has no side effects.

---

# Minification

Tree shaking marks code as unused.

Minification often removes it.

Common minifiers:

```text
Terser
esbuild
SWC
UglifyJS
```

Example:

```bash
esbuild src/index.ts --bundle --minify --outfile=dist/app.js
```

Webpack production mode enables minimization by default.

Rollup often uses plugins such as:

```text
@rollup/plugin-terser
```

---

# Dead Branch Elimination

Bundlers can remove branches when constants are known.

Example:

```ts
if (process.env.NODE_ENV !== "production") {
  debugTools()
}
```

Production build can remove `debugTools()`.

Vite:

```ts
if (import.meta.env.DEV) {
  debugTools()
}
```

esbuild:

```bash
esbuild src/index.ts \
  --bundle \
  --define:process.env.NODE_ENV='"production"' \
  --minify
```

---

# Feature Flags

Example:

```ts
if (__ENABLE_SPEECH__) {
  startSpeechRuntime()
}
```

esbuild:

```bash
esbuild src/index.ts \
  --bundle \
  --define:__ENABLE_SPEECH__=false \
  --minify
```

The speech code may disappear if it becomes unreachable.

---

# Code Splitting

Tree shaking removes unused code.

Code splitting separates used code into lazy chunks.

Example:

```ts
const module = await import("./heavy-editor")
```

This keeps `heavy-editor` out of the initial bundle.

Useful for:

```text
admin panels
AI tools
video editors
charts
3D rendering
PDF export
large SDKs
rare workflows
```

---

# Dynamic Imports

Good:

```ts
async function openEditor() {
  const { Editor } = await import("./Editor")
  return new Editor()
}
```

Bad:

```ts
const moduleName = getUserInput()
await import(moduleName)
```

Static dynamic imports are easier to optimize.

Fully dynamic imports can force bundlers to include more files.

---

# Barrel Files

Barrel files are common:

```ts
export * from "./parser"
export * from "./analyzer"
export * from "./renderer"
```

They can be fine, but can also confuse optimization if they trigger side effects or re-export too much.

Better:

```ts
export { parse } from "./parser"
export { analyze } from "./analyzer"
```

Avoid barrels that import everything first:

```ts
import * as parser from "./parser"
import * as analyzer from "./analyzer"

export { parser, analyzer }
```

---

# Import Style

Prefer named imports:

```ts
import { debounce } from "lodash-es"
```

Avoid large namespace imports:

```ts
import _ from "lodash"
```

Prefer ESM-native packages:

```ts
lodash-es
```

over CommonJS-heavy packages when bundle size matters.

---

# Package Exports

For libraries, expose clear ESM entry points.

```json
{
  "name": "@vokda/sdk",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./synthesis": {
      "types": "./dist/synthesis.d.ts",
      "import": "./dist/synthesis.js"
    },
    "./ssml": {
      "types": "./dist/ssml.d.ts",
      "import": "./dist/ssml.js"
    }
  },
  "sideEffects": false
}
```

This allows:

```ts
import { synthesize } from "@vokda/sdk/synthesis"
```

instead of importing the whole package root.

---

# Preserve Modules for Libraries

Rollup:

```ts
export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "esm",
    preserveModules: true,
    preserveModulesRoot: "src",
  },
}
```

This keeps module boundaries in `dist`.

Benefits:

```text
better tree shaking
better deep imports
easier debugging
smaller consumer bundles
```

---

# Framework-Specific Notes

## React

Use direct imports when possible.

```ts
import { useMemo } from "react"
```

Lazy-load heavy components:

```tsx
const AdminPanel = lazy(() => import("./AdminPanel"))
```

Avoid importing all icon packs:

```ts
import { Search } from "lucide-react"
```

Do not do:

```ts
import * as Icons from "lucide-react"
```

---

## Vue

Vite + Vue generally tree-shakes well.

Lazy-load routes:

```ts
{
  path: "/admin",
  component: () => import("./pages/Admin.vue")
}
```

---

## Svelte / SvelteKit

Svelte compiles components and generally produces small bundles.

Still use:

```ts
await import("./heavy-module")
```

for heavy optional features.

---

## Next.js / Nuxt

Use dynamic imports for expensive client-only features.

Next:

```tsx
const Editor = dynamic(() => import("./Editor"), {
  ssr: false,
})
```

Nuxt:

```ts
const Editor = defineAsyncComponent(() => import("./Editor.vue"))
```

---

# Node.js Backend Bundling

Tree shaking is not only for browsers.

For Node 20+ services, bundling can reduce deployment size and cold start time.

Example with esbuild:

```bash
esbuild src/server.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --packages=external \
  --minify \
  --tree-shaking=true \
  --outfile=dist/server.js
```

For Lambda:

```bash
esbuild src/handler.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --minify \
  --sourcemap \
  --outfile=dist/handler.mjs
```

---

# External Dependencies

Sometimes you should externalize dependencies:

```bash
--packages=external
```

or:

```ts
external: ["aws-sdk"]
```

Useful when:

```text
runtime already provides package
native modules are involved
dependency is huge
dependency should not be bundled
```

But externalizing means it will not be tree-shaken inside your bundle.

---

# Measuring Bundle Size

Useful tools:

```text
rollup-plugin-visualizer
webpack-bundle-analyzer
source-map-explorer
esbuild analyze
vite-bundle-visualizer
bundlejs.com
npm ls
pnpm why
```

esbuild:

```bash
esbuild src/index.ts \
  --bundle \
  --metafile=meta.json \
  --outfile=dist/app.js
```

Analyze:

```bash
npx esbuild --analyze --metafile=meta.json
```

Rollup visualizer:

```bash
npm install -D rollup-plugin-visualizer
```

```ts
import { visualizer } from "rollup-plugin-visualizer"

export default {
  plugins: [
    visualizer({
      filename: "stats.html",
      gzipSize: true,
      brotliSize: true,
    }),
  ],
}
```

---

# Debugging Tree Shaking

Ask:

```text
Is the package ESM?
Is the code imported through CommonJS?
Does package.json declare sideEffects?
Are there import-time side effects?
Are barrel files pulling too much?
Is minification enabled?
Is production mode enabled?
Are dynamic imports too broad?
Is the dependency reflection-heavy?
Is the code actually reachable?
```

---

# Common Mistakes

## Mistake 1: Compiling TS to CommonJS

Bad:

```json
{
  "module": "CommonJS"
}
```

Better:

```json
{
  "module": "ESNext"
}
```

---

## Mistake 2: Missing `sideEffects`

Without:

```json
{
  "sideEffects": false
}
```

bundlers may keep entire files.

---

## Mistake 3: Importing Whole Libraries

Bad:

```ts
import _ from "lodash"
```

Better:

```ts
import debounce from "lodash/debounce"
```

or:

```ts
import { debounce } from "lodash-es"
```

---

## Mistake 4: Side Effects in Index Files

Bad:

```ts
// index.ts
registerEverything()
export * from "./parser"
export * from "./renderer"
```

Better:

```ts
export { parse } from "./parser"
export { render } from "./renderer"
```

---

## Mistake 5: Huge Barrel Exports

Bad:

```ts
export * from "./all-providers"
```

Better:

```ts
export { OpenAIProvider } from "./providers/openai"
export { OllamaProvider } from "./providers/ollama"
```

---

## Mistake 6: Runtime Plugin Auto-Registration

Bad:

```ts
import "./providers/openai"
import "./providers/bedrock"
import "./providers/anthropic"
import "./providers/ollama"
```

Better:

```ts
import { OpenAIProvider } from "./providers/openai"
```

---

# Recommended App Config: Vite

```ts
// vite.config.ts

import { defineConfig } from "vite"
import { visualizer } from "rollup-plugin-visualizer"

export default defineConfig({
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: true,
    rollupOptions: {
      treeshake: true,
      plugins: [
        visualizer({
          filename: "dist/stats.html",
          gzipSize: true,
          brotliSize: true,
        }),
      ],
    },
  },
})
```

---

# Recommended Library Config: tsup

```ts
// tsup.config.ts

import { defineConfig } from "tsup"

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/parser.ts",
    "src/analyzer.ts",
    "src/render.ts",
  ],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: true,
  treeshake: true,
  target: "es2022",
})
```

---

# Recommended Library `package.json`

```json
{
  "name": "@vokda/sdk",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./synthesis": {
      "types": "./dist/synthesis.d.ts",
      "import": "./dist/synthesis.js"
    },
    "./ssml": {
      "types": "./dist/ssml.d.ts",
      "import": "./dist/ssml.js"
    }
  },
  "sideEffects": false,
  "files": [
    "dist"
  ]
}
```

---

# Vokda Package Recommendations

For Vokda, avoid a single monolithic SDK that pulls every provider adapter and the
whole catalog into one entry:

```text
@vokda/sdk   // everything re-exported from the root
```

Prefer focused modules / `exports` subpaths:

```text
@vokda/sdk            // thin root: client + types only
@vokda/sdk/catalog    // voice catalog loading + filtering
@vokda/sdk/synthesis  // synthesis orchestration
@vokda/sdk/ssml       // SSML tags, validate, serialize
@vokda/sdk/keys       // API key + credential helpers
```

Then apps import only what they need:

```ts
import { synthesize } from "@vokda/sdk/synthesis"
import { validateSsml } from "@vokda/sdk/ssml"
```

Instead of pulling the whole SDK:

```ts
import { synthesize, validateSsml } from "@vokda/sdk"
```

Optional provider adapters should be separate (or behind dynamic `import()` keyed by
`providerId`), so each one's heavy client only loads when that provider is used:

```text
@vokda/adapter-openai
@vokda/adapter-elevenlabs
@vokda/adapter-aws-polly      // pulls @aws-sdk/client-polly
@vokda/adapter-azure-speech
@vokda/adapter-gcp-tts
```

This prevents cloud SDKs (`@aws-sdk/*`, Azure/GCP clients) and audio-heavy
dependencies from entering every bundle — important for both the SvelteKit client and
the SAM/Lambda synthesis router, where each handler should bundle only the adapters it
actually invokes.

---

# Best Practices Checklist

Use:

```text
✓ ESM
✓ named exports
✓ named imports
✓ sideEffects false
✓ explicit side-effect file lists
✓ production builds
✓ minification
✓ static imports
✓ dynamic imports for heavy features
✓ direct package entry points
✓ smaller modules
✓ separate provider packages
✓ bundle analyzer tools
✓ pure annotations when correct
✓ feature flags with define replacement
```

Avoid:

```text
✗ CommonJS for libraries
✗ giant barrels
✗ import-time registration
✗ unnecessary polyfills
✗ importing entire icon packs
✗ importing full utility libraries
✗ side effects in index.ts
✗ dynamic require
✗ broad dynamic imports
✗ reflection-heavy patterns
✗ all-in-one provider packages
```

---

# Summary

TypeScript and JavaScript have the most explicit form of tree shaking among mainstream ecosystems, but it only works well when code is designed for it.

The key ingredients are:

```text
1. ES modules
2. static imports and exports
3. production bundling
4. minification
5. sideEffects declarations
6. pure annotations
7. modular package design
8. code splitting
9. dependency hygiene
10. bundle analysis
```

The architecture matters as much as the tool.

A well-designed TS/JS system uses small ESM modules, avoids import-time side effects, splits optional providers into separate packages, and measures bundle output continuously.