import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRoom } from './git-room.mjs';

const html = await readFile(new URL('./index.html', import.meta.url));

export function roomMiddleware(options = {}) {
  const room = options.room ?? createRoom(options);
  const key = options.key ?? process.env.ROOM_KEY ?? '';
  return async (req, res, next = () => { res.statusCode = 404; res.end('Not found'); }) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/room/')) return next();
    const json = (status, value) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    if (url.pathname === '/room/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(html);
      return;
    }
    if (!url.pathname.startsWith('/room/api/')) return json(404, { error: 'Not found' });
    const host = req.headers.host ?? '';
    let local;
    try { local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${host}`).hostname); }
    catch { return json(400, { error: 'Invalid host.' }); }
    if (!key && !local) return json(503, { error: 'Set ROOM_KEY on the serving computer before using the room through a tunnel.' });
    if (key && req.headers['x-room-key'] !== key) return json(401, { error: 'Enter the room key first.' });
    if (req.headers.origin) {
      let originHost;
      try { originHost = new URL(req.headers.origin).host; }
      catch { return json(403, { error: 'Use the room from its own page.' }); }
      if (originHost !== host && originHost !== req.headers['x-forwarded-host']) return json(403, { error: 'Use the room from its own page.' });
    }
    try {
      let body;
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'Send JSON.' });
        let text = '';
        for await (const chunk of req) {
          text += chunk;
          if (text.length > 512000) throw new Error('Request is too large.');
        }
        body = JSON.parse(text);
      }
      if (url.pathname === '/room/api/events' && req.method === 'GET') {
        const snapshot = await room.events();
        const who = url.searchParams.get('participant');
        if (who) {
          const checkpoint = await room.checkpoint(who);
          const seen = new Set(checkpoint.seenEventIds);
          return json(200, { ...snapshot, context: snapshot.events.slice(-10), events: snapshot.events.filter(event => !seen.has(event.id)) });
        }
        return json(200, snapshot);
      }
      if (url.pathname === '/room/api/events' && req.method === 'POST') return json(201, await room.append(body));
      const match = /^\/room\/api\/checkpoints\/([a-z][a-z0-9_-]{0,31})$/.exec(url.pathname);
      if (match && req.method === 'POST') {
        if (!Array.isArray(body?.seenEventIds)) throw new Error('Supply seenEventIds.');
        return json(200, await room.checkpoint(match[1], body.seenEventIds));
      }
      return json(404, { error: 'Not found' });
    } catch (error) {
      json(error.status ?? 400, { error: error.message });
    }
  };
}

export function roomPlugin(options = {}) {
  return {
    name: 'git-backed-room',
    configureServer(server) { server.middlewares.use(roomMiddleware(options)); },
    configurePreviewServer(server) { server.middlewares.use(roomMiddleware(options)); },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const middleware = roomMiddleware();
  const port = Number(process.env.ROOM_PORT ?? 5188);
  createServer((req, res) => {
    if (req.url === '/') { res.writeHead(302, { location: '/room/' }); res.end(); }
    else middleware(req, res);
  }).listen(port, '127.0.0.1', () => process.stdout.write(`Room: http://127.0.0.1:${port}/room/\n`));
}
