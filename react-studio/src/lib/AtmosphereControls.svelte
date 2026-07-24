<script lang="ts">
  import type { ReactConfig } from './reactConfig';
  import {
    ATMOSPHERIC_STUDIES,
    COLOR_MODE_LABELS,
    MAX_ATMOSPHERIC_EFFECTS,
    NARRATIVE_LABELS,
    PHENOMENON_LABELS,
    PHENOMENON_NOTES,
    SOURCE_LABELS,
    cloneAtmosphericStudy,
    newAtmosphericEffect,
    type AtmosphericPhenomenon,
  } from './atmosphere';

  export let config: ReactConfig;

  let active = 0;
  $: effects = config.atmosphere;
  $: if (active >= effects.length) active = Math.max(0, effects.length - 1);
  $: effect = effects[active];

  const bump = () => {
    config = config;
  };

  function loadStudy(key: string) {
    config.atmosphere = cloneAtmosphericStudy(key);
    active = 0;
    bump();
  }

  function addEffect() {
    if (effects.length >= MAX_ATMOSPHERIC_EFFECTS) return;
    config.atmosphere = [...effects, newAtmosphericEffect(effects.length + 1)];
    active = config.atmosphere.length - 1;
    bump();
  }

  function duplicateEffect() {
    if (!effect || effects.length >= MAX_ATMOSPHERIC_EFFECTS) return;
    const copy = {
      ...effect,
      id: `${effect.id}_copy`,
      name: `${effect.name} copy`,
    };
    config.atmosphere = [
      ...effects.slice(0, active + 1),
      copy,
      ...effects.slice(active + 1),
    ];
    active += 1;
    bump();
  }

  function removeEffect() {
    if (!effect) return;
    config.atmosphere = effects.filter((_, i) => i !== active);
    active = Math.max(0, active - 1);
    bump();
  }

  function changePhenomenon(value: string) {
    if (!effect || !(value in PHENOMENON_LABELS)) return;
    const replacement = newAtmosphericEffect(active + 1, value as AtmosphericPhenomenon);
    config.atmosphere[active] = {
      ...replacement,
      id: effect.id,
      name: replacement.name,
      enabled: effect.enabled,
      source: effect.source,
      narrative: effect.narrative,
      x: effect.x,
      y: effect.y,
      delay: effect.delay,
      duration: effect.duration,
      intensity: effect.intensity,
      previewSource: effect.previewSource,
      colorMode: effect.colorMode,
      color: effect.color,
      secondaryColor: effect.secondaryColor,
      tertiaryColor: effect.tertiaryColor,
    };
    bump();
  }
</script>

