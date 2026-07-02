<script lang="ts">
  // Editor for the selected block (§6): set its text header, tick it done, or
  // delete it. Appears only when a block is selected; colour stays primary, the
  // text is the index. Drives RadialCanvas via the daystate action store.
  import { selectedBlockStore, blockActions } from './daystate';
  import { resolveVibe } from './categories';
  import { armedVibe } from './stores';
  import { VIBES } from './vibes';
  import { customVibes } from './customVibes';

  let draft = '';
  let lastId: number | null = null;
  let showTimes = false;
  let startStr = '';
  let endStr = '';

  let newStartStr = '';
  let newEndStr = '';
  let newLaneId = 'main';

  // Appointment creation options
  let isAppointmentAdd = false;
  let addTravelBeforeMins = 30;
  let addTravelAfterMins = 30;

  // Appointment editing options
  let travelBeforeMins = 30;
  let travelAfterMins = 30;

  $: sb = $selectedBlockStore;
  // Reset drafts only when the selected block CHANGES, so live edits (which
  // re-emit the same id) don't fight the input cursor.
  $: if (sb && sb.id !== lastId) {
    draft = sb.label ?? '';
    startStr = hoursToHHMM(sb.startHours);
    endStr = hoursToHHMM(sb.coreEndHours);
    if (sb.kind === 'appointment') {
      travelBeforeMins = Math.round((sb.travelBeforeHours ?? 0) * 60);
      travelAfterMins = Math.round((sb.travelAfterHours ?? 0) * 60);
    }
    showTimes = false;
    showVibeGrid = false;
    lastId = sb.id;
  }
  $: if (!sb) {
    lastId = null;
    showVibeGrid = false;
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

  function commitTravel() {
    $blockActions?.setTravelTimes(travelBeforeMins / 60, travelAfterMins / 60);
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
    $blockActions?.addBlock(
      newLaneId,
      startH,
      endH,
      vibeId,
      isAppointmentAdd,
      addTravelBeforeMins / 60,
      addTravelAfterMins / 60
    );
  }

  function addCustom() {
    const s = hhmmToHours(newStartStr);
    let e = hhmmToHours(newEndStr);
    if (s === null || e === null) return;
    if (e <= s) e += 24;
    const vibeId = $armedVibe ? $armedVibe.id : null;
    $blockActions?.addBlock(
      newLaneId,
      s,
      e,
      vibeId,
      isAppointmentAdd,
      addTravelBeforeMins / 60,
      addTravelAfterMins / 60
    );
  }
  let showVibeGrid = false;

  function changeVibe(vibeId: string | null) {
    $blockActions?.setVibe(vibeId);
  }

  function hexToHSL(hex: string) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let hVal = 0;
    let sVal = 0;
    const lVal = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      sVal = lVal > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: hVal = (g - b) / d + (g < b ? 6 : 0); break;
        case g: hVal = (b - r) / d + 2; break;
        case b: hVal = (r - g) / d + 4; break;
      }
      hVal /= 6;
    }
    return { h: hVal * 360, s: sVal * 100, l: lVal * 100 };
  }

  function sortVibesChromatically(list: any[]) {
    return [...list].sort((a, b) => {
      const hslA = hexToHSL(a.hex);
      const hslB = hexToHSL(b.hex);

      // Put neutral grays/slates (low saturation) at the very end
      const grayThreshold = 12;
      const isGrayA = hslA.s < grayThreshold;
      const isGrayB = hslB.s < grayThreshold;

      if (isGrayA && !isGrayB) return 1;
      if (!isGrayA && isGrayB) return -1;
      if (isGrayA && isGrayB) return hslA.l - hslB.l; // Sort grays by lightness

      // Sort colored swatches by Hue, then Lightness
      if (Math.abs(hslA.h - hslB.h) > 2) {
        return hslA.h - hslB.h;
      }
      return hslA.l - hslB.l;
    });
  }

  $: sortedVibes = sortVibesChromatically([...VIBES, ...$customVibes]);
</script>

