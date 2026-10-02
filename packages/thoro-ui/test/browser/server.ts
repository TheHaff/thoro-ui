import { readFile } from 'node:fs/promises'
import { createServer, type ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'

const ROOT = normalize(join(import.meta.dirname, '..', '..'))
const APP_PORT = 4173
const VENDOR_PORT = 4174
const VENDOR = `http://127.0.0.1:${VENDOR_PORT}`
// Stands in for "something unique to your own policy". The harness passes it as ownPolicy.
const OWN_MARKER = 'https://own-marker.invalid'

// Our own policy: allows the vendor everywhere it is used.
const OWN = [
  "default-src 'self'",
  "script-src 'self'",
  `script-src-elem 'self' ${VENDOR}`,
  `style-src 'self' ${VENDOR}`,
  `img-src 'self' ${VENDOR}`,
  `connect-src 'self' ${VENDOR} ${OWN_MARKER}`,
].join('; ')

// A second policy, as a browser extension or corporate proxy would add. Blocks the vendor.
const FOREIGN = ["script-src-elem 'self'", "style-src 'self'", "img-src 'self'", "connect-src 'self'"].join('; ')

// Our own policy, but it forgot the vendor.
const OWN_WITHOUT_VENDOR = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  `connect-src 'self' ${OWN_MARKER}`,
].join('; ')

const STRICT = `${OWN}; require-trusted-types-for 'script'; trusted-types 'none'`

const POLICIES: Record<string, string[]> = {
  allowed: [OWN],
  foreign: [OWN, FOREIGN],
  'own-blocks': [OWN_WITHOUT_VENDOR],
  strict: [STRICT],
}

const TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

const VENDOR_ASSETS: Record<string, { body: string; type: string }> = {
  '/pixel.svg': { body: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>', type: TYPES['.svg'] },
  '/widget.css': { body: 'html {}\n', type: TYPES['.css'] },
  '/widget.js': { body: 'globalThis.vendorWidgetLoaded = true\n', type: TYPES['.js'] },
}

function pageHtml(script: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>thoro-ui test page</title>',
    `<script type="module" src="/fixtures/${script}.js"></script>`,
    '</head>',
    '<body></body>',
    '</html>',
    '',
  ].join('\n')
}

async function sendFile(res: ServerResponse, relativePath: string): Promise<void> {
  const path = normalize(join(ROOT, relativePath))
  if (!path.startsWith(ROOT + sep)) {
    res.writeHead(403).end()
    return
  }
  try {
    const body = await readFile(path)
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
}

createServer((req, res) => {
  const { pathname, searchParams } = new URL(req.url ?? '/', `http://127.0.0.1:${APP_PORT}`)
  if (pathname === '/health') {
    res.end('ok')
    return
  }
  if (pathname === '/page') {
    const policy = POLICIES[searchParams.get('csp') ?? 'allowed']
    const script = searchParams.get('script')
    if (!policy || !script || !/^[a-z-]+$/.test(script)) {
      res.writeHead(400).end('bad csp or script')
      return
    }
    // An array value sends one header line per policy; the browser enforces every one.
    // setHeader, because @types/node types this header in writeHead as a single string.
    res.setHeader('content-security-policy', policy)
    res.writeHead(200, { 'content-type': TYPES['.html'] })
    res.end(pageHtml(script))
    return
  }
  if (pathname.startsWith('/fixtures/')) {
    void sendFile(res, `test/browser${pathname}`)
    return
  }
  if (pathname.startsWith('/dist/')) {
    void sendFile(res, pathname.slice(1))
    return
  }
  res.writeHead(404).end()
}).listen(APP_PORT, '127.0.0.1')

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', VENDOR)
  // Never answers: stands in for a firewall that silently drops the request.
  if (pathname === '/hang') return
  const asset = VENDOR_ASSETS[pathname]
  if (!asset) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': asset.type })
  res.end(asset.body)
}).listen(VENDOR_PORT, '127.0.0.1')
