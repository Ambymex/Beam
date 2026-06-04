<script lang="ts">
  // Editor for the selected block (§6): set its text header, tick it done, or
  // delete it. Appears only when a block is selected; colour stays primary, the
  // text is the index. Drives RadialCanvas via the daystate action store.
  import { selectedBlockStore, blockActions } from './daystate';
  import { resolveVibe } from './categories';
  import { armedVibe } from './stores';

  let draft = '';
  let lastId: number | null = null;
  let showTimes = false;
  let startStr = '';
  let endStr = '';

  let newStartStr = '';
  let newEndStr = '';
  let newLaneId = 'main';

  $: sb = $selectedBlockStore;
  // Reset drafts only when the selected block CHANGES, so live edits (which
  // re-emit the same id) don't fight the input cursor.
  $: if (sb && sb.id !== lastId) {
    draft = sb.label ?? '';
    startStr = hoursToHHMM(sb.startHours);
    endStr = hoursToHHMM(sb.coreEndHours);
    showTimes = false;
    lastId = sb.id;
  }
  $: if (!sb) {
    lastId = null;
    initAddTimes();
  }
  // resolveVibe handles both member ids and category ids (cat:*).
  $: vibe = sb ? resolveVibe(sb.vibeId) : null;
  $: emotion = vibe?.emotion ?? null;

  function onInput() {
    $blockActions?.setLabel(draft);
  }

  // hours-from-midnight (may be ≥24 for cross-midnight) → "HH:MM" within a day
  function hoursToHHMM(h: number): string {
    const mins = Math.round(((h % 24) + 24) % 24 * 60);
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  function hhmmToHours(s: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) return null;
    return Number(m[1]) + Number(m[2]) / 60;
  }
  // Precise numeric entry: commit start + end. If end ≤ start it's read as
  // crossing midnight (end + 24), so "23:50 → 00:05" works.
  function commitTimes() {
    const s = hhmmToHours(startStr);
    let e = hhmmToHours(endStr);
    if (s === null || e === null) return;
    if (e <= s) e += 24;
    $blockActions?.setTimes(s, e);
  }

  function initAddTimes() {
    const now = new Date();
    const roundMin = now.getMinutes();
    const startH = now.getHours() + roundMin / 60;
    const endH = startH + 1.0; // default 1 hour duration
    newStartStr = hoursToHHMM(startH);
    newEndStr = hoursToHHMM(endH);
  }

  function addNow() {
    const now = new Date();
    const startH = now.getHours() + now.getMinutes() / 60;
    const endH = startH + 1.0;
    const vibeId = $armedVibe ? $armedVibe.id : null;
    $blockActions?.addBlock(newLaneId, startH, endH, vibeId);
  }

  function addCustom() {
    const s = hhmmToHours(newStartStr);
    let e = hhmmToHours(newEndStr);
    if (s === null || e === null) return;
    if (e <= s) e += 24;
    const vibeId = $armedVibe ? $armedVibe.id : null;
    $blockActions?.addBlock(newLaneId, s, e, vibeId);
  }
</script>

{#if sb}
  <div class="editor">
    <span class="dot" style="background:{vibe?.hex ?? '#6a6a78'}"></span>
    <input
      class="label"
      type="text"
      placeholder="add a label…"
      bind:value={draft}
      on:input={onInput}
      aria-label="Block label"
    />
    <button class="act" class:on={sb.done} on:click={() => $blockActions?.toggleDone()}>
      {sb.done ? '✓ completed' : 'completed'}
    </button>
    <button class="act del" on:click={() => $blockActions?.remove()} aria-label="Delete block">🗑</button>
    <button class="act" on:click={() => $blockActions?.deselect()} aria-label="Deselect">✕</button>
  </div>

  <!-- precise numeric entry: native time inputs give the proper HH:MM
       keypad, no arithmetic demanded. Gesture stays the default rough-in. -->
  <div class="times">
    <label>start <input type="time" bind:value={startStr} on:change={commitTimes} /></label>
    <span class="arrow">→</span>
    <label>end <input type="time" bind:value={endStr} on:change={commitTimes} /></label>
  </div>

  {#if emotion}
    <div class="emotion">{emotion}</div>
  {/if}
{:else}
  <!-- Add block bar -->
  <div class="editor add-bar">
    <span class="dot" style="background:{$armedVibe?.hex ?? '#6a6a78'}"></span>
    <button class="act now-btn" on:click={addNow} title="Start task now using armed vibe">
      ⚡ Start now
    </button>
    
    <div class="times select-times">
      <label>start <input type="time" bind:value={newStartStr} /></label>
      <span class="arrow">→</span>
      <label>end <input type="time" bind:value={newEndStr} /></label>
    </div>

    <select class="lane-select" bind:value={newLaneId} aria-label="Target lane">
      <option value="main">Main</option>
      <option value="washer">Washer</option>
      <option value="dryer">Dryer</option>
    </select>

    <button class="act add-btn" on:click={addCustom}>
      ＋ Add
    </button>
  </div>
{/if}

<style>
  .editor {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px 2px;
  }
  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex: 0 0 auto;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25);
  }
  .label {
    flex: 1 1 auto;
    min-width: 0;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: 8px;
    color: var(--text);
    font-size: 14px;
    padding: 7px 10px;
  }
  .label::placeholder {
    color: var(--text-faint);
  }
  .label:focus {
    outline: none;
    border-color: var(--text-faint);
  }
  .act {
    flex: 0 0 auto;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  /* done-state cue is non-colour: a luminous ring (§2) */
  .act.on {
    box-shadow: 0 0 0 1px var(--signal) inset;
    color: var(--signal);
  }
  .act.del {
    font-size: 13px;
  }
  .times {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px 2px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .times label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .times input[type='time'] {
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: 8px;
    color: var(--text);
    font-size: 14px;
    padding: 6px 8px;
  }
  .times input[type='time']:focus {
    outline: none;
    border-color: var(--text-faint);
  }
  .arrow {
    color: var(--text-faint);
  }
  .emotion {
    flex: 0 0 auto;
    padding: 0 14px 2px;
    font-size: 12px;
    color: var(--text-dim);
  }

  /* Add mode styles */
  .add-bar {
    flex-wrap: wrap;
    row-gap: 6px;
  }
  .now-btn {
    font-weight: 600;
    color: var(--signal);
    border-color: var(--border);
  }
  .select-times {
    padding: 0 !important;
  }
  .lane-select {
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: 8px;
    color: var(--text);
    font-size: 12px;
    padding: 6px 8px;
    cursor: pointer;
  }
  .lane-select:focus {
    outline: none;
    border-color: var(--text-faint);
  }
  .add-btn {
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    color: var(--signal);
    font-weight: 600;
  }
</style>
