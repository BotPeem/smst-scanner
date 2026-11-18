const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let cleanUrl = decodeURIComponent(req.url.split('?')[0]);
  
  if (cleanUrl === '/' || cleanUrl === '') {
    cleanUrl = '/index.html';
  } else if (cleanUrl === '/staff') {
    cleanUrl = '/staff.html';
  }

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // API: Get walk-in settings
  if (cleanUrl === '/api/walkin-settings' && req.method === 'GET') {
    const settingsPath = path.join(ROOT, 'walkin_settings.json');
    let data = {};
    if (fs.existsSync(settingsPath)) {
      try {
        data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      } catch (e) {}
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify(data));
    return;
  }

  // API: Save walk-in settings
  if (cleanUrl === '/api/walkin-settings' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const settingsPath = path.join(ROOT, 'walkin_settings.json');
        let existing = {};
        if (fs.existsSync(settingsPath)) {
          try { existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) {}
        }
        const updated = Object.assign(existing, parsed);
        fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2), 'utf8');

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ ok: true, settings: updated }));
      } catch (err) {
        res.writeHead(400, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  let filePath = path.join(ROOT, cleanUrl);

  // Security check to prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  // If path is a directory, look for index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;"><h2>404 Not Found</h2><p>Cannot find ${cleanUrl}</p><a href="/">กลับหน้าหลัก</a></body></html>`);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`SMST Open House 2026 Dev Server กำลังทำงานแล้ว!`);
  console.log(`- หน้าหลัก (Landing): http://localhost:${PORT}/`);
  console.log(`- หน้าระบบสตาฟ (Staff): http://localhost:${PORT}/staff`);
  console.log(`- หน้าระบบสตาฟ (HTML): http://localhost:${PORT}/staff.html`);
  console.log(`======================================================\n`);
});
