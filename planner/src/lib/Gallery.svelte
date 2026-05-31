<script lang="ts">
  // The day-thumbnail gallery (§12 tier 1) — the "time machine" for flicking
  // back through days by shape and colour. Zero AI; this covers ~80% of search.
  import { createEventDispatcher } from 'svelte';
  import { days, currentKey, dayKeysDesc, todayKey, futureKeys } from './days';
  import { parseKey, emptyDay } from './daydata';
  import DayThumbnail from './DayThumbnail.svelte';

  const dispatch = createEventDispatcher<{ close: void }>();
  const tKey = todayKey();
  const fmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const future = futureKeys(14); // the time machine forward (§8)

  function pick(key: string) {
    currentKey.set(key);
    dispatch('close');
  }
  function label(key: string): string {
    if (key === tKey) return 'Today';
    return fmt.format(parseKey(key));
  }
</script>

<div class="overlay" role="dialog" aria-label="Day gallery">
  <header>
    <span>Days</span>
    <button class="close" on:click={() => dispatch('close')} aria-label="Close gallery">✕</button>
  </header>
  <div class="scroll">
    <div class="grid">
      {#each $dayKeysDesc as key (key)}
        <button class="cell" class:current={key === $currentKey} on:click={() => pick(key)}>
          <div class="thumb">
            <DayThumbnail day={$days[key] ?? emptyDay()} isToday={key === tKey} />
          </div>
          <span class="caption">{label(key)}</span>
        </button>
      {/each}
    </div>

    <!-- Future days (§8): pre-seeded empty rings — land on one and drop an
         appointment before its morning. -->
    <h2 class="section">Ahead</h2>
    <div class="grid">
      {#each future as key (key)}
        <button class="cell" class:current={key === $currentKey} on:click={() => pick(key)}>
          <div class="thumb">
            <DayThumbnail day={$days[key] ?? emptyDay()} isToday={false} />
          </div>
          <span class="caption">{label(key)}</span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: #0b0b0e;
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
    color: #e7e7ea;
    border-bottom: 1px solid #1b1b22;
  }
  .close {
    background: none;
    border: none;
    color: #9a9aa4;
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
    gap: 14px;
    padding: 16px;
    align-content: start;
  }
  .section {
    margin: 0;
    padding: 4px 16px 0;
    font-size: 13px;
    font-weight: 600;
    color: #8a8a94;
    border-top: 1px solid #1b1b22;
  }
  .cell {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .thumb {
    aspect-ratio: 1;
    border-radius: 12px;
    /* selection: non-colour ring */
    box-shadow: inset 0 0 0 1px #1f1f27;
  }
  .cell.current .thumb {
    box-shadow: 0 0 0 2px #fdfdff;
  }
  .caption {
    font-size: 12px;
    color: #b6b6be;
    text-align: center;
  }
</style>
