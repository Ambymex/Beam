<script lang="ts">
  // The stage: the planner's real ambient gradient + the theme's ambient
  // canopy (stars/petals/aurora/storm) from the imported app.css, with the
  // react particles composited on top exactly as they will be in the chat.
  // This component is the REFERENCE the exported code reproduces.
  import { onMount, onDestroy } from 'svelte';
  import { THEME_ORDER, THEME_LABELS, currentTheme, canopyFor } from './theme';
  import { SHAPES } from './shapes';
  import { spawnParticles, type ReactConfig, type Particle } from './reactConfig';

  export let config: ReactConfig;

  let particles: Particle[] = [];
  let stageEl: HTMLDivElement;
  let clearTimer: ReturnType<typeof setTimeout>;
  let loopTimer: ReturnType<typeof setTimeout>;
  let looping = true;

  $: canopy = canopyFor($currentTheme);
  $: shapeDef = config.shape === 'custom'
    ? { render: 'path' as const, viewBox: '0 0 24 24', d: config.customPath || SHAPES.heart.d }
    : SHAPES[config.shape];

  // Longest a burst can live, for the DOM cleanup + loop cadence.
  $: lifeMs = (config.spawnWindow + config.durMax) * 1000 + 400;

  function fire() {
    particles = spawnParticles(config);
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => (particles = []), lifeMs);
  }

  function scheduleLoop() {
    clearTimeout(loopTimer);
    if (!looping) return;
    loopTimer = setTimeout(() => {
      fire();
      scheduleLoop();
    }, lifeMs + 500);
  }

  // Re-fire when the config meaningfully changes (debounced) so tweaks show live.
  let debounce: ReturnType<typeof setTimeout>;
  $: config, (() => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { fire(); scheduleLoop(); }, 120);
  })();

  function toggleLoop() {
    looping = !looping;
    if (looping) scheduleLoop();
    else clearTimeout(loopTimer);
  }

  onMount(() => { fire(); scheduleLoop(); });
  onDestroy(() => { clearTimeout(clearTimer); clearTimeout(loopTimer); clearTimeout(debounce); });

  // per-particle travel endpoint, by direction (matches generate.ts)
  function tx(p: Particle): string {
    if (config.direction === 'burst') return `${(Math.cos((p.angle * Math.PI) / 180) * p.distance).toFixed(1)}vmin`;
    return `${p.driftX.toFixed(1)}vw`;
  }
  function ty(p: Particle): string {
    if (config.direction === 'fall') return '112vh';
    if (config.direction === 'rise') return '-72vh';
    return `${(Math.sin((p.angle * Math.PI) / 180) * p.distance * 0.7 + 8).toFixed(1)}vmin`;
  }
  const s0 = () => (config.direction === 'burst' ? 0.3 : 1);
  $: travelEase = config.direction === 'burst' ? 'cubic-bezier(0.2, 0.7, 0.3, 1)' : 'linear';
  // Fixed glow only; the adaptive rim is applied by theme-keyed global CSS.
  function glow(p: Particle): string {
    if (config.glowMode !== 'fixed' || !config.glowBlur) return 'none';
    const c = config.glowColor === 'auto' ? p.color : config.glowColor;
    return `drop-shadow(0 0 ${config.glowBlur}px ${c})`;
  }
</script>

