import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  clean: true,
  define: {
    'process.env.PACKAGE_VERSION': JSON.stringify(packageJson.version),
  },
  dts: true,
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  shims: true,
  sourcemap: true,
  splitting: false,
  target: 'node18',
});
