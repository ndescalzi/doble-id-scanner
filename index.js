#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

// ─── Colors ───────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m'
}

const bold = s => `${c.bold}${s}${c.reset}`
const red = s => `${c.red}${s}${c.reset}`
const green = s => `${c.green}${s}${c.reset}`
const yellow = s => `${c.yellow}${s}${c.reset}`
const cyan = s => `${c.cyan}${s}${c.reset}`
const gray = s => `${c.gray}${s}${c.reset}`
const magenta = s => `${c.magenta}${s}${c.reset}`

// ─── Extensions to scan ───────────────────────────────────────────────────────
const EXTENSIONS = ['.html', '.jsx', '.tsx', '.vue', '.js', '.ts']

// Dirs always ignored — never useful to scan
const ALWAYS_IGNORE_DIRS = [
  'node_modules',
  '.git',
  'coverage',
  '.cache',
  '.turbo'
]

// Build output dirs — scanned BY DEFAULT, skipped only with --no-build.
// These are folder *names* matched against entry.name (no slashes allowed).
const BUILD_DIRS = [
  'dist', // Vite, Rollup, generic
  'build', // Create React App, Angular
  '.next', // Next.js
  '.nuxt', // Nuxt.js
  'out', // Next.js static export
  '.output', // Nuxt 3
  '.svelte-kit', // SvelteKit
  '.vercel', // Vercel build cache
  '.netlify', // Netlify build cache
  'storybook-static', // Storybook
  'www' // Ionic / Capacitor
]

// ─── Regex patterns to find id attributes ─────────────────────────────────────
const PATTERNS = [
  // Static: id="foo" or id='foo'  (negative lookbehind: skips :id= and v-bind:id=)
  { regex: /(?<![:\w])id\s*=\s*["']([^"']+)["']/g, dynamic: false },
  // JSX dynamic: id={expr}
  { regex: /\bid\s*=\s*\{([^}]+)\}/g, dynamic: true },
  // Vue binding: :id="expr" or v-bind:id="expr"
  { regex: /(?::id|v-bind:id)\s*=\s*["']([^"']+)["']/g, dynamic: true }
]

// ─── Parse CLI args ───────────────────────────────────────────────────────────
function parseArgs (argv) {
  // Rules:
  //  - Flags always start with "-" or "--"
  //  - --path <dir> is the only flag that takes a value
  //  - Any non-flag token is treated as the scan directory (optional)
  //  - --path wins over a positional path; order never matters
  const KNOWN_FLAGS = new Set([
    '--all',
    '--json',
    '--file',
    '--no-build',
    '--dynamic',
    '--help',
    '-h'
  ])

  const flags = new Set()
  let dir = null
  let explicitPath = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--path') {
      explicitPath = argv[i + 1] !== undefined ? argv[i + 1] : null
      i++
      continue
    }

    if (arg.startsWith('-')) {
      if (!KNOWN_FLAGS.has(arg)) {
        process.stderr.write('Warning: unknown flag "' + arg + '" — ignored.\n')
      }
      flags.add(arg)
      continue
    }

    // Non-flag token → scan directory (first one wins)
    if (dir === null) dir = arg
  }

  // --path wins over positional; both are optional (default: where npx was run)
  const targetDir = path.resolve(
    explicitPath !== null ? explicitPath : dir !== null ? dir : process.cwd()
  )

  return {
    targetDir,
    showAll: flags.has('--all'),
    jsonOutput: flags.has('--json'),
    toFile: flags.has('--file'),
    noBuild: flags.has('--no-build'),
    includeDynamic: flags.has('--dynamic'),
    help: flags.has('--help') || flags.has('-h')
  }
}

// ─── Collect all files recursively ────────────────────────────────────────────
function collectFiles (dir, ignoreBuild, files = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return files
  }

  for (const entry of entries) {
    if (ALWAYS_IGNORE_DIRS.includes(entry.name)) continue
    if (ignoreBuild && BUILD_DIRS.includes(entry.name)) continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      collectFiles(fullPath, ignoreBuild, files)
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (EXTENSIONS.includes(ext)) files.push(fullPath)
    }
  }
  return files
}

