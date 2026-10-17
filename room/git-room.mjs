import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const exec = promisify(execFile);
const defaults = JSON.parse(await readFile(new URL('./config.json', import.meta.url), 'utf8'));
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/;
const participant = /^[a-z][a-z0-9_-]{0,31}$/;

export function normalizeEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected an event object.');
  const event = {
    id: input.id ?? randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    participant: input.participant,
    type: input.type ?? 'message',
  };
  if (typeof event.id !== 'string' || !identifier.test(event.id)) throw new Error('Invalid event ID.');
  if (typeof event.participant !== 'string' || !participant.test(event.participant)) throw new Error('Use a lowercase participant name.');
  if (typeof event.timestamp !== 'string' || !Number.isFinite(Date.parse(event.timestamp))) throw new Error('Invalid timestamp.');
  event.timestamp = new Date(event.timestamp).toISOString();
  if (!['message', 'reaction', 'system'].includes(event.type)) throw new Error('Unknown event type.');
  const field = event.type === 'reaction' ? 'reaction' : 'text';
  if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > (field === 'reaction' ? 100 : 16000)) {
    throw new Error(field === 'reaction' ? 'A reaction needs a short payload.' : 'A message needs text (maximum 16,000 characters).');
  }
  event[field] = input[field].trim();
  if (input.to !== undefined) {
    if (typeof input.to !== 'string' || !participant.test(input.to)) throw new Error('Invalid recipient.');
    event.to = input.to;
  }
  if (input.replyTo !== undefined) {
    if (typeof input.replyTo !== 'string' || !identifier.test(input.replyTo)) throw new Error('Invalid reply target.');
    event.replyTo = input.replyTo;
  }
  return event;
}

// gh supplies the computer's existing GitHub authentication. No token is sent
// to the browser, committed, or placed in a command argument.
export async function githubApi(path, body) {
  const child = exec('gh', ['api', path, ...(body ? ['--method', 'PUT', '--input', '-'] : [])], { maxBuffer: 16 * 1024 * 1024 });
  if (body) child.child.stdin.end(JSON.stringify(body));
  try {
    const { stdout } = await child;
    return JSON.parse(stdout);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Install GitHub CLI (gh), then run gh auth login on the serving computer.');
    let detail;
    try { detail = JSON.parse(error.stdout).message; } catch { /* gh may return plain stderr */ }
    const failure = new Error(detail ?? 'GitHub request failed. Check gh auth status and repository access on this computer.');
    failure.status = /404/.test(error.stderr ?? '') ? 404 : /409|422/.test(error.stderr ?? '') ? 409 : 502;
    throw failure;
  }
}

export function createRoom(options = {}) {
  const repository = options.repository ?? process.env.ROOM_REPO ?? defaults.repository;
  const branch = options.branch ?? process.env.ROOM_BRANCH ?? defaults.branch;
  const api = options.api ?? githubApi;
  const cache = new Map();
  const prefix = `repos/${repository}`;
  const contents = path => `${prefix}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  function configured() {
    if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Set ROOM_REPO to the repository holding the room transcript.');
  }
  async function file(path) {
    try {
      const data = await api(contents(path));
      return { sha: data.sha, value: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')) };
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }
  async function put(path, value, sha, message) {
    return api(`${prefix}/contents/${path}`, {
      branch, message, content: Buffer.from(JSON.stringify(value, null, 2) + '\n').toString('base64'),
      ...(sha ? { sha } : {}),
    });
  }
  return {
    repository, branch,
    async events() {
      configured();
      const tree = await api(`${prefix}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
      if (tree.truncated) throw new Error('GitHub returned an incomplete room tree.');
      const paths = tree.tree.filter(entry => entry.type === 'blob' && /^room\/events\/[\w-]+\.json$/.test(entry.path));
      const events = [];
      const warnings = [];
      for (const entry of paths) {
        if (!cache.has(entry.sha)) {
          const blob = await api(`${prefix}/git/blobs/${entry.sha}`);
          try {
            const raw = JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'));
            if (!raw.id || !raw.timestamp) throw new Error('Missing ID or timestamp.');
            const event = normalizeEvent(raw);
            if (entry.path !== `room/events/${event.id}.json`) throw new Error('Filename and ID differ.');
            cache.set(entry.sha, event);
          } catch (error) {
            cache.set(entry.sha, { invalid: `${entry.path}: ${error.message}` });
          }
        }
        const event = cache.get(entry.sha);
        if (event.invalid) warnings.push(event.invalid);
        else events.push(event);
      }
      events.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
      return { repository, branch, events, warnings };
    },
    async append(input) {
      configured();
      const event = normalizeEvent(input);
      const path = `room/events/${event.id}.json`;
      for (let attempt = 0; attempt < 4; attempt++) {
        const existing = await file(path);
        if (existing) {
          const original = normalizeEvent(existing.value);
          if (input.timestamp === undefined) event.timestamp = original.timestamp;
          if (JSON.stringify(original) === JSON.stringify(event)) return original;
          throw Object.assign(new Error('That event ID already exists with different content. History is immutable.'), { status: 409 });
        }
        try {
          await put(path, event, null, `[room:${event.participant}] ${event.type} ${event.id}`);
          return event;
        } catch (error) {
          if (error.status !== 409 || attempt === 3) throw error;
        }
      }
    },
    async checkpoint(who, ids) {
      configured();
      if (!participant.test(who)) throw new Error('Invalid participant.');
      if (ids !== undefined && (!Array.isArray(ids) || ids.length > 10000 || ids.some(id => typeof id !== 'string' || !identifier.test(id)))) {
        throw new Error('Checkpoint IDs must be a list of event IDs.');
      }
      const path = `room/state/${who}.json`;
      for (let attempt = 0; attempt < 4; attempt++) {
        const existing = await file(path);
        const seenEventIds = existing?.value.seenEventIds ?? [];
        if (ids === undefined) return { participant: who, seenEventIds };
        const value = { participant: who, seenEventIds: [...new Set([...seenEventIds, ...ids])].sort() };
        if (JSON.stringify(value.seenEventIds) === JSON.stringify(seenEventIds)) return value;
        try {
          await put(path, value, existing?.sha, `[room:${who}] checkpoint`);
          return value;
        } catch (error) {
          if (error.status !== 409 || attempt === 3) throw error;
        }
      }
    },
  };
}
