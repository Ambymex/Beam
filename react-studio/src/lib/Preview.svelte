<script lang="ts">
  // The stage: the planner's real ambient gradient + the theme's ambient
  // canopy (stars/petals/aurora/storm) from the imported app.css, with the
  // react particles composited on top exactly as they will be in the chat.
  // This component is the REFERENCE the exported code reproduces.
  import { onMount, onDestroy } from 'svelte';
  import { THEME_ORDER, THEME_LABELS, currentTheme, canopyFor } from './theme';
  import { SHAPES } from './shapes';
  import { spawnAll, lifeMs, EASES, type ReactConfig, type LayerConfig, type Particle } from './reactConfig';

  export let config: ReactConfig;

  let particleSets: Particle[][] = [];
  let stageEl: HTMLDivElement;
  let layerHost: HTMLDivElement;
  let clearTimer: ReturnType<typeof setTimeout>;
  let loopTimer: ReturnType<typeof setTimeout>;
  let looping = true;
  let slowMo = false; // ¼-speed study mode
  let scrubbing = false;
  let scrubT = 0; // ms into the react while scrubbing
  let fps = 0;
  let domNodes = 0;

  $: canopy = canopyFor($currentTheme);
  $: life = lifeMs(config);
  $: rate = slowMo ? 0.25 : 1;

  function shapeDefFor(layer: LayerConfig) {
    return layer.shape === 'custom'
      ? { render: 'path' as const, viewBox: '0 0 24 24', d: layer.customPath || SHAPES.heart.d }
      : SHAPES[layer.shape];
  }

  // every animation the react owns (canopies are outside layerHost on purpose)
  function anims(): Animation[] {
    return layerHost ? (layerHost.getAnimations({ subtree: true }) as Animation[]) : [];
  }
  function applyRate() {
    for (const a of anims()) a.playbackRate = rate;
  }

  function fire() {
    scrubbing = false;
    particleSets = spawnAll(config);
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => (particleSets = []), life / rate);
    // playbackRate is set after the DOM exists; also count what we mounted
    requestAnimationFrame(() => {
      applyRate();
      domNodes = layerHost ? layerHost.querySelectorAll('*').length : 0;
    });
  }

  function scheduleLoop() {
    clearTimeout(loopTimer);
    if (!looping || scrubbing) return;
    loopTimer = setTimeout(() => {
      fire();
      scheduleLoop();
    }, life / rate + 500);
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

  function toggleSlowMo() {
    slowMo = !slowMo;
    rate = slowMo ? 0.25 : 1;
    if (!scrubbing) {
      applyRate();
      // stretch/shrink the cleanup + loop cadence to match
      fire();
      scheduleLoop();
    }
  }

  // ---- scrubbing: freeze the whole react and walk its timeline by hand ----
  function enterScrub() {
    if (scrubbing) return;
    scrubbing = true;
    clearTimeout(loopTimer);
    clearTimeout(clearTimer);
    if (!particleSets.some((s) => s.length)) {
      particleSets = spawnAll(config);
    }
    requestAnimationFrame(() => {
      for (const a of anims()) a.pause();
      seek(scrubT);
    });
  }
  function seek(t: number) {
    scrubT = t;
    for (const a of anims()) a.currentTime = t;
  }
  function onScrubInput(e: Event) {
    const t = Number((e.currentTarget as HTMLInputElement).value);
    if (!scrubbing) enterScrub();
    seek(t);
  }
  function resume() {
    scrubbing = false;
    fire();
    scheduleLoop();
  }

  // rolling FPS, sampled while the tab renders — the honest number behind
  // "pure CSS kinetics stay smooth": watch it hold 60 even at high counts
  let rafId = 0;
  let frames: number[] = [];
  function fpsLoop(now: number) {
    frames.push(now);
    while (frames.length && frames[0] < now - 1000) frames.shift();
    fps = frames.length;
    rafId = requestAnimationFrame(fpsLoop);
  }

  onMount(() => {
    fire();
    scheduleLoop();
    rafId = requestAnimationFrame(fpsLoop);
  });
  onDestroy(() => {
    clearTimeout(clearTimer);
    clearTimeout(loopTimer);
    clearTimeout(debounce);
    cancelAnimationFrame(rafId);
  });

  // per-particle travel endpoint, by direction (matches generate.ts)
  function tx(layer: LayerConfig, p: Particle): string {
    if (layer.direction === 'burst') return `${(Math.cos((p.angle * Math.PI) / 180) * p.distance).toFixed(1)}vmin`;
    return `${p.driftX.toFixed(1)}vw`;
  }
  function ty(layer: LayerConfig, p: Particle): string {
    if (layer.direction === 'fall') return '112vh';
    if (layer.direction === 'rise') return '-72vh';
    if (layer.direction === 'fountain') return '0vh'; // Y lives on the arc wrapper
    return `${(Math.sin((p.angle * Math.PI) / 180) * p.distance * 0.7 + 8).toFixed(1)}vmin`;
  }
  // Fixed glow only; the adaptive rim is applied by theme-keyed global CSS.
  function glow(layer: LayerConfig, p: Particle): string {
    if (layer.glowMode !== 'fixed' || !layer.glowBlur) return 'none';
    const c = layer.glowColor === 'auto' ? p.color : layer.glowColor;
    return `drop-shadow(0 0 ${layer.glowBlur}px ${c})`;
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
      <button class="tbtn" class:on={slowMo} on:click={toggleSlowMo} title="Quarter-speed study mode">¼×</button>
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

    <!-- the react layers, stacked in config order -->
    <div class="layer-host" bind:this={layerHost}>
      {#each config.layers as layer, li}
        {@const sd = shapeDefFor(layer)}
        <div class="react-layer {layer.direction}">
          {#each particleSets[li] ?? [] as p (p.id)}
            <span
              class="p"
              style="
                --size:{p.size}px; --dur:{p.dur}s; --delay:{p.delay}s; --op:{p.op};
                --indur:{p.inDur.toFixed(3)}s; --outdelay:{p.outDelay.toFixed(3)}s; --outdur:{p.outDur.toFixed(3)}s;
                --tx:{tx(layer, p)}; --ty:{ty(layer, p)}; --s0:{layer.scaleFrom}; --s1:{layer.scaleTo};
                --ease:{EASES[layer.travelEase].css};
                --sway:{p.swayAmp}px; --swaydur:{p.swayDur}s; --swayphase:{p.swayPhase}s;
                --rot:{p.rotEnd}deg; --apex:{p.apex.toFixed(1)}vh; {layer.direction !== 'burst' ? `left:${p.x}%;` : ''}
              "
            >
              <span class="p-arc">
                <span class="p-sway">
                  <span
                    class="p-shape"
                    class:adaptive={layer.glowMode === 'adaptive'}
                    style="{layer.glowMode === 'fixed' ? `filter:${glow(layer, p)};` : ''} --rim:{layer.glowBlur}px;"
                  >
                    {#if sd.render === 'path'}
                      <svg viewBox={sd.viewBox} width={p.size} height={p.size} style="display:block;">
                        <path fill={p.color} d={sd.d} />
                      </svg>
                    {:else}
                      <span
                        class="css-shape"
                        style="width:{p.size}px; height:{p.size}px; background:{p.color}; border-radius:{sd.radius};"
                      ></span>
                    {/if}
                  </span>
                </span>
              </span>
            </span>
          {/each}
        </div>
      {/each}
    </div>
  </div>

  <div class="underbar">
    <div class="scrub">
      {#if scrubbing}
        <button class="tbtn small" on:click={resume} title="Resume live playback">▶</button>
      {:else}
        <button class="tbtn small" on:click={enterScrub} title="Freeze and scrub the timeline">⏸</button>
      {/if}
      <input
        class="scrub-slider"
        type="range"
        min="0"
        max={life}
        step="16"
        value={scrubbing ? scrubT : 0}
        on:input={onScrubInput}
        title="Drag to walk the react frame by frame"
      />
      <span class="scrub-t">{scrubbing ? (scrubT / 1000).toFixed(2) + 's' : (life / 1000).toFixed(1) + 's total'}</span>
    </div>
    <div class="meter" title="Everything animates transform/opacity only, so the compositor does the work — watch fps hold as you raise the count.">
      <span>{domNodes} nodes</span>
      <span class:good={fps >= 55} class:rough={fps < 45}>{scrubbing ? '—' : fps} fps</span>
      <span class="law">transform/opacity only ✓</span>
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
  .tbtn.small { padding: 4px 10px; }
  .underbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  .scrub {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 260px;
    min-width: 0;
  }
  .scrub-slider {
    flex: 1 1 auto;
    min-width: 0;
    accent-color: var(--signal);
  }
  .scrub-t {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
    min-width: 64px;
    text-align: right;
  }
  .meter {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 11px;
    color: var(--text-faint);
    font-variant-numeric: tabular-nums;
  }
  .meter .good { color: #7dbb8a; }
  .meter .rough { color: #d96a6a; }
  .meter .law { color: var(--text-faint); }
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
  .layer-host,
  .react-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 60;
  }

  /* ---- particle skeleton: .p travels + fades, .p-arc is the fountain's Y
     axis, .p-sway flutters, .p-shape spins. All transform/opacity only. ---- */
  .p {
    position: absolute;
    width: var(--size);
    height: var(--size);
    margin-left: calc(var(--size) / -2);
    animation:
      s-travel var(--dur) var(--ease, linear) var(--delay) both,
      s-in var(--indur) linear var(--delay) both,
      s-out var(--outdur) linear var(--outdelay) forwards;
  }
  .react-layer.fall .p { top: calc(-1 * var(--size) - 10px); }
  .react-layer.rise .p { bottom: calc(-1 * var(--size) - 10px); }
  .react-layer.fountain .p { bottom: calc(-1 * var(--size) - 10px); }
  .react-layer.burst .p { top: 50%; left: 50%; margin-top: calc(var(--size) / -2); }
  @keyframes s-travel {
    from { transform: translate(0, 0) scale(var(--s0, 1)); }
    to { transform: translate(var(--tx), var(--ty)) scale(var(--s1, 1)); }
  }
  /* fade envelope: rise to --op over --indur, hold, fall over --outdur.
     s-out deliberately has NO backwards fill — s-in owns the early frames. */
  @keyframes s-in {
    from { opacity: 0; }
    to { opacity: var(--op); }
  }
  @keyframes s-out {
    from { opacity: var(--op); }
    to { opacity: 0; }
  }

  .p-arc { display: block; }
  /* the fountain arc: Y rises decelerating (spending energy), tips over at
     45%, then falls accelerating (gravity). Two easings on one property —
     composed with the outer X travel, this is how CSS fakes a parabola. */
  .react-layer.fountain .p-arc {
    animation: s-arc var(--dur) linear var(--delay) both;
  }
  @keyframes s-arc {
    0% { transform: translateY(0); animation-timing-function: cubic-bezier(0.16, 0.6, 0.44, 1); }
    45% { transform: translateY(calc(-1 * var(--apex))); animation-timing-function: cubic-bezier(0.55, 0, 0.83, 0.4); }
    100% { transform: translateY(14vh); }
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
