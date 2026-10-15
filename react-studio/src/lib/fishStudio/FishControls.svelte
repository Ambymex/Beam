<script lang="ts">
  // 🐟 2D Fish Studio — Clean & Focused Color, Shading, Glow & VFX Controls
  import {
    FISH_PRESETS,
    BLANK_FISH_CONFIG,
    DEFAULT_EMITTER_LAYER,
    MAX_EMITTERS,
    type FishConfig,
    type DorsalPattern,
    type CrownSpotType,
    type PulseWave,
    type ParticleSocket,
    type ParticleShape,
  } from './fishConfig';

  import SwatchDock from './SwatchDock.svelte';
  import ColorHarmonyWheel from './ColorHarmonyWheel.svelte';
  import { addSwatch } from './fishSwatches';

  export let config: FishConfig;

  let activeTab: 'palette' | 'dorsal' | 'head' | 'glow' | 'emitters' | 'identity' = 'palette';
  let activeEmitterIdx = 0;

  function loadPreset(key: string) {
    if (FISH_PRESETS[key]) {
      config = JSON.parse(JSON.stringify(FISH_PRESETS[key]));
      activeEmitterIdx = 0;
    }
  }

  function resetToBlank() {
    config = JSON.parse(JSON.stringify(BLANK_FISH_CONFIG));
    activeEmitterIdx = 0;
  }

  function addEmitterLayer() {
    if (config.emitters.length >= MAX_EMITTERS) return;
    const newIdx = config.emitters.length + 1;
    const baseCol = config.emission.energy > 0 ? config.emission.color : (config.body.underbellyColor || '#ffd166');
    config.emitters = [
      ...config.emitters,
      {
        ...DEFAULT_EMITTER_LAYER,
        id: `layer_${Date.now()}`,
        name: `VFX Layer ${newIdx}`,
        colorStart: baseCol,
        colorMid: baseCol,
        colorEnd: baseCol,
      },
    ];
    activeEmitterIdx = config.emitters.length - 1;
  }

  function removeEmitterLayer(idx: number) {
    config.emitters = config.emitters.filter((_, i) => i !== idx);
    activeEmitterIdx = Math.max(0, Math.min(activeEmitterIdx, config.emitters.length - 1));
  }

  function randomizeSeed() {
    config.dorsal.seed = Math.floor(Math.random() * 10000);
  }

  let activeColorTarget: string = 'body_base';

  const TARGET_LABELS: Record<string, string> = {
    body_base: 'Base Core',
    body_grad_end: 'Secondary Tone',
    underbelly: 'Underbelly Rim',
    fin_base: 'Pectoral Fin',
    fin_accent: 'Fin Accent',
    tail_base: 'Tail Base',
    tail_accent: 'Tail Accent',
    marking_primary: 'Primary Marking',
    marking_accent: 'Marking Accent',
    whisker: 'Snout Whisker',
    eye: 'Eye Sclera',
    pupil: 'Pupil Glow',
    orbit: 'Eye Orbit Rim',
    crown: 'Crown Color',
    glow: 'Emission Glow',
    vfx_start: 'VFX Core Hue',
    vfx_mid: 'VFX Mid Glow',
    vfx_end: 'VFX Fade Out',
    vfx_glow: 'VFX Bloom Glow',
    vfx_gstart: 'VFX Glow Start',
    vfx_gmid: 'VFX Glow Mid',
    vfx_gend: 'VFX Glow End',
  };

  function getActiveColorValue(): string {
    switch (activeColorTarget) {
      case 'body_base': return config.body.baseColor;
      case 'body_grad_end': return config.body.baseGradientEnd;
      case 'underbelly': return config.body.underbellyColor;
      case 'fin_base': return config.fins.finColor;
      case 'fin_accent': return config.fins.finAccentColor;
      case 'tail_base': return config.tail.baseColor;
      case 'tail_accent': return config.tail.accentColor;
      case 'marking_primary': return config.dorsal.markingColor;
      case 'marking_accent': return config.dorsal.markingSecondaryColor;
      case 'whisker': return config.head.whiskerColor;
      case 'eye': return config.head.eyeColor;
      case 'pupil': return config.head.eyePupilGlow;
      case 'orbit': return config.head.eyeOrbitColor;
      case 'crown': return config.head.crownSpot.color;
      case 'glow': return config.emission.color;
      case 'vfx_start': return config.emitters[activeEmitterIdx]?.colorStart || '#70d6ff';
      case 'vfx_mid': return config.emitters[activeEmitterIdx]?.colorMid || '#ffffff';
      case 'vfx_end': return config.emitters[activeEmitterIdx]?.colorEnd || '#a0c4ff';
      case 'vfx_glow': return config.emitters[activeEmitterIdx]?.glowColor || '#70d6ff';
      case 'vfx_gstart': return config.emitters[activeEmitterIdx]?.glowColorStart || '#70d6ff';
      case 'vfx_gmid': return config.emitters[activeEmitterIdx]?.glowColorMid || '#ffffff';
      case 'vfx_gend': return config.emitters[activeEmitterIdx]?.glowColorEnd || '#a0c4ff';
      default: return config.body.baseColor;
    }
  }

  function handleApplyColor(hex: string) {
    switch (activeColorTarget) {
      case 'body_base': config.body.baseColor = hex; break;
      case 'body_grad_end': config.body.baseGradientEnd = hex; break;
      case 'underbelly': config.body.underbellyColor = hex; break;
      case 'fin_base': config.fins.finColor = hex; break;
      case 'fin_accent': config.fins.finAccentColor = hex; break;
      case 'tail_base': config.tail.baseColor = hex; break;
      case 'tail_accent': config.tail.accentColor = hex; break;
      case 'marking_primary': config.dorsal.markingColor = hex; break;
      case 'marking_accent': config.dorsal.markingSecondaryColor = hex; break;
      case 'whisker': config.head.whiskerColor = hex; break;
      case 'eye': config.head.eyeColor = hex; break;
      case 'pupil': config.head.eyePupilGlow = hex; break;
      case 'orbit': config.head.eyeOrbitColor = hex; break;
      case 'crown': config.head.crownSpot.color = hex; break;
      case 'glow': config.emission.color = hex; break;
      case 'vfx_start':
        if (config.emitters[activeEmitterIdx]) config.emitters[activeEmitterIdx].colorStart = hex;
        break;
      case 'vfx_mid':
        if (config.emitters[activeEmitterIdx]) config.emitters[activeEmitterIdx].colorMid = hex;
        break;
      case 'vfx_end':
        if (config.emitters[activeEmitterIdx]) config.emitters[activeEmitterIdx].colorEnd = hex;
        break;
      case 'vfx_glow':
        if (config.emitters[activeEmitterIdx]) config.emitters[activeEmitterIdx].glowColor = hex;
        break;
      case 'vfx_gstart':
        if (config.emitters[activeEmitterIdx]) config.emitters[activeEmitterIdx].glowColorStart = hex;
        break;
      case 'vfx_gmid':
        if (config.emitters[activeEmitterIdx]) config.emitters[activeEmitterIdx].glowColorMid = hex;
        break;
      case 'vfx_gend':
        if (config.emitters[activeEmitterIdx]) config.emitters[activeEmitterIdx].glowColorEnd = hex;
        break;
      default:
        config.body.baseColor = hex;
        break;
    }
    config = config;
  }

  $: currentActiveColor =
    activeColorTarget === 'body_base'
      ? config.body.baseColor
      : activeColorTarget === 'body_grad_end'
      ? config.body.baseGradientEnd
      : activeColorTarget === 'underbelly'
      ? config.body.underbellyColor
      : activeColorTarget === 'fin_base'
      ? config.fins.finColor
      : activeColorTarget === 'fin_accent'
      ? config.fins.finAccentColor
      : activeColorTarget === 'tail_base'
      ? config.tail.baseColor
      : activeColorTarget === 'tail_accent'
      ? config.tail.accentColor
      : activeColorTarget === 'marking_primary'
      ? config.dorsal.markingColor
      : activeColorTarget === 'marking_accent'
      ? config.dorsal.markingSecondaryColor
      : activeColorTarget === 'whisker'
      ? config.head.whiskerColor
      : activeColorTarget === 'eye'
      ? config.head.eyeColor
      : activeColorTarget === 'pupil'
      ? config.head.eyePupilGlow
      : activeColorTarget === 'orbit'
      ? config.head.eyeOrbitColor
      : activeColorTarget === 'crown'
      ? config.head.crownSpot.color
      : activeColorTarget === 'glow'
      ? config.emission.color
      : activeColorTarget === 'vfx_start'
      ? config.emitters[activeEmitterIdx]?.colorStart || '#70d6ff'
      : activeColorTarget === 'vfx_mid'
      ? config.emitters[activeEmitterIdx]?.colorMid || '#ffffff'
      : activeColorTarget === 'vfx_end'
      ? config.emitters[activeEmitterIdx]?.colorEnd || '#a0c4ff'
      : activeColorTarget === 'vfx_glow'
      ? config.emitters[activeEmitterIdx]?.glowColor || '#70d6ff'
      : activeColorTarget === 'vfx_gstart'
      ? config.emitters[activeEmitterIdx]?.glowColorStart || '#70d6ff'
      : activeColorTarget === 'vfx_gmid'
      ? config.emitters[activeEmitterIdx]?.glowColorMid || '#ffffff'
      : activeColorTarget === 'vfx_gend'
      ? config.emitters[activeEmitterIdx]?.glowColorEnd || '#a0c4ff'
      : config.body.baseColor;

  $: activeTargetName = TARGET_LABELS[activeColorTarget] || 'Base Core';
