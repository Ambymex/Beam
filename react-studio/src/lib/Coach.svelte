<script lang="ts">
  // Live animation-habit feedback — a mentor at your shoulder, not a linter.
  // Nudges surface first; satisfied principles collapse behind the summary.
  import { coach } from './coach';
  import type { ReactConfig } from './reactConfig';

  export let config: ReactConfig;

  let showAll = false;
  $: notes = coach(config);
  $: nudges = notes.filter((n) => !n.ok);
  $: oks = notes.filter((n) => n.ok);
</script>

<div class="coach">
  <button class="head" on:click={() => (showAll = !showAll)}>
    <span class="title">Coach</span>
    <span class="summary">
      {#if nudges.length === 0}
        all {oks.length} habits singing ✓
      {:else}
        {oks.length} ✓ · {nudges.length} {nudges.length === 1 ? 'nudge' : 'nudges'}
      {/if}
    </span>
    <span class="tw">{showAll ? '▾' : '▸'}</span>
  </button>

  {#if nudges.length || showAll}
    <ul>
      {#each nudges as nte (nte.id)}
        <li class="nudge">
          <span class="dot">•</span>
          <span><b>{nte.title}.</b> {nte.note}</span>
        </li>
      {/each}
      {#if showAll}
        {#each oks as nte (nte.id)}
          <li class="ok">
            <span class="dot">✓</span>
            <span><b>{nte.title}.</b> {nte.note}</span>
          </li>
        {/each}
      {/if}
    </ul>
  {/if}
</div>

<style>
  .coach {
    background: var(--surface-1, var(--surface-2));
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 4px 12px 6px;
  }
  .head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    padding: 6px 0;
    cursor: pointer;
    color: var(--text-dim);
    font-size: 12px;
  }
  .title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--signal);
  }
  .summary { flex: 1 1 auto; text-align: left; }
  .tw { color: var(--text-faint); }
  ul {
    list-style: none;
    margin: 0 0 4px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: flex;
    gap: 8px;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--text-dim);
  }
  li b { color: var(--text); font-weight: 600; }
  .dot { flex: 0 0 auto; width: 12px; text-align: center; }
  .nudge .dot { color: var(--signal); }
  .ok { opacity: 0.75; }
  .ok .dot { color: #7dbb8a; }
</style>
