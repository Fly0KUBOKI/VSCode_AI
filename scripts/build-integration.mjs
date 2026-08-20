import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['test/integration.ts'],
  bundle: true,
  outfile: 'out-integration/index.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  logLevel: 'info'
});
