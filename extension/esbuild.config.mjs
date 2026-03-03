import { build, context } from 'esbuild';
import { mkdirSync } from 'node:fs';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: ['chrome120'],
  entryNames: '[name]',
  outdir: 'dist',
  sourcemap: true,
  entryPoints: {
    background: 'src/background/index.ts',
    content: 'src/content/index.ts',
    popup: 'src/popup/popup.ts'
  }
};

mkdirSync('dist', { recursive: true });

const ctx = await context(buildOptions);

if (isWatch) {
  await ctx.watch();
  console.log('Watching extension entry points...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('Built extension bundles.');
}
