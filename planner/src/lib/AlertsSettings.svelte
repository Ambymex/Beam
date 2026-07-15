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

  import { syncConfigured, syncToServer, lastSyncError } from './sync';
  import { gcalSyncActive, connectGCal, disconnectGCal } from './gcal';
  import { exportBackup, importBackup } from './backup';
  import { getBeamConfig, saveBeamConfig, testBeam, formatGlucose, TREND_ARROWS } from './glucose';
  import {
    weatherCity,
    lastWeatherCheck,
    setWeatherCity,
    clearWeatherCity,
    searchCities,
    type CityResult,
  } from './envTheme';

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

  // ----- Beam CGM bridge config -----
  const beamCfg = getBeamConfig();
  let beamUrl = beamCfg.url;
  let beamToken = beamCfg.token;
  let beamUnit: 'mmol' | 'mgdl' = beamCfg.unit;
  let beamLow = beamCfg.lowMmol;
  let beamHigh = beamCfg.highMmol;
  let beamStatus = '';

  function saveBeam() {
    saveBeamConfig({
      url: beamUrl,
      token: beamToken,
      unit: beamUnit,
      lowMmol: beamLow,
      highMmol: beamHigh,
    });
    beamStatus = beamUrl && beamToken ? 'Saved ✓ — polling started' : 'Saved (disabled: url/token empty)';
  }

  async function handleTestBeam() {
    beamStatus = 'Testing…';
    saveBeamConfig({ url: beamUrl, token: beamToken, unit: beamUnit, lowMmol: beamLow, highMmol: beamHigh });
    try {
      const r = await testBeam();
      const unitLabel = beamUnit === 'mmol' ? 'mmol/L' : 'mg/dL';
      beamStatus = `Connected ✓ — ${formatGlucose(r.mgdl, beamUnit)} ${unitLabel} ${TREND_ARROWS[r.trend] ?? ''} (${r.minutesOld} min ago)`;
    } catch (e: any) {
      beamStatus = `Connection failed: ${e?.message ?? e}`;
    }
  }

  // ----- Sky & Weather (storm/heatwave themes need a location) -----
  let cityQuery = '';
  let cityResults: CityResult[] = [];
  let citySearching = false;
  let cityStatus = '';

  async function handleCitySearch() {
    const q = cityQuery.trim();
    if (!q) return;
    citySearching = true;
    cityStatus = '';
    cityResults = [];
    try {
      cityResults = await searchCities(q);
      if (!cityResults.length) cityStatus = 'No matches — try the nearest bigger town.';
    } catch {
      cityStatus = 'Search failed — check the connection and try again.';
    } finally {
      citySearching = false;
    }
  }

  function pickCity(r: CityResult) {
    setWeatherCity(r.lat, r.lon, r.label);
    cityResults = [];
    cityQuery = '';
    cityStatus = `Watching the sky over ${r.name} ✓`;
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      cityStatus = 'Location is not available in this browser.';
      return;
    }
    cityStatus = 'Asking for your location…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setWeatherCity(pos.coords.latitude, pos.coords.longitude, 'My location');
        cityResults = [];
        cityStatus = 'Watching the sky over your location ✓';
      },
      () => {
        cityStatus = 'Location denied — search for your city instead.';
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  }

  let textareaEl: HTMLTextAreaElement;
  let exportStatus = '';
  let exportedCode = '';
  let importCode = '';
  let importStatus = '';
  let importError = '';

  async function handleExport() {
    exportStatus = 'Generating...';
    exportedCode = '';
    try {
      const code = await exportBackup();
      exportedCode = code;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(code);
          exportStatus = 'Copied to clipboard! ✓';
        } else {
          exportStatus = 'Copy code manually below.';
        }
      } catch (clipErr) {
        exportStatus = 'Copy code manually below.';
      }
    } catch (err) {
      exportStatus = 'Export failed';
      exportedCode = '';
    }
  }

  async function handleImport() {
    importStatus = 'Restoring...';
    importError = '';
    try {
      const el = document.getElementById('import-textarea') as HTMLTextAreaElement;
      const code = (el ? el.value : '') || importCode;
      if (!code.trim()) {
        throw new Error('Please paste your backup code first.');
      }
      const ok = await importBackup(code);
      if (ok) {
        importStatus = 'Restored successfully! Reloading...';
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (err: any) {
      importStatus = '';
      importError = err.message || 'Restoration failed. Verify code.';
    }
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
      {#if typeof window !== 'undefined' && !window.isSecureContext}
        <div class="card warn">
          <strong>HTTPS Connection Required:</strong><br>
          Browsers block notifications on plain HTTP connections. To enable alerts on your device, please connect via the secure **Ngrok HTTPS link**.
        </div>
      {:else}
        <div class="card warn">This browser doesn't support notifications.</div>
      {/if}
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
          {#if $lastSyncError}
            <div class="error-msg">{$lastSyncError}</div>
          {/if}
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

    <!-- Google Calendar Sync section -->
    <hr class="divider" />
    
    <div class="gcal-section">
      <h3>Google Calendar Sync</h3>
      <p class="desc">
        Sync imported events onto your rings as hard-edged blocks. Local color choices are preserved.
      </p>

      <div class="row">
        <span class="lbl">GCal Sync Status</span>
        <span class="state" class:active={$gcalSyncActive}>
          {$gcalSyncActive ? 'Connected & Synced ✓' : 'Disconnected'}
        </span>
      </div>

      {#if !$gcalSyncActive}
        <button class="primary gcal-btn" on:click={connectGCal}>
          Connect Google Calendar
        </button>
      {:else}
        <button class="secondary gcal-btn" on:click={disconnectGCal}>
          Disconnect Google Calendar
        </button>
      {/if}
    </div>

    <!-- Beam CGM section -->
    <hr class="divider" />

    <div class="gcal-section">
      <h3>Glucose (Beam CGM)</h3>
      <p class="desc">
        Live blood glucose from your Libre sensor via the Beam bridge. Readings
        accumulate locally to paint the day's curve behind the ring.
      </p>

      <label class="desc" for="beam-url" style="display:block; margin-bottom:2px;">Beam URL</label>
      <input
        id="beam-url"
        type="url"
        bind:value={beamUrl}
        placeholder="https://beam-glucose.fly.dev"
        style="width:100%; box-sizing:border-box; background: var(--surface-2); color: var(--text); border: 1px solid var(--border-2); border-radius: 6px; padding: 8px; font-size: 13px; margin-bottom: 8px;"
      />
      <label class="desc" for="beam-token" style="display:block; margin-bottom:2px;">API token</label>
      <input
        id="beam-token"
        type="password"
        bind:value={beamToken}
        placeholder="the API_TOKEN Fly secret"
        style="width:100%; box-sizing:border-box; background: var(--surface-2); color: var(--text); border: 1px solid var(--border-2); border-radius: 6px; padding: 8px; font-size: 13px; margin-bottom: 8px;"
      />

      <div class="row">
        <span class="lbl">Units</span>
        <span>
          <label style="margin-right:10px; font-size:13px;"><input type="radio" bind:group={beamUnit} value="mmol" /> mmol/L</label>
          <label style="font-size:13px;"><input type="radio" bind:group={beamUnit} value="mgdl" /> mg/dL</label>
        </span>
      </div>
      <div class="row">
        <span class="lbl">Target range (mmol/L)</span>
        <span>
          <input type="number" step="0.1" min="2" max="8" bind:value={beamLow} style="width:52px; background: var(--surface-2); color: var(--text); border: 1px solid var(--border-2); border-radius: 6px; padding: 4px 6px;" aria-label="Low threshold" />
          –
          <input type="number" step="0.1" min="6" max="20" bind:value={beamHigh} style="width:52px; background: var(--surface-2); color: var(--text); border: 1px solid var(--border-2); border-radius: 6px; padding: 4px 6px;" aria-label="High threshold" />
        </span>
      </div>

      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="primary" style="flex:1;" on:click={saveBeam}>Save</button>
        <button class="secondary" style="flex:1;" on:click={handleTestBeam}>Test connection</button>
      </div>
      {#if beamStatus}
        <p class="ok" style="word-break: break-word;">{beamStatus}</p>
      {/if}
    </div>

    <!-- Sky & Weather section -->
    <hr class="divider" />

    <div class="gcal-section">
      <h3>Sky &amp; Weather</h3>
      <p class="desc">
        The storm and heatwave themes follow the real sky at your location —
        set a city (or use your location) and the ring weathers with you.
        Checked every 15 minutes while the app is open.
      </p>

      <div class="row">
        <span class="lbl">Watching</span>
        <span class="state" class:active={!!$weatherCity}>
          {$weatherCity ? $weatherCity.name : 'not set — storm theme can’t trigger'}
        </span>
      </div>
      {#if $weatherCity && $lastWeatherCheck}
        <div class="row sub">
          <span class="lbl">Sky right now</span>
          <span class="state">{$lastWeatherCheck}</span>
        </div>
      {/if}

      <div style="display:flex; gap:8px; margin-top:8px;">
        <input
          type="text"
          bind:value={cityQuery}
          placeholder="Search city…"
          aria-label="Search for a city"
          on:keydown={(e) => e.key === 'Enter' && handleCitySearch()}
          style="flex:1; min-width:0; background: var(--surface-2); color: var(--text); border: 1px solid var(--border-2); border-radius: 6px; padding: 8px; font-size: 13px;"
        />
        <button class="secondary" on:click={handleCitySearch} disabled={citySearching || !cityQuery.trim()}>
          {citySearching ? 'Searching…' : 'Search'}
        </button>
      </div>

      {#if cityResults.length}
        <div class="card" style="margin-top:8px; display:flex; flex-direction:column; gap:4px;">
          {#each cityResults as r}
            <button class="secondary" style="text-align:left;" on:click={() => pickCity(r)}>{r.label}</button>
          {/each}
        </div>
      {/if}

      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="primary" style="flex:1;" on:click={useMyLocation}>Use my location</button>
        {#if $weatherCity}
          <button class="secondary" style="flex:1;" on:click={() => { clearWeatherCity(); cityStatus = 'Sky watching off.'; }}>Clear</button>
        {/if}
      </div>
      {#if cityStatus}
        <p class="ok" style="word-break: break-word;">{cityStatus}</p>
      {/if}
    </div>

    <!-- Backup & Migration section -->
    <hr class="divider" />
    
    <div class="gcal-section">
      <h3>Backup & Migration</h3>
      <p class="desc">
        Export all calendar tasks, symptom logs, scratch pad notes, settings, and chat history into a single backup code.
      </p>
      
      <button class="primary" on:click={handleExport}>
        {exportStatus || 'Export Backup'}
      </button>

      {#if exportedCode}
        <div class="card" style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px;">
          <p class="desc" style="margin: 0; color: var(--signal); font-weight: 500;">
            Clipboard auto-copy blocked by browser security. Tap "Select All Text" below, copy, then save it somewhere:
          </p>
          <textarea
            bind:this={textareaEl}
            style="width: 100%; height: 160px; font-size: 10px; font-family: monospace; background: var(--surface-3); color: var(--text); border: 1px solid var(--border-2); border-radius: 6px; padding: 6px; box-sizing: border-box; overflow-y: auto; -webkit-overflow-scrolling: touch;"
            readonly
            on:focus={(e) => e.currentTarget.select()}
            value={exportedCode}
          ></textarea>
          <button 
            class="secondary" 
            style="padding: 8px; font-size: 12px; font-weight: 600;" 
            on:click={() => {
              if (textareaEl) {
                textareaEl.focus();
                textareaEl.setSelectionRange(0, exportedCode.length);
              }
            }}
          >
            Select All Text for Copying
          </button>
        </div>
      {/if}

      <div class="import-wrap">
        <textarea
          id="import-textarea"
          bind:value={importCode}
          placeholder="Paste your backup code here to restore..."
          aria-label="Backup code input"
        ></textarea>
        <button class="secondary" on:click={handleImport}>
          Import & Restore Backup
        </button>
        {#if importStatus}
          <p class="ok">{importStatus}</p>
        {/if}
        {#if importError}
          <p class="error-msg">{importError}</p>
        {/if}
      </div>
    </div>
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
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
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
  .error-msg {
    font-size: 11px;
    color: #e00000;
    line-height: 1.4;
    word-break: break-all;
    background: var(--surface-2);
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid var(--border-2);
    margin-top: 4px;
  }
  .divider {
    border: none;
    border-top: 1px solid var(--hairline);
    margin: 8px 0;
  }
  .gcal-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .gcal-section h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }
  .gcal-section .desc {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-dim);
  }
  .gcal-section .state.active {
    color: var(--signal);
    font-weight: 500;
  }
  .gcal-btn {
    width: 100%;
    margin-top: 4px;
  }
  .secondary {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-dim);
    border-radius: 10px;
    padding: 11px 14px;
    font-size: 14px;
    cursor: pointer;
  }
  .secondary:active {
    color: var(--text);
    border-color: var(--text-faint);
  }
  .import-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 6px;
  }
  .import-wrap textarea {
    width: 100%;
    height: 60px;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: 8px;
    color: var(--text);
    padding: 8px;
    font-size: 11px;
    font-family: monospace;
    resize: none;
    outline: none;
  }
  .import-wrap textarea:focus {
    border-color: var(--text-faint);
  }
</style>