// ─── Extract ids from a single file ──────────────────────────────────────────
function extractIds (filePath, includeDynamic) {
  let content
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch {
    return []
  }

  const lines = content.split('\n')
  const results = []

  for (const { regex, dynamic } of PATTERNS) {
    // Skip dynamic patterns unless --dynamic flag is set
    if (dynamic && !includeDynamic) continue
    regex.lastIndex = 0
    let match
    while ((match = regex.exec(content)) !== null) {
      const idValue = match[1].trim()
      const upToMatch = content.slice(0, match.index)
      const line = upToMatch.split('\n').length
      const lineContent = lines[line - 1]?.trim() || ''
      results.push({ id: idValue, line, lineContent, dynamic })
    }
  }
  return results
}

// ─── Generate Markdown report ─────────────────────────────────────────────────
function generateMarkdown (
  targetDir,
  files,
  allIds,
  duplicates,
  includeDynamic
) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  const buildNote = 'Includes build output folders (dist, .next, build, etc.)'
  const dynamicNote = includeDynamic
    ? 'Yes (--dynamic)'
    : 'No (static IDs only)'

  let md = `# 🔍 Duplicate ID Scan Report\n\n`
  md += `- **Scanned:** \`${targetDir}\`\n`
  md += `- **Date:** ${now}\n`
  md += `- **Note:** ${buildNote}\n`
  md += `- **Dynamic IDs included:** ${dynamicNote}\n`
  md += `- **Files scanned:** ${files.length}\n`
  md += `- **Unique IDs found:** ${allIds.size}\n`
  md += `- **Duplicate IDs found:** ${duplicates.size}\n\n`
  md += `---\n\n`

  if (duplicates.size === 0) {
    md += `## ✅ No duplicate IDs found\n\nAll id attributes in the project are unique.\n`
    return md
  }

  md += `## ❌ Duplicate IDs (${duplicates.size})\n\n`

  for (const [id, occurrences] of [...duplicates.entries()].sort()) {
    const hasDynamic = occurrences.some(o => o.dynamic)
    md += `### \`id="${id}"\``
    if (hasDynamic) md += ` ⚡ *(contains dynamic bindings)*`
    md += `\n\nAppears **${occurrences.length} times**:\n\n`
    md += `| File | Line | Content | Type |\n`
    md += `|------|------|---------|------|\n`
    for (const { file, line, lineContent, dynamic } of occurrences) {
      const snippet =
        lineContent.replace(/\|/g, '\\|').slice(0, 70) +
        (lineContent.length > 70 ? '…' : '')
      const type = dynamic ? '⚡ dynamic' : 'static'
      md += `| \`${file}\` | ${line} | \`${snippet}\` | ${type} |\n`
    }
    md += `\n`
  }

  md += `---\n\n*Generated by [duplicate-id-scanner](https://www.npmjs.com/package/duplicate-id-scanner)*\n`
  return md
}

