<script lang="ts">
  // The stage: the planner's real ambient gradient + the theme's ambient
  // canopy (stars/petals/aurora/storm) from the imported app.css, with the
  // react particles composited on top exactly as they will be in the chat.
  // This component is the REFERENCE the exported code reproduces.
  import { onMount, onDestroy } from 'svelte';
  import {
    THEME_ORDER,
    THEME_LABELS,
    currentTheme,
    importedThemes,
    canopyFor,
    importThemeJson,
    isImportedTheme,
    removeImportedTheme,
  } from './theme';
  import { SHAPES, type ShapeDef, type CustomPathPart } from './shapes';
  import LunarMoon from './LunarMoon.svelte';
  import AtmosphericVfx from './AtmosphericVfx.svelte';
  import { spawnAll, lifeMs, EASES, type ReactConfig, type LayerConfig, type Particle } from './reactConfig';

  export let config: ReactConfig;

  type PreviewMode = 'desktop' | 'iphone-portrait' | 'iphone-landscape';
  const VIEWPORTS: Record<PreviewMode, { label: string; buttonLabel: string; width: number; height: number; device: boolean }> = {
    desktop: { label: 'Desktop', buttonLabel: 'Desktop', width: 0, height: 0, device: false },
    'iphone-portrait': { label: 'iPhone portrait', buttonLabel: 'iPhone', width: 393, height: 852, device: true },
    'iphone-landscape': { label: 'iPhone landscape', buttonLabel: 'Landscape', width: 852, height: 393, device: true },
  };

  let particleSets: Particle[][] = [];
  let stageEl: HTMLDivElement;
  let frameEl: HTMLDivElement;
  let layerHost: HTMLDivElement;
  let clearTimer: ReturnType<typeof setTimeout>;
  let loopTimer: ReturnType<typeof setTimeout>;
  let resizeObserver: ResizeObserver | undefined;
  let looping = true;
  let slowMo = false; // ¼-speed study mode
  let scrubbing = false;
  let scrubT = 0; // ms into the react while scrubbing
  let fps = 0;
  let domNodes = 0;
  let atmosphereRun = 0;
  let previewMode: PreviewMode = 'desktop';
  let frameScale = 1;
  let themeFileInput: HTMLInputElement;
  let themeImportMessage = '';
  let themeImportError = false;

  // Imported themes can be replaced in place, so canopy metadata depends on
  // both the selected id and the persisted custom-theme collection.
  $: canopy = ($importedThemes, canopyFor($currentTheme));
  $: life = lifeMs(config);
  $: rate = slowMo ? 0.25 : 1;
  $: viewport = VIEWPORTS[previewMode];
  $: frameStyle = viewport.device
    ? `--viewport-width:${viewport.width}px; --viewport-height:${viewport.height}px; --frame-scale:${frameScale};`
    : '';
  $: repainting = config.layers.some(
    (layer) => layer.colorMidMode !== 'hold' || layer.colorEndMode !== 'hold'
      || (layer.glowMode !== 'none' && (
        layer.glowEnvelope
        || (layer.glowMode === 'fixed' && (layer.glowColorMidMode !== 'hold' || layer.glowColorEndMode !== 'hold'))
      ))
  ) || config.atmosphere.some((effect) => effect.enabled);

  function shapeDefFor(layer: LayerConfig): ShapeDef {
    return layer.shape === 'custom'
      ? {
          render: 'path',
          viewBox: layer.customViewBox || '0 0 24 24',
          d: layer.customPath || SHAPES.heart.d,
          paths: layer.customPaths.length ? layer.customPaths : undefined,
        }
      : SHAPES[layer.shape];
  }

  function pathParts(sd: ShapeDef): CustomPathPart[] {
    return sd.paths?.length ? sd.paths : [{ d: sd.d ?? '' }];
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
    atmosphereRun += 1;
    particleSets = spawnAll(config);
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      // Fixed objects are stage fixtures; travelling layers still clean up on
      // schedule, while the moon remains present between replay cycles.
      particleSets = particleSets.map((set, i) =>
        config.layers[i]?.direction === 'fixed' ? set : [],
      );
    }, life / rate);
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

  function updateFrameScale() {
    if (!frameEl || !viewport.device) {
      frameScale = 1;
      return;
    }
    // Keep real CSS-pixel dimensions inside the screen, then scale the whole
    // phone like a model so it fits comfortably in the desktop editor.
    const frameWidth = viewport.width + 20;
    const frameHeight = viewport.height + 20;
    frameScale = Math.max(
      0.1,
      Math.min((frameEl.clientWidth - 28) / frameWidth, (frameEl.clientHeight - 28) / frameHeight, 1),
    );
  }

  function setPreviewMode(mode: string) {
    if (!Object.prototype.hasOwnProperty.call(VIEWPORTS, mode)) return;
    previewMode = mode as PreviewMode;
    localStorage.setItem('react-studio-preview-mode', previewMode);
    requestAnimationFrame(() => {
      updateFrameScale();
      fire();
      scheduleLoop();
    });
  }

  function chooseThemeFile() {
    themeFileInput?.click();
  }

  async function importThemeFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const fallbackName = file.name.replace(/\.json$/i, '').replace(/[-_]+/g, ' ');
      const themes = importThemeJson(await file.text(), fallbackName);
      currentTheme.set(themes[0].id);
      themeImportError = false;
      themeImportMessage = themes.length === 1
        ? `Imported ${themes[0].name}`
        : `Imported ${themes.length} themes`;
    } catch (error) {
      themeImportError = true;
      themeImportMessage = error instanceof Error ? error.message : 'Could not import that theme.';
    } finally {
      input.value = '';
    }
  }

  function removeCurrentImportedTheme() {
    const selected = $currentTheme;
    const name = $importedThemes.find((theme) => theme.id === selected)?.name ?? 'Imported theme';
    removeImportedTheme(selected);
    themeImportError = false;
    themeImportMessage = `Removed ${name}`;
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
    const savedMode = localStorage.getItem('react-studio-preview-mode');
    if (savedMode && Object.prototype.hasOwnProperty.call(VIEWPORTS, savedMode)) {
      previewMode = savedMode as PreviewMode;
    }
    resizeObserver = new ResizeObserver(updateFrameScale);
    resizeObserver.observe(frameEl);
    requestAnimationFrame(updateFrameScale);
    fire();
    scheduleLoop();
    rafId = requestAnimationFrame(fpsLoop);
  });
  onDestroy(() => {
    clearTimeout(clearTimer);
    clearTimeout(loopTimer);
    clearTimeout(debounce);
    resizeObserver?.disconnect();
    cancelAnimationFrame(rafId);
  });

  // per-particle travel endpoint, by direction (matches generate.ts)
  function tx(layer: LayerConfig, p: Particle): string {
    if (layer.direction === 'fixed') return '0px';
    if (layer.direction === 'burst' || layer.direction === 'converge')
      return `${(Math.cos((p.angle * Math.PI) / 180) * p.distance).toFixed(1)}cqmin`;
    return `${p.driftX.toFixed(1)}cqw`;
  }
  function ty(layer: LayerConfig, p: Particle): string {
    if (layer.direction === 'fixed') return '0px';
    if (layer.direction === 'fall') return '112cqh';
    if (layer.direction === 'rise') return '-72cqh';
    if (layer.direction === 'fountain') return '0cqh'; // Y lives on the arc wrapper
    if (layer.direction === 'converge')
      return `${(Math.sin((p.angle * Math.PI) / 180) * p.distance * 0.7).toFixed(1)}cqmin`;
    return `${(Math.sin((p.angle * Math.PI) / 180) * p.distance * 0.7 + 8).toFixed(1)}cqmin`;
  }