{#if sb}
  <div class="editor">
    <button class="dot-btn" on:click={() => showVibeGrid = !showVibeGrid} aria-label="Change block color" title="Change block color">
      <span class="dot" style="background:{vibe?.hex ?? '#6a6a78'}"></span>
    </button>
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

  {#if showVibeGrid}
    <div class="editor-swatches-grid">
      <button 
        class="swatch" 
        class:active={!sb.vibeId}
        style="background: #6a6a78;" 
        title="No vibe"
        on:click={() => { changeVibe(null); setTimeout(() => { showVibeGrid = false; }, 150); }}
        aria-label="Remove vibe color"
      ></button>
      {#each sortedVibes as v (v.id)}
        <button
          class="swatch"
          class:active={sb.vibeId === v.id}
          style="background:{v.hex}"
          title={v.emotion}
          on:click={() => { changeVibe(v.id); setTimeout(() => { showVibeGrid = false; }, 150); }}
          aria-label="Set vibe to {v.emotion}"
        ></button>
      {/each}
    </div>
  {/if}

  <div class="times">
    <label>start <input type="time" bind:value={startStr} on:change={commitTimes} /></label>
    <span class="arrow">→</span>
    <label>end <input type="time" bind:value={endStr} on:change={commitTimes} /></label>
  </div>

  {#if sb.kind === 'appointment'}
    <div class="travel-times">
      <label>leave <input type="number" min="0" step="5" bind:value={travelBeforeMins} on:change={commitTravel} /> min early</label>
      <span class="dot-sep">•</span>
      <label>return <input type="number" min="0" step="5" bind:value={travelAfterMins} on:change={commitTravel} /> min after</label>
    </div>
  {/if}

  {#if emotion}
    <div class="emotion">{emotion}</div>
  {/if}
{:else}
  <!-- Add block bar -->
  <div class="editor add-bar">
    <span class="dot" style="background:{$armedVibe?.hex ?? '#6a6a78'}"></span>
    <button class="act now-btn" on:click={addNow} title="Start task now using armed vibe">
      Start now
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
      <option value="emotion">Emotion</option>
    </select>

    <label class="appt-check">
      <input type="checkbox" bind:checked={isAppointmentAdd} />
      Appt
    </label>

    <button class="act add-btn" on:click={addCustom}>
      ＋ Add
    </button>

    {#if isAppointmentAdd}
      <div class="add-travel-times">
        <label>leave <input type="number" min="0" step="5" bind:value={addTravelBeforeMins} /> min early</label>
        <span class="dot-sep">•</span>
        <label>return <input type="number" min="0" step="5" bind:value={addTravelAfterMins} /> min after</label>
      </div>
    {/if}
  </div>
{/if}

<style>
  .editor {
    position: relative;
    z-index: 2;
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
    background: var(--glass-bg);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--glass-border);
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
    background: var(--glass-bg);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--glass-border);
    color: var(--text-2);
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  /* done-state cue is non-colour: a luminous ring (§2) */
  .act.on {
    background: var(--signal);
    color: var(--signal-contrast);
    box-shadow: 0 0 6px var(--signal-glow);
    border-color: var(--signal);
  }
  .act.del {
    font-size: 13px;
  }
  .times {
    position: relative;
    z-index: 2;
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

  /* Travel times editing and adding */
  .travel-times,
  .add-travel-times {
    position: relative;
    z-index: 2;
    width: 100%;
    padding: 2px 12px 6px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .travel-times label,
  .add-travel-times label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .travel-times input[type='number'],
  .add-travel-times input[type='number'] {
    width: 52px;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: 8px;
    color: var(--text);
    font-size: 13px;
    padding: 4px 6px;
    text-align: center;
  }
  .travel-times input[type='number']:focus,
  .add-travel-times input[type='number']:focus {
    outline: none;
    border-color: var(--text-faint);
  }
  .dot-sep {
    color: var(--text-faint);
    user-select: none;
  }
  .appt-check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text-2);
    cursor: pointer;
    user-select: none;
  }
  .appt-check input[type='checkbox'] {
    cursor: pointer;
    width: 15px;
    height: 15px;
    accent-color: var(--signal);
  }

  /* Color dot button and swatches grid */
  .dot-btn {
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    border-radius: 50%;
    transition: background-color 0.12s ease;
  }
  .dot-btn:hover {
    background-color: var(--surface-3);
  }
  .editor-swatches-grid {
    position: relative;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 14px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--hairline);
    width: 100%;
  }
  .swatch {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1px solid var(--border-2);
    cursor: pointer;
    padding: 0;
    transition: transform 0.08s ease, border-color 0.08s ease;
  }
  .swatch:hover {
    transform: scale(1.15);
  }
  .swatch.active {
    border-color: var(--text);
    box-shadow: 0 0 0 2px var(--surface), 0 0 0 3px var(--text);
  }
</style>