<div class="preview">
  <div class="toolbar">
    <label class="tsel">
      Theme
      <select bind:value={$currentTheme}>
        {#each THEME_ORDER as key}
          <option value={key}>{THEME_LABELS[key]}</option>
        {/each}
      </select>
    </label>
    <div class="tools">
      <button class="tbtn" on:click={fire} title="Replay the react">▶ Fire</button>
      <button class="tbtn" class:on={looping} on:click={toggleLoop} title="Auto-replay on a loop">
        {looping ? '↻ Looping' : '↻ Loop off'}
      </button>
    </div>
  </div>

  <div class="stage" bind:this={stageEl}>
    <!-- the same ambient canopies the app shows for this theme -->
    {#if canopy.stars}<div class="stars-canopy active"></div>{/if}
    {#if canopy.meteor}<div class="meteor-canopy active"></div>{/if}
    {#if canopy.aurora}<div class="aurora-canopy active"></div>{/if}
    {#if canopy.storm}
      <div class="storm-canopy active">
        <div class="ripple r1"></div><div class="ripple r2"></div><div class="ripple r3"></div>
        <div class="ripple r4"></div><div class="ripple r5"></div>
      </div>
    {/if}
    {#if canopy.petals}
      <div class="petals-canopy active">
        {#each Array(12) as _}<span class="petal"></span>{/each}
      </div>
    {/if}

    <!-- a soft glass card so particles read against real chrome, like the chat -->
    <div class="ghost-card glass-card">
      <span>{config.label || 'Untitled react'}</span>
    </div>

    <!-- the react layer -->
    <div class="react-layer {config.direction}">
      {#each particles as p (p.id)}
        <span
          class="p"
          style="
            --size:{p.size}px; --dur:{p.dur}s; --delay:{p.delay}s; --op:{p.op};
            --tx:{tx(p)}; --ty:{ty(p)}; --s0:{s0()}; --ease:{travelEase};
            --sway:{p.swayAmp}px; --swaydur:{p.swayDur}s; --swayphase:{p.swayPhase}s;
            --rot:{p.rotEnd}deg; {config.direction !== 'burst' ? `left:${p.x}%;` : ''}
          "
        >
          <span class="p-sway">
            <span
              class="p-shape"
              class:adaptive={config.glowMode === 'adaptive'}
              style="{config.glowMode === 'fixed' ? `filter:${glow(p)};` : ''} --rim:{config.glowBlur}px;"
            >
              {#if shapeDef.render === 'path'}
                <svg viewBox={shapeDef.viewBox} width={p.size} height={p.size} style="display:block;">
                  <path fill={p.color} d={shapeDef.d} />
                </svg>
              {:else}
                <span
                  class="css-shape"
                  style="width:{p.size}px; height:{p.size}px; background:{p.color}; border-radius:{shapeDef.radius};"
                ></span>
              {/if}
            </span>
          </span>
        </span>
      {/each}
    </div>
  </div>
</div>

<style>
  .preview {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .tsel {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .tsel select {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 13px;
  }
  .tools { display: flex; gap: 8px; }
  .tbtn {
    background: var(--surface-2);
    color: var(--text-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .tbtn.on {
    background: var(--signal);
    color: var(--signal-contrast);
    border-color: var(--signal);
    box-shadow: 0 0 8px var(--signal-glow);
  }
  .stage {
    position: relative;
    flex: 1 1 auto;
    min-height: 420px;
    border-radius: 16px;
    overflow: hidden;
    background: var(--ambient-gradient, var(--app-bg));
    border: 1px solid var(--border);
  }
  .ghost-card {
    position: absolute;
    top: 18px;
    left: 18px;
    right: 18px;
    padding: 14px 16px;
    border-radius: 14px;
    color: var(--text-2);
    font-size: 13px;
    z-index: 5;
  }
  .react-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 60;
  }
  .p {
    position: absolute;
    width: var(--size);
    height: var(--size);
    margin-left: calc(var(--size) / -2);
    animation:
      s-travel var(--dur) var(--ease, linear) var(--delay) both,
      s-fade var(--dur) linear var(--delay) both;
  }
  .react-layer.fall .p { top: calc(-1 * var(--size) - 10px); }
  .react-layer.rise .p { bottom: calc(-1 * var(--size) - 10px); }
  .react-layer.burst .p { top: 50%; left: 50%; margin-top: calc(var(--size) / -2); }
  @keyframes s-travel {
    from { transform: translate(0, 0) scale(var(--s0)); }
    to { transform: translate(var(--tx), var(--ty)) scale(1); }
  }
  @keyframes s-fade {
    0% { opacity: 0; }
    8% { opacity: var(--op); }
    72% { opacity: var(--op); }
    100% { opacity: 0; }
  }
  .p-sway {
    display: block;
    animation: s-sway var(--swaydur) ease-in-out calc(-1 * var(--swayphase)) infinite alternate;
  }
  @keyframes s-sway {
    from { transform: translateX(calc(-1 * var(--sway))); }
    to { transform: translateX(var(--sway)); }
  }
  .p-shape {
    display: block;
    animation: s-spin var(--dur) linear var(--delay) both;
  }
  /* adaptive readability rim: light on dark skies, soft dark on light — the
     data-theme selector is global (set on <html>), the shape class stays scoped */
  :global([data-theme='dark']) .p-shape.adaptive {
    filter: drop-shadow(0 0 1px rgba(255, 255, 255, 0.6)) drop-shadow(0 0 var(--rim, 6px) rgba(255, 255, 255, 0.35));
  }
  :global([data-theme='light']) .p-shape.adaptive {
    filter: drop-shadow(0 0 var(--rim, 6px) rgba(40, 30, 30, 0.32));
  }
  @keyframes s-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(var(--rot)); }
  }
  .css-shape { display: block; }
</style>
