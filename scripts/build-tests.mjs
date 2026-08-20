import * as esbuild from 'esbuild';
import { readdirSync } from 'node:fs';

const tests = readdirSync('test')
  .filter((name) => name.endsWith('.test.ts'))
  .map((name) => `test/${name}`);
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
