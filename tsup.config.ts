import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/**/*.ts'],
  format: ['esm'],
  target: 'node18',
  splitting: true,
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
    'boxen',
    'express',
    'cors',
    'compression',
    'ws',
    'open'
  ],
  // 排除测试文件和类型声明文件
  ignore: [
    'src/**/*.test.ts',
    'src/**/*.spec.ts',
    'src/**/*.d.ts'
  ]
})