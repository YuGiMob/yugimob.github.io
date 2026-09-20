#!/usr/bin/env node
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 8123);

const CONTENT_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
]);

export function contentType(file) {
  return CONTENT_TYPES.get(extname(file).toLowerCase()) ?? 'application/octet-stream';
}

export function resolveTarget(root, urlPath) {
  const base = resolve(root);
  let decoded;
  try {
    decoded = decodeURIComponent(String(urlPath ?? '/').split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  const candidate = resolve(base, `.${normalize(decoded)}`);
  if (candidate !== base && !candidate.startsWith(base + sep)) return null;
  try {
    return statSync(candidate).isDirectory() ? joinedFile(candidate, 'index.html') : candidate;
  } catch {
    return null;
  }
}

function joinedFile(directory, name) {
  const file = join(directory, name);
  try {
    return statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

function send(response, status, file) {
  response.writeHead(status, { 'content-type': contentType(file), 'cache-control': 'no-store' });
  pipeline(createReadStream(file), response, () => {});
}

export function createStaticServer(root = ROOT) {
  return createServer((request, response) => {
    const target = resolveTarget(root, request.url);
    if (target) {
      send(response, 200, target);
      return;
    }
    const notFound = joinedFile(resolve(root), '404.html');
    if (notFound) send(response, 404, notFound);
    else {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('404\n');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createStaticServer();
  server.listen(PORT, () => console.log(`Serving ${ROOT} at http://localhost:${PORT}/`));
}
