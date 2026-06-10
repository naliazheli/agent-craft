import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = '/app/dist';
const port = Number(process.env.PORT || 80);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendFile(res, filePath) {
  const type = contentTypes[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  createReadStream(filePath).pipe(res);
}

async function resolvePath(urlPath) {
  const safePath = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(root, safePath);

  if (safePath === '/' || safePath === '.') {
    filePath = join(root, 'index.html');
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      const indexPath = join(filePath, 'index.html');
      if (existsSync(indexPath)) return indexPath;
    } else {
      return filePath;
    }
  } catch {
    // Fall through to SPA entrypoint.
  }

  return join(root, 'index.html');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  try {
    const filePath = await resolvePath(url.pathname);
    sendFile(res, filePath);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(error));
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`UI server listening on ${port}`);
});
