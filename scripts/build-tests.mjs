import * as esbuild from 'esbuild';
import { globSync } from 'node:fs';

const tests = globSync('test/*.test.ts');
if (tests.length === 0) {
  throw new Error('No unit tests found.');
}

await esbuild.build({
  entryPoints: tests,
  bundle: true,
  outdir: 'out-test',
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info'
});
