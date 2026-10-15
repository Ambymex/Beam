<script lang="ts">
  // 🐟 The Fish Coach — Live Design Feedback UI
  import { fishCoach } from './fishCoach';
  import type { FishConfig } from './fishConfig';

  export let config: FishConfig;

  let showAll = false;
  $: notes = fishCoach(config);
  $: nudges = notes.filter((n) => n.kind === 'nudge');
  $: tips = notes.filter((n) => n.kind === 'tip');
  $: oks = notes.filter((n) => n.kind === 'ok');
</script>

<div class="fish-coach">
  <button class="head" on:click={() => (showAll = !showAll)}>
    <span class="title">🐟 Fish Coach</span>
    <span class="summary">
      {#if nudges.length === 0 && tips.length === 0}
        all {oks.length} species design habits balanced ✓
      {:else}
        {oks.length} ✓{#if nudges.length}&nbsp;· {nudges.length} {nudges.length === 1 ? 'nudge' : 'nudges'}{/if}{#if tips.length}&nbsp;· {tips.length} {tips.length === 1 ? 'tip' : 'tips'}{/if}
      {/if}
    </span>
    <span class="tw">{showAll ? '▾' : '▸'}</span>
  </button>

  {#if nudges.length || tips.length || showAll}
    <ul>
      {#each nudges as nte (nte.id)}
        <li class="nudge">
          <span class="dot">•</span>
          <span><b>{nte.title}.</b> {nte.note}</span>
        </li>
      {/each}
      {#each tips as nte (nte.id)}
        <li class="tip">
          <span class="dot">◇</span>
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
  .fish-coach {
    background: var(--surface-1, var(--surface-2));
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 6px 14px;
    font-size: 12px;
    color: var(--text-2);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    background: none;
    border: none;
    padding: 4px 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }
  .title {
    font-weight: 700;
    color: var(--text);
  }
  .summary {
    flex: 1 1 auto;
    font-size: 11px;
    color: var(--text-dim);
  }
  .tw {
    font-size: 10px;
    color: var(--text-dim);
  }
  ul {
    list-style: none;
    margin: 6px 0 2px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid var(--hairline, var(--border));
    padding-top: 6px;
  }
  li {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    line-height: 1.4;
    font-size: 11.5px;
  }
  .dot {
    flex: 0 0 auto;
    font-weight: 700;
  }
  .nudge {
    color: var(--signal, #ffb703);
  }
  .tip {
    color: var(--text-2, #8ecae6);
  }
  .ok {
    color: var(--text-dim, #6c757d);
  }
  li b {
    color: var(--text);
  }
</style>
