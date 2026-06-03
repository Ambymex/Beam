<script lang="ts">
  // Alerts settings (spec §7). Surfaces notification permission, the iOS
  // install requirement, and a test that fires a real notification through the
  // service worker — proving the receive half before the server spine exists.
  import { createEventDispatcher, onMount } from 'svelte';
  import {
    pushPermission,
    pushSubscribed,
    currentPermission,
    requestPermission,
    subscribe,
    sendTestNotification,
    isStandalone,
    VAPID_PUBLIC_KEY,
  } from './push';

  import { syncConfigured, syncToServer } from './sync';

  const dispatch = createEventDispatcher<{ close: void }>();
  const standalone = isStandalone();
  let testFired = false;
  let syncedOk: boolean | null = null;

  // refresh on open
  pushPermission.set(currentPermission());

  onMount(async () => {
    if (currentPermission() === 'granted') {
      await subscribe();
      if (syncConfigured) syncedOk = await syncToServer();
    }
  });

  async function enable() {
    const state = await requestPermission();
    if (state === 'granted') {
      await subscribe();
      // upload the subscription + upcoming schedule so pings fire when closed
      if (syncConfigured) syncedOk = await syncToServer();
    }
  }
  async function test() {
    testFired = await sendTestNotification();
  }
</script>

<div class="overlay" role="dialog" aria-label="Alerts settings">
  <header>
    <span>Alerts</span>
    <button class="close" on:click={() => dispatch('close')} aria-label="Close">✕</button>
  </header>

  <div class="body">
    <p class="lead">
      Alerts fire on <em>transitions</em> — a block starting, an appliance cycle
      ending, or time to leave for an appointment. Never a nag for something
      undone; that just slides to tomorrow.
    </p>

    {#if $pushPermission === 'unsupported'}
      <div class="card warn">This browser doesn't support notifications.</div>
    {:else}
      <div class="row">
        <span class="lbl">Permission</span>
        <span class="state {$pushPermission}">{$pushPermission}</span>
      </div>

      {#if !standalone}
        <div class="card warn">
          <strong>Add to Home Screen first.</strong>
          On iPhone, reliable alerts need the app installed: tap
          <span class="key">Share</span> → <span class="key">Add to Home Screen</span>, then open it
          from the Home Screen and enable alerts from there.
        </div>
      {/if}

      {#if $pushPermission !== 'granted'}
        <button class="primary" on:click={enable} disabled={$pushPermission === 'denied'}>
          {$pushPermission === 'denied' ? 'Blocked in settings' : 'Enable alerts'}
        </button>
      {:else}
        <button class="primary" on:click={test}>Send a test alert</button>
        {#if testFired}
          <p class="ok">Sent — check your notifications.</p>
        {/if}
        <div class="row sub">
          <span class="lbl">Push subscription</span>
          <span class="state">{$pushSubscribed ? 'active' : VAPID_PUBLIC_KEY ? 'idle' : 'server not wired yet'}</span>
        </div>
        {#if syncConfigured}
          <div class="row sub">
            <span class="lbl">Scheduled pings</span>
            <span class="state"
              >{syncedOk === null ? 'syncing…' : syncedOk ? 'synced ✓' : 'will retry'}</span
            >
          </div>
        {/if}
      {/if}
    {/if}

    <p class="note">
      {#if syncConfigured}
        Your schedule is mirrored to the server, so transition alerts land even
        when the app is closed.
      {:else}
        The scheduled server push (so alerts land even when the app is closed)
        connects once the Supabase spine is deployed. The receive path above
        already works.
      {/if}
    </p>
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
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 480px;
  }
  .lead {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-dim);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .row.sub {
    opacity: 0.8;
    font-size: 13px;
  }
  .lbl {
    font-size: 14px;
    color: var(--text-2);
  }
  .state {
    font-size: 13px;
    color: var(--text-dim);
    text-transform: capitalize;
  }
  .state.granted {
    color: var(--text-2);
  }
  .state.denied {
    color: var(--text-dim);
  }
  .card {
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 13px;
    line-height: 1.5;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    color: var(--text-2);
  }
  .card.warn {
    border-color: var(--border-2);
  }
  .key {
    background: var(--surface-3);
    border-radius: 5px;
    padding: 1px 6px;
    font-size: 12px;
    color: var(--text);
    white-space: nowrap;
  }
  .primary {
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    color: var(--signal);
    border-radius: 10px;
    padding: 11px 14px;
    font-size: 14px;
    cursor: pointer;
  }
  .primary:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .ok {
    margin: 0;
    font-size: 13px;
    color: var(--text-2);
  }
  .note {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-faint);
  }
</style>
