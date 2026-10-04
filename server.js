const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8000);
const HTML_PAGES = new Set([
  'index.html',
  'shop.html',
  'product.html',
  'cart.html',
  'checkout.html',
  'success.html',
  'login.html',
  'admin.html'
]);
const PUBLIC_FILES = new Set([
  ...Array.from(HTML_PAGES, (file) => `/${file}`),
  '/css/styles.css',
  '/js/admin.js',
  '/js/data.js',
  '/js/main.js',
  '/js/supabase.js'
]);
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

function loadEnvironmentFile() {
  const env = { ...process.env };
  const envPath = path.join(ROOT, '.env');

  if (!fs.existsSync(envPath)) return env;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.hasOwn(env, match[1])) continue;

    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }

    env[match[1]] = value;
  }

  return env;
}

function isAnonOrPublishableKey(key) {
  if (key.startsWith('sb_publishable_')) return true;

  const parts = key.split('.');
  if (parts.length !== 3) return false;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.role === 'anon';
  } catch {
    return false;
  }
}

const environment = loadEnvironmentFile();
const supabaseUrl = (environment.SUPABASE_URL || '').trim();
const supabaseAnonKey = (environment.SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env.');
  process.exit(1);
}

try {
  const parsedUrl = new URL(supabaseUrl);
  if (parsedUrl.protocol !== 'https:' || !parsedUrl.hostname) {
    throw new Error('Supabase URL must be a valid HTTPS URL.');
  }
} catch {
  console.error('SUPABASE_URL must be a valid HTTPS URL.');
  process.exit(1);
}

if (!isAnonOrPublishableKey(supabaseAnonKey)) {
  console.error('SUPABASE_ANON_KEY must be a Supabase publishable key or legacy anon JWT. Never use a service-role or secret key.');
  process.exit(1);
}

function send(response, status, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(status, {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    send(response, 400, 'Bad request');
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  if (pathname === '/api/config') {
    const body = [
      `window.SUPABASE_URL = window.SUPABASE_URL || ${JSON.stringify(supabaseUrl)};`,
      `window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || ${JSON.stringify(supabaseAnonKey)};`
    ].join('\n');
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES['.js'],
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(request.method === 'HEAD' ? undefined : body);
    return;
  }

  if (!PUBLIC_FILES.has(pathname)) {
    send(response, 404, 'Not found');
    return;
  }

  const filePath = path.join(ROOT, pathname.slice(1));
  fs.readFile(filePath, (error, contents) => {
    if (error) {
      send(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(filePath)],
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(request.method === 'HEAD' ? undefined : contents);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Maison Étoile is running at http://127.0.0.1:${PORT}`);
});