<section class="atmosphere-controls">
  <div class="heading-row">
    <h3>Atmospheric VFX · Optical field lab</h3>
    <span class="wave">Waves 1 + 2</span>
  </div>
  <p class="intro">
    Optical fields sit beside particle layers. Pick a study, then tune its source,
    target and narrative envelope without changing the background or mobile frame.
  </p>

  <div class="study-row">
    {#each Object.entries(ATMOSPHERIC_STUDIES) as [key, study]}
      <button
        class="study"
        on:click={() => loadStudy(key)}
        title={study.note}
      >{study.label}</button>
    {/each}
  </div>

  <div class="effect-chips">
    {#each effects as item, i}
      <button
        class="chip"
        class:active={i === active}
        class:muted={!item.enabled}
        on:click={() => (active = i)}
      >{item.name || `Effect ${i + 1}`}</button>
    {/each}
    {#if effects.length < MAX_ATMOSPHERIC_EFFECTS}
      <button class="chip add" on:click={addEffect} title="Add an atmospheric effect">＋</button>
    {/if}
  </div>

  {#if !effect}
    <div class="empty">
      No atmospheric layer yet. Load one of the studies or press ＋ to begin.
    </div>
  {:else}
    <label class="field">
      <span>Effect name</span>
      <input type="text" bind:value={effect.name} on:input={bump} />
    </label>
    <div class="actions">
      <label class="field check">
        <input type="checkbox" bind:checked={effect.enabled} on:change={bump} />
        <span>Enabled</span>
      </label>
      <div class="button-row">
        <button class="mini" on:click={duplicateEffect} disabled={effects.length >= MAX_ATMOSPHERIC_EFFECTS}>Duplicate</button>
        <button class="mini danger" on:click={removeEffect}>Delete</button>
      </div>
    </div>

    <label class="field col">
      <span>Optical phenomenon</span>
      <select value={effect.phenomenon} on:change={(event) => changePhenomenon(event.currentTarget.value)}>
        {#each Object.entries(PHENOMENON_LABELS) as [value, label]}
          <option {value}>{label}</option>
        {/each}
      </select>
    </label>
    <p class="phenomenon-note">{PHENOMENON_NOTES[effect.phenomenon]}</p>

    <div class="pair">
      <label class="field col">
        <span>Source</span>
        <select bind:value={effect.source} on:change={bump}>
          {#each Object.entries(SOURCE_LABELS) as [value, label]}
            <option {value}>{label}</option>
          {/each}
        </select>
      </label>
      <label class="field col">
        <span>Narrative</span>
        <select bind:value={effect.narrative} on:change={bump}>
          {#each Object.entries(NARRATIVE_LABELS) as [value, label]}
            <option {value}>{label}</option>
          {/each}
        </select>
      </label>
    </div>

    <div class="pair">
      <label class="field col">
        <span>Source X <b>{effect.x}%</b></span>
        <input type="range" min="5" max="95" bind:value={effect.x} on:input={bump} />
      </label>
      <label class="field col">
        <span>Source Y <b>{effect.y}%</b></span>
        <input type="range" min="8" max="92" bind:value={effect.y} on:input={bump} />
      </label>
    </div>
    <label class="field check">
      <input type="checkbox" bind:checked={effect.previewSource} on:change={bump} />
      <span>Show a source marker when no moon/object is present</span>
    </label>

    <div class="triple">
      <label class="field col">
        <span>Delay <b>{effect.delay.toFixed(1)}s</b></span>
        <input type="range" min="0" max="6" step="0.1" bind:value={effect.delay} on:input={bump} />
      </label>
      <label class="field col">
        <span>Duration <b>{effect.duration.toFixed(1)}s</b></span>
        <input type="range" min="1.5" max="18" step="0.1" bind:value={effect.duration} on:input={bump} />
      </label>
      <label class="field col">
        <span>Intensity <b>{effect.intensity.toFixed(2)}</b></span>
        <input type="range" min="0.05" max="1" step="0.01" bind:value={effect.intensity} on:input={bump} />
      </label>
    </div>

    <label class="field col">
      <span>Optical palette</span>
      <select bind:value={effect.colorMode} on:change={bump}>
        {#each Object.entries(COLOR_MODE_LABELS) as [value, label]}
          <option {value}>{label}</option>
        {/each}
      </select>
    </label>
    {#if effect.colorMode === 'fixed'}
      <div class="palette">
        <label title="Primary optical colour"><span>Primary</span><input type="color" bind:value={effect.color} on:input={bump} /></label>
        <label title="Secondary diffraction colour"><span>Second</span><input type="color" bind:value={effect.secondaryColor} on:input={bump} /></label>
        <label title="Tertiary diffraction colour"><span>Third</span><input type="color" bind:value={effect.tertiaryColor} on:input={bump} /></label>
      </div>
    {/if}

    {#if effect.phenomenon === 'corona'}
      <h4>Corona optics</h4>
      <div class="pair">
        <label class="field col"><span>Ring count <b>{effect.ringCount}</b></span><input type="range" min="1" max="10" bind:value={effect.ringCount} on:input={bump} /></label>
        <label class="field col"><span>Inner radius <b>{effect.innerRadius.toFixed(1)}</b></span><input type="range" min="3" max="28" step="0.5" bind:value={effect.innerRadius} on:input={bump} /></label>
      </div>
      <div class="pair">
        <label class="field col"><span>Ring spacing <b>{effect.ringSpacing.toFixed(1)}</b></span><input type="range" min="1" max="10" step="0.25" bind:value={effect.ringSpacing} on:input={bump} /></label>
        <label class="field col"><span>Softness <b>{effect.softness.toFixed(1)}px</b></span><input type="range" min="0" max="8" step="0.1" bind:value={effect.softness} on:input={bump} /></label>
      </div>
      <div class="triple">
        <label class="field col"><span>Chromatic <b>{effect.chromaticSpread.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.chromaticSpread} on:input={bump} /></label>
        <label class="field col"><span>Opacity <b>{effect.opacity.toFixed(2)}</b></span><input type="range" min="0.05" max="1" step="0.01" bind:value={effect.opacity} on:input={bump} /></label>
        <label class="field col"><span>Asymmetry <b>{effect.radialAsymmetry.toFixed(2)}</b></span><input type="range" min="0" max="0.35" step="0.01" bind:value={effect.radialAsymmetry} on:input={bump} /></label>
      </div>
      <div class="triple">
        <label class="field col"><span>Pulse depth <b>{effect.pulseDepth.toFixed(2)}</b></span><input type="range" min="0" max="0.35" step="0.01" bind:value={effect.pulseDepth} on:input={bump} /></label>
        <label class="field col"><span>Pulse <b>{effect.pulseDuration.toFixed(1)}s</b></span><input type="range" min="1" max="12" step="0.1" bind:value={effect.pulseDuration} on:input={bump} /></label>
        <label class="field col"><span>Scintillation <b>{effect.scintillation.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.scintillation} on:input={bump} /></label>
      </div>
    {:else if effect.phenomenon === 'glory'}
      <h4>Glory optics</h4>
      <div class="triple">
        <label class="field col"><span>Halo diameter <b>{effect.haloDiameter}</b></span><input type="range" min="14" max="90" bind:value={effect.haloDiameter} on:input={bump} /></label>
        <label class="field col"><span>Ring compression <b>{effect.ringCompression.toFixed(2)}</b></span><input type="range" min="0.1" max="1" step="0.01" bind:value={effect.ringCompression} on:input={bump} /></label>
        <label class="field col"><span>Ring visibility <b>{effect.opacity.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.opacity} on:input={bump} /></label>
      </div>
      <div class="triple">
        <label class="field col"><span>Mist density <b>{effect.mistDensity.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.mistDensity} on:input={bump} /></label>
        <label class="field col"><span>Silhouette <b>{effect.silhouetteOpacity.toFixed(2)}</b></span><input type="range" min="0" max="0.8" step="0.01" bind:value={effect.silhouetteOpacity} on:input={bump} /></label>
        <label class="field col"><span>Diffusion <b>{effect.edgeDiffusion.toFixed(1)}</b></span><input type="range" min="0" max="14" step="0.25" bind:value={effect.edgeDiffusion} on:input={bump} /></label>
      </div>
      <div class="triple">
        <label class="field col"><span>Irregularity <b>{effect.radialIrregularity.toFixed(2)}</b></span><input type="range" min="0" max="0.4" step="0.01" bind:value={effect.radialIrregularity} on:input={bump} /></label>
        <label class="field col"><span>Reveal <b>{effect.revealDuration.toFixed(1)}s</b></span><input type="range" min="0.3" max="8" step="0.1" bind:value={effect.revealDuration} on:input={bump} /></label>
        <label class="field col"><span>Mist fade <b>{effect.mistFadeDuration.toFixed(1)}s</b></span><input type="range" min="0.3" max="8" step="0.1" bind:value={effect.mistFadeDuration} on:input={bump} /></label>
      </div>
    {:else if effect.phenomenon === 'moonDogs'}
      <h4>Moon-dog optics</h4>
      <div class="pair">
        <label class="field col"><span>Lateral offset <b>{effect.lateralOffset}</b></span><input type="range" min="8" max="42" bind:value={effect.lateralOffset} on:input={bump} /></label>
        <label class="field col"><span>Pair symmetry <b>{effect.pairSymmetry.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.pairSymmetry} on:input={bump} /></label>
      </div>
      <div class="triple">
        <label class="field col"><span>Fringe <b>{effect.colorFringe.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.colorFringe} on:input={bump} /></label>
        <label class="field col"><span>Brightness <b>{effect.brightness.toFixed(2)}</b></span><input type="range" min="0.05" max="1" step="0.01" bind:value={effect.brightness} on:input={bump} /></label>
        <label class="field col"><span>Onset delay <b>{effect.onsetDelay.toFixed(1)}s</b></span><input type="range" min="0" max="4" step="0.1" bind:value={effect.onsetDelay} on:input={bump} /></label>
      </div>
      <div class="pair">
        <label class="field col"><span>Hover drift <b>{effect.hoverDrift.toFixed(1)}</b></span><input type="range" min="0" max="6" step="0.1" bind:value={effect.hoverDrift} on:input={bump} /></label>
        <label class="field col"><span>Fade order</span><select bind:value={effect.fadeOrder} on:change={bump}><option value="together">Together</option><option value="leftFirst">Left first</option><option value="rightFirst">Right first</option></select></label>
      </div>
    {:else if effect.phenomenon === 'bailyBeads'}
      <h4>Baily’s beads optics</h4>
      <div class="pair">
        <label class="field col"><span>Bead count <b>{effect.beadCount}</b></span><input type="range" min="3" max="18" bind:value={effect.beadCount} on:input={bump} /></label>
        <label class="field col"><span>Rim radius <b>{effect.beadRadius.toFixed(1)}</b></span><input type="range" min="4" max="28" step="0.5" bind:value={effect.beadRadius} on:input={bump} /></label>
      </div>
      <div class="triple">
        <label class="field col"><span>Irregularity <b>{effect.beadIrregularity.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.beadIrregularity} on:input={bump} /></label>
        <label class="field col"><span>Bead size <b>{effect.beadSize.toFixed(1)}px</b></span><input type="range" min="1" max="10" step="0.1" bind:value={effect.beadSize} on:input={bump} /></label>
        <label class="field col"><span>Brightness <b>{effect.beadBrightness.toFixed(2)}</b></span><input type="range" min="0.1" max="1" step="0.01" bind:value={effect.beadBrightness} on:input={bump} /></label>
      </div>
      <div class="triple">
        <label class="field col"><span>Sequence</span><select bind:value={effect.beadSequence} on:change={bump}><option value="irregular">Irregular</option><option value="sequential">Sequential</option></select></label>
        <label class="field col"><span>Ignition spread <b>{effect.ignitionSpread.toFixed(1)}s</b></span><input type="range" min="0.1" max="5" step="0.1" bind:value={effect.ignitionSpread} on:input={bump} /></label>
        <label class="field col"><span>Final flash <b>{effect.finalFlash.toFixed(2)}</b></span><input type="range" min="0" max="1.5" step="0.01" bind:value={effect.finalFlash} on:input={bump} /></label>
      </div>
    {:else if effect.phenomenon === 'lightPillar'}
      <h4>Light-pillar optics</h4>
      <div class="pair">
        <label class="field col"><span>Target X <b>{effect.targetX}%</b></span><input type="range" min="5" max="95" bind:value={effect.targetX} on:input={bump} /></label>
        <label class="field col"><span>Target Y <b>{effect.targetY}%</b></span><input type="range" min="8" max="95" bind:value={effect.targetY} on:input={bump} /></label>
      </div>
      <div class="triple">
        <label class="field col"><span>Width <b>{effect.pillarWidth.toFixed(1)}px</b></span><input type="range" min="1" max="14" step="0.1" bind:value={effect.pillarWidth} on:input={bump} /></label>
        <label class="field col"><span>Taper <b>{effect.pillarTaper.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.pillarTaper} on:input={bump} /></label>
        <label class="field col"><span>Softness <b>{effect.verticalSoftness.toFixed(1)}px</b></span><input type="range" min="0" max="18" step="0.1" bind:value={effect.verticalSoftness} on:input={bump} /></label>
      </div>
      <div class="triple">
        <label class="field col"><span>Core <b>{effect.coreBrightness.toFixed(2)}</b></span><input type="range" min="0.05" max="1" step="0.01" bind:value={effect.coreBrightness} on:input={bump} /></label>
        <label class="field col"><span>Ice crystals <b>{effect.suspendedDensity.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.suspendedDensity} on:input={bump} /></label>
        <label class="field col"><span>After-shimmer <b>{effect.residualShimmer.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.residualShimmer} on:input={bump} /></label>
      </div>
      <div class="triple">
        <label class="field col"><span>Rise <b>{effect.riseTime.toFixed(1)}s</b></span><input type="range" min="0.2" max="6" step="0.1" bind:value={effect.riseTime} on:input={bump} /></label>
        <label class="field col"><span>Hold <b>{effect.holdTime.toFixed(1)}s</b></span><input type="range" min="0.2" max="10" step="0.1" bind:value={effect.holdTime} on:input={bump} /></label>
        <label class="field col"><span>Decay <b>{effect.decayTime.toFixed(1)}s</b></span><input type="range" min="0.2" max="8" step="0.1" bind:value={effect.decayTime} on:input={bump} /></label>
      </div>
    {:else if effect.phenomenon === 'heiligenschein'}
      <h4>Heiligenschein optics</h4>
      <div class="triple">
        <label class="field col"><span>Contact radius <b>{effect.contactRadius}</b></span><input type="range" min="5" max="42" bind:value={effect.contactRadius} on:input={bump} /></label>
        <label class="field col"><span>Dew density <b>{effect.dewDensity.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.dewDensity} on:input={bump} /></label>
        <label class="field col"><span>Retro brightness <b>{effect.retroBrightness.toFixed(2)}</b></span><input type="range" min="0.05" max="1" step="0.01" bind:value={effect.retroBrightness} on:input={bump} /></label>
      </div>
      <div class="triple">
        <label class="field col"><span>Local falloff <b>{effect.localFalloff.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.localFalloff} on:input={bump} /></label>
        <label class="field col"><span>Shimmer <b>{effect.shimmerFrequency.toFixed(1)}s</b></span><input type="range" min="0.8" max="8" step="0.1" bind:value={effect.shimmerFrequency} on:input={bump} /></label>
        <label class="field col"><span>Viewer alignment <b>{effect.viewerAlignment.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.viewerAlignment} on:input={bump} /></label>
      </div>
      <label class="field col"><span>Quiet persistence <b>{effect.dewPersistence.toFixed(2)}</b></span><input type="range" min="0.05" max="1" step="0.01" bind:value={effect.dewPersistence} on:input={bump} /></label>
    {:else if effect.phenomenon === 'virga'}
      <h4>Virga optics</h4>
      <div class="triple">
        <label class="field col"><span>Trail length <b>{effect.trailLength}</b></span><input type="range" min="6" max="65" bind:value={effect.trailLength} on:input={bump} /></label>
        <label class="field col"><span>Evaporates at Y <b>{effect.evaporationHeight}%</b></span><input type="range" min="30" max="94" bind:value={effect.evaporationHeight} on:input={bump} /></label>
        <label class="field col"><span>Strands <b>{effect.strandCount}</b></span><input type="range" min="1" max="28" bind:value={effect.strandCount} on:input={bump} /></label>
      </div>
      <div class="triple">
        <label class="field col"><span>Descent <b>{effect.descentSpeed.toFixed(1)}s</b></span><input type="range" min="1.2" max="12" step="0.1" bind:value={effect.descentSpeed} on:input={bump} /></label>
        <label class="field col"><span>Lateral wind <b>{effect.lateralWind.toFixed(1)}</b></span><input type="range" min="-12" max="12" step="0.1" bind:value={effect.lateralWind} on:input={bump} /></label>
        <label class="field col"><span>Droplet light <b>{effect.dropletBrightness.toFixed(2)}</b></span><input type="range" min="0.05" max="1" step="0.01" bind:value={effect.dropletBrightness} on:input={bump} /></label>
      </div>
      <div class="pair">
        <label class="field col"><span>Evaporation curve</span><select bind:value={effect.virgaFadeCurve} on:change={bump}><option value="soft">Soft and early</option><option value="balanced">Balanced</option><option value="late">Late release</option></select></label>
        <label class="field col"><span>Terminal opacity <b>{effect.terminalOpacity.toFixed(2)}</b></span><input type="range" min="0" max="0.5" step="0.01" bind:value={effect.terminalOpacity} on:input={bump} /></label>
      </div>
    {:else if effect.phenomenon === 'brockenSpectre'}
      <h4>Brocken-spectre projection</h4>
      <div class="triple">
        <label class="field col"><span>Projection scale <b>{effect.projectionScale.toFixed(2)}</b></span><input type="range" min="0.8" max="4" step="0.01" bind:value={effect.projectionScale} on:input={bump} /></label>
        <label class="field col"><span>Perspective <b>{effect.perspectiveStretch.toFixed(2)}</b></span><input type="range" min="0.6" max="2" step="0.01" bind:value={effect.perspectiveStretch} on:input={bump} /></label>
        <label class="field col"><span>Blur <b>{effect.projectionBlur.toFixed(1)}px</b></span><input type="range" min="0" max="18" step="0.1" bind:value={effect.projectionBlur} on:input={bump} /></label>
      </div>
      <div class="triple">
        <label class="field col"><span>Opacity <b>{effect.projectionOpacity.toFixed(2)}</b></span><input type="range" min="0.02" max="0.8" step="0.01" bind:value={effect.projectionOpacity} on:input={bump} /></label>
        <label class="field col"><span>Fog depth <b>{effect.fogDepth.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.fogDepth} on:input={bump} /></label>
        <label class="field col"><span>Motion lag <b>{effect.motionLag.toFixed(1)}s</b></span><input type="range" min="0" max="4" step="0.1" bind:value={effect.motionLag} on:input={bump} /></label>
      </div>
      <div class="pair">
        <label class="field col"><span>Halo <b>{effect.haloIntensity.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.haloIntensity} on:input={bump} /></label>
        <label class="field col"><span>Distortion <b>{effect.distortionNoise.toFixed(2)}</b></span><input type="range" min="0" max="1" step="0.01" bind:value={effect.distortionNoise} on:input={bump} /></label>
      </div>
      <div class="pair">
        <label class="field col"><span>Projection X offset <b>{effect.projectionOffsetX.toFixed(1)}</b></span><input type="range" min="-40" max="40" step="0.5" bind:value={effect.projectionOffsetX} on:input={bump} /></label>
        <label class="field col"><span>Projection Y offset <b>{effect.projectionOffsetY.toFixed(1)}</b></span><input type="range" min="-55" max="35" step="0.5" bind:value={effect.projectionOffsetY} on:input={bump} /></label>
      </div>
    {/if}
  {/if}
</section>

<style>
  .atmosphere-controls {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--signal) 32%, var(--border));
    border-radius: 12px;
    background:
      linear-gradient(150deg, color-mix(in srgb, var(--signal) 7%, transparent), transparent 48%),
      var(--surface-2);
  }
  .heading-row,
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  h3, h4 {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--signal);
  }
  h3 { font-size: 11px; }
  h4 {
    margin-top: 4px;
    font-size: 10px;
    color: var(--text-2);
  }
  .wave {
    padding: 2px 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--signal) 14%, transparent);
    color: var(--signal);
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .intro, .phenomenon-note, .empty {
    margin: 0;
    color: var(--text-faint);
    font-size: 11px;
    line-height: 1.45;
  }
  .phenomenon-note {
    padding: 7px 8px;
    border-left: 2px solid color-mix(in srgb, var(--signal) 42%, transparent);
    background: color-mix(in srgb, var(--signal) 5%, transparent);
  }
  .empty {
    padding: 10px;
    border: 1px dashed var(--border);
    border-radius: 9px;
  }
  .study-row,
  .effect-chips,
  .button-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .study, .chip, .mini {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-2);
    cursor: pointer;
  }
  .study {
    border-radius: 999px;
    padding: 4px 9px;
    font-size: 10px;
  }
  .chip {
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
  }
  .chip.active {
    background: var(--signal);
    color: var(--signal-contrast);
    border-color: var(--signal);
  }
  .chip.muted { opacity: 0.45; text-decoration: line-through; }
  .chip.add { border-style: dashed; }
  .mini {
    border-radius: 7px;
    padding: 3px 8px;
    font-size: 10px;
  }
  .mini:disabled { opacity: 0.4; cursor: default; }
  .mini.danger { color: #d96a6a; }
  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    color: var(--text-dim);
    font-size: 11px;
  }
  .field.col {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
  .field.check {
    justify-content: flex-start;
  }
  .field b { color: var(--text); font-weight: 600; }
  .field input[type='range'] {
    width: 100%;
    min-width: 0;
    accent-color: var(--signal);
  }
  .field input[type='text'],
  .field select {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 5px 7px;
    border: 1px solid var(--border-2);
    border-radius: 7px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .field.check input { accent-color: var(--signal); }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .triple {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }
  .palette {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 7px;
  }
  .palette label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    color: var(--text-faint);
    font-size: 10px;
  }
  .palette input[type='color'] {
    width: 35px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
  }
</style>
