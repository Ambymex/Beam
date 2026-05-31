<script lang="ts">
  // Editor for the selected block (§6): set its text header, tick it done, or
  // delete it. Appears only when a block is selected; colour stays primary, the
  // text is the index. Drives RadialCanvas via the daystate action store.
  import { selectedBlockStore, blockActions } from './daystate';
  import { VIBES_BY_ID } from './vibes';

  let draft = '';
  let lastId: number | null = null;

  $: sb = $selectedBlockStore;
  // Reset the draft only when the selected block CHANGES, so live label edits
  // (which re-emit the same id) don't fight the input cursor.
  $: if (sb && sb.id !== lastId) {
    draft = sb.label ?? '';
    lastId = sb.id;
  }
  $: if (!sb) lastId = null;
  $: emotion = sb && sb.vibeId ? (VIBES_BY_ID[sb.vibeId]?.emotion ?? null) : null;

  function onInput() {
    $blockActions?.setLabel(draft);
  }
</script>

{#if sb}
  <div class="editor">
    <span class="dot" style="background:{sb.vibeId ? (VIBES_BY_ID[sb.vibeId]?.hex ?? '#6a6a78') : '#6a6a78'}"
    ></span>
    <input
      class="label"
      type="text"
      placeholder="add a label…"
      bind:value={draft}
      on:input={onInput}
      aria-label="Block label"
    />
    <button class="act" class:on={sb.done} on:click={() => $blockActions?.toggleDone()}>
      {sb.done ? '✓ done' : 'done'}
    </button>
    <button class="act del" on:click={() => $blockActions?.remove()} aria-label="Delete block">🗑</button>
    <button class="act" on:click={() => $blockActions?.deselect()} aria-label="Deselect">✕</button>
  </div>
  {#if emotion}
    <div class="emotion">{emotion}</div>
  {/if}
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
    background: #16161c;
    border: 1px solid #2a2a33;
    border-radius: 8px;
    color: #e7e7ea;
    font-size: 14px;
    padding: 7px 10px;
  }
  .label::placeholder {
    color: #5d5d68;
  }
  .label:focus {
    outline: none;
    border-color: #4a4a57;
  }
  .act {
    flex: 0 0 auto;
    background: #16161c;
    border: 1px solid #26262e;
    color: #cfcfd6;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  /* done-state cue is non-colour: a luminous ring (§2) */
  .act.on {
    box-shadow: 0 0 0 1px #fdfdff inset;
    color: #fdfdff;
  }
  .act.del {
    font-size: 13px;
  }
  .emotion {
    flex: 0 0 auto;
    padding: 0 14px 2px;
    font-size: 12px;
    color: #8a8a94;
  }
</style>