</script>

<div class="fish-controls">
  <!-- Top Quick Actions Bar -->
  <div class="presets-row">
    <button class="blank-btn" on:click={resetToBlank} title="Reset to a pure clean canvas">
      ✨ Blank Slate
    </button>
    <select class="select-input preset-select" on:change={(e) => loadPreset(e.currentTarget.value)}>
      <option value="">Load Preset…</option>
      {#each Object.entries(FISH_PRESETS) as [key, preset]}
        <option value={key}>{preset.label}</option>
      {/each}
    </select>
  </div>

  <!-- Tabs Navigation -->
  <div class="tabs-nav">
    <button class="tab-btn" class:active={activeTab === 'palette'} on:click={() => { activeTab = 'palette'; activeColorTarget = 'body_base'; }}>
      🎨 Palette
    </button>
    <button class="tab-btn" class:active={activeTab === 'dorsal'} on:click={() => { activeTab = 'dorsal'; activeColorTarget = 'marking_primary'; }}>
      💠 Markings
    </button>
    <button class="tab-btn" class:active={activeTab === 'head'} on:click={() => { activeTab = 'head'; activeColorTarget = 'whisker'; }}>
      👁️ Head & Crown
    </button>
    <button class="tab-btn" class:active={activeTab === 'glow'} on:click={() => { activeTab = 'glow'; activeColorTarget = 'glow'; }}>
      ✨ Glow
    </button>
    <button class="tab-btn" class:active={activeTab === 'emitters'} on:click={() => { activeTab = 'emitters'; activeColorTarget = 'vfx_start'; }}>
      🌟 VFX ({config.emitters.length})
    </button>
    <button class="tab-btn" class:active={activeTab === 'identity'} on:click={() => (activeTab = 'identity')}>
      📜 Identity
    </button>
  </div>

  <!-- Persistent Color Harmony Wheel (Active on all design tabs) -->
  {#if activeTab !== 'identity'}
    <ColorHarmonyWheel
      baseColor={currentActiveColor}
      targetLabel={activeTargetName}
      onApplyColor={handleApplyColor}
    />
  {/if}

  <div class="tab-content">
    <!-- 1. COLOR & PALETTE -->
    {#if activeTab === 'palette'}
      <!-- Body Core & Shading -->
      <div class="section-group">
        <h4 class="section-heading">Body Shading</h4>
        
        <div class="control-row">
          <label for="f-grad-type">Gradient Style</label>
          <select id="f-grad-type" class="select-input" bind:value={config.body.gradientType}>
            <option value="dual_tone">Solid / Dual Tone</option>
            <option value="linear_spine">Linear Spine (Nose → Tail)</option>
            <option value="radial_glow">Radial Center Glow</option>
          </select>
        </div>

        <div class="color-grid">
          <div
            class="color-cell"
            class:active-target={activeColorTarget === 'body_base'}
            on:click={() => (activeColorTarget = 'body_base')}
            on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'body_base')}
            role="button"
            tabindex="0"
          >
            <div class="cell-head">
              <label for="f-base-c">Base Core</label>
              <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.body.baseColor)} title="Add to Swatch Dock">+</button>
            </div>
            <input id="f-base-c" type="color" bind:value={config.body.baseColor} on:focus={() => (activeColorTarget = 'body_base')} />
          </div>

          <div
            class="color-cell"
            class:active-target={activeColorTarget === 'body_grad_end'}
            on:click={() => (activeColorTarget = 'body_grad_end')}
            on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'body_grad_end')}
            role="button"
            tabindex="0"
          >
            <div class="cell-head">
              <label for="f-grad-end">Secondary</label>
              <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.body.baseGradientEnd)} title="Add to Swatch Dock">+</button>
            </div>
            <input id="f-grad-end" type="color" bind:value={config.body.baseGradientEnd} on:focus={() => (activeColorTarget = 'body_grad_end')} />
          </div>

          <div
            class="color-cell"
            class:active-target={activeColorTarget === 'underbelly'}
            on:click={() => (activeColorTarget = 'underbelly')}
            on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'underbelly')}
            role="button"
            tabindex="0"
          >
            <div class="cell-head">
              <label for="f-under-c">Underbelly</label>
              <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.body.underbellyColor)} title="Add to Swatch Dock">+</button>
            </div>
            <input id="f-under-c" type="color" bind:value={config.body.underbellyColor} on:focus={() => (activeColorTarget = 'underbelly')} />
          </div>
        </div>

        <div class="control-row">
          <label for="f-opacity">Body Opacity ({config.body.opacity.toFixed(2)})</label>
          <input id="f-opacity" type="range" min="0.25" max="1.0" step="0.02" bind:value={config.body.opacity} />
        </div>
      </div>

      <!-- Fins & Tail Colors -->
      <div class="section-group">
        <h4 class="section-heading">Fin & Tail Palettes</h4>

        <div class="color-grid">
          <div
            class="color-cell"
            class:active-target={activeColorTarget === 'fin_base'}
            on:click={() => (activeColorTarget = 'fin_base')}
            on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'fin_base')}
            role="button"
            tabindex="0"
          >
            <div class="cell-head">
              <label for="f-fin-c">Pectoral Fin</label>
              <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.fins.finColor)} title="Add to Swatch Dock">+</button>
            </div>
            <input id="f-fin-c" type="color" bind:value={config.fins.finColor} on:focus={() => (activeColorTarget = 'fin_base')} />
          </div>

          <div
            class="color-cell"
            class:active-target={activeColorTarget === 'fin_accent'}
            on:click={() => (activeColorTarget = 'fin_accent')}
            on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'fin_accent')}
            role="button"
            tabindex="0"
          >
            <div class="cell-head">
              <label for="f-fin-ac">Fin Accent</label>
              <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.fins.finAccentColor)} title="Add to Swatch Dock">+</button>
            </div>
            <input id="f-fin-ac" type="color" bind:value={config.fins.finAccentColor} on:focus={() => (activeColorTarget = 'fin_accent')} />
          </div>

          <div
            class="color-cell"
            class:active-target={activeColorTarget === 'tail_base'}
            on:click={() => (activeColorTarget = 'tail_base')}
            on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'tail_base')}
            role="button"
            tabindex="0"
          >
            <div class="cell-head">
              <label for="f-tail-bc">Tail Base</label>
              <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.tail.baseColor)} title="Add to Swatch Dock">+</button>
            </div>
            <input id="f-tail-bc" type="color" bind:value={config.tail.baseColor} on:focus={() => (activeColorTarget = 'tail_base')} />
          </div>

          <div
            class="color-cell"
            class:active-target={activeColorTarget === 'tail_accent'}
            on:click={() => (activeColorTarget = 'tail_accent')}
            on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'tail_accent')}
            role="button"
            tabindex="0"
          >
            <div class="cell-head">
              <label for="f-tail-ac">Tail Accent</label>
              <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.tail.accentColor)} title="Add to Swatch Dock">+</button>
            </div>
            <input id="f-tail-ac" type="color" bind:value={config.tail.accentColor} on:focus={() => (activeColorTarget = 'tail_accent')} />
          </div>
        </div>

        <div class="control-row">
          <label for="f-fin-alpha">Fin Webbing Translucency ({config.fins.transparency.toFixed(2)})</label>
          <input id="f-fin-alpha" type="range" min="0.25" max="0.95" step="0.05" bind:value={config.fins.transparency} />
        </div>
      </div>

    <!-- 2. DORSAL MARKINGS & PATTERNS -->
    {:else if activeTab === 'dorsal'}
      <div class="section-group">
        <h4 class="section-heading">Dorsal Ridge Markings</h4>

        <div class="control-row">
          <label for="f-pattern">Pattern</label>
          <select id="f-pattern" class="select-input" bind:value={config.dorsal.pattern}>
            <option value="plain">None (Clean Slate)</option>
            <option value="calico_patches">Calico Patches (Kohaku/Sanke)</option>
            <option value="metallic_scales">Metallic Diamond Scales</option>
            <option value="lunar_emblem">Lunar Celestial Emblem</option>
            <option value="tempest_lightning">Tempest Lightning Scutes</option>
            <option value="rime_ice_crust">Rime Crystalline Frost Crust</option>
            <option value="stippling">Fine Rain Stippling</option>
          </select>
        </div>

        {#if config.dorsal.pattern === 'plain'}
          <div class="empty-hint">
            <span>✨ No markings selected. Choose a pattern above to paint scutes or scales.</span>
          </div>
        {:else}
          <div class="color-grid">
            <div
              class="color-cell"
              class:active-target={activeColorTarget === 'marking_primary'}
              on:click={() => (activeColorTarget = 'marking_primary')}
              on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'marking_primary')}
              role="button"
              tabindex="0"
            >
              <div class="cell-head">
                <label for="f-mark-c">Primary</label>
                <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.dorsal.markingColor)} title="Add to Swatch Dock">+</button>
              </div>
              <input id="f-mark-c" type="color" bind:value={config.dorsal.markingColor} on:focus={() => (activeColorTarget = 'marking_primary')} />
            </div>

            <div
              class="color-cell"
              class:active-target={activeColorTarget === 'marking_accent'}
              on:click={() => (activeColorTarget = 'marking_accent')}
              on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'marking_accent')}
              role="button"
              tabindex="0"
            >
              <div class="cell-head">
                <label for="f-mark-c2">Accent</label>
                <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.dorsal.markingSecondaryColor)} title="Add to Swatch Dock">+</button>
              </div>
              <input id="f-mark-c2" type="color" bind:value={config.dorsal.markingSecondaryColor} on:focus={() => (activeColorTarget = 'marking_accent')} />
            </div>
          </div>

          <div class="control-row">
            <label for="f-blend">Blend Mode</label>
            <select id="f-blend" class="select-input" bind:value={config.dorsal.blendMode}>
              <option value="source-over">Solid (Source Over)</option>
              <option value="overlay">Overlay</option>
              <option value="screen">Screen (Luminescent)</option>
              <option value="multiply">Multiply (Darkened)</option>
              <option value="color-dodge">Color Dodge</option>
            </select>
          </div>

          <div class="control-row">
            <label for="f-mark-blur">Edge Softness / Blur ({config.dorsal.blur || 0}px)</label>
            <input id="f-mark-blur" type="range" min="0" max="20" step="1" bind:value={config.dorsal.blur} />
          </div>

          <div class="control-row">
            <label for="f-scale-sz">Scale / Detail Size ({config.dorsal.scaleSize}px)</label>
            <input id="f-scale-sz" type="range" min="4" max="24" bind:value={config.dorsal.scaleSize} />
          </div>

          <div class="control-row">
            <label for="f-density">Marking Density ({config.dorsal.density.toFixed(2)})</label>
            <input id="f-density" type="range" min="0.1" max="1.0" step="0.05" bind:value={config.dorsal.density} />
          </div>

          <div class="btn-row">
            <button class="action-btn" on:click={randomizeSeed}>🎲 Re-roll Marking Seed</button>
          </div>
        {/if}
      </div>

    <!-- 3. HEAD, WHISKERS & CROWN -->
    {:else if activeTab === 'head'}
      <div class="section-group">
        <h4 class="section-heading">Whisker & Eye Palettes</h4>

        <div class="color-grid">
          <div
            class="color-cell"
            class:active-target={activeColorTarget === 'whisker'}
            on:click={() => (activeColorTarget = 'whisker')}
            on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'whisker')}
            role="button"
            tabindex="0"
          >
            <div class="cell-head">
              <label for="f-whisk-c">Whisker</label>
              <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.head.whiskerColor)} title="Add to Swatch Dock">+</button>
            </div>
            <input id="f-whisk-c" type="color" bind:value={config.head.whiskerColor} on:focus={() => (activeColorTarget = 'whisker')} />
          </div>

          <div
            class="color-cell"
            class:active-target={activeColorTarget === 'eye'}
            on:click={() => (activeColorTarget = 'eye')}
            on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'eye')}
            role="button"
            tabindex="0"
          >
            <div class="cell-head">
              <label for="f-eye-c">Eye Sclera</label>
              <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.head.eyeColor)} title="Add to Swatch Dock">+</button>
            </div>
            <input id="f-eye-c" type="color" bind:value={config.head.eyeColor} on:focus={() => (activeColorTarget = 'eye')} />
          </div>

          <div
            class="color-cell"
            class:active-target={activeColorTarget === 'pupil'}
            on:click={() => (activeColorTarget = 'pupil')}
            on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'pupil')}
            role="button"
            tabindex="0"
          >
            <div class="cell-head">
              <label for="f-pupil-g">Pupil Glow</label>
              <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.head.eyePupilGlow)} title="Add to Swatch Dock">+</button>
            </div>
            <input id="f-pupil-g" type="color" bind:value={config.head.eyePupilGlow} on:focus={() => (activeColorTarget = 'pupil')} />
          </div>

          <div
            class="color-cell"
            class:active-target={activeColorTarget === 'orbit'}
            on:click={() => (activeColorTarget = 'orbit')}
            on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'orbit')}
            role="button"
            tabindex="0"
          >
            <div class="cell-head">
              <label for="f-orbit-c">Orbit Rim</label>
              <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.head.eyeOrbitColor)} title="Add to Swatch Dock">+</button>
            </div>
            <input id="f-orbit-c" type="color" bind:value={config.head.eyeOrbitColor} on:focus={() => (activeColorTarget = 'orbit')} />
          </div>
        </div>
      </div>

      <div class="section-group">
        <div class="layer-header">
          <h4 class="section-heading">Head Crown Spot</h4>
          <label class="check-switch">
            <input type="checkbox" bind:checked={config.head.crownSpot.enabled} />
            <span class="switch-txt">{config.head.crownSpot.enabled ? 'ON' : 'OFF'}</span>
          </label>
        </div>

        {#if !config.head.crownSpot.enabled}
          <div class="empty-hint">
            <span>Crown emblem is turned off. Toggle switch to add a Tancho disc or celestial star.</span>
          </div>
        {:else}
          <div class="control-row">
            <label for="f-crown-type">Emblem Shape</label>
            <select id="f-crown-type" class="select-input" bind:value={config.head.crownSpot.type}>
              <option value="circle">Tancho Red Disc</option>
              <option value="star">Celestial Star</option>
              <option value="crescent">Lunar Crescent</option>
              <option value="diamond">Faceted Diamond</option>
            </select>
          </div>

          <div class="control-row">
            <label for="f-crown-sz">Crown Size ({config.head.crownSpot.size}px)</label>
            <input id="f-crown-sz" type="range" min="5" max="20" bind:value={config.head.crownSpot.size} />
          </div>

          <div
            class="control-row"
            class:active-target={activeColorTarget === 'crown'}
            on:click={() => (activeColorTarget = 'crown')}
            on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'crown')}
            role="button"
            tabindex="0"
          >
            <label for="f-crown-c">Crown Color</label>
            <div class="row-color-wrap">
              <input id="f-crown-c" class="select-input" type="color" bind:value={config.head.crownSpot.color} on:focus={() => (activeColorTarget = 'crown')} />
              <button type="button" class="add-swatch-mini-row" on:click|stopPropagation={() => addSwatch(config.head.crownSpot.color)} title="Add to Swatch Dock">+</button>
            </div>
          </div>

          <div class="checkbox-row">
            <label class="check-label">
              <input type="checkbox" bind:checked={config.head.crownSpot.glow} />
              Luminescent Crown Glow
            </label>
          </div>
        {/if}
      </div>

    <!-- 4. BIOLUMINESCENCE & GLOW -->
    {:else if activeTab === 'glow'}
      <div class="section-group">
        <h4 class="section-heading">Bioluminescence Engine</h4>

        <div class="control-row">
          <label for="f-emit-nrg">Emission Energy ({config.emission.energy.toFixed(2)} HDR)</label>
          <input id="f-emit-nrg" type="range" min="0.0" max="3.0" step="0.1" bind:value={config.emission.energy} />
        </div>

        {#if config.emission.energy <= 0.01}
          <div class="empty-hint">
            <span>✨ Bioluminescence is currently 0.0 (Matte natural pond fish). Drag slider to add glow!</span>
          </div>
        {:else}
          <div
            class="control-row"
            class:active-target={activeColorTarget === 'glow'}
            on:click={() => (activeColorTarget = 'glow')}
            on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'glow')}
            role="button"
            tabindex="0"
          >
            <label for="f-emit-c">Emission Glow Hue</label>
            <div class="row-color-wrap">
              <input id="f-emit-c" class="select-input" type="color" bind:value={config.emission.color} on:focus={() => (activeColorTarget = 'glow')} />
              <button type="button" class="add-swatch-mini-row" on:click|stopPropagation={() => addSwatch(config.emission.color)} title="Add to Swatch Dock">+</button>
            </div>
          </div>

          <div class="control-row">
            <label for="f-pulse-wv">Pulse Waveform</label>
            <select id="f-pulse-wv" class="select-input" bind:value={config.emission.pulseWave}>
              <option value="static">Static (Constant Glow)</option>
              <option value="sine_heartbeat">Sine Heartbeat</option>
              <option value="lunar_breath">Lunar Breathing Cycle</option>
              <option value="static_crackling">Static Crackling</option>
              <option value="aurora_shimmer">Aurora Shimmer</option>
            </select>
          </div>

          <div class="control-row">
            <label for="f-pulse-spd">Pulse Speed ({config.emission.pulseSpeed.toFixed(1)} Hz)</label>
            <input id="f-pulse-spd" type="range" min="0.3" max="3.5" step="0.1" bind:value={config.emission.pulseSpeed} />
          </div>

          <div class="checkbox-row">
            <label class="check-label">
              <input type="checkbox" bind:checked={config.emission.spineGlow} />
              Spine Filament Glow
            </label>
          </div>

          <div class="checkbox-row">
            <label class="check-label">
              <input type="checkbox" bind:checked={config.emission.finMarginGlow} />
              Fin Margin Halo Bloom
            </label>
          </div>
        {/if}
      </div>

    <!-- 5. VFX EMITTERS (1-4 LAYERS) -->
    {:else if activeTab === 'emitters'}
      <div class="section-group">
        <div class="layer-header">
          <h4 class="section-heading">Particle VFX Sockets</h4>
          {#if config.emitters.length < MAX_EMITTERS}
            <button class="small-btn" on:click={addEmitterLayer}>+ Add Emitter</button>
          {/if}
        </div>

        {#if config.emitters.length === 0}
          <div class="empty-state">
            <p>✨ No active particle emitters.</p>
            <button class="action-btn" on:click={addEmitterLayer}>+ Add First Emitter Layer</button>
          </div>
        {:else}
          <!-- Layer Chips -->
          <div class="chips-bar">
            {#each config.emitters as emitter, idx}
              <button
                class="layer-chip"
                class:selected={activeEmitterIdx === idx}
                on:click={() => (activeEmitterIdx = idx)}
              >
                <span>{emitter.name || `Emitter ${idx + 1}`}</span>
                <span
                  class="chip-del"
                  role="button"
                  tabindex="0"
                  on:click|stopPropagation={() => removeEmitterLayer(idx)}
                  on:keydown|stopPropagation={(e) => e.key === 'Enter' && removeEmitterLayer(idx)}
                >✕</span>
              </button>
            {/each}
          </div>

          {#if config.emitters[activeEmitterIdx]}
            <div class="layer-control-bar">
              <label class="check-switch">
                <input type="checkbox" bind:checked={config.emitters[activeEmitterIdx].enabled} />
                <span class="switch-txt">{config.emitters[activeEmitterIdx].enabled ? 'ACTIVE' : 'MUTED'}</span>
              </label>
              <button class="danger-btn" on:click={() => removeEmitterLayer(activeEmitterIdx)}>
                🗑️ Remove Emitter
              </button>
            </div>

            <div class="control-row">
              <label for="f-em-sock">Anchor Socket</label>
              <select id="f-em-sock" class="select-input" bind:value={config.emitters[activeEmitterIdx].socket}>
                <option value="orbital_ring">Orbital Ring (Revolving)</option>
                <option value="dorsal_crest">Dorsal Spine Crest</option>
                <option value="fin_tips">Trailing Fin & Tail Tips</option>
                <option value="halo_crown">Head Halo Crown</option>
                <option value="submerged_aura">Submerged Ripple Aura</option>
              </select>
            </div>

            <div class="control-row">
              <label for="f-em-shape">Particle Shape</label>
              <select id="f-em-shape" class="select-input" bind:value={config.emitters[activeEmitterIdx].shape}>
                <option value="sparkle">✨ Sparkle Star</option>
                <option value="star">⭐ 5-Point Star</option>
                <option value="snowflake">❄️ Crystalline Snowflake</option>
                <option value="petal">🌸 Sakura Blossom Petal</option>
                <option value="diamond_crystal">💎 Diamond Crystal</option>
                <option value="ice_shard">🧊 Glacial Ice Shard</option>
                <option value="smoke_puff">💨 Smoke / Magma Puff</option>
                <option value="bubble">🫧 Aquatic Bubble</option>
                <option value="lunar_mote">🌙 Lunar Mote</option>
              </select>
            </div>

            <div class="control-row">
              <label for="f-em-szmid">Particle Size ({config.emitters[activeEmitterIdx].sizeMid}px)</label>
              <input id="f-em-szmid" type="range" min="2" max="32" step="1" bind:value={config.emitters[activeEmitterIdx].sizeMid} />
            </div>

            <div class="control-row">
              <label for="f-em-count">Particle Count ({config.emitters[activeEmitterIdx].count})</label>
              <input id="f-em-count" type="range" min="1" max="35" step="1" bind:value={config.emitters[activeEmitterIdx].count} />
            </div>

            {#if config.emitters[activeEmitterIdx].socket === 'orbital_ring'}
              <div class="control-row">
                <label for="f-em-orb-rad">Orbit Radius ({config.emitters[activeEmitterIdx].radialExpansion}px)</label>
                <input id="f-em-orb-rad" type="range" min="15" max="80" step="1" bind:value={config.emitters[activeEmitterIdx].radialExpansion} />
              </div>
              <div class="control-row">
                <label for="f-em-orb-spd">Orbit Speed ({config.emitters[activeEmitterIdx].orbitSpeed.toFixed(1)} rad/s)</label>
                <input id="f-em-orb-spd" type="range" min="-3.0" max="3.0" step="0.2" bind:value={config.emitters[activeEmitterIdx].orbitSpeed} />
              </div>
            {:else}
              <div class="control-row">
                <label for="f-em-drift-spd">Ejection / Drift Speed ({config.emitters[activeEmitterIdx].speed} px/s)</label>
                <input id="f-em-drift-spd" type="range" min="5" max="90" step="2" bind:value={config.emitters[activeEmitterIdx].speed} />
              </div>
            {/if}

            <h5 class="sub-heading">Particle Palette (Core → Mid → End)</h5>
            <div class="color-grid">
              <div
                class="color-cell"
                class:active-target={activeColorTarget === 'vfx_start'}
                on:click={() => (activeColorTarget = 'vfx_start')}
                on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'vfx_start')}
                role="button"
                tabindex="0"
              >
                <div class="cell-head">
                  <label for="f-em-cstart">Core Hue</label>
                  <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.emitters[activeEmitterIdx].colorStart)} title="Add to Swatch Dock">+</button>
                </div>
                <input
                  id="f-em-cstart"
                  type="color"
                  bind:value={config.emitters[activeEmitterIdx].colorStart}
                  on:focus={() => (activeColorTarget = 'vfx_start')}
                  on:input={(e) => {
                    config.emitters[activeEmitterIdx].colorMid = e.currentTarget.value;
                    config.emitters[activeEmitterIdx].colorEnd = e.currentTarget.value;
                  }}
                />
              </div>

              <div
                class="color-cell"
                class:active-target={activeColorTarget === 'vfx_mid'}
                on:click={() => (activeColorTarget = 'vfx_mid')}
                on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'vfx_mid')}
                role="button"
                tabindex="0"
              >
                <div class="cell-head">
                  <label for="f-em-cmid">Mid Glow</label>
                  <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.emitters[activeEmitterIdx].colorMid)} title="Add to Swatch Dock">+</button>
                </div>
                <input id="f-em-cmid" type="color" bind:value={config.emitters[activeEmitterIdx].colorMid} on:focus={() => (activeColorTarget = 'vfx_mid')} />
              </div>

              <div
                class="color-cell"
                class:active-target={activeColorTarget === 'vfx_end'}
                on:click={() => (activeColorTarget = 'vfx_end')}
                on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'vfx_end')}
                role="button"
                tabindex="0"
              >
                <div class="cell-head">
                  <label for="f-em-cend">Fade Out</label>
                  <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.emitters[activeEmitterIdx].colorEnd)} title="Add to Swatch Dock">+</button>
                </div>
                <input id="f-em-cend" type="color" bind:value={config.emitters[activeEmitterIdx].colorEnd} on:focus={() => (activeColorTarget = 'vfx_end')} />
              </div>
            </div>

            <h5 class="sub-heading">Particle Glow (Bloom Halo)</h5>
            <div class="control-row">
              <label for="f-em-glowmode">Glow Mode</label>
              <select id="f-em-glowmode" class="select-input" bind:value={config.emitters[activeEmitterIdx].glowMode}>
                <option value="follow">Follow Particle Color (Auto)</option>
                <option value="fixed">Fixed Single Color</option>
                <option value="envelope">3-Stop Color Envelope</option>
                <option value="none">Disabled (No Glow)</option>
              </select>
            </div>

            {#if config.emitters[activeEmitterIdx].glowMode !== 'none'}
              <div class="control-row">
                <label for="f-em-glowblur">Glow Blur Radius ({config.emitters[activeEmitterIdx].glowBlur}px)</label>
                <input id="f-em-glowblur" type="range" min="0" max="30" step="1" bind:value={config.emitters[activeEmitterIdx].glowBlur} />
              </div>

              {#if config.emitters[activeEmitterIdx].glowMode === 'fixed'}
                <div
                  class="control-row"
                  class:active-target={activeColorTarget === 'vfx_glow'}
                  on:click={() => (activeColorTarget = 'vfx_glow')}
                  on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'vfx_glow')}
                  role="button"
                  tabindex="0"
                >
                  <label for="f-em-glowc">Fixed Glow Color</label>
                  <div class="row-color-wrap">
                    <input id="f-em-glowc" class="select-input" type="color" bind:value={config.emitters[activeEmitterIdx].glowColor} on:focus={() => (activeColorTarget = 'vfx_glow')} />
                    <button type="button" class="add-swatch-mini-row" on:click|stopPropagation={() => addSwatch(config.emitters[activeEmitterIdx].glowColor)} title="Add to Swatch Dock">+</button>
                  </div>
                </div>
              {:else if config.emitters[activeEmitterIdx].glowMode === 'envelope'}
                <div class="color-grid">
                  <div
                    class="color-cell"
                    class:active-target={activeColorTarget === 'vfx_gstart'}
                    on:click={() => (activeColorTarget = 'vfx_gstart')}
                    on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'vfx_gstart')}
                    role="button"
                    tabindex="0"
                  >
                    <div class="cell-head">
                      <label for="f-em-gstart">Glow Start</label>
                      <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.emitters[activeEmitterIdx].glowColorStart)} title="Add to Swatch Dock">+</button>
                    </div>
                    <input id="f-em-gstart" type="color" bind:value={config.emitters[activeEmitterIdx].glowColorStart} on:focus={() => (activeColorTarget = 'vfx_gstart')} />
                  </div>

                  <div
                    class="color-cell"
                    class:active-target={activeColorTarget === 'vfx_gmid'}
                    on:click={() => (activeColorTarget = 'vfx_gmid')}
                    on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'vfx_gmid')}
                    role="button"
                    tabindex="0"
                  >
                    <div class="cell-head">
                      <label for="f-em-gmid">Glow Mid</label>
                      <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.emitters[activeEmitterIdx].glowColorMid)} title="Add to Swatch Dock">+</button>
                    </div>
                    <input id="f-em-gmid" type="color" bind:value={config.emitters[activeEmitterIdx].glowColorMid} on:focus={() => (activeColorTarget = 'vfx_gmid')} />
                  </div>

                  <div
                    class="color-cell"
                    class:active-target={activeColorTarget === 'vfx_gend'}
                    on:click={() => (activeColorTarget = 'vfx_gend')}
                    on:keydown={(e) => e.key === 'Enter' && (activeColorTarget = 'vfx_gend')}
                    role="button"
                    tabindex="0"
                  >
                    <div class="cell-head">
                      <label for="f-em-gend">Glow End</label>
                      <button type="button" class="add-swatch-mini" on:click|stopPropagation={() => addSwatch(config.emitters[activeEmitterIdx].glowColorEnd)} title="Add to Swatch Dock">+</button>
                    </div>
                    <input id="f-em-gend" type="color" bind:value={config.emitters[activeEmitterIdx].glowColorEnd} on:focus={() => (activeColorTarget = 'vfx_gend')} />
                  </div>
                </div>
              {/if}
            {/if}
          {/if}
        {/if}
      </div>

    <!-- 6. SPECIES IDENTITY & ONTOLOGY -->
    {:else if activeTab === 'identity'}
      <div class="section-group">
        <h4 class="section-heading">Species Metadata</h4>

        <div class="control-row">
          <label for="f-id-id">Species ID</label>
          <input id="f-id-id" class="text-input" type="text" bind:value={config.id} />
        </div>

        <div class="control-row">
          <label for="f-id-lbl">Display Label</label>
          <input id="f-id-lbl" class="text-input" type="text" bind:value={config.label} />
        </div>

        <div class="control-row">
          <label for="f-id-fam">Ontology Family</label>
          <input id="f-id-fam" class="text-input" type="text" bind:value={config.family} />
        </div>

        <div class="control-row">
          <label for="f-id-rarity">Rarity Tier</label>
          <select id="f-id-rarity" class="select-input" bind:value={config.rarity}>
            <option value="common">Common</option>
            <option value="uncommon">Uncommon</option>
            <option value="rare">Rare</option>
            <option value="epic">Epic Sovereign</option>
            <option value="legendary">Legendary Sovereign</option>
          </select>
        </div>

        <div class="control-row">
          <label for="f-id-treat">Lore Treatment</label>
          <textarea id="f-id-treat" class="text-input textarea" rows="2" bind:value={config.treatment}></textarea>
        </div>
      </div>
    {/if}
  </div>

  <!-- Persistent Color Palette Swatch Dock (Positioned below all docks) -->
  <SwatchDock
    activeColor={currentActiveColor}
    onApplyColor={handleApplyColor}
  />
