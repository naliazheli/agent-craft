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

const immutableAssetHeaders = {
  'Cache-Control': 'public, max-age=31536000, immutable',
};

const noStoreHeaders = {
  'Cache-Control': 'no-store',
};

function sendFile(res, filePath, headers = {}) {
  const type = contentTypes[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, ...headers });
  createReadStream(filePath).pipe(res);
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...noStoreHeaders });
  res.end('Not found');
}

function toSafePath(urlPath) {
  return normalize(decodeURIComponent(urlPath))
    .replace(/^(\.\.([/\\]|$))+/, '')
    .replace(/^[/\\]+/, '') || 'index.html';
}

async function findFile(urlPath) {
  const filePath = join(root, toSafePath(urlPath));

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      const indexPath = join(filePath, 'index.html');
      if (existsSync(indexPath)) return indexPath;
    } else {
      return filePath;
    }
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('ok');
    return;
  }

  try {
    const filePath = await findFile(url.pathname);
    if (filePath) {
      const headers = url.pathname.startsWith('/assets/') ? immutableAssetHeaders : noStoreHeaders;
      sendFile(res, filePath, headers);
      return;
    }

    if (url.pathname.startsWith('/assets/') || extname(url.pathname)) {
      notFound(res);
      return;
    }

    sendFile(res, join(root, 'index.html'), noStoreHeaders);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(error));
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`UI server listening on ${port}`);
});
