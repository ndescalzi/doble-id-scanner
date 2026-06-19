# 🔍 doble-id-scanner

Scan your **React**, **Vue**, **Angular** and **HTML** projects for doble `id` attributes — no installation required.

## Usage

```bash
# Scan current directory (default)
npx doble-id-scanner

# Scan a specific folder
npx doble-id-scanner ./src

# The path is always optional and can go anywhere in the command
npx doble-id-scanner --file ./src
npx doble-id-scanner ./src --file --json
```

## Options

| Option | Description |
|--------|-------------|
| `[path]` | Directory to scan. Optional — defaults to where you run the command. Can appear before or after any flag. |
| `--path <dir>` | Explicit path flag, alternative to positional path |
| `--dynamic` | Include dynamic id bindings (`id={expr}`, `:id="expr"`) in the analysis. Excluded by default since their value is unknown at build time. |
| `--file` | Save the report to `idScan.md` (or `idScan.json` with `--json`). Only creates the file if dobles are found. |
| `--json` | Format output as JSON — on console or in the file if combined with `--file` |
| `--no-build` | Exclude build output folders from the scan |
| `--all` | Show all found ids, not just dobles |
| `--help`, `-h` | Show help |

## Examples

```bash
# Basic scan of current directory
npx doble-id-scanner

# Scan a specific folder
npx doble-id-scanner ./src

# Save report as idScan.md (only if dobles found)
npx doble-id-scanner --file

# Save report as idScan.json
npx doble-id-scanner --file --json

# Include dynamic id bindings (JSX id={expr}, Vue :id="expr")
npx doble-id-scanner --dynamic

# Full combo: specific folder, dynamic ids, save as JSON file
npx doble-id-scanner ./src --dynamic --file --json

# Exclude build output dirs
npx doble-id-scanner --no-build

# Flags and path can go in any order
npx doble-id-scanner --file --dynamic ./src
npx doble-id-scanner ./src --file --dynamic
```

## Example output

```
🔍 doble ID Scanner
────────────────────────────────────────────────────
Scanning : /my-project
Build dirs: (includes build output: dist, .next, build…)
Dynamic IDs: excluded (use --dynamic to include)
Extensions: .html, .jsx, .tsx, .vue, .js, .ts
────────────────────────────────────────────────────

Found 24 file(s) to scan...

❌  Found 2 doble ID(s):

  id="submit-btn"
  Appears 2 times:
    src/components/LoginForm.jsx:14
    → <button id="submit-btn" onClick={handleLogin}>
    src/components/RegisterForm.vue:22
    → <button id="submit-btn" type="submit">

  id="header"
  Appears 3 times:
    src/layouts/MainLayout.jsx:5
    → <header id="header">
    src/components/Modal.tsx:11
    → <div id="header" className="modal-header">
    dist/index.html:1
    → <header id="header">built output</header>

────────────────────────────────────────────────────
Summary: 2 doble id(s) found across 24 file(s) scanned.
Tips: run with --file to save as idScan.md · --dynamic to include dynamic id bindings
```

## About dynamic IDs

By default, the scanner only analyzes **static** id values — ones whose value is known in the source code:

```jsx
<div id="my-header">...</div>       ✅ scanned by default
```

With `--dynamic`, it also analyzes **dynamic bindings** where the value is a runtime expression:

```jsx
<div id={userId}>...</div>          ⚡ only with --dynamic
<div :id="computedId">...</div>     ⚡ only with --dynamic
<div v-bind:id="someVar">...</div>  ⚡ only with --dynamic
```

Dynamic ids are excluded by default because their actual value is unknown at scan time — two components using `id={props.id}` are not necessarily dobles. Use `--dynamic` when you want to audit all id bindings regardless.

## Scanned folders

By default, **everything** in the target directory is scanned, including build output:

| Folder | Framework |
|--------|-----------|
| `dist` | Vite, Rollup, generic |
| `build` | Create React App, Angular |
| `.next` | Next.js |
| `.nuxt` | Nuxt.js |
| `out` | Next.js static export |
| `.output` | Nuxt 3 |
| `.svelte-kit` | SvelteKit |
| `.vercel` | Vercel build cache |
| `.netlify` | Netlify build cache |
| `storybook-static` | Storybook |
| `www` | Ionic / Capacitor |

Use `--no-build` to exclude these.

Always ignored: `node_modules`, `.git`, `coverage`, `.cache`, `.turbo`.

## Scanned file types

`.html` · `.jsx` · `.tsx` · `.vue` · `.js` · `.ts`

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | No dobles found |
| `1` | dobles found |

This makes it easy to use in CI/CD pipelines:

```yaml
# GitHub Actions example — fail the build if doble IDs are found
- name: Check for doble IDs
  run: npx doble-id-scanner ./src --dynamic
```

## Why does this matter?

- doble `id`s break **accessibility** (screen readers, ARIA relationships)
- They break **anchor links** (`href="#myId"` only jumps to the first match)
- `document.getElementById()` only returns the first element — silent bugs
- They are **invalid HTML** per the W3C spec

## License

MIT