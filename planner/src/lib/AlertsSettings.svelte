<script lang="ts">
  // Alerts settings (spec §7). Surfaces notification permission, the iOS
  // install requirement, and a test that fires a real notification through the
  // service worker — proving the receive half before the server spine exists.
  import { createEventDispatcher } from 'svelte';
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

  const dispatch = createEventDispatcher<{ close: void }>();
  const standalone = isStandalone();
  let testFired = false;

  // refresh on open
  pushPermission.set(currentPermission());

  async function enable() {
    const state = await requestPermission();
    if (state === 'granted') await subscribe();
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
      {/if}
    {/if}

    <p class="note">
      The scheduled server push (so alerts land even when the app is closed)
      connects once the Supabase spine is deployed. The receive path above
      already works.
    </p>
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
    color: #b6b6be;
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
    color: #cfcfd6;
  }
  .state {
    font-size: 13px;
    color: #9a9aa4;
    text-transform: capitalize;
  }
  .state.granted {
    color: #cfd0d8;
  }
  .state.denied {
    color: #9a9aa4;
  }
  .card {
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 13px;
    line-height: 1.5;
    background: #16161c;
    border: 1px solid #2a2a33;
    color: #c4c4cc;
  }
  .card.warn {
    border-color: #3a3a44;
  }
  .key {
    background: #23242c;
    border-radius: 5px;
    padding: 1px 6px;
    font-size: 12px;
    color: #e7e7ea;
    white-space: nowrap;
  }
  .primary {
    background: #16161c;
    border: 1px solid #3a3a44;
    color: #fdfdff;
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
    color: #cfd0d8;
  }
  .note {
    margin: 4px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: #5d5e68;
  }
</style>