</script>

<div class="preview">
  <div class="toolbar">
    <div class="view-options">
      <div class="theme-picker">
        <label class="tsel">
          Theme
          <select bind:value={$currentTheme}>
            <optgroup label="Built-in themes">
              {#each THEME_ORDER as key}
                <option value={key}>{THEME_LABELS[key]}</option>
              {/each}
            </optgroup>
            {#if $importedThemes.length}
              <optgroup label="Imported themes">
                {#each $importedThemes as theme}
                  <option value={theme.id}>{theme.name}</option>
                {/each}
              </optgroup>
            {/if}
          </select>
        </label>
        <button class="theme-action" type="button" on:click={chooseThemeFile} title="Import a planner theme JSON file">
          Import theme
        </button>
        {#if isImportedTheme($currentTheme)}
          <button class="theme-action remove" type="button" on:click={removeCurrentImportedTheme} title="Remove this imported theme">
            Remove
          </button>
        {/if}
        <input
          class="theme-file"
          bind:this={themeFileInput}
          type="file"
          accept="application/json,.json"
          on:change={importThemeFile}
        />
        {#if themeImportMessage}
          <span class="theme-import-message" class:error={themeImportError}>{themeImportMessage}</span>
        {/if}
      </div>
      <div class="view-switch" aria-label="Preview size">
        <span>View</span>
        {#each Object.entries(VIEWPORTS) as [mode, choice]}
          <button
            type="button"
            class:active={previewMode === mode}
            aria-pressed={previewMode === mode}
            title={choice.device ? `${choice.label}, ${choice.width} by ${choice.height} CSS pixels` : 'Use all available preview space'}
            on:click={() => setPreviewMode(mode)}
          >{choice.buttonLabel}</button>
        {/each}
      </div>
    </div>
    <div class="tools">
      <button class="tbtn" on:click={fire} title="Replay the react">▶ Fire</button>
      <button class="tbtn" class:on={looping} on:click={toggleLoop} title="Auto-replay on a loop">
        {looping ? '↻ Looping' : '↻ Loop off'}
      </button>
      <button class="tbtn" class:on={slowMo} on:click={toggleSlowMo} title="Quarter-speed study mode">¼×</button>
    </div>
  </div>

  <div class="stage-shell" class:device-mode={viewport.device} bind:this={frameEl}>
    <div
      class="device-frame"
      class:phone={viewport.device}
      class:landscape={previewMode === 'iphone-landscape'}
      style={frameStyle}
    >
      {#if viewport.device}<div class="phone-pill" aria-hidden="true"></div>{/if}
      <div class="stage" class:device-stage={viewport.device} bind:this={stageEl}>
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
      {#key atmosphereRun}
        <AtmosphericVfx
          effects={config.atmosphere}
          sourcePresent={config.layers.some((layer) => layer.direction === 'fixed' && layer.shape === 'lunar')}
        />
      {/key}
      {#each config.layers as layer, li}
        {@const sd = shapeDefFor(layer)}
        <div
          class="react-layer {layer.direction}"
          class:size-envelope={layer.sizeEnvelope}
          class:color-envelope={layer.colorMidMode !== 'hold' || layer.colorEndMode !== 'hold'}
          class:fixed-glow={layer.glowMode === 'fixed'}
          class:adaptive-glow={layer.glowMode === 'adaptive'}
          class:glow-envelope={layer.glowMode !== 'none' && (layer.glowEnvelope || (layer.glowMode === 'fixed' && (layer.glowColorMidMode !== 'hold' || layer.glowColorEndMode !== 'hold')))}
        >
          {#each particleSets[li] ?? [] as p (p.id)}
            <span
              class="p"
              style="
                --size:{p.size}px; --dur:{p.dur}s; --delay:{p.delay}s; --op:{p.op};
                --indur:{p.inDur.toFixed(3)}s; --outdelay:{p.outDelay.toFixed(3)}s; --outdur:{p.outDur.toFixed(3)}s;
                --envmiddur:{p.envMidDur.toFixed(3)}s; --envenddelay:{p.envEndDelay.toFixed(3)}s; --envenddur:{p.envEndDur.toFixed(3)}s;
                --tx:{tx(layer, p)}; --ty:{ty(layer, p)}; --s0:{layer.scaleFrom}; --sm:{layer.scaleMid}; --s1:{layer.scaleTo};
                --c0:{p.color}; --cm:{p.colorMid}; --c1:{p.colorEnd};
                --gb0:{layer.glowBlur}px; --gbm:{layer.glowEnvelope ? layer.glowBlurMid : layer.glowBlur}px; --gb1:{layer.glowEnvelope ? layer.glowBlurEnd : layer.glowBlur}px;
                --fgc0:{p.glowColor}; --fgcm:{p.glowColorMid}; --fgc1:{p.glowColorEnd};
                --go:{layer.glowOpacity}; --gbr:{layer.glowBrightness};
                --ease:{EASES[layer.travelEase].css};
                --sway:{p.swayAmp}px; --swaydur:{p.swayDur}s; --swayphase:{p.swayPhase}s;
                --rot:{p.rotEnd}deg; --apex:{p.apex.toFixed(1)}cqh;
                --fx:{p.fromX.toFixed(1)}cqmin; --fy:{p.fromY.toFixed(1)}cqmin;
                {layer.direction === 'fixed'
                  ? `left:${layer.fixedX}%; top:${layer.fixedY}%;`
                  : layer.direction !== 'burst' && layer.direction !== 'converge' ? `left:${p.x}%;` : ''}
              "
            >
              <span class="p-arc">
                <span class="p-scale">
                  <span class="p-color">
                    <span class="p-sway">
                      <span class="p-glow">
                        <span class="p-shape" class:adaptive={layer.glowMode === 'adaptive'}>
                          {#if sd.render === 'lunar'}
                            <LunarMoon
                              uid={`preview-${li}-${p.id}`}
                              size={p.size}
                              lunarDay={layer.lunarDay}
                              hemisphere={layer.lunarHemisphere}
                              rotation={layer.moonRotation}
                              terminatorSoftness={layer.moonTerminatorSoftness}
                              earthshineOpacity={layer.moonEarthshineOpacity}
                              earthshineColor={layer.moonEarthshineColor}
                              limbDarkening={layer.moonLimbDarkening}
                              limbDarkeningColor={layer.moonLimbDarkeningColor}
                              debug={layer.moonDebug}
                            />
                          {:else if sd.render === 'path'}
                            <svg viewBox={sd.viewBox} width={p.size} height={p.size} style="display:block;">
                              {#each pathParts(sd) as part}
                                <path
                                  fill="currentColor"
                                  d={part.d}
                                  transform={part.transform || undefined}
                                  fill-rule={part.fillRule || undefined}
                                />
                              {/each}
                            </svg>
                          {:else}
                            <span
                              class="css-shape"
                              style="width:{p.size}px; height:{p.size}px; background:currentColor; border-radius:{sd.radius};"
                            ></span>
                          {/if}
                        </span>
                      </span>
                    </span>
                  </span>
                </span>
              </span>
            </span>
          {/each}
        </div>
      {/each}
    </div>
      </div>
    </div>
    {#if viewport.device}
      <div class="viewport-caption">{viewport.width} × {viewport.height} CSS px</div>
    {/if}
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
    <div class="meter" title="Movement stays on transform/opacity. Colour and glow envelopes intentionally repaint, so watch fps as you raise the count.">
      <span>{domNodes} nodes</span>
      <span class:good={fps >= 55} class:rough={fps < 45}>{scrubbing ? '—' : fps} fps</span>
      <span class="law">{repainting ? 'colour/glow repaint · motion composited' : 'transform/opacity motion ✓'}</span>
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
  .view-options {
    display: flex;
    align-items: center;
    gap: 14px;
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
  .theme-picker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .theme-action {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px 9px;
    background: var(--surface-2);
    color: var(--text-2);
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .theme-action:hover {
    border-color: color-mix(in srgb, var(--signal) 48%, var(--border));
    color: var(--signal);
  }
  .theme-action.remove {
    color: var(--text-faint);
  }
  .theme-file { display: none; }
  .theme-import-message {
    max-width: 220px;
    color: var(--signal);
    font-size: 10px;
    line-height: 1.25;
  }
  .theme-import-message.error { color: #e46767; }
  .view-switch {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-2);
  }
  .view-switch > span {
    padding: 0 5px;
    font-size: 11px;
    color: var(--text-dim);
  }
  .view-switch button {
    border: 0;
    border-radius: 7px;
    padding: 4px 8px;
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .view-switch button.active {
    background: var(--signal);
    color: var(--signal-contrast);
    box-shadow: 0 0 7px var(--signal-glow);
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
  .stage-shell {
    position: relative;
    flex: 1 1 auto;
    min-height: 420px;
    min-width: 0;
  }
  .stage-shell.device-mode {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 16px;
    background:
      radial-gradient(circle at 50% 45%, var(--signal-glow), transparent 48%),
      color-mix(in srgb, var(--surface-2) 72%, var(--app-bg));
  }
  .device-frame {
    width: 100%;
    height: 100%;
    display: flex;
  }
  .device-frame.phone {
    position: absolute;
    left: 50%;
    top: 50%;
    width: calc(var(--viewport-width) + 20px);
    height: calc(var(--viewport-height) + 20px);
    padding: 10px;
    box-sizing: border-box;
    flex: none;
    transform: translate(-50%, -50%) scale(var(--frame-scale));
    transform-origin: center;
    border-radius: 52px;
    background: #101013;
    box-shadow:
      0 24px 70px rgba(0, 0, 0, 0.32),
      0 0 0 2px rgba(255, 255, 255, 0.16) inset;
  }
  .device-frame.phone.landscape { border-radius: 38px; }
  .phone-pill {
    position: absolute;
    z-index: 100;
    left: 50%;
    top: 20px;
    width: 126px;
    height: 35px;
    transform: translateX(-50%);
    border-radius: 999px;
    background: #070708;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.045);
    pointer-events: none;
  }
  .device-frame.landscape .phone-pill {
    left: 20px;
    top: 50%;
    width: 35px;
    height: 126px;
    transform: translateY(-50%);
  }
  .viewport-caption {
    position: absolute;
    right: 10px;
    bottom: 8px;
    z-index: 2;
    color: var(--text-faint);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .stage {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
    border-radius: 16px;
    overflow: hidden;
    container-type: size;
    background: var(--ambient-gradient, var(--app-bg));
    border: 1px solid var(--border);
  }
  .stage.device-stage {
    width: 100%;
    height: 100%;
    flex: none;
    border: 0;
    border-radius: 43px;
  }
  .device-frame.landscape .stage.device-stage { border-radius: 29px; }
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
     axis, .p-scale changes size, .p-color changes colour, .p-sway flutters,
     .p-glow carries the halo and .p-shape spins. Motion and size stay on
     transform/opacity; colour and animated glow repaint. ---- */
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
  .react-layer.fixed .p {
    margin-top: calc(var(--size) / -2);
    animation: none;
    opacity: var(--op);
    transform: translate(0, 0);
  }
  .react-layer.burst .p { top: 50%; left: 50%; margin-top: calc(var(--size) / -2); }
  .react-layer.converge .p {
    top: 50%;
    left: 50%;
    margin-top: calc(var(--size) / -2);
    animation:
      s-converge var(--dur) var(--ease, linear) var(--delay) both,
      s-in var(--indur) linear var(--delay) both,
      s-out var(--outdur) linear var(--outdelay) forwards;
  }
  .react-layer.size-envelope:not(.converge):not(.fixed) .p {
    animation:
      s-travel-pos var(--dur) var(--ease, linear) var(--delay) both,
      s-in var(--indur) linear var(--delay) both,
      s-out var(--outdur) linear var(--outdelay) forwards;
  }
  .react-layer.size-envelope.converge .p {
    animation:
      s-converge-pos var(--dur) var(--ease, linear) var(--delay) both,
      s-in var(--indur) linear var(--delay) both,
      s-out var(--outdur) linear var(--outdelay) forwards;
  }
  @keyframes s-travel {
    from { transform: translate(0, 0) scale(var(--s0, 1)); }
    to { transform: translate(var(--tx), var(--ty)) scale(var(--s1, 1)); }
  }
  @keyframes s-travel-pos {
    from { transform: translate(0, 0); }
    to { transform: translate(var(--tx), var(--ty)); }
  }
  /* Convergence is phrased, not merely reversed: arrive by 72%, then let the
     resolved shape hold still while the fade envelope decides when it leaves. */
  @keyframes s-converge {
    0% { transform: translate(var(--fx), var(--fy)) scale(var(--s0, 1)); }
    72%, 100% { transform: translate(var(--tx), var(--ty)) scale(var(--s1, 1)); }
  }
  @keyframes s-converge-pos {
    0% { transform: translate(var(--fx), var(--fy)); }
    72%, 100% { transform: translate(var(--tx), var(--ty)); }
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

  .p-scale,
  .p-color,
  .p-sway,
  .p-glow {
    display: block;
  }
  .react-layer.size-envelope .p-scale {
    animation:
      s-scale-a var(--envmiddur) var(--ease, linear) var(--delay) both,
      s-scale-b var(--envenddur) var(--ease, linear) var(--envenddelay) forwards;
  }
  @keyframes s-scale-a {
    from { transform: scale(var(--s0, 1)); }
    to { transform: scale(var(--sm, 1)); }
  }
  @keyframes s-scale-b {
    from { transform: scale(var(--sm, 1)); }
    to { transform: scale(var(--s1, 1)); }
  }
  .p-color { color: var(--c0); }
  .react-layer.color-envelope .p-color {
    animation:
      s-color-a var(--envmiddur) linear var(--delay) both,
      s-color-b var(--envenddur) linear var(--envenddelay) forwards;
  }
  @keyframes s-color-a {
    from { color: var(--c0); }
    to { color: var(--cm); }
  }
  @keyframes s-color-b {
    from { color: var(--cm); }
    to { color: var(--c1); }
  }
  .p-sway {
    animation: s-sway var(--swaydur) ease-in-out calc(-1 * var(--swayphase)) infinite alternate;
  }
  @keyframes s-sway {
    from { transform: translateX(calc(-1 * var(--sway))); }
    to { transform: translateX(var(--sway)); }
  }
  .react-layer.fixed-glow .p-glow,
  .react-layer.adaptive-glow .p-glow {
    --glow-alpha: clamp(0%, calc(var(--go, 0.72) * var(--gbr, 1) * 100%), 100%);
    --corona-alpha: clamp(0%, calc(var(--go, 0.72) * var(--gbr, 1) * 34%), 65%);
    filter:
      drop-shadow(0 0 var(--gb0) color-mix(in srgb, var(--gc0, var(--fgc0)) var(--glow-alpha), transparent))
      drop-shadow(0 0 calc(var(--gb0) * 1.8) color-mix(in srgb, var(--gc0, var(--fgc0)) var(--corona-alpha), transparent));
  }
  .react-layer.glow-envelope .p-glow {
    animation:
      s-glow-a var(--envmiddur) linear var(--delay) both,
      s-glow-b var(--envenddur) linear var(--envenddelay) forwards;
  }
  @keyframes s-glow-a {
    from { filter: drop-shadow(0 0 var(--gb0) color-mix(in srgb, var(--gc0, var(--fgc0)) var(--glow-alpha), transparent)) drop-shadow(0 0 calc(var(--gb0) * 1.8) color-mix(in srgb, var(--gc0, var(--fgc0)) var(--corona-alpha), transparent)); }
    to { filter: drop-shadow(0 0 var(--gbm) color-mix(in srgb, var(--gcm, var(--fgcm)) var(--glow-alpha), transparent)) drop-shadow(0 0 calc(var(--gbm) * 1.8) color-mix(in srgb, var(--gcm, var(--fgcm)) var(--corona-alpha), transparent)); }
  }
  @keyframes s-glow-b {
    from { filter: drop-shadow(0 0 var(--gbm) color-mix(in srgb, var(--gcm, var(--fgcm)) var(--glow-alpha), transparent)) drop-shadow(0 0 calc(var(--gbm) * 1.8) color-mix(in srgb, var(--gcm, var(--fgcm)) var(--corona-alpha), transparent)); }
    to { filter: drop-shadow(0 0 var(--gb1) color-mix(in srgb, var(--gc1, var(--fgc1)) var(--glow-alpha), transparent)) drop-shadow(0 0 calc(var(--gb1) * 1.8) color-mix(in srgb, var(--gc1, var(--fgc1)) var(--corona-alpha), transparent)); }
  }
  :global([data-theme='dark']) .react-layer.adaptive-glow .p-glow {
    --gc0: rgba(255, 255, 255, 0.35);
    --gcm: rgba(255, 255, 255, 0.35);
    --gc1: rgba(255, 255, 255, 0.35);
  }
  :global([data-theme='light']) .react-layer.adaptive-glow .p-glow {
    --gc0: rgba(40, 30, 30, 0.32);
    --gcm: rgba(40, 30, 30, 0.32);
    --gc1: rgba(40, 30, 30, 0.32);
  }
  .p-shape {
    display: block;
    animation: s-spin var(--dur) linear var(--delay) both;
  }
  /* adaptive readability rim: light on dark skies, soft dark on light — the
     data-theme selector is global (set on <html>), the shape class stays scoped */
  :global([data-theme='dark']) .p-shape.adaptive {
    filter: drop-shadow(0 0 1px rgba(255, 255, 255, 0.6));
  }
  @keyframes s-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(var(--rot)); }
  }
  .css-shape { display: block; }
</style>
