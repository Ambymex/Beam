<script lang="ts">
  import RadialCanvas from './lib/RadialCanvas.svelte';
  import Palette from './lib/Palette.svelte';
  import Gallery from './lib/Gallery.svelte';
  import BlockEditor from './lib/BlockEditor.svelte';
  import CaptureList from './lib/CaptureList.svelte';
  import CycleEditor from './lib/CycleEditor.svelte';
  import AlertsSettings from './lib/AlertsSettings.svelte';
  import Search from './lib/Search.svelte';
  import ChatCompanion from './lib/ChatCompanion.svelte';
  import SymptomEditor from './lib/SymptomEditor.svelte';
  import AppetiteEditor from './lib/AppetiteEditor.svelte';
  import ScratchPad from './lib/ScratchPad.svelte';
  import Diary from './lib/Diary.svelte';
  import ThemeDesigner from './lib/ThemeDesigner.svelte';
  import CommsPanel from './lib/CommsPanel.svelte';
  import { unreadComms } from './lib/comms';
  import { currentKey, todayKey } from './lib/days';
  import { cascadeMode, appointmentMode, symptomActions, appetiteActions } from './lib/daystate';
  import { theme, toggleTheme, envLabel, customThemeStore, starsVisible } from './lib/theme';
  import { startEnvTheme, stopEnvTheme, envThemeState, debugThemeOverride } from './lib/envTheme';
  import { savedThemes } from './lib/savedThemes';
  import { startGlucose, stopGlucose } from './lib/glucose';
  import { startMsgSync, stopMsgSync } from './lib/msgSync';
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';

  onMount(() => {
    startEnvTheme();
    startGlucose();
    // ChatCompanion (a child, mounted before this runs) registers its chat
    // adapter in its own onMount, so the first sync already sees the chat.
    startMsgSync();

    // Notification tap → comms channel. Two arrival paths (see sw.js): a
    // fresh window carries ?comms=1 in the URL; an already-open window gets a
    // notification-click message from the service worker instead.
    if (new URLSearchParams(location.search).get('comms') === '1') {
      showComms = true;
      history.replaceState(null, '', location.pathname);
    }
    const onSwMessage = (e: MessageEvent) => {
      const msg = e.data || {};
      if (msg.type === 'notification-click' && String(msg.url || '').includes('comms=1')) {
        showComms = true;
      }
    };
    const onWindowMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'beam-close-room') {
        showRoom = false;
      }
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    window.addEventListener('message', onWindowMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
      window.removeEventListener('message', onWindowMessage);
    };
  });
  onDestroy(() => {
    stopEnvTheme();
    stopGlucose();
    stopMsgSync();
  });

  function varsMatch(a: Record<string, string> | null | undefined, b: Record<string, string> | null | undefined): boolean {
    if (!a || !b) return false;
    const keysA = Object.keys(a);
    return keysA.length === Object.keys(b).length && keysA.every((k) => a[k] === b[k]);
  }

  $: activeSavedTheme = $customThemeStore
    ? $savedThemes.find((t) => varsMatch(t.cssVars, $customThemeStore))
    : undefined;

  $: headerThemeSelectValue = activeSavedTheme
    ? `saved:${activeSavedTheme.id}`
    : ($debugThemeOverride ?? '');

  function handleDropdownChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    if (!val) {
      customThemeStore.set(null);
      debugThemeOverride.set(null);
    } else if (val.startsWith('saved:')) {
      const id = val.slice(6);
      const found = $savedThemes.find((t) => t.id === id);
      if (found) {
        debugThemeOverride.set('custom');
        customThemeStore.set({ ...found.cssVars });
      }
    } else if (val === 'custom') {
      debugThemeOverride.set('custom');
      const saved = localStorage.getItem('radial-planner-custom-theme');
      if (saved) {
        try {
          customThemeStore.set(JSON.parse(saved));
        } catch {}
      }
    } else {
      customThemeStore.set(null);
      debugThemeOverride.set(val);
    }
  }


  let showGallery = false;
  let showCapture = false;
  let showCycle = false;
  let showAlerts = false;
  let showSearch = false;
  let showCompanion = false;
  let showScratchpad = false;
  let showDiary = false;
  let showDesigner = false;
  let showComms = false;
  let showRoom = false;
  let companionRef: ChatCompanion | null = null;
  $: viewingToday = $currentKey === todayKey();

  // Stars logic lives in theme.ts (starsVisible) so the chat overlay's sky
  // stays in lockstep with this one.

  function onAddSymptom() {
    const now = new Date();
    const timeHours = now.getHours() + now.getMinutes() / 60;
    $symptomActions?.addSymptom(timeHours, 1, 'sneezing');
  }

  function onAddAppetite() {
    const now = new Date();
    const timeHours = now.getHours() + now.getMinutes() / 60;
    $appetiteActions?.addAppetite(timeHours, 'normal');
  }
