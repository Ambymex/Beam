<script lang="ts">
  import RadialCanvas from './lib/RadialCanvas.svelte';
  import Palette from './lib/Palette.svelte';
  import Gallery from './lib/Gallery.svelte';
  import BlockEditor from './lib/BlockEditor.svelte';
  import CaptureList from './lib/CaptureList.svelte';
  import CycleEditor from './lib/CycleEditor.svelte';
  import AlertsSettings from './lib/AlertsSettings.svelte';
  import { currentKey, todayKey } from './lib/days';
  import { cascadeMode, appointmentMode } from './lib/daystate';
  import { theme, toggleTheme } from './lib/theme';

  let showGallery = false;
  let showCapture = false;
  let showCycle = false;
  let showAlerts = false;
  $: viewingToday = $currentKey === todayKey();
</script>

<main>
  <header class="bar">
    <button class="chip" on:click={() => (showGallery = true)} aria-label="Open day gallery">▦ Days</button>
    <button class="chip" on:click={() => (showCapture = true)} aria-label="Open capture list">✎ List</button>
    <button class="chip" on:click={() => (showCycle = true)} aria-label="Open cycle settings">◍ Cycle</button>
    <button class="chip" on:click={() => (showAlerts = true)} aria-label="Open alerts settings">🔔 Alerts</button>
    <!-- Cascade toggle (§9): off = nudge just this; on = push my day. The "on"
         state is a non-colour cue — a luminous ring, never a hue. -->
    <button
      class="chip push"
      class:on={$cascadeMode}
      on:click={() => cascadeMode.update((v) => !v)}
      aria-pressed={$cascadeMode}
      aria-label="Toggle push-my-day cascade"
    >
      {$cascadeMode ? '⇉ Push my day' : '→ Nudge'}
    </button>
    <!-- Appointment-draw toggle (§8): when on, a sweep makes a hard-edged
         appointment with travel-time wings instead of a soft block. -->
    <button
      class="chip push"
      class:on={$appointmentMode}
      on:click={() => appointmentMode.update((v) => !v)}
      aria-pressed={$appointmentMode}
      aria-label="Toggle appointment draw mode"
    >
      {$appointmentMode ? '📍 Appointment' : '◷ Block'}
    </button>
    <button
      class="chip theme"
      on:click={toggleTheme}
      aria-label="Toggle light or dark theme"
    >
      {$theme === 'light' ? '☾ Dark' : '☀ Light'}
    </button>
    {#if !viewingToday}
      <button class="chip back" on:click={() => currentKey.set(todayKey())}>Today →</button>
    {/if}
  </header>

  <div class="ring">
    <RadialCanvas />
  </div>

  <BlockEditor />

  <div class="tray-wrap">
    <Palette />
  </div>
</main>

{#if showGallery}
  <Gallery on:close={() => (showGallery = false)} />
{/if}
{#if showCapture}
  <CaptureList on:close={() => (showCapture = false)} />
{/if}
{#if showCycle}
  <CycleEditor on:close={() => (showCycle = false)} />
{/if}
{#if showAlerts}
  <AlertsSettings on:close={() => (showAlerts = false)} />
{/if}

<style>
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    /* min-width:0 stops the wide palette grid from ballooning the column past
       the viewport (flexbox min-width:auto trap). */
    min-width: 0;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
    /* clear the notch/status bar — at least 8px even where the inset reads 0
       (e.g. desktop / mis-reported), more on notched phones */
    padding: max(env(safe-area-inset-top), 8px) env(safe-area-inset-right)
      env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
  .bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    /* extra top room so the chips clear the status bar / notch on mobile,
       stacking with main's safe-area-inset-top */
    padding: 12px 12px 4px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    /* this row owns horizontal panning; the page itself can't slide */
    touch-action: pan-x;
    overscroll-behavior-x: contain;
  }
  .bar::-webkit-scrollbar {
    display: none;
  }
  .chip {
    flex: 0 0 auto;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 13px;
    cursor: pointer;
  }
  .chip.back {
    margin-left: auto;
  }
  /* cascade ON = luminous ring (non-colour, §2) */
  .chip.push.on {
    box-shadow: 0 0 0 1px var(--signal) inset;
    color: var(--signal);
  }
  .ring {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }
  .tray-wrap {
    flex: 0 0 auto;
    min-width: 0;
    padding: 6px 10px 4px;
    border-top: 1px solid var(--hairline);
    background: var(--surface);
  }
</style>