// ─── Generate JSON report ─────────────────────────────────────────────────────
function generateJson (targetDir, files, allIds, duplicates, includeDynamic) {
  return JSON.stringify(
    {
      scannedDirectory: targetDir,
      scannedAt: new Date().toISOString(),
      includesBuildDirs: true,
      includesDynamicIds: includeDynamic,
      totalFiles: files.length,
      totalUniqueIds: allIds.size,
      duplicatesFound: duplicates.size,
      duplicates: Object.fromEntries(duplicates)
    },
    null,
    2
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main () {
  const args = process.argv.slice(2)
  const {
    targetDir,
    showAll,
    jsonOutput,
    toFile,
    noBuild,
    includeDynamic,
    help
  } = parseArgs(args)

  // ── Help ──────────────────────────────────────────────────────────────────
  if (help) {
    console.log(`
${bold(
  'duplicate-id-scanner'
)} — Find duplicate HTML id attributes in your project

${bold('Usage:')}
  npx duplicate-id-scanner [options] [path]

  The ${cyan(
    'path'
  )} is always optional. When omitted, the current directory is used.
  It can appear anywhere in the command — before or after any flag.

${bold('Options:')}
  ${cyan(
    '--path <dir>'
  )}   Explicit directory to scan (alternative to positional path)
  ${cyan('--all')}          Show all found ids, not just duplicates
  ${cyan('--json')}         Format output as JSON (console or file)
  ${cyan(
    '--file'
  )}         Save results to a file (idScan.md or idScan.json if --json)
                  File is only created if duplicates are found
  ${cyan(
    '--no-build'
  )}     Exclude build output folders (dist, .next, build, out…)
  ${cyan('--dynamic')}      Include dynamic id bindings in the analysis
                  (JSX: id={expr}, Vue: :id="expr" / v-bind:id="expr")
                  By default these are skipped — their value is unknown at build time
  ${cyan('--help, -h')}     Show this help message

${bold('Scanned extensions:')}
  .html  .jsx  .tsx  .vue  .js  .ts

${bold('Scanned folders (default):')}
  dist, build, .next, .nuxt, out, .output, .svelte-kit, .vercel, .netlify, www, storybook-static
  Plus all source files in the project. Use ${cyan(
    '--no-build'
  )} to exclude build output.

${bold('Examples:')}
  npx duplicate-id-scanner                   # scan current dir
  npx duplicate-id-scanner ./src             # scan a specific folder
  npx duplicate-id-scanner --json            # JSON output, current dir
  npx duplicate-id-scanner --file            # save idScan.md if duplicates found
  npx duplicate-id-scanner --file --json     # save idScan.json if duplicates found
  npx duplicate-id-scanner ./src --file      # path + file flag (any order)
  npx duplicate-id-scanner --file ./src      # same, different order
  npx duplicate-id-scanner --no-build        # skip build output dirs
  npx duplicate-id-scanner --path ./src      # explicit path flag
  npx duplicate-id-scanner --dynamic         # include dynamic id bindings
  npx duplicate-id-scanner --dynamic --file  # dynamic scan, save report
`)
    process.exit(0)
  }

  // ── Header ────────────────────────────────────────────────────────────────
  if (!jsonOutput) {
    const buildStatus = noBuild
      ? gray('(build dirs excluded via --no-build)')
      : yellow('(includes build output: dist, .next, build…)')

    console.log(`
${bold(cyan('🔍 Duplicate ID Scanner'))}
${gray('─'.repeat(52))}
Scanning : ${cyan(targetDir)}
Build dirs: ${buildStatus}
Dynamic IDs: ${
      includeDynamic
        ? yellow('included (--dynamic)')
        : gray('excluded (use --dynamic to include)')
    }
Extensions: ${gray(EXTENSIONS.join(', '))}
${gray('─'.repeat(52))}
`)
  }

  // ── Collect & extract ─────────────────────────────────────────────────────
  const files = collectFiles(targetDir, noBuild)

  if (!jsonOutput) {
    console.log(gray(`Found ${files.length} file(s) to scan...\n`))
  }

  const idMap = new Map()

  for (const filePath of files) {
    const ids = extractIds(filePath, includeDynamic)
    const relPath = path.relative(targetDir, filePath)

    for (const { id, line, lineContent, dynamic } of ids) {
      if (!idMap.has(id)) idMap.set(id, [])
      idMap.get(id).push({ file: relPath, line, lineContent, dynamic })
    }
  }

  // ── Split into allIds / duplicates ────────────────────────────────────────
  const duplicates = new Map()
  const allIds = new Map()

  for (const [id, occurrences] of idMap.entries()) {
    allIds.set(id, occurrences)
    if (occurrences.length > 1) duplicates.set(id, occurrences)
  }

  // ── --file: write to disk (only when duplicates exist) ───────────────────
  if (toFile) {
    if (duplicates.size === 0) {
      console.log(
        green(bold('✅  No duplicate IDs found!')) +
          gray(` — no file generated (nothing to report).`)
      )
      console.log(
        gray(
          `   ${allIds.size} unique id(s) scanned across ${files.length} file(s).`
        )
      )
      console.log()
      process.exit(0)
    }

    const fileName = jsonOutput ? 'idScan.json' : 'idScan.md'
    const outputPath = path.join(process.cwd(), fileName)
    const content = jsonOutput
      ? generateJson(targetDir, files, allIds, duplicates, includeDynamic)
      : generateMarkdown(targetDir, files, allIds, duplicates, includeDynamic)

    fs.writeFileSync(outputPath, content, 'utf8')

    console.log(
      red(bold(`❌  Found ${duplicates.size} duplicate ID(s).`)) +
        `\n\n   Report saved to: ${cyan(outputPath)}\n`
    )
    process.exit(1)
  }

  // ── JSON to console ───────────────────────────────────────────────────────
  if (jsonOutput) {
    console.log(
      generateJson(targetDir, files, allIds, duplicates, includeDynamic)
    )
    process.exit(duplicates.size > 0 ? 1 : 0)
  }

  // ── --all: show every id ──────────────────────────────────────────────────
  if (showAll) {
    if (allIds.size === 0) {
      console.log(gray('No id attributes found.\n'))
    } else {
      console.log(bold(`All found IDs (${allIds.size} unique):\n`))
      for (const [id, occurrences] of [...allIds.entries()].sort()) {
        const isDup = occurrences.length > 1
        const label = isDup ? red(`⚠  #${id}`) : green(`✓  #${id}`)
        console.log(`  ${label} ${gray(`(${occurrences.length}x)`)}`)
        for (const { file, line } of occurrences) {
          console.log(`     ${gray(`${file}:${line}`)}`)
        }
      }
      console.log()
    }
  }

  // ── Duplicates console report ─────────────────────────────────────────────
  if (duplicates.size === 0) {
    console.log(
      green(bold('✅  No duplicate IDs found!')) +
        gray(
          ` (${allIds.size} unique id(s) scanned across ${files.length} file(s))`
        )
    )
    console.log()
    process.exit(0)
  }

  console.log(red(bold(`❌  Found ${duplicates.size} duplicate ID(s):`)) + '\n')

  let totalOccurrences = 0

  for (const [id, occurrences] of [...duplicates.entries()].sort()) {
    totalOccurrences += occurrences.length

    const hasDynamic = occurrences.some(o => o.dynamic)
    const dynamicNote = hasDynamic
      ? yellow(' ⚡ (some are dynamic/runtime values)')
      : ''

    console.log(`  ${bold(red(`id="${id}"`))}${dynamicNote}`)
    console.log(`  ${gray(`Appears ${occurrences.length} times:`)}`)

    for (const { file, line, lineContent, dynamic } of occurrences) {
      const dynTag = dynamic ? magenta(' [dynamic]') : ''
      console.log(`    ${cyan(file)}${gray(`:${line}`)}${dynTag}`)
      console.log(
        `    ${gray('→')} ${gray(lineContent.slice(0, 80))}${
          lineContent.length > 80 ? gray('…') : ''
        }`
      )
    }
    console.log()
  }

  console.log(gray('─'.repeat(52)))
  console.log(
    `${bold('Summary:')} ${red(
      `${duplicates.size} duplicate id(s)`
    )} found across ${cyan(`${files.length} file(s)`)} scanned.`
  )
  console.log(gray(`Total duplicate occurrences: ${totalOccurrences}`))
  console.log(
    gray(
      `Tips: run with ${cyan('--file')} to save as idScan.md · ${cyan(
        '--dynamic'
      )} to include dynamic id bindings`
    )
  )
  console.log()

  process.exit(1)
}

main()