</div>

<style>
  .fish-controls {
    display: flex;
    flex-direction: column;
    width: 320px;
    height: 100%;
    overflow: hidden;
    gap: 10px;
  }

  .presets-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: var(--surface-1, rgba(0, 0, 0, 0.2));
    border: 1px solid var(--hairline, var(--border));
    border-radius: 8px;
    flex: 0 0 auto;
  }

  .blank-btn {
    background: var(--signal);
    color: var(--signal-contrast, #000);
    border: 1px solid var(--signal);
    border-radius: 6px;
    padding: 5px 9px;
    font-size: 11.5px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .blank-btn:hover {
    box-shadow: 0 0 8px var(--signal-glow, rgba(112, 214, 255, 0.4));
  }

  .preset-select {
    flex: 1 1 auto;
    font-size: 11.5px;
  }

  .tabs-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    flex: 0 0 auto;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--hairline, var(--border));
  }

  .tab-btn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    border-radius: 6px;
    padding: 5px 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-btn:hover {
    border-color: var(--signal);
    color: var(--text);
  }

  .tab-btn.active {
    background: var(--signal);
    color: var(--signal-contrast, #000);
    border-color: var(--signal);
    box-shadow: 0 0 6px var(--signal-glow, rgba(112, 214, 255, 0.3));
  }

  .tab-content {
    flex: 1 1 auto;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-right: 4px;
  }

  .tab-content::-webkit-scrollbar {
    width: 6px;
  }

  .tab-content::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }

  .section-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--surface-1, rgba(0, 0, 0, 0.1));
    border: 1px solid var(--hairline, var(--border));
    border-radius: 10px;
    padding: 10px 12px;
  }

  .section-heading {
    margin: 0 0 4px;
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .sub-heading {
    margin: 6px 0 2px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-dim);
  }

  .control-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11.5px;
    color: var(--text-2);
  }

  .control-row label {
    font-weight: 500;
  }

  .control-row input[type='range'] {
    accent-color: var(--signal);
    cursor: pointer;
  }

  .select-input,
  .text-input {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 6px;
    padding: 5px 8px;
    font-size: 12px;
    font-family: inherit;
    width: 100%;
  }

  .textarea {
    resize: vertical;
  }

  .color-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(68px, 1fr));
    gap: 8px;
    margin: 4px 0;
  }

  .color-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 10.5px;
    color: var(--text-dim);
  }

  .color-cell input[type='color'] {
    border: 1px solid var(--border);
    border-radius: 6px;
    width: 100%;
    height: 28px;
    background: none;
    cursor: pointer;
    padding: 2px;
  }

  .cell-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .add-swatch-mini {
    background: var(--surface-2, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    color: var(--text-dim);
    border-radius: 3px;
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    transition: all 0.12s ease;
  }

  .add-swatch-mini:hover {
    border-color: var(--signal, #70d6ff);
    color: var(--signal, #70d6ff);
    background: var(--surface-1);
    transform: scale(1.15);
  }

  .row-color-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .add-swatch-mini-row {
    background: var(--surface-2, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.15));
    color: var(--text-dim);
    border-radius: 4px;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
    transition: all 0.12s ease;
    flex: 0 0 auto;
  }

  .add-swatch-mini-row:hover {
    border-color: var(--signal, #70d6ff);
    color: var(--signal, #70d6ff);
    background: var(--surface-1);
    transform: scale(1.08);
  }

  .color-cell.active-target {
    outline: 2px solid var(--signal, #70d6ff);
    outline-offset: 2px;
    border-radius: 6px;
    background: rgba(112, 214, 255, 0.08);
    padding: 2px 3px;
  }

  .control-row.active-target {
    border-left: 2px solid var(--signal, #70d6ff);
    padding-left: 6px;
    background: rgba(112, 214, 255, 0.05);
    border-radius: 4px;
  }

  .empty-hint {
    padding: 8px 10px;
    background: rgba(0, 0, 0, 0.15);
    border: 1px dashed var(--hairline, var(--border));
    border-radius: 6px;
    font-size: 11px;
    color: var(--text-dim);
    line-height: 1.4;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px 8px;
    text-align: center;
    color: var(--text-dim);
    font-size: 11.5px;
  }

  .layer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .check-switch {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
  }

  .switch-txt {
    color: var(--signal);
  }

  .chips-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 4px 0;
  }

  .layer-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
  }

  .layer-chip.selected {
    border-color: var(--signal);
    color: var(--text);
    font-weight: 700;
  }

  .chip-del {
    color: var(--text-dim);
    font-size: 10px;
    padding: 0 2px;
  }

  .chip-del:hover {
    color: var(--signal);
  }

  .btn-row {
    margin-top: 4px;
  }

  .action-btn,
  .small-btn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .small-btn {
    padding: 3px 8px;
    font-size: 10.5px;
  }

  .layer-control-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    margin: 2px 0 6px;
  }

  .danger-btn {
    background: rgba(230, 57, 70, 0.15);
    border: 1px solid rgba(230, 57, 70, 0.4);
    color: #ff6b6b;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .danger-btn:hover {
    background: rgba(230, 57, 70, 0.35);
    border-color: #ff6b6b;
    color: #fff;
  }

  .action-btn:hover,
  .small-btn:hover {
    border-color: var(--signal);
    color: var(--text);
  }
</style>
