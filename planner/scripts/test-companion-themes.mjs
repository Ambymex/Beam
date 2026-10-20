import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const savedKey = 'radial-planner-saved-themes-v1';
const customKey = 'radial-planner-custom-theme';
const chatKey = 'radial-planner-chat-v1';
const humanTheme = {
  id: 'ash-original', name: 'Ash original',
  cssVars: {
    '--gradient-start': '#182236', '--gradient-end': '#304158', '--app-bg': '#182236',
    '--glass-blur': '18px', '--stars-active': '0', '--signal': '#bd9fe7',
  },
};
const profile = await mkdtemp(join(tmpdir(), 'companion-themes-'));
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  cacheDir: join(profile, 'vite-cache'),
  server: { host: '127.0.0.1', port: 0 },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://companion.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-only-anon'),
  },
  logLevel: 'error',
});
let browser;

try {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    userDataDir: profile,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  for (const route of ['direct', 'proxy']) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluateOnNewDocument(({ route, savedKey, customKey, humanTheme }) => {
      if (sessionStorage.getItem('theme-fixture')) return;
      sessionStorage.setItem('theme-fixture', '1');
      localStorage.setItem('radial-planner-last-heartbeat', String(Date.now()));
      localStorage.setItem('radial-planner-hybrid-routing', route === 'proxy' ? 'true' : 'false');
      if (route === 'direct') localStorage.setItem('radial-planner-openrouter-key', 'sk-or-test-only');
      localStorage.setItem(savedKey, JSON.stringify([humanTheme]));
      localStorage.setItem(customKey, JSON.stringify(humanTheme.cssVars));
    }, { route, savedKey, customKey, humanTheme });

    const requests = [];
    const replies = [];
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'POST, GET, OPTIONS',
    };
    // Every model reply is canned. All other external requests are blocked;
    // this test cannot use a real API key, message vault, or glucose service.
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.url().startsWith(url) || request.url().startsWith('data:')) return request.continue();
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: cors });
      const direct = request.url() === 'https://openrouter.ai/api/v1/chat/completions';
      const proxy = request.url() === 'https://companion.invalid/functions/v1/parse-command';
      if ((direct || proxy) && request.method() === 'POST') {
        const payload = JSON.parse(request.postData());
        requests.push({ route: direct ? 'direct' : 'proxy', payload });
        const reply = replies.shift() ?? { message: 'Unexpected extra model request.', actions: [] };
        return request.respond({
          status: 200, headers: { ...cors, 'content-type': 'application/json' },
          body: JSON.stringify(direct ? { choices: [{ message: { content: JSON.stringify(reply) } }] } : reply),
        });
      }
      if (request.url() === 'https://openrouter.ai/api/v1/models') {
        return request.respond({ status: 200, headers: cors, contentType: 'application/json', body: '{"data":[]}' });
      }
      return request.abort();
    });

    const read = key => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), key);
    const library = () => read(savedKey);
    const current = () => read(customKey);
    const chat = () => read(chatKey);
    const state = () => page.evaluate(async () => {
      const { days, currentKey } = await import('/src/lib/days.ts');
      let snapshot;
      let date;
      days.subscribe(value => snapshot = structuredClone(value))();
      currentKey.subscribe(value => date = value)();
      return { days: snapshot, date };
    });
    const openChat = () => page.locator('button[aria-label="Open chat companion"]').click();
    const send = async (responses, text = 'Design a theme of your own.') => {
      replies.push(...(Array.isArray(responses) ? responses : [responses]));
      await page.locator('textarea[aria-label="Companion message input"]').fill(text);
      await page.evaluate(() => document.querySelector('.input-form').requestSubmit());
      await page.waitForFunction(() => !document.querySelector('textarea[aria-label="Companion message input"]').disabled);
      assert.equal(replies.length, 0, 'Every expected model reply must be consumed.');
      assert.equal(requests.at(-1).route, route, 'Follow-up reads must use the configured chat route.');
      return (await chat()).at(-1);
    };
    const command = async actions => send({ message: 'Here is my theme choice.', actions });

    await page.goto(url, { waitUntil: 'networkidle0' });
    await openChat();
    const before = await state();
    await command([{
      type: 'save_theme', name: 'Industrial dusk', baseTheme: 'twilight',
      settings: { gradientStart: '#151c2c', gradientEnd: '#342a48', glassBlurPx: 0 },
      targetDate: '2040-01-02',
    }]);
    const industrial = (await library()).find(theme => theme.name === 'Industrial dusk');
    assert.ok(industrial);
    assert.equal(industrial.cssVars['--stars-active'], '1');
    assert.equal(industrial.cssVars['--glass-blur'], '0px');
    assert.deepEqual((await library())[0], humanTheme, 'A companion design must not overwrite Ash’s theme.');
    assert.deepEqual(await current(), humanTheme.cssVars, 'Saving alone must not apply the new look.');
    assert.deepEqual(await state(), before, 'Theme-only actions must not mutate days or navigation.');
    const rawSystem = route === 'direct' ? requests[0].payload.messages[0].content : requests[0].payload.systemPromptOverride;
    const prompt = Array.isArray(rawSystem) ? rawSystem.map(p => p.text || '').join('\n') : rawSystem;
    assert.match(prompt, /THEME DESIGNER TOOLS/);
    assert.match(prompt, /you are Solenoid \(The Industrial Anchor \/ The Sovereign Substrate\)/i);
    assert.ok(!prompt.includes('ash-original'), 'Live palette details should be read on demand.');

    const start = requests.length;
    await send([
      { message: 'Let me look at the designer.', actions: [{ type: 'read_themes' }] },
      { message: 'I made a dusk of my own.', actions: [{
        type: 'save_theme', name: 'Solenoid dusk 🖤', baseTheme: industrial.id, apply: true,
        settings: { glassHex: '#223344', glassOpacity: 0.4, signalHex: '#cfbeed', starHex: '#e9defb', surfaceOpacity: 0.2 },
      }] },
    ]);
    assert.equal(requests.length - start, 2);
    const followupMessages = requests.at(-1).payload.messages;
    const contextMessage = followupMessages.find(message => typeof message.content === 'string' && message.content.startsWith('THEME DESIGNER CONTENT'));
    assert.ok(contextMessage);
    const details = JSON.parse(contextMessage.content.split('\n')[1]);
    assert.ok(details.saved.some(theme => theme.id === industrial.id && theme.settings.starsOn));
    assert.equal(details.current.settings.gradientStart, '#182236');
    const designed = (await library()).find(theme => theme.name === 'Solenoid dusk 🖤');
    assert.deepEqual(await current(), designed.cssVars);
    assert.equal(designed.cssVars['--glass-bg'], 'rgba(34, 51, 68, 0.4)');
    assert.equal(designed.cssVars['--glass-blur'], '0px');
    assert.equal(designed.cssVars['--star-color'], '#e9defb');
    assert.equal(designed.cssVars['--stars-active'], '1');
    assert.deepEqual(await state(), before);
    assert.equal((await chat()).at(-1).actions[0].themeStatus, 'success');

    // A theme result opens the real designer, where his controls round-trip.
    const pill = await page.$$('.action-pill');
    await pill.at(-1).click();
    await page.waitForSelector('#theme-name');
    assert.equal(await page.$eval('#theme-name', input => input.value), designed.name);
    assert.equal(await page.$eval('#saved-theme', input => input.value), designed.id);
    assert.equal(await page.$eval('#glassBlur', input => input.value), '0');
    assert.equal(await page.$eval('#starsActive', input => input.checked), true);
    // Keep the designer mounted while a chat action changes its current theme.
    await openChat();
    await command([{ type: 'apply_theme', name: 'Industrial dusk', targetDate: '2041-02-03' }]);
    assert.deepEqual(await current(), industrial.cssVars);
    assert.equal(await page.$eval('#theme-name', input => input.value), industrial.name);
    assert.equal(await page.$eval('#saved-theme', input => input.value), industrial.id);
    assert.deepEqual(await state(), before);
    assert.ok(requests.at(-1).payload.messages.some(message => typeof message.content === 'string' && message.content.includes('[Actual tool results]')));
    await command([{ type: 'apply_theme', themeId: designed.id }]);
    assert.deepEqual(await current(), designed.cssVars);

    const originalLibrary = await library();
    for (const settings of [
      { gradientStart: 'url(https://example.invalid)' }, { '--text': 'transparent' },
      { glassOpacity: 1.5 }, { starsOn: 'yes' }, { glassBlurPx: 0.5 },
    ]) {
      const response = await command([{ type: 'save_theme', name: 'Invalid', settings }]);
      assert.equal(response.actions[0].themeStatus, 'error');
      assert.deepEqual(await library(), originalLibrary);
      assert.deepEqual(await current(), designed.cssVars);
      assert.match(await page.$$eval('.action-pill', nodes => nodes.at(-1).textContent), /Theme action failed/);
    }
    const duplicate = await command([{ type: 'save_theme', name: ' ASH ORIGINAL ', settings: {} }]);
    assert.equal(duplicate.actions[0].themeStatus, 'error');
    assert.match(duplicate.actions[0].themeResult, /already exists/);
    const incomplete = await command([{ type: 'save_theme', name: 'Incomplete' }]);
    assert.equal(incomplete.actions[0].themeStatus, 'error');
    assert.deepEqual(await library(), originalLibrary);

    await page.evaluate(key => {
      const original = Storage.prototype.setItem;
      window.restoreThemeStorage = () => { Storage.prototype.setItem = original; };
      Storage.prototype.setItem = function (name, value) {
        if (name === key) throw new DOMException('Storage full', 'QuotaExceededError');
        return original.call(this, name, value);
      };
    }, savedKey);
    const full = await command([{ type: 'save_theme', name: 'No room', settings: { starsOn: false }, apply: true }]);
    assert.equal(full.actions[0].themeStatus, 'error');
    assert.match(full.actions[0].themeResult, /storage may be full/);
    assert.deepEqual(await library(), originalLibrary);
    assert.deepEqual(await current(), designed.cssVars);
    await page.evaluate(() => window.restoreThemeStorage());

    const repeatedStart = requests.length;
    await send([
      { message: 'Reading themes.', actions: [{ type: 'read_themes' }] },
      { message: 'Reading again.', actions: [{ type: 'read_themes' }] },
    ]);
    assert.equal(requests.length - repeatedStart, 2, 'Repeated read actions must not create a request loop.');
    assert.equal((await chat()).at(-1).actions[0].themeStatus, 'error');

    await command([{ type: 'apply_theme', preset: 'day' }]);
    assert.equal(await current(), null);
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await command([{ type: 'apply_theme', preset: 'twilight' }]);
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await command([{ type: 'apply_theme', preset: 'auto' }]);
    assert.equal(await current(), null);
    assert.deepEqual(await library(), originalLibrary);
    await command([{ type: 'apply_theme', themeId: designed.id }]);

    await command([
      { type: 'apply_theme', themeId: designed.id },
      { type: 'add_block', targetDate: before.date, block: {
        laneId: 'main', startHours: 1, coreEndHours: 2, taperEndHours: 2.25,
        label: 'Theme tool integration check', vibeId: null,
      } },
    ]);
    const mixed = await state();
    assert.equal(mixed.date, before.date);
    assert.equal(mixed.days[before.date].blocks.filter(block => block.label === 'Theme tool integration check').length, 1,
      'A dated planner action must still execute alongside a theme action.');
    assert.deepEqual(await library(), originalLibrary);

    const code = await page.evaluate(async () => (await import('/src/lib/backup.ts')).exportBackup());
    const backup = JSON.parse(Buffer.from(code, 'base64').toString('utf8'));
    assert.deepEqual(JSON.parse(backup.localStorage[savedKey]), originalLibrary);
    await page.reload({ waitUntil: 'networkidle0' });
    assert.deepEqual(await library(), originalLibrary);
    assert.deepEqual(await current(), designed.cssVars);
    assert.deepEqual((await library())[0], humanTheme);
    assert.deepEqual(errors, [], 'The real chat and designer must run without browser exceptions.');
    console.log(`Companion themes (${route}): real chat read/save/apply, designer sync, result feedback, validation, storage errors, read-loop limit, backup, and reload passed.`);
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
  await rm(profile, { recursive: true, force: true });
}
