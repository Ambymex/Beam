<script lang="ts">
  // The untimed capture list overlay (§6) — "to get: cat, milk, emergency bag."
  import { createEventDispatcher } from 'svelte';
  import { capture, addCapture, toggleCapture, removeCapture } from './capture';

  const dispatch = createEventDispatcher<{ close: void }>();
  let draft = '';

  function submit() {
    addCapture(draft);
    draft = '';
  }
</script>

<div class="overlay" role="dialog" aria-label="Capture list">
  <header>
    <span>To get / to do</span>
    <button class="close" on:click={() => dispatch('close')} aria-label="Close list">✕</button>
  </header>

  <form
    class="add"
    on:submit|preventDefault={submit}
  >
    <input
      type="text"
      placeholder="anything with no time attached…"
      bind:value={draft}
      aria-label="New capture item"
    />
    <button type="submit" aria-label="Add">＋</button>
  </form>

  <ul>
    {#each $capture as item (item.id)}
      <li class:done={item.done}>
        <button class="check" class:on={item.done} on:click={() => toggleCapture(item.id)} aria-label="Toggle done">
          {item.done ? '✓' : ''}
        </button>
        <span class="text">{item.text}</span>
        <button class="rm" on:click={() => removeCapture(item.id)} aria-label="Remove">✕</button>
      </li>
    {:else}
      <li class="empty">Nothing captured yet.</li>
    {/each}
  </ul>
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
  .add {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
  }
  .add input {
    flex: 1 1 auto;
    min-width: 0;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: 8px;
    color: var(--text);
    font-size: 14px;
    padding: 9px 12px;
  }
  .add input::placeholder {
    color: var(--text-faint);
  }
  .add input:focus {
    outline: none;
    border-color: var(--text-faint);
  }
  .add button {
    flex: 0 0 auto;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    border-radius: 8px;
    font-size: 18px;
    width: 42px;
    cursor: pointer;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 16px 16px;
    overflow-y: auto;
  }
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid var(--surface-2);
  }
  li.empty {
    color: var(--text-faint);
    font-size: 13px;
    justify-content: center;
    border: none;
  }
  .check {
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface-2);
    color: var(--signal);
    font-size: 13px;
    cursor: pointer;
    line-height: 1;
  }
  /* done = luminous ring, non-colour (§2) */
  .check.on {
    box-shadow: 0 0 0 1px var(--signal) inset;
  }
  .text {
    flex: 1 1 auto;
    color: var(--text);
    font-size: 14px;
  }
  li.done .text {
    color: var(--text-faint);
    text-decoration: line-through;
  }
  .rm {
    flex: 0 0 auto;
    background: none;
    border: none;
    color: var(--text-faint);
    font-size: 14px;
    cursor: pointer;
    padding: 4px 6px;
  }
</style>
