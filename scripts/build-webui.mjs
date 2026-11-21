/** 面板打包:src/webui/client.ts → dist/webui.js;图片经 dataurl loader 内联。 */
import * as esbuild from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outfile = join(root, 'dist', 'webui.js');
mkdirSync(dirname(outfile), { recursive: true });

await esbuild.build({
  entryPoints: [join(root, 'src', 'webui', 'client.ts')],
  outfile,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  logLevel: 'info',
  loader: {
    '.jpg': 'dataurl',
    '.png': 'dataurl',
  },
});

console.log(`wrote ${outfile}`);
