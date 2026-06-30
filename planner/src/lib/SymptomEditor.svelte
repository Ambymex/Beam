<script lang="ts">
  import { selectedSymptomStore, symptomActions } from './daystate';
  import { SYMPTOM_CATEGORIES, type SymptomCategory, SYMPTOM_FILL, severityOpacity } from './symptoms';
  import { palette } from './theme';

  $: ss = $selectedSymptomStore;
  $: pal = $palette;

  let timeStr = '';
  let noteStr = '';
  let severityLevel: 1 | 2 | 3 | 4 | 5 = 1;
  let category: SymptomCategory | null = null;
  let lastId: number | null = null;
  const levels: (1|2|3|4|5)[] = [1, 2, 3, 4, 5];

  $: if (ss && ss.id !== lastId) {
    timeStr = hoursToHHMM(ss.timeHours);
    noteStr = ss.note ?? '';
    severityLevel = ss.severity;
    category = ss.category;
    lastId = ss.id;
  }
  $: if (!ss) {
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
    if (!ss || !category) return;
    $symptomActions?.updateSymptom(severityLevel, category, hhmmToHours(timeStr), noteStr);
  }

  function setSeverity(level: 1 | 2 | 3 | 4 | 5) {
    severityLevel = level;
    commitUpdate();
  }

  function onCategoryChange(ev: Event) {
    category = (ev.target as HTMLSelectElement).value as SymptomCategory;
    commitUpdate();
  }
</script>

{#if ss}
  <div class="symptom-editor glass-card">
    <div class="row header-row">
      <div class="dot-wrap">
        <div class="dot" style="background: {SYMPTOM_FILL}; opacity: {severityOpacity(severityLevel)}" />
      </div>
      <div class="title">Edit Symptom</div>
      <button class="icon-btn" on:click={() => $symptomActions?.remove()} aria-label="Delete">🗑</button>
      <button class="icon-btn" on:click={() => $symptomActions?.deselect()} aria-label="Close">✕</button>
    </div>

    <div class="row">
      <label>
        Time
        <input type="time" bind:value={timeStr} on:change={commitUpdate} required />
      </label>
      <label class="flex-grow">
        Category
        <select bind:value={category} on:change={onCategoryChange}>
          {#each SYMPTOM_CATEGORIES as cat}
            <option value={cat.id}>{cat.label}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="row severities">
      <span class="label">Severity</span>
      <div class="pills">
        {#each levels as lvl (lvl)}
          <button
            class="sev-pill"
            class:active={severityLevel === lvl}
            on:click={() => setSeverity(lvl)}
            style="--op: {severityOpacity(lvl)}"
          >
            {lvl}
          </button>
        {/each}
      </div>
    </div>

    <div class="row">
      <input 
        type="text" 
        class="note-input"
        placeholder="Optional note (e.g. took antihistamine)" 
        bind:value={noteStr} 
        on:blur={commitUpdate}
        on:keydown={(e) => e.key === 'Enter' && commitUpdate()}
      />
    </div>
  </div>
{/if}

<style>
  .symptom-editor {
    position: absolute;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    width: max-content;
    max-width: 94vw;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: 50;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
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
  .flex-grow {
    flex: 1;
  }
  input, select {
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
  .severities {
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
  }
  .sev-pill {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    width: 32px;
    height: 32px;
    border-radius: 16px;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  .sev-pill::before {
    content: '';
    position: absolute;
    inset: 0;
    background: #8a8a96;
    opacity: var(--op);
    z-index: 1;
  }
  .sev-pill.active {
    border-color: var(--signal);
    box-shadow: 0 0 0 1px var(--signal);
  }
  .sev-pill span, .sev-pill {
    z-index: 2; /* keep text readable */
  }
</style>
