// 预览静态服务器:serve 本目录(card-preview.html 与 assets),仅本机。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '..', 'src', 'webui', 'assets');
const types = { '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.js': 'text/javascript' };

createServer(async (req, res) => {
  try {
    const rel = req.url === '/' ? '/card-preview.html' : req.url;
    const name = decodeURIComponent(rel.split('?')[0] ?? '/');
    const file = name === '/card-face.jpg' || name === '/card-back.jpg' ? join(assets, name.slice(1)) : join(here, name);
    const bytes = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(17790, '127.0.0.1', () => console.log('preview at http://127.0.0.1:17790/'));
