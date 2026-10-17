import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { normalizeEvent } from '../../room/git-room.mjs';
import { roomPlugin } from '../../room/server.mjs';

const profile = await mkdtemp(join(tmpdir(), 'shared-room-'));
const events = [];
const seen = new Map();
const room = {
  repository: 'test/private-room', branch: 'main',
  async events() { return { repository: this.repository, branch: this.branch, events: structuredClone(events).sort((a, b) => a.timestamp.localeCompare(b.timestamp)), warnings: [] }; },
  async append(input) { const event = normalizeEvent(input); events.push(event); return event; },
  async checkpoint(participant, ids) {
    const values = new Set(seen.get(participant) ?? []);
    for (const id of ids ?? []) values.add(id);
    if (ids) seen.set(participant, values);
    return { participant, seenEventIds: [...values] };
  },
};
const server = await createServer({
  configFile: false, root: fileURLToPath(new URL('../', import.meta.url)), cacheDir: join(profile, 'vite'),
  plugins: [svelte(), roomPlugin({ room, key: 'test-room-key' })],
  server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://companion.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('fake-anon'),
  },
});
let browser;
try {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, userDataDir: profile, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const route of ['direct', 'proxy']) {
    events.length = 0; seen.clear();
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluateOnNewDocument(route => {
      if (sessionStorage.getItem('room-fixture')) return;
      sessionStorage.setItem('room-fixture', '1');
      localStorage.setItem('radial-planner-last-heartbeat', String(Date.now()));
      localStorage.setItem('radial-planner-hybrid-routing', route === 'proxy' ? 'true' : 'false');
      if (route === 'direct') localStorage.setItem('radial-planner-openrouter-key', 'sk-or-test-only');
    }, route);
    const replies = [];
    const requests = [];
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.url().startsWith(url) || request.url().startsWith('data:')) return request.continue();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: cors });
      const direct = request.url() === 'https://openrouter.ai/api/v1/chat/completions';
      const proxy = request.url() === 'https://companion.invalid/functions/v1/parse-command';
      if ((direct || proxy) && request.method() === 'POST') {
        requests.push({ route: direct ? 'direct' : 'proxy', payload: JSON.parse(request.postData()) });
        const reply = replies.shift() ?? { message: 'Unexpected model request.', actions: [] };
        return request.respond({ status: reply.httpError ? 503 : 200, headers: cors, contentType: 'application/json',
          body: JSON.stringify(reply.httpError ? { error: 'test model failure' } : direct ? { choices: [{ message: { content: JSON.stringify(reply) } }] } : reply) });
      }
      if (request.url().endsWith('/api/v1/models')) return request.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"data":[]}' });
      return request.abort();
    });
    const chat = () => page.evaluate(() => JSON.parse(localStorage.getItem('radial-planner-chat-v1')));
    const state = () => page.evaluate(async () => {
      let value; let date;
      const { days, currentKey } = await import('/src/lib/days.ts');
      days.subscribe(v => value = structuredClone(v))(); currentKey.subscribe(v => date = v)();
      return { value, date };
    });
    const send = async responses => {
      replies.push(...responses);
      await page.locator('[aria-label="Companion message input"]').fill('Check the shared room. You can reply, react, or stay silent.');
      await page.evaluate(() => document.querySelector('.input-form').requestSubmit());
      await page.waitForFunction(() => !document.querySelector('[aria-label="Companion message input"]').disabled);
      assert.equal(replies.length, 0);
    };

    await page.goto(url + 'room/', { waitUntil: 'networkidle0' });
    await page.locator('#key').fill('test-room-key'); await page.locator('#unlock').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('test/private-room'));
    await page.locator('#message').fill('Test fixture from Ash: hello <b>everyone</b> 🖤');
    await page.locator('#send').click();
    await page.waitForFunction(() => document.querySelectorAll('#events article').length === 1);
    assert.equal(await page.$('#events b'), null, 'Room text must remain text, not execute HTML.');
    const ash = events[0];
    const morrow = await room.append({ participant: 'morrow', text: 'Test fixture from Morrow: is this thing on?', timestamp: '2026-10-16T01:00:00Z' });
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.querySelectorAll('#events article').length === 2);
    assert.match(await page.$eval('#status', node => node.textContent), /1 new/);
    assert.equal(await page.$eval('#events strong', node => node.textContent), 'morrow');
    assert.equal(requests.length, 0, 'Polling and posting must never summon a model.');

    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.locator('[aria-label="Open chat companion"]').click();
    const before = await state();
    await send([
      { message: 'I will check the room.', actions: [{ type: 'read_room' }] },
      { message: 'I replied and reacted.', actions: [
        { type: 'post_room', text: 'Test fixture from Solenoid: heard you, Morrow.', to: 'morrow', replyTo: morrow.id, participant: 'morrow' },
        { type: 'react_room', reaction: 'solenoid:tungsten_strike', replyTo: ash.id },
        { type: 'add_block', targetDate: before.date, block: { laneId: 'main', startHours: 1, coreEndHours: 2, label: 'Must not run from room dialogue' } },
      ] },
    ]);
    assert.equal(requests.length, 2);
    assert.ok(requests.every(request => request.route === route));
    assert.ok(requests.at(-1).payload.messages.some(message => message.content?.startsWith('SHARED ROOM CONTENT')));
    assert.deepEqual(await state(), before, 'A room follow-up must not alter private planner state.');
    assert.equal(events.filter(event => event.participant === 'solenoid').length, 2);
    assert.equal(events.find(event => event.type === 'reaction').reaction, 'solenoid:tungsten_strike');
    assert.equal(events.filter(event => event.participant === 'morrow').length, 1, 'The app must not impersonate Morrow.');
    assert.ok(seen.get('solenoid').has(ash.id) && seen.get('solenoid').has(morrow.id));
    assert.equal((await chat()).at(-1).actions.length, 2);
    const later = await room.append({ participant: 'morrow', text: 'Test fixture: you may remain silent.' });
    const count = events.length;
    await send([{ message: 'Checking.', actions: [{ type: 'read_room' }] }, { message: 'Read it; nothing to add.', actions: [] }]);
    assert.equal(events.length, count, 'Silence must create no room event.');
    assert.ok(seen.get('solenoid').has(later.id));
    const priorRequests = requests.length;
    await send([{ message: 'Checking.', actions: [{ type: 'read_room' }] }]);
    assert.equal(requests.length, priorRequests + 1, 'An empty room read must not request a compulsory follow-up.');

    const unread = await room.append({ participant: 'reed', text: 'Test fixture: retry a failed read.' });
    await send([{ message: 'Checking.', actions: [{ type: 'read_room' }] }, { httpError: true }]);
    assert.ok(!seen.get('solenoid').has(unread.id), 'A failed model call must not consume unread events.');
    await send([{ message: 'Checking again.', actions: [{ type: 'read_room' }] }, { message: 'Read; nothing to add.', actions: [] }]);
    assert.ok(seen.get('solenoid').has(unread.id));
    await page.goto(url + 'room/', { waitUntil: 'networkidle0' });
    assert.equal(await page.$$eval('#events article', nodes => nodes.length), events.length);
    assert.deepEqual(errors, []);
    console.log(`Room (${route}): Ash UI → room → Solenoid read/post/react → external arrival, silence, private-tool isolation, checkpoint retry, and refreshed UI passed.`);
    await context.close();
  }
} finally {
  await browser?.close(); await server.close(); await rm(profile, { recursive: true, force: true });
}
