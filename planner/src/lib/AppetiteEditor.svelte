<script lang="ts">
  import { selectedAppetiteStore, appetiteActions } from './daystate';
  import { APPETITE_LEVELS, type AppetiteLevel, APPETITE_FILL, appetiteOpacity } from './appetite';
  import { palette } from './theme';

  $: ae = $selectedAppetiteStore;
  $: pal = $palette;

  let timeStr = '';
  let noteStr = '';
  let level: AppetiteLevel = 'normal';
  let lastId: number | null = null;

  $: if (ae && ae.id !== lastId) {
    timeStr = hoursToHHMM(ae.timeHours);
    noteStr = ae.note ?? '';
    level = ae.level;
    lastId = ae.id;
  }
  $: if (!ae) {
    lastId = null;
  }

  function hoursToHHMM(h: number): string {
    const mins = Math.round(((h % 24) + 24) % 24 * 60);
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  function hhmmToHours(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h + m / 60;
  }

  function commitUpdate() {
    if (!ae) return;
    $appetiteActions?.updateAppetite(level, hhmmToHours(timeStr), noteStr);
  }

  function setLevel(l: AppetiteLevel) {
    level = l;
    commitUpdate();
  }
</script>

{#if ae}
  <div class="appetite-editor glass-card">
    <div class="row header-row">
      <div class="dot-wrap">
        <div class="dot" style="background: {APPETITE_FILL}; opacity: {appetiteOpacity(level)}" />
      </div>
      <div class="title">Edit Appetite</div>
      <button class="icon-btn" on:click={() => $appetiteActions?.remove()} aria-label="Delete">🗑</button>
      <button class="icon-btn" on:click={() => $appetiteActions?.deselect()} aria-label="Close">✕</button>
    </div>

    <div class="row">
      <label>
        Time
        <input type="time" bind:value={timeStr} on:change={commitUpdate} required />
      </label>
    </div>

    <div class="row levels">
      <span class="label">Level</span>
      <div class="pills">
        {#each APPETITE_LEVELS as lvl (lvl.id)}
          <button
            class="lvl-pill"
            class:active={level === lvl.id}
            on:click={() => setLevel(lvl.id)}
            style="--op: {lvl.opacity}"
          >
            <span>{lvl.label}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="row">
      <input
        type="text"
        class="note-input"
        placeholder="Optional note"
        bind:value={noteStr}
        on:blur={commitUpdate}
        on:keydown={(e) => e.key === 'Enter' && commitUpdate()}
      />
    </div>
  </div>
{/if}

<style>
  .appetite-editor {
    position: absolute;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    width: max-content;
    max-width: 94vw;
    background: var(--glass-bg);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--glass-border);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: 50;
    box-shadow: var(--glass-shadow);
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .header-row {
    justify-content: space-between;
  }
  .dot-wrap {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
  }
  .title {
    font-weight: 600;
    color: var(--text);
    flex: 1;
  }
  .icon-btn {
    background: transparent;
    border: none;
    color: var(--text-dim);
    width: 32px;
    height: 32px;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .icon-btn:hover {
    background: var(--surface-3);
    color: var(--text);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  input {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 14px;
    font-family: inherit;
  }
  .note-input {
    width: 100%;
  }
  .levels {
    align-items: center;
    justify-content: space-between;
  }
  .label {
    font-size: 11px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .pills {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .lvl-pill {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    height: 32px;
    padding: 0 10px;
    border-radius: 16px;
    cursor: pointer;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  .lvl-pill::before {
    content: '';
    position: absolute;
    inset: 0;
    background: #8a8a96;
    opacity: var(--op);
    z-index: 1;
  }
  .lvl-pill.active {
    border-color: var(--signal);
    box-shadow: 0 0 0 1px var(--signal);
  }
  .lvl-pill span {
    position: relative;
    z-index: 2; /* keep text readable over the opacity wash */
  }
</style>
