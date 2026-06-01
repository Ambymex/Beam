<script lang="ts">
  // Length + reset controls for the cycle (§11). Position itself is set
  // spatially by dragging the subdial marker — this just covers the things a
  // drag can't: cycle length (varies) and "today = day 1". A live preview dial
  // sits on top so every change is felt positionally, never as a bare number.
  import { createEventDispatcher } from 'svelte';
  import { cycle, setLength, startToday, nudgePosition, MIN_LENGTH, MAX_LENGTH } from './cycle';
  import CycleDial from './CycleDial.svelte';

  const dispatch = createEventDispatcher<{ close: void }>();
</script>

<div class="overlay" role="dialog" aria-label="Cycle settings">
  <header>
    <span>Cycle</span>
    <button class="close" on:click={() => dispatch('close')} aria-label="Close">✕</button>
  </header>

  <div class="body">
    <div class="dialwrap">
      <CycleDial size={200} interactive={true} />
    </div>
    <p class="hint">Drag the marker to set where you are.</p>

    <div class="row">
      <span class="lbl">Cycle length</span>
      <div class="stepper">
        <button on:click={() => setLength($cycle.length - 1)} disabled={$cycle.length <= MIN_LENGTH} aria-label="Shorter">−</button>
        <span class="val">{$cycle.length} days</span>
        <button on:click={() => setLength($cycle.length + 1)} disabled={$cycle.length >= MAX_LENGTH} aria-label="Longer">＋</button>
      </div>
    </div>

    <div class="row">
      <span class="lbl">Nudge position</span>
      <div class="stepper">
        <button on:click={() => nudgePosition(-1)} aria-label="Back a day">−</button>
        <span class="val">day {$cycle.position}</span>
        <button on:click={() => nudgePosition(1)} aria-label="Forward a day">＋</button>
      </div>
    </div>

    <button class="reset" on:click={startToday}>Today is day 1</button>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    border-bottom: 1px solid var(--hairline);
  }
  .close {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
  }
  .body {
    padding: 18px 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
  }
  .dialwrap {
    margin-top: 6px;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-faint);
  }
  .row {
    width: 100%;
    max-width: 320px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .lbl {
    font-size: 14px;
    color: var(--text-2);
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .stepper button {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    color: var(--text);
    font-size: 18px;
    cursor: pointer;
  }
  .stepper button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .val {
    min-width: 70px;
    text-align: center;
    font-size: 14px;
    color: var(--text);
  }
  .reset {
    margin-top: 4px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    border-radius: 999px;
    padding: 8px 16px;
    font-size: 13px;
    cursor: pointer;
  }
</style>
