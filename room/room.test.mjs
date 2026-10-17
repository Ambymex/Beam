import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createRoom, normalizeEvent } from './git-room.mjs';
import { roomMiddleware } from './server.mjs';

export function fakeGitHub() {
  const files = new Map();
  let serial = 0;
  let conflict = false;
  async function api(path, body) {
    if (path.includes('/git/trees/')) return { tree: [...files].map(([path, file]) => ({ path, sha: file.sha, type: 'blob' })) };
    if (path.includes('/git/blobs/')) {
      const sha = path.split('/').at(-1);
      return { content: [...files.values()].find(file => file.sha === sha).content };
    }
    const name = path.split('/contents/')[1].split('?')[0];
    const existing = files.get(name);
    if (!body) {
      if (!existing) throw Object.assign(new Error('Not found'), { status: 404 });
      return existing;
    }
    if (conflict) { conflict = false; throw Object.assign(new Error('Concurrent branch update'), { status: 409 }); }
    if ((existing && existing.sha !== body.sha) || (!existing && body.sha)) throw Object.assign(new Error('Stale SHA'), { status: 409 });
    const value = { sha: String(++serial), content: body.content };
    files.set(name, value);
    return { content: { sha: value.sha } };
  }
  return { api, files, conflictOnce: () => { conflict = true; } };
}

const message = (id, participant = 'ash', timestamp = '2026-10-17T09:00:00.000Z') => ({ id, participant, timestamp, text: 'Hello 🖤' });

test('immutable files, deterministic ordering, idempotent retries, and concurrent writers', async () => {
  const github = fakeGitHub();
  const room = createRoom({ repository: 'test/room', branch: 'main', api: github.api });
  github.conflictOnce();
  await Promise.all([room.append(message('b', 'solenoid')), room.append(message('a', 'ash'))]);
  assert.deepEqual((await room.events()).events.map(event => event.id), ['a', 'b']);
  const before = github.files.get('room/events/a.json').content;
  await room.append({ id: 'a', participant: 'ash', text: 'Hello 🖤' });
  assert.equal(github.files.get('room/events/a.json').content, before);
  await assert.rejects(room.append({ ...message('a'), text: 'Rewrite history' }), /immutable/);
  assert.equal(github.files.get('room/events/a.json').content, before);
  const reaction = await room.append({ id: 'r', participant: 'solenoid', type: 'reaction', reaction: 'solenoid:tungsten_strike', replyTo: 'a' });
  assert.equal(reaction.reaction, 'solenoid:tungsten_strike');
});

test('checkpoints merge concurrent reads and do not lose late-arriving earlier events', async () => {
  const github = fakeGitHub();
  const room = createRoom({ repository: 'test/room', api: github.api });
  await room.append(message('newer'));
  await Promise.all([room.checkpoint('morrow', ['newer']), room.checkpoint('morrow', ['other'])]);
  assert.deepEqual((await room.checkpoint('morrow')).seenEventIds, ['newer', 'other']);
  await room.append(message('late', 'reed', '2026-10-16T01:00:00Z'));
  const seen = new Set((await room.checkpoint('morrow')).seenEventIds);
  assert.deepEqual((await room.events()).events.filter(event => !seen.has(event.id)).map(event => event.id), ['late']);
  assert.equal((await room.checkpoint('solenoid')).seenEventIds.length, 0);
});

test('malformed events are reported without hiding valid conversation', async () => {
  const github = fakeGitHub();
  const room = createRoom({ repository: 'test/room', api: github.api });
  await room.append(message('valid'));
  github.files.set('room/events/bad.json', { sha: 'bad', content: Buffer.from('{broken').toString('base64') });
  const snapshot = await room.events();
  assert.equal(snapshot.events.length, 1);
  assert.equal(snapshot.warnings.length, 1);
  for (const invalid of [
    { ...message('../escape') }, { ...message('ok'), participant: 'Morrow' },
    { ...message('ok'), timestamp: 'never' }, { ...message('ok'), type: 'other' },
    { ...message('ok'), text: '' }, { ...message('ok'), replyTo: '../../x' },
  ]) assert.throws(() => normalizeEvent(invalid));
});

test('HTTP page, key, origin checks, posting, polling, and checkpoint endpoints', async t => {
  const github = fakeGitHub();
  const room = createRoom({ repository: 'test/room', api: github.api });
  const server = createServer(roomMiddleware({ room, key: 'test-key' }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.match(await (await fetch(url + '/room/')).text(), /No automatic turns/);
  assert.equal((await fetch(url + '/room/api/events')).status, 401);
  const headers = { 'x-room-key': 'test-key', 'content-type': 'application/json' };
  const post = await fetch(url + '/room/api/events', { method: 'POST', headers, body: JSON.stringify(message('http')) });
  assert.equal(post.status, 201);
  assert.equal((await (await fetch(url + '/room/api/events', { headers })).json()).events.length, 1);
  assert.equal((await fetch(url + '/room/api/events', { headers: { ...headers, origin: 'https://unrelated.invalid' } })).status, 403);
  assert.equal((await fetch(url + '/room/api/events', { headers: { ...headers, origin: 'null' } })).status, 403);
  assert.equal((await fetch(url + '/room/api/checkpoints/solenoid', { method: 'POST', headers, body: JSON.stringify({ seenEventIds: ['http'] }) })).status, 200);
  assert.equal((await (await fetch(url + '/room/api/events?participant=solenoid', { headers })).json()).events.length, 0);
});
