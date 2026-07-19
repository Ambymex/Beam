<script lang="ts">
  import { PRESETS, EASES, MAX_LAYERS, newLayer, migrateConfig, type ReactConfig, type EaseKind } from './reactConfig';
  import { SHAPE_LABELS, type ShapeKind } from './shapes';
  import CustomShape from './CustomShape.svelte';
  import { SYNODIC_MONTH, lunarPhaseInfo } from './lunar';

  // Two-way bound from App; reassigning `config` (even to itself) is what tells
  // Svelte a nested field changed, so the live preview re-fires.
  export let config: ReactConfig;

  let active = 0; // which layer is being edited
  $: if (active >= config.layers.length) active = config.layers.length - 1;
  $: layer = config.layers[active];
  $: lunarPhase = layer?.shape === 'lunar'
    ? lunarPhaseInfo(layer.lunarDay, layer.lunarHemisphere)
    : null;

  const bump = () => {
    // Keep the old single-colour field meaningful for saved drafts made by
    // earlier Studio versions.
    layer.glowColor = layer.glowColorMode === 'auto'
      ? 'auto'
      : (layer.glowColors[0] ?? '#ffffff');
    config = config;
  };

  function loadPreset(key: string) {
    config = migrateConfig(PRESETS[key]);
    active = 0;
  }

  function addLayer() {
    if (config.layers.length >= MAX_LAYERS) return;
    config.layers = [...config.layers, newLayer(config.layers.length + 1)];
    active = config.layers.length - 1;
    bump();
  }
  function duplicateLayer() {
    if (config.layers.length >= MAX_LAYERS) return;
    const copy = {
      ...layer,
      name: `${layer.name} copy`,
      colors: [...layer.colors],
      colorsMid: [...layer.colorsMid],
      colorsEnd: [...layer.colorsEnd],
      glowColors: [...layer.glowColors],
      glowColorsMid: [...layer.glowColorsMid],
      glowColorsEnd: [...layer.glowColorsEnd],
      customPaths: layer.customPaths.map((part) => ({ ...part })),
    };
    config.layers = [...config.layers.slice(0, active + 1), copy, ...config.layers.slice(active + 1)];
    active = active + 1;
    bump();
  }
  function removeLayer() {
    if (config.layers.length <= 1) return;
    config.layers = config.layers.filter((_, i) => i !== active);
    active = Math.max(0, active - 1);
    bump();
  }

  function addColor() {
    layer.colors = [...layer.colors, '#ffffff'];
    bump();
  }
  function removeColor(i: number) {
    layer.colors = layer.colors.filter((_, j) => j !== i);
    bump();
  }
  function addMidColor() {
    layer.colorsMid = [...layer.colorsMid, '#ffffff'];
    bump();
  }
  function removeMidColor(i: number) {
    layer.colorsMid = layer.colorsMid.filter((_, j) => j !== i);
    bump();
  }
  function addEndColor() {
    layer.colorsEnd = [...layer.colorsEnd, '#ffffff'];
    bump();
  }
  function removeEndColor(i: number) {
    layer.colorsEnd = layer.colorsEnd.filter((_, j) => j !== i);
    bump();
  }
  function addGlowColor(stop: 'start' | 'middle' | 'end') {
    if (stop === 'start') layer.glowColors = [...layer.glowColors, '#ffffff'];
    if (stop === 'middle') layer.glowColorsMid = [...layer.glowColorsMid, '#ffffff'];
    if (stop === 'end') layer.glowColorsEnd = [...layer.glowColorsEnd, '#ffffff'];
    bump();
  }
  function removeGlowColor(stop: 'start' | 'middle' | 'end', i: number) {
    if (stop === 'start') layer.glowColors = layer.glowColors.filter((_, j) => j !== i);
    if (stop === 'middle') layer.glowColorsMid = layer.glowColorsMid.filter((_, j) => j !== i);
    if (stop === 'end') layer.glowColorsEnd = layer.glowColorsEnd.filter((_, j) => j !== i);
    bump();
  }
  // keep the id a safe snake_case identifier as they type
  function sanitizeId() {
    config.id = config.id.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    bump();
  }

  const shapeKinds = Object.keys(SHAPE_LABELS) as ShapeKind[];
  const easeKinds = Object.keys(EASES) as EaseKind[];

  // curve thumbnail: x = time, y = progress; bezier control points → SVG path
  function easePath(kind: EaseKind): string {
    const pts = EASES[kind].pts;
    if (!pts) return 'M2,26 L26,2';
    const [x1, y1, x2, y2] = pts;
    return `M2,26 C${(2 + x1 * 24).toFixed(1)},${(26 - y1 * 24).toFixed(1)} ${(2 + x2 * 24).toFixed(1)},${(26 - y2 * 24).toFixed(1)} 26,2`;
  }

  // fade envelope thumbnail: rise to full by fadeInPct, hold, fall from fadeOutPct
  function envPath(): string {
    const inX = 4 + (layer.fadeInPct / 100) * 112;
    const outX = 4 + (layer.fadeOutPct / 100) * 112;
    return `M4,26 L${inX.toFixed(1)},6 L${outX.toFixed(1)},6 L116,26`;
  }