</script>

<main class:storm-mode={$envThemeState.isStorm}>
  <div class="stars-canopy" class:active={$starsVisible}></div>
  <div class="meteor-canopy" class:active={$envThemeState.isMeteorShower}></div>
  <div class="aurora-canopy" class:active={$envThemeState.isAurora}></div>
  <div class="storm-canopy" class:active={$envThemeState.isStorm}>
    <div class="ripple r1"></div>
    <div class="ripple r2"></div>
    <div class="ripple r3"></div>
    <div class="ripple r4"></div>
    <div class="ripple r5"></div>
  </div>
  <div class="petals-canopy" class:active={$envThemeState.isPetals}>
    {#each Array(12) as _}
      <span class="petal"></span>
    {/each}
  </div>

  <header class="bar glass-panel">
    <button class="chip" on:click={onAddSymptom} aria-label="Log symptom now">Symptom</button>
    <button class="chip" on:click={onAddAppetite} aria-label="Log appetite now">Appetite</button>
    <button class="chip" on:click={() => (showGallery = true)} aria-label="Open day gallery">Days</button>
    <button class="chip" on:click={() => (showCapture = true)} aria-label="Open capture list">List</button>
    <button class="chip" on:click={() => (showCycle = true)} aria-label="Open cycle settings">Cycle</button>
    <button class="chip" on:click={() => (showAlerts = true)} aria-label="Open alerts settings">Alerts</button>
    <button class="chip" on:click={() => (showCompanion = true)} aria-label="Open chat companion">Companion</button>
    <button class="chip" on:click={() => (showRoom = true)} aria-label="Open shared room">Room</button>
    <button class="chip comms" on:click={() => (showComms = true)} aria-label="Open companion comms channel">
      Comms{#if $unreadComms > 0}<span class="badge">{$unreadComms}</span>{/if}
    </button>
    <button class="chip" on:click={() => (showSearch = true)} aria-label="Open plan search">Search</button>
    <button class="chip" on:click={() => (showDiary = true)} aria-label="Open daily diary">Diary</button>
    <button class="chip" on:click={() => (showScratchpad = true)} aria-label="Open scratch pad notes">Notes</button>
    <button class="chip" on:click={() => (showDesigner = true)} aria-label="Open UI Theme Designer">Theme</button>
    <!-- Cascade toggle (§9): off = nudge just this; on = push my day. The "on"
         state is a non-colour cue — a luminous ring, never a hue. -->
    <button
      class="chip push"
      class:on={$cascadeMode}
      on:click={() => cascadeMode.update((v) => !v)}
      aria-pressed={$cascadeMode}
      aria-label="Toggle push-my-day cascade"
    >
      {$cascadeMode ? 'Push my day' : 'Nudge'}
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
      {$appointmentMode ? 'Appointment' : 'Block'}
    </button>
    <select class="chip theme-debug" value={headerThemeSelectValue} on:change={handleDropdownChange}>
      <option value="">Auto Theme</option>
      <option value="custom">Custom Theme</option>
      {#if $savedThemes.length > 0}
        <optgroup label="Saved Themes">
          {#each $savedThemes as st (st.id)}
            <option value={`saved:${st.id}`}>{st.name}</option>
          {/each}
        </optgroup>
      {/if}
      <optgroup label="Environmental Presets">
        <option value="pre_dawn">Pre-Dawn</option>
        <option value="sunrise">Sunrise</option>
        <option value="day">Day</option>
        <option value="sweet">Sweet</option>
        <option value="sunset">Sunset</option>
        <option value="twilight">Twilight</option>
        <option value="night_new">Night (New Moon)</option>
        <option value="night_full">Night (Full Moon)</option>
        <option value="storm">Storm</option>
        <option value="heatwave">Heatwave</option>
        <option value="aurora">Aurora</option>
        <option value="meteor_shower">Meteor Shower</option>
        <option value="lunar_eclipse">Lunar Eclipse</option>
        <option value="solar_eclipse">Solar Eclipse</option>
      </optgroup>
    </select>
    
    {#if !viewingToday}
      <button class="chip back" on:click={() => currentKey.set(todayKey())}>Today</button>
    {/if}
  </header>

  <div class="ring">
    <RadialCanvas />
  </div>

  <BlockEditor />
  <SymptomEditor />
  <AppetiteEditor />

  <div class="tray-wrap glass-panel">
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
<!-- Always mounted, merely hidden when closed: the companion's heartbeat and
     scheduled-alert checker live in its onMount and must survive the overlay
     being dismissed. -->
<ChatCompanion
  bind:this={companionRef}
  visible={showCompanion}
  on:close={() => (showCompanion = false)}
  on:openThemeDesigner={() => { showCompanion = false; showDesigner = true; }}
  on:openRoom={() => { showCompanion = false; showRoom = true; }}
/>
{#if showSearch}
  <Search on:close={() => (showSearch = false)} />
{/if}
{#if showScratchpad}
  <ScratchPad on:close={() => (showScratchpad = false)} />
{/if}
{#if showDiary}
  <Diary on:close={() => (showDiary = false)} />
{/if}
{#if showDesigner}
  <ThemeDesigner on:close={() => (showDesigner = false)} />
{/if}
{#if showComms}
  <CommsPanel on:close={() => (showComms = false)} />
{/if}
{#if showRoom}
  <div class="room-backdrop" role="presentation" on:click={() => (showRoom = false)}>
    <div class="room-sheet glass-card" role="dialog" aria-modal="true" aria-label="The shared room" on:click|stopPropagation on:keydown|stopPropagation tabindex="-1">
      <div class="room-sheet-bar">
        <span class="room-sheet-title">The shared room 🖤</span>
        <div class="room-sheet-actions">
          <button
            type="button"
            class="room-sheet-close"
            on:click={() => { showRoom = false; showCompanion = true; companionRef?.checkRoomDirect('Check the shared room.'); }}
            aria-label="Have Solenoid check the shared room"
          >🗜️ Ask Solenoid</button>
          <button type="button" class="room-sheet-close" on:click={() => (showRoom = false)} aria-label="Close shared room">✕ Close</button>
        </div>
      </div>
      <iframe class="room-frame" src="/room/" title="The shared room"></iframe>
    </div>
  </div>
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
    /* modest default (desktop / in-browser): just clear the edges */
    padding: max(env(safe-area-inset-top), 8px) env(safe-area-inset-right)
      env(safe-area-inset-bottom) env(safe-area-inset-left);
  }
  /* Installed to the Home Screen, content runs under the status bar — reserve a
     real status-bar's worth of top room (≥ 50px) so the clock/battery and an
     AssistiveTouch blob can't sit on top of the chips, while still using the
     larger real inset on notched phones. Scoped to standalone so desktop/Safari
     don't get a dead gap. */
  @media (display-mode: standalone) {
    main {
      padding-top: max(env(safe-area-inset-top), 50px);
    }
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
    background: var(--glass-bg);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--glass-border);
    color: var(--text-2);
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 13px;
    cursor: pointer;
    box-shadow: var(--glass-shadow);
  }
  .chip.back {
    margin-left: auto;
  }
  .chip.comms {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  /* unread count = luminosity cue via --signal, same grammar as .push.on */
  .badge {
    background: var(--signal);
    color: var(--signal-contrast);
    box-shadow: 0 0 6px var(--signal-glow);
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    padding: 3px 6px;
  }
  /* cascade ON = luminous ring (non-colour, §2) */
  .chip.push.on {
    background: var(--signal);
    color: var(--signal-contrast);
    box-shadow: 0 0 8px var(--signal-glow);
    border-color: var(--signal);
  }
  .ring {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    min-width: 0;
    /* breathing room so the ring never sits flush to the screen edge (where it
       looked clipped on the right) */
    padding: 0 10px;
  }
  .tray-wrap {
    position: relative;
    z-index: 3;
    flex: 0 0 auto;
    min-width: 0;
    padding: 6px 10px 4px;
    border-top: 1px solid var(--hairline);
    /* background: var(--surface); removed for glass */
  }
  .room-backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    background: rgba(6, 7, 10, 0.72);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: max(env(safe-area-inset-top), 12px) max(env(safe-area-inset-right), 12px)
      max(env(safe-area-inset-bottom), 12px) max(env(safe-area-inset-left), 12px);
  }
  .room-sheet {
    width: min(820px, 100%);
    height: min(860px, 100%);
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    overflow: hidden;
    background: #161719;
    border: 1px solid var(--glass-border);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
  }
  .room-sheet-bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #1e2024;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .room-sheet-title {
    font-size: 14px;
    font-weight: 600;
    color: #eee;
  }
  .room-sheet-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .room-sheet-close {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: #fff;
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .room-sheet-close:hover {
    background: rgba(255, 255, 255, 0.16);
  }
  .room-frame {
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    border: 0;
    background: #161719;
  }
</style>
