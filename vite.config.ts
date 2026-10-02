import { defineConfig } from 'vite-plus'

// Repo-wide fmt (oxfmt) and lint (oxlint). Each package's own vite.config.ts holds its test and pack blocks.
export default defineConfig({
  fmt: {
    arrowParens: 'avoid',
    bracketSpacing: true,
    endOfLine: 'lf',
    printWidth: 120,
    proseWrap: 'preserve',
    semi: false,
    singleQuote: true,
    sortPackageJson: true,
    tabWidth: 2,
    trailingComma: 'all',
    useTabs: false,
  },
  lint: {
    plugins: ['typescript', 'unicorn', 'oxc', 'import'],
    categories: {
      correctness: 'error',
    },
    // Listed explicitly: without a .gitignore in effect, the import plugin walks node_modules.
    ignorePatterns: ['**/dist/**', 'node_modules/**', '**/playwright-report/**', '**/test-results/**'],
    options: {
      // Type-aware rules only; `tsc -p .` stays the type checker because it also reports
      // isolatedDeclarations errors, which this path does not.
      typeAware: true,
      typeCheck: false,
    },
  },
})
