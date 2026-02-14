import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  minify: false,
  banner: {
    js: `#!/usr/bin/env node`
  },
  external: [
    'commander',
    'chalk',
    'inquirer',
    'ora',
    'fs-extra',
    'js-yaml',
    'zod',
    'simple-git',
    'puppeteer',
    'execa',
    'boxen'
  ]
})