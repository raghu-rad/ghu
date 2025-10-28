import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
    },
    sourcemap: true,
    clean: true,
    dts: true,
    target: 'node18',
    format: ['esm', 'cjs'],
    splitting: false,
    shims: true,
  },
  {
    entry: {
      cli: 'src/cli.tsx',
    },
    sourcemap: true,
    clean: false,
    dts: false,
    target: 'node18',
    format: ['esm', 'cjs'],
    splitting: false,
    shims: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
