<script lang="ts">
  // Comms channel overlay: the untruncated archive of every notification the
  // companion has sent (see comms.ts). Read-only by design — replies belong
  // in the chat; this is the message board on the fridge.
  import { createEventDispatcher, onMount } from 'svelte';
  import { loadComms, markAllCommsRead, clearComms, type CommMessage } from './comms';

  const dispatch = createEventDispatcher<{ close: void }>();

  let messages: CommMessage[] = [];
  let loaded = false;

  onMount(async () => {
    messages = await loadComms();
    loaded = true;
    // Opening the panel IS reading it — but keep this visit's unread dots so
    // "what's new since I last looked" survives the act of looking at it.
    markAllCommsRead();
  });

  const KIND_LABELS: Record<string, string> = {
    'companion-alert': 'Sent live',
    'scheduled-alert': 'Scheduled',
  };

  function fmtWhen(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `Today ${time}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
  }

  // Two-tap clear: no confirm() dialogs in this app's style.
  let clearArmed = false;
  let clearTimer: ReturnType<typeof setTimeout>;
  async function onClear() {
    if (!clearArmed) {
      clearArmed = true;
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => (clearArmed = false), 2500);
      return;
    }
    clearTimeout(clearTimer);
    clearArmed = false;
    await clearComms();
    messages = [];
  }
</script>

<div class="overlay" role="dialog" aria-label="Companion comms channel">
  <header>
    <span>Comms</span>
    <div class="head-btns">
      {#if messages.length > 0}
        <button class="clear" class:armed={clearArmed} on:click={onClear}>
          {clearArmed ? 'Tap again to clear' : 'Clear all'}
        </button>
      {/if}
      <button class="close" on:click={() => dispatch('close')} aria-label="Close comms">✕</button>
    </div>
  </header>

  <div class="feed">
    {#if loaded && messages.length === 0}
      <p class="empty">
        Nothing here yet. When the companion sends a notification, the full
        message lands in this channel — however long it runs.
      </p>
    {/if}
    {#each messages as msg (msg.id)}
      <article class="card glass-card" class:unread={msg.read === 0}>
        <div class="meta">
          {#if msg.read === 0}<span class="dot" title="New since last visit"></span>{/if}
          <span class="when">{fmtWhen(msg.ts)}</span>
          <span class="kind">{KIND_LABELS[msg.kind] || msg.kind}</span>
        </div>
        <h3>{msg.title}</h3>
        {#if msg.body}
          <p class="body">{msg.body}</p>
        {/if}
      </article>
    {/each}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: var(--ambient-gradient, var(--app-bg));
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
  .head-btns {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .clear {
    background: none;
    border: none;
    color: var(--text-faint);
    font-size: 12px;
    text-decoration: underline;
    cursor: pointer;
    padding: 4px 6px;
  }
  .clear.armed {
    color: var(--signal);
  }
  .close {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
  }
  .feed {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .empty {
    color: var(--text-dim);
    font-size: 14px;
    line-height: 1.5;
    text-align: center;
    margin-top: 32px;
    padding: 0 24px;
  }
  .card {
    border-radius: 14px;
    padding: 12px 14px;
  }
  /* unread = luminosity cue, never a hue (§2) */
  .card.unread {
    border-color: var(--signal);
    box-shadow: 0 0 8px var(--signal-glow);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--signal);
    box-shadow: 0 0 6px var(--signal-glow);
  }
  .when {
    font-size: 11px;
    color: var(--text-dim);
  }
  .kind {
    font-size: 10px;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }
  /* pre-wrap: his line breaks are part of the message */
  .body {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-2);
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }
</style>
