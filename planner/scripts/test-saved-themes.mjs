import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';

const savedKey = 'radial-planner-saved-themes-v1';
const customKey = 'radial-planner-custom-theme';
const swatchesKey = 'radial-planner-theme-swatches';
const profile = await mkdtemp(join(tmpdir(), 'planner-themes-'));
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { host: '127.0.0.1', port: 0 },
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
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let acceptDelete = true;
  page.on('dialog', dialog => dialog.type() === 'confirm' && !acceptDelete ? dialog.dismiss() : dialog.accept());
  // A fresh browser profile plus blocked external requests keeps the test away
  // from real chats, weather services, companion APIs, and the message vault.
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url().startsWith(url) || request.url().startsWith('data:')) request.continue();
    else request.abort();
  });

  const readStorage = key => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), key);
  const library = () => readStorage(savedKey);
  const current = () => readStorage(customKey);
  const action = name => page.locator({
    'Save new': '.saved-themes button[type="submit"]',
    Apply: '.theme-actions button:nth-child(1)',
    Update: '.theme-actions button:nth-child(2)',
    Delete: '.theme-actions button:nth-child(3)',
  }[name]).click();
  const fillName = value => page.locator('#theme-name').fill(value);
  const changeRange = (id, value) => page.evaluate(({ id, value }) => {
    const input = document.getElementById(id);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, { id, value });
  const openDesigner = async () => {
    await page.locator('button[aria-label="Open UI Theme Designer"]').click();
    await page.waitForSelector('#theme-name');
  };
  const reload = async () => {
    await page.goto(url, { waitUntil: 'networkidle0' });
    await openDesigner();
  };
  const screenshot = async name => {
    if (!process.env.THEME_SCREENSHOTS_DIR) return;
    await mkdir(process.env.THEME_SCREENSHOTS_DIR, { recursive: true });
    await page.evaluate(() => {
      document.querySelector('.designer .content').scrollTop = 0;
      document.getAnimations().forEach(animation => {
        if (animation.effect?.getTiming().iterations === Infinity) animation.pause();
        else animation.finish();
      });
    });
    await page.screenshot({ path: join(process.env.THEME_SCREENSHOTS_DIR, `${name}.png`) });
  };

  await page.goto(url, { waitUntil: 'networkidle0' });
  // Emulate an existing user who already has a custom look, before this feature.
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify({
    '--gradient-start': '#101525', '--gradient-end': '#1a2235', '--app-bg': '#101525',
    '--glass-blur': '0px', '--stars-active': '1', '--signal': '#a24df0',
  })), customKey);
  await reload();
  assert.equal((await current())['--glass-blur'], '0px');
  assert.equal(await page.$eval('#glassBlur', input => input.value), '0');
  assert.equal(await page.$eval('button[type="submit"]', button => button.disabled), true);

  await fillName('  Midnight garden  ');
  await action('Save new');
  const [first] = await library();
  assert.equal(first.name, 'Midnight garden');
  assert.equal(first.cssVars['--glass-blur'], '0px');
  assert.equal(first.cssVars['--stars-active'], '1');
  assert.deepEqual(await current(), first.cssVars);

  await changeRange('glassBlur', '22');
  await page.locator('#starsActive').click();
  assert.equal((await current())['--glass-blur'], '22px');
  assert.equal((await current())['--stars-active'], '0');
  assert.deepEqual(await library(), [first], 'Live edits must not mutate a saved theme.');
  await fillName('Aurora 🌙');
  await action('Save new');
  const [, second] = await library();
  await fillName('  MIDNIGHT GARDEN  ');
  await action('Save new');
  assert.equal((await library()).length, 2, 'Duplicate names must not overwrite or append.');
  assert.match(await page.$eval('.theme-status', node => node.textContent), /already exists/);

  await page.select('#saved-theme', first.id);
  await action('Apply');
  assert.deepEqual(await current(), first.cssVars);
  assert.equal(await page.$eval('#glassBlur', input => input.value), '0');
  assert.equal(await page.$eval('#starsActive', input => input.checked), true);
  await fillName('Midnight ink 🖤');
  await changeRange('glassOpacity', '0.35');
  await action('Update');
  const [updated] = await library();
  assert.equal(updated.id, first.id);
  assert.equal(updated.name, 'Midnight ink 🖤');
  assert.equal(updated.cssVars['--glass-bg'], 'rgba(25, 25, 30, 0.35)');
  assert.deepEqual(await library(), [updated, second]);
  await reload();
  assert.deepEqual(await library(), [updated, second]);
  assert.deepEqual(await current(), updated.cssVars);
  assert.equal(await page.$eval('#saved-theme', input => input.value), first.id);
  assert.equal(await page.$eval('#theme-name', input => input.value), updated.name);
  console.log('Save, apply, edit isolation, duplicate names, update/rename, and reload passed.');

  for (const [theme, mode] of [['day', 'light'], ['twilight', 'dark']]) {
    await page.select('.theme-debug', theme);
    await page.waitForFunction(mode => document.documentElement.dataset.theme === mode, {}, mode);
    await page.waitForFunction(() => {
      const expected = document.createElement('span').style;
      expected.backgroundColor = document.documentElement.style.getPropertyValue('--gradient-start');
      return document.querySelector('[aria-label="Gradient Start color"]').style.backgroundColor === expected.backgroundColor;
    });
    assert.equal(await current(), null);
    assert.deepEqual(await library(), [updated, second]);
    await screenshot(theme);
  }
  await page.setViewport({ width: 320, height: 640, isMobile: true, hasTouch: true });
  const layoutFits = await page.$eval('.saved-themes', section => {
    const { left, right } = section.getBoundingClientRect();
    return left >= 0 && right <= innerWidth && section.scrollWidth <= section.clientWidth;
  });
  assert.equal(layoutFits, true, 'Saved-theme controls must fit a narrow phone.');
  await screenshot('narrow-phone');

  await page.locator('.actions .reset').click();
  assert.equal(await current(), null);
  assert.deepEqual(await library(), [updated, second]);
  await page.select('#saved-theme', updated.id);
  await action('Apply');
  assert.deepEqual(await current(), updated.cssVars);
  console.log('Day/twilight, narrow-phone layout, and environmental reset passed.');

  const swatches = ['#101525', '#a24df0'];
  await page.evaluate(({ key, swatches }) => localStorage.setItem(key, JSON.stringify(swatches)), { key: swatchesKey, swatches });
  const backupCode = await page.evaluate(async () => (await import('/src/lib/backup.ts')).exportBackup());
  const payload = JSON.parse(Buffer.from(backupCode, 'base64').toString('utf8'));
  assert.deepEqual(JSON.parse(payload.localStorage[savedKey]), [updated, second]);
  assert.deepEqual(JSON.parse(payload.localStorage[customKey]), updated.cssVars);
  assert.deepEqual(JSON.parse(payload.localStorage[swatchesKey]), swatches);
  await page.evaluate(keys => keys.forEach(key => localStorage.removeItem(key)), [savedKey, customKey, swatchesKey]);
  await page.evaluate(async code => (await import('/src/lib/backup.ts')).importBackup(code), backupCode);
  await reload();
  assert.deepEqual(await library(), [updated, second]);
  assert.deepEqual(await current(), updated.cssVars);
  assert.deepEqual(await readStorage(swatchesKey), swatches);

  // An older backup omits these additive keys and must remain importable.
  payload.version = 1;
  delete payload.db.repeatRules;
  for (const key of [savedKey, customKey, swatchesKey]) delete payload.localStorage[key];
  const oldCode = Buffer.from(JSON.stringify(payload)).toString('base64');
  assert.equal(await page.evaluate(async code => (await import('/src/lib/backup.ts')).importBackup(code), oldCode), true);
  assert.deepEqual(await library(), [updated, second]);

  acceptDelete = false;
  await action('Delete');
  assert.deepEqual(await library(), [updated, second]);
  acceptDelete = true;
  await action('Delete');
  assert.deepEqual(await library(), [second]);
  assert.deepEqual(await current(), updated.cssVars, 'Deleting a preset must leave the current look intact.');
  await reload();
  assert.deepEqual(await library(), [second]);

  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Storage full', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, savedKey);
  await fillName('Unsaved');
  await action('Save new');
  assert.match(await page.$eval('.theme-status', node => node.textContent), /storage may be full/);
  assert.deepEqual(await library(), [second]);
  assert.equal(await page.$$eval('#saved-theme option', options => options.length), 2);

  await reload();
  await page.evaluate(key => localStorage.setItem(key, '{broken json'), savedKey);
  await reload();
  assert.equal(await page.$('#saved-theme'), null, 'Malformed storage must not crash the designer.');
  assert.deepEqual(await current(), updated.cssVars);
  await page.evaluate(({ key, valid }) => localStorage.setItem(key, JSON.stringify([null, { id: 'bad', name: 'Bad', cssVars: [] }, valid])), { key: savedKey, valid: second });
  await reload();
  assert.equal(await page.$$eval('#saved-theme option', options => options.length), 2);

  await page.locator('.actions button:first-child').click();
  const exported = JSON.parse(await page.$eval('.actions textarea', input => input.value));
  assert.deepEqual(exported.cssVars, updated.cssVars);
  const imported = { name: 'Imported twilight', cssVars: { ...exported.cssVars, '--gradient-end': '#312340' } };
  await page.locator('.actions textarea').fill(JSON.stringify(imported));
  assert.equal(await page.$eval('#theme-name', input => input.value), imported.name);
  assert.equal((await current())['--gradient-end'], '#312340');
  assert.equal((await current())['--glass-blur'], '0px');
  assert.equal((await current())['--stars-active'], '1');
  assert.equal((await library()).length, 3, 'Importing JSON must not silently add to the saved library.');
  await action('Save new');
  assert.equal((await library()).length, 2, 'Saving normalizes the valid library entries.');
  assert.equal((await library())[1].name, imported.name);
  assert.deepEqual(errors, [], 'The app must run without browser exceptions.');
  console.log('Saved themes: save, apply, edit isolation, update/rename, reload, backups, legacy import, delete/cancel, storage failures, and phone layouts passed.');
} finally {
  await browser?.close();
  await server.close();
  await rm(profile, { recursive: true, force: true });
}