</script>

<div class="controls">
  <div class="preset-row">
    <span class="preset-label">Start from</span>
    {#each Object.entries(PRESETS) as [key, p]}
      <button class="preset" on:click={() => loadPreset(key)}>{p.label}</button>
    {/each}
  </div>

  <section>
    <h3>Identity</h3>
    <label class="field">
      <span>React id</span>
      <input type="text" bind:value={config.id} on:input={bump} on:blur={sanitizeId} placeholder="my_react" />
    </label>
    <label class="field">
      <span>Label</span>
      <input type="text" bind:value={config.label} on:input={bump} />
    </label>
    <label class="field col">
      <span>Register (prompt guidance)</span>
      <textarea rows="2" bind:value={config.register} on:input={bump}></textarea>
    </label>
  </section>

  <section>
    <h3>Layers</h3>
    <div class="layer-chips">
      {#each config.layers as l, i}
        <button class="chip" class:active={i === active} class:muted={l.muted} on:click={() => (active = i)}>
          {l.name || `Layer ${i + 1}`}
        </button>
      {/each}
      {#if config.layers.length < MAX_LAYERS}
        <button class="chip add" on:click={addLayer} title="Add a layer">＋</button>
      {/if}
    </div>
    <label class="field">
      <span>Layer name</span>
      <input type="text" bind:value={layer.name} on:input={bump} />
    </label>
    <div class="layer-actions">
      <label class="field check">
        <input type="checkbox" bind:checked={layer.muted} on:change={bump} />
        <span>Mute (preview only — export keeps it)</span>
      </label>
      <div class="layer-btns">
        <button class="mini" on:click={duplicateLayer} disabled={config.layers.length >= MAX_LAYERS}>Duplicate</button>
        <button class="mini danger" on:click={removeLayer} disabled={config.layers.length <= 1}>Delete</button>
      </div>
    </div>
    <p class="hint">A dense, quiet layer behind a sparse hero layer is the classic recipe — support sells the depth, the hero carries the feeling.</p>
  </section>

  <section>
    <h3>Emission · {layer.name}</h3>
    <label class="field">
      <span>Direction</span>
      <select bind:value={layer.direction} on:change={bump}>
        <option value="fixed">Fixed position</option>
        <option value="fall">Fall (top → down)</option>
        <option value="rise">Rise (bottom → up)</option>
        <option value="burst">Burst (from centre)</option>
        <option value="fountain">Fountain (arc up & over)</option>
        <option value="converge">Converge (scatter → focus)</option>
      </select>
    </label>
    {#if layer.direction === 'fountain'}
      <p class="hint">The arc is two easings on one property: decelerate up (spending energy), accelerate down (gravity). The travel easing below drives the horizontal only.</p>
    {/if}
    {#if layer.direction === 'converge'}
      <p class="hint">Particles begin scattered around the frame, settle into a focused cloud by 72% of travel, then hold still. Fade-out timing decides how long the lock gets to breathe.</p>
    {/if}
    {#if layer.direction === 'fixed'}
      <p class="hint">Anchored to one point on the stage. Inner size, colour and glow envelopes can still breathe without moving the object itself.</p>
      <div class="pair">
        <label class="field">
          <span>Position X <b>{layer.fixedX}%</b></span>
          <input type="range" min="5" max="95" bind:value={layer.fixedX} on:input={bump} />
        </label>
        <label class="field">
          <span>Position Y <b>{layer.fixedY}%</b></span>
          <input type="range" min="10" max="90" bind:value={layer.fixedY} on:input={bump} />
        </label>
      </div>
      <label class="field">
        <span>Animation cycle <b>{layer.durMax.toFixed(1)}s</b></span>
        <input
          type="range"
          min="0.8"
          max="12"
          step="0.1"
          bind:value={layer.durMax}
          on:input={() => { layer.durMin = layer.durMax; bump(); }}
        />
      </label>
    {/if}
    {#if layer.direction !== 'fixed'}
    <label class="field">
      <span>Count <b>{layer.count}</b></span>
      <input type="range" min="1" max="80" bind:value={layer.count} on:input={bump} />
    </label>
    <label class="field">
      <span>Spawn trickle <b>{layer.spawnWindow.toFixed(1)}s</b></span>
      <input type="range" min="0" max="4" step="0.1" bind:value={layer.spawnWindow} on:input={bump} />
    </label>
    <label class="field">
      <span>Layer delay <b>{layer.layerDelay.toFixed(1)}s</b></span>
      <input type="range" min="0" max="4" step="0.1" bind:value={layer.layerDelay} on:input={bump} />
    </label>
    <div class="pair">
      <label class="field">
        <span>Travel min <b>{layer.durMin.toFixed(1)}s</b></span>
        <input type="range" min="0.4" max="8" step="0.1" bind:value={layer.durMin} on:input={bump} />
      </label>
      <label class="field">
        <span>Travel max <b>{layer.durMax.toFixed(1)}s</b></span>
        <input type="range" min="0.4" max="8" step="0.1" bind:value={layer.durMax} on:input={bump} />
      </label>
    </div>
    <div class="field col">
      <span>Travel easing</span>
      <div class="ease-row">
        {#each easeKinds as k}
          <button
            class="ease-btn"
            class:active={layer.travelEase === k}
            title={EASES[k].label}
            on:click={() => { layer.travelEase = k; bump(); }}
          >
            <svg viewBox="0 0 28 28" width="26" height="26">
              <path d={easePath(k)} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        {/each}
      </div>
      <p class="hint"><b>{EASES[layer.travelEase].label}:</b> {EASES[layer.travelEase].teach}</p>
    </div>
    {/if}
    {#if layer.direction === 'fall' || layer.direction === 'rise' || layer.direction === 'fountain'}
      <label class="field">
        <span>Horizontal drift <b>{layer.driftX}vw</b></span>
        <input type="range" min="0" max="30" bind:value={layer.driftX} on:input={bump} />
      </label>
    {/if}
    {#if layer.direction === 'fountain'}
      <label class="field">
        <span>Arc height <b>{layer.arcApex}vh</b></span>
        <input type="range" min="15" max="85" bind:value={layer.arcApex} on:input={bump} />
      </label>
    {/if}
    {#if layer.direction === 'converge'}
      <label class="field">
        <span>Focus radius <b>{layer.focusRadius.toFixed(1)}vmin</b></span>
        <input type="range" min="0" max="30" step="0.5" bind:value={layer.focusRadius} on:input={bump} />
      </label>
    {/if}
  </section>

  <section>
    <h3>Particle · {layer.name}</h3>
    <label class="field">
      <span>Shape</span>
      <select bind:value={layer.shape} on:change={bump}>
        {#each shapeKinds as k}<option value={k}>{SHAPE_LABELS[k]}</option>{/each}
      </select>
    </label>
    {#if layer.shape === 'custom'}
      <div class="field col">
        <span>Custom shape</span>
        {#key active}
          <CustomShape
            bind:path={layer.customPath}
            bind:viewBox={layer.customViewBox}
            bind:paths={layer.customPaths}
            bind:sourceName={layer.customShapeName}
            on:change={bump}
          />
        {/key}
      </div>
    {/if}
    {#if layer.shape === 'lunar'}
      {#if lunarPhase}
        <div class="phase-card">
          <b>{lunarPhase.name}</b>
          <span>{(lunarPhase.illumination * 100).toFixed(1)}% illuminated · {lunarPhase.waxing ? 'waxing' : 'waning'} · lit on the {lunarPhase.side}</span>
        </div>
      {/if}
      <label class="field col">
        <span>Lunar day <b>{layer.lunarDay.toFixed(2)} / {SYNODIC_MONTH.toFixed(2)}</b></span>
        <input type="range" min="0" max={SYNODIC_MONTH} step="0.01" bind:value={layer.lunarDay} on:input={bump} />
      </label>
      <label class="field">
        <span>Hemisphere orientation</span>
        <select bind:value={layer.lunarHemisphere} on:change={bump}>
          <option value="south">Southern (Melbourne)</option>
          <option value="north">Northern</option>
        </select>
      </label>
      <div class="pair">
        <label class="field">
          <span>Apparent size <b>{layer.moonSize}px</b></span>
          <input type="range" min="32" max="260" bind:value={layer.moonSize} on:input={bump} />
        </label>
        <label class="field">
          <span>Disc opacity <b>{layer.moonOpacity.toFixed(2)}</b></span>
          <input type="range" min="0" max="1" step="0.01" bind:value={layer.moonOpacity} on:input={bump} />
        </label>
      </div>
      <label class="field">
        <span>Moon colour</span>
        <select bind:value={layer.colorMode} on:change={bump}>
          <option value="fixed">Fixed colour</option>
          <option value="signal">Theme --signal</option>
          <option value="contrast">Theme --signal-contrast</option>
        </select>
      </label>
      {#if layer.colorMode === 'fixed'}
        <div class="single-colour">
          <input type="color" bind:value={layer.colors[0]} on:input={bump} aria-label="Moon colour" />
        </div>
      {/if}
      <div class="pair">
        <label class="field">
          <span>Earthshine <b>{layer.moonEarthshineOpacity.toFixed(2)}</b></span>
          <input type="range" min="0" max="1" step="0.01" bind:value={layer.moonEarthshineOpacity} on:input={bump} />
        </label>
        <label class="field colour-field">
          <span>Earthshine colour</span>
          <input type="color" bind:value={layer.moonEarthshineColor} on:input={bump} aria-label="Earthshine colour" />
        </label>
      </div>
      <div class="pair">
        <label class="field">
          <span>Terminator softness <b>{layer.moonTerminatorSoftness.toFixed(2)}</b></span>
          <input type="range" min="0" max="3" step="0.05" bind:value={layer.moonTerminatorSoftness} on:input={bump} />
        </label>
        <label class="field">
          <span>Limb shading <b>{layer.moonLimbDarkening.toFixed(2)}</b></span>
          <input type="range" min="0" max="1" step="0.01" bind:value={layer.moonLimbDarkening} on:input={bump} />
        </label>
      </div>
      <label class="field check">
        <input type="checkbox" bind:checked={layer.moonDebug} on:change={bump} />
        <span>Debug mask, axes and pivot</span>
      </label>
      <p class="hint">The phase uses projected-sphere geometry. Day 0 is new, 7.38 first quarter, 14.77 full, and 22.15 last quarter.</p>
    {:else}
    <div class="pair">
      <label class="field">
        <span>Size min <b>{layer.sizeMin}px</b></span>
        <input type="range" min="3" max="40" bind:value={layer.sizeMin} on:input={bump} />
      </label>
      <label class="field">
        <span>Size max <b>{layer.sizeMax}px</b></span>
        <input type="range" min="3" max="48" bind:value={layer.sizeMax} on:input={bump} />
      </label>
    </div>
    <label class="field check">
      <input type="checkbox" bind:checked={layer.depthLink} on:change={bump} />
      <span>Depth link (big = near = fast & solid)</span>
    </label>
    {#if layer.depthLink}
      <p class="hint">One random depth per particle drives size, speed and opacity together — coherent variation reads as depth; independent randomness reads as noise.</p>
    {/if}
    <label class="field">
      <span>Start colour</span>
      <select bind:value={layer.colorMode} on:change={bump}>
        <option value="fixed">Fixed colour(s)</option>
        <option value="signal">Theme --signal</option>
        <option value="contrast">Theme --signal-contrast</option>
      </select>
    </label>
    {#if layer.colorMode === 'fixed'}
      <div class="colors">
        {#each layer.colors as c, i}
          <div class="color-chip">
            <input type="color" bind:value={layer.colors[i]} on:input={bump} />
            {#if layer.colors.length > 1}
              <button class="x" on:click={() => removeColor(i)} aria-label="Remove colour">✕</button>
            {/if}
          </div>
        {/each}
        <button class="add-color" on:click={addColor} title="Add a colour for per-particle variation">＋</button>
      </div>
    {/if}
    {/if}
  </section>

  <section>
    <h3>Motion · {layer.name}</h3>
    {#if layer.shape === 'lunar'}
      <label class="field">
        <span>Disc rotation <b>{layer.moonRotation}°</b></span>
        <input type="range" min="-180" max="180" bind:value={layer.moonRotation} on:input={bump} />
      </label>
      <p class="hint">Position remains truly fixed. Rotation is an artistic orientation adjustment; set it to 0° for the hemisphere-correct upright phase.</p>
    {:else}
    <label class="field check">
      <input type="checkbox" bind:checked={layer.spin} on:change={bump} />
      <span>Spin as it travels</span>
    </label>
    {#if layer.spin}
      <label class="field">
        <span>Rotation rate <b>{layer.rotMax}°/s</b></span>
        <input type="range" min="0" max="180" bind:value={layer.rotMax} on:input={bump} />
      </label>
    {/if}
    <label class="field">
      <span>Flutter amplitude <b>{layer.swayAmp}px</b></span>
      <input type="range" min="0" max="40" bind:value={layer.swayAmp} on:input={bump} />
    </label>
    {#if layer.swayAmp > 0}
      <div class="pair">
        <label class="field">
          <span>Flutter min <b>{layer.swayMin.toFixed(1)}s</b></span>
          <input type="range" min="0.4" max="3" step="0.1" bind:value={layer.swayMin} on:input={bump} />
        </label>
        <label class="field">
          <span>Flutter max <b>{layer.swayMax.toFixed(1)}s</b></span>
          <input type="range" min="0.4" max="3.5" step="0.1" bind:value={layer.swayMax} on:input={bump} />
        </label>
      </div>
    {/if}
    {/if}
  </section>

  <section>
    <h3>Change over time · {layer.name}</h3>
    <p class="hint">Size, colour and glow share one middle beat, so a bloom or colour-turn reads as a single thought rather than unrelated effects.</p>
    <label class="field check">
      <input type="checkbox" bind:checked={layer.sizeEnvelope} on:change={bump} />
      <span>Three-point size envelope</span>
    </label>
    {#if layer.sizeEnvelope}
      <div class="triple">
        <label class="field">
          <span>Start <b>{layer.scaleFrom.toFixed(2)}</b></span>
          <input type="range" min="0.1" max="2.5" step="0.05" bind:value={layer.scaleFrom} on:input={bump} />
        </label>
        <label class="field">
          <span>Middle <b>{layer.scaleMid.toFixed(2)}</b></span>
          <input type="range" min="0.1" max="2.5" step="0.05" bind:value={layer.scaleMid} on:input={bump} />
        </label>
        <label class="field">
          <span>End <b>{layer.scaleTo.toFixed(2)}</b></span>
          <input type="range" min="0.1" max="2.5" step="0.05" bind:value={layer.scaleTo} on:input={bump} />
        </label>
      </div>
    {:else}
      <div class="pair">
        <label class="field">
          <span>Scale from <b>{layer.scaleFrom.toFixed(2)}</b></span>
          <input type="range" min="0.1" max="2" step="0.05" bind:value={layer.scaleFrom} on:input={bump} />
        </label>
        <label class="field">
          <span>Scale to <b>{layer.scaleTo.toFixed(2)}</b></span>
          <input type="range" min="0.1" max="2" step="0.05" bind:value={layer.scaleTo} on:input={bump} />
        </label>
      </div>
    {/if}

    <label class="field">
      <span>Middle colour</span>
      <select bind:value={layer.colorMidMode} on:change={bump}>
        <option value="hold">Hold start</option>
        <option value="fixed">Fixed colour(s)</option>
        <option value="signal">Theme --signal</option>
        <option value="contrast">Theme --signal-contrast</option>
      </select>
    </label>
    {#if layer.colorMidMode === 'fixed'}
      <div class="colors">
        {#each layer.colorsMid as c, i}
          <div class="color-chip">
            <input type="color" bind:value={layer.colorsMid[i]} on:input={bump} />
            {#if layer.colorsMid.length > 1}
              <button class="x" on:click={() => removeMidColor(i)} aria-label="Remove middle colour">✕</button>
            {/if}
          </div>
        {/each}
        <button class="add-color" on:click={addMidColor} title="Add a middle colour">＋</button>
      </div>
    {/if}

    <label class="field">
      <span>End colour</span>
      <select bind:value={layer.colorEndMode} on:change={bump}>
        <option value="hold">Hold middle</option>
        <option value="fixed">Fixed colour(s)</option>
        <option value="signal">Theme --signal</option>
        <option value="contrast">Theme --signal-contrast</option>
      </select>
    </label>
    {#if layer.colorEndMode === 'fixed'}
      <div class="colors">
        {#each layer.colorsEnd as c, i}
          <div class="color-chip">
            <input type="color" bind:value={layer.colorsEnd[i]} on:input={bump} />
            {#if layer.colorsEnd.length > 1}
              <button class="x" on:click={() => removeEndColor(i)} aria-label="Remove end colour">✕</button>
            {/if}
          </div>
        {/each}
        <button class="add-color" on:click={addEndColor} title="Add an end colour">＋</button>
      </div>
    {/if}

    {#if layer.sizeEnvelope || layer.colorMidMode !== 'hold' || layer.colorEndMode !== 'hold' || layer.glowEnvelope || (layer.glowMode === 'fixed' && (layer.glowColorMidMode !== 'hold' || layer.glowColorEndMode !== 'hold'))}
      <label class="field">
        <span>Middle arrives <b>{layer.envelopeMidPct}%</b></span>
        <input type="range" min="10" max="90" bind:value={layer.envelopeMidPct} on:input={bump} />
      </label>
      <p class="hint">The first phase ends here; the second phase uses the rest of the travel. Around 40–60% feels balanced, while early or late stops create a snap.</p>
    {/if}
  </section>

  <section>
    <h3>Look · {layer.name}</h3>
    {#if layer.shape !== 'lunar'}
    <div class="pair">
      <label class="field">
        <span>Opacity min <b>{layer.opacityMin.toFixed(2)}</b></span>
        <input type="range" min="0" max="1" step="0.05" bind:value={layer.opacityMin} on:input={bump} />
      </label>
      <label class="field">
        <span>Opacity max <b>{layer.opacityMax.toFixed(2)}</b></span>
        <input type="range" min="0" max="1" step="0.05" bind:value={layer.opacityMax} on:input={bump} />
      </label>
    </div>
    <div class="field col">
      <span>Fade envelope</span>
      <div class="env-row">
        <svg viewBox="0 0 120 30" width="120" height="30" class="env-svg">
          <path d={envPath()} fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        </svg>
        <div class="env-sliders">
          <label class="field">
            <span>In by <b>{layer.fadeInPct}%</b></span>
            <input type="range" min="0" max="40" bind:value={layer.fadeInPct} on:input={bump} />
          </label>
          <label class="field">
            <span>Out from <b>{layer.fadeOutPct}%</b></span>
            <input type="range" min="50" max="100" bind:value={layer.fadeOutPct} on:input={bump} />
          </label>
        </div>
      </div>
      {#if layer.fadeInPct === 0 || layer.fadeOutPct === 100}
        <p class="hint">Popping in or vanishing at full opacity is the #1 amateur tell — even 5% of fade keeps the illusion of a thing arriving and leaving.</p>
      {/if}
    </div>
    {/if}
    <label class="field">
      <span>Glow</span>
      <select bind:value={layer.glowMode} on:change={bump}>
        <option value="none">None</option>
        <option value="fixed">Fixed colour halo</option>
        <option value="adaptive">Adaptive rim (per theme)</option>
      </select>
    </label>
    {#if layer.glowMode !== 'none'}
      <label class="field check">
        <input type="checkbox" bind:checked={layer.glowEnvelope} on:change={bump} />
        <span>Three-point glow strength</span>
      </label>
      {#if layer.glowEnvelope}
        <div class="triple">
          <label class="field">
            <span>Start <b>{layer.glowBlur}px</b></span>
            <input type="range" min="0" max="24" bind:value={layer.glowBlur} on:input={bump} />
          </label>
          <label class="field">
            <span>Middle <b>{layer.glowBlurMid}px</b></span>
            <input type="range" min="0" max="24" bind:value={layer.glowBlurMid} on:input={bump} />
          </label>
          <label class="field">
            <span>End <b>{layer.glowBlurEnd}px</b></span>
            <input type="range" min="0" max="24" bind:value={layer.glowBlurEnd} on:input={bump} />
          </label>
        </div>
      {:else}
        <label class="field">
          <span>Glow strength <b>{layer.glowBlur}px</b></span>
          <input type="range" min="0" max="24" bind:value={layer.glowBlur} on:input={bump} />
        </label>
      {/if}
      <div class="pair">
        <label class="field">
          <span>Glow opacity <b>{layer.glowOpacity.toFixed(2)}</b></span>
          <input type="range" min="0" max="1" step="0.01" bind:value={layer.glowOpacity} on:input={bump} />
        </label>
        <label class="field">
          <span>Glow brightness <b>{layer.glowBrightness.toFixed(2)}</b></span>
          <input type="range" min="0" max="2" step="0.05" bind:value={layer.glowBrightness} on:input={bump} />
        </label>
      </div>
    {/if}
    {#if layer.glowMode === 'fixed'}
      <label class="field">
        <span>Start glow colour</span>
        <select bind:value={layer.glowColorMode} on:change={bump}>
          <option value="auto">Follow particle</option>
          <option value="fixed">Fixed colour(s)</option>
        </select>
      </label>
      {#if layer.glowColorMode === 'fixed'}
        <div class="colors">
          {#each layer.glowColors as c, i}
            <div class="color-chip">
              <input type="color" bind:value={layer.glowColors[i]} on:input={bump} />
              {#if layer.glowColors.length > 1}
                <button class="x" on:click={() => removeGlowColor('start', i)} aria-label="Remove start glow colour">✕</button>
              {/if}
            </div>
          {/each}
          <button class="add-color" on:click={() => addGlowColor('start')} title="Add a start glow colour">＋</button>
        </div>
      {/if}

      <label class="field">
        <span>Middle glow colour</span>
        <select bind:value={layer.glowColorMidMode} on:change={bump}>
          <option value="hold">Hold start</option>
          <option value="auto">Follow particle</option>
          <option value="fixed">Fixed colour(s)</option>
        </select>
      </label>
      {#if layer.glowColorMidMode === 'fixed'}
        <div class="colors">
          {#each layer.glowColorsMid as c, i}
            <div class="color-chip">
              <input type="color" bind:value={layer.glowColorsMid[i]} on:input={bump} />
              {#if layer.glowColorsMid.length > 1}
                <button class="x" on:click={() => removeGlowColor('middle', i)} aria-label="Remove middle glow colour">✕</button>
              {/if}
            </div>
          {/each}
          <button class="add-color" on:click={() => addGlowColor('middle')} title="Add a middle glow colour">＋</button>
        </div>
      {/if}

      <label class="field">
        <span>End glow colour</span>
        <select bind:value={layer.glowColorEndMode} on:change={bump}>
          <option value="hold">Hold middle</option>
          <option value="auto">Follow particle</option>
          <option value="fixed">Fixed colour(s)</option>
        </select>
      </label>
      {#if layer.glowColorEndMode === 'fixed'}
        <div class="colors">
          {#each layer.glowColorsEnd as c, i}
            <div class="color-chip">
              <input type="color" bind:value={layer.glowColorsEnd[i]} on:input={bump} />
              {#if layer.glowColorsEnd.length > 1}
                <button class="x" on:click={() => removeGlowColor('end', i)} aria-label="Remove end glow colour">✕</button>
              {/if}
            </div>
          {/each}
          <button class="add-color" on:click={() => addGlowColor('end')} title="Add an end glow colour">＋</button>
        </div>
      {/if}
    {/if}
    {#if layer.glowMode === 'adaptive'}
      <p class="hint">Light rim on dark themes, soft dark rim on light — keeps the particle readable on any background.</p>
    {/if}
  </section>
</div>

<style>
  .controls {
    width: 340px;
    flex: 0 0 auto;
    overflow-y: auto;
    padding-right: 6px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .preset-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .preset-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-faint);
    margin-right: 2px;
  }
  .preset {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--hairline);
  }
  h3 {
    margin: 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--signal);
  }
  .layer-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .chip.active {
    background: var(--signal);
    color: var(--signal-contrast);
    border-color: var(--signal);
  }
  .chip.muted { opacity: 0.45; text-decoration: line-through; }
  .chip.add { padding: 4px 10px; border-style: dashed; }
  .layer-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  .layer-btns { display: flex; gap: 6px; }
  .mini {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    border-radius: 7px;
    padding: 3px 9px;
    font-size: 11px;
    cursor: pointer;
  }
  .mini:disabled { opacity: 0.4; cursor: default; }
  .mini.danger { color: #d96a6a; }
  .ease-row { display: flex; gap: 6px; }
  .ease-btn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-dim);
    border-radius: 8px;
    padding: 4px;
    cursor: pointer;
    line-height: 0;
  }
  .ease-btn.active {
    color: var(--signal);
    border-color: var(--signal);
    box-shadow: 0 0 6px var(--signal-glow);
  }
  .env-row { display: flex; align-items: center; gap: 10px; }
  .env-svg { color: var(--signal); flex: 0 0 auto; opacity: 0.9; }
  .env-sliders { flex: 1 1 auto; display: flex; flex-direction: column; gap: 4px; }
  .env-sliders .field { flex-direction: column; align-items: stretch; gap: 2px; }
  .env-sliders .field input[type='range'] { max-width: none; }
  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .field.col {
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
  }
  .field.check {
    justify-content: flex-start;
    gap: 8px;
  }
  .field b { color: var(--text); font-weight: 600; }
  .field span { flex: 0 0 auto; }
  .field input[type='range'] { flex: 1 1 auto; min-width: 0; max-width: 170px; accent-color: var(--signal); }
  .field input[type='text'],
  .field select,
  .field textarea {
    flex: 1 1 auto;
    min-width: 0;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: 8px;
    color: var(--text);
    font-size: 12px;
    padding: 6px 8px;
    font-family: inherit;
  }
  .field textarea { resize: vertical; }
  .field.check input { width: auto; accent-color: var(--signal); }
  .pair { display: flex; gap: 10px; }
  .pair .field { flex: 1 1 0; flex-direction: column; align-items: stretch; gap: 4px; }
  .pair .field input[type='range'] { max-width: none; }
  .triple { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .triple .field { flex-direction: column; align-items: stretch; gap: 4px; }
  .triple .field input[type='range'] { max-width: none; width: 100%; }
  .phase-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 9px 10px;
    border: 1px solid color-mix(in srgb, var(--signal) 38%, var(--border));
    border-radius: 9px;
    background: color-mix(in srgb, var(--signal) 7%, var(--surface-2));
    color: var(--text-dim);
    font-size: 11px;
  }
  .phase-card b { color: var(--text); font-size: 12px; }
  .single-colour,
  .colour-field { display: flex; align-items: center; gap: 8px; }
  .single-colour input[type='color'],
  .colour-field input[type='color'] {
    width: 44px;
    height: 30px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: none;
    cursor: pointer;
    padding: 2px;
  }
  .colors { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .color-chip { position: relative; }
  .color-chip input[type='color'] {
    width: 34px;
    height: 28px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: none;
    cursor: pointer;
    padding: 2px;
  }
  .color-chip .x {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: var(--surface-3);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 8px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
  }
  .add-color {
    width: 34px;
    height: 28px;
    border-radius: 6px;
    border: 1px dashed var(--border-2);
    background: none;
    color: var(--text-dim);
    font-size: 15px;
    cursor: pointer;
  }
  .hint {
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-faint);
  }
  .hint b { color: var(--text-dim); }
</style>
