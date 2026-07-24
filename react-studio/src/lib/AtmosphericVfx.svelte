<script lang="ts">
  import {
    resolvedAtmosphericColors,
    type AtmosphericEffectConfig,
    type NarrativeEnvelope,
  } from './atmosphere';

  export let effects: AtmosphericEffectConfig[] = [];
  export let sourcePresent = false;

  const NARRATIVE_SCALE: Record<NarrativeEnvelope, [number, number, number]> = {
    gather: [0.84, 1, 1.02],
    recognise: [0.9, 1.035, 1],
    consider: [0.94, 1, 0.98],
    commit: [0.76, 1, 1],
    offer: [0.9, 1.06, 1.03],
    refuse: [1, 0.94, 0.84],
    release: [0.92, 1.04, 1.12],
    settle: [0.86, 1.04, 1],
    remain: [0.96, 1, 1],
  };

  const indices = (count: number): number[] =>
    Array.from({ length: Math.max(1, Math.round(count)) }, (_, i) => i);

  function rootStyle(effect: AtmosphericEffectConfig): string {
    const [c0, c1, c2] = resolvedAtmosphericColors(effect);
    const [n0, n1, n2] = NARRATIVE_SCALE[effect.narrative];
    return `
      --x:${effect.x}%; --y:${effect.y}%;
      --delay:${effect.delay}s; --duration:${effect.duration}s;
      --intensity:${effect.intensity}; --c0:${c0}; --c1:${c1}; --c2:${c2};
      --n0:${n0}; --n1:${n1}; --n2:${n2};
    `;
  }

  function coronaRingStyle(effect: AtmosphericEffectConfig, i: number): string {
    const diameter = (effect.innerRadius + i * effect.ringSpacing) * 2;
    const fade = 1 - (i / Math.max(effect.ringCount - 1, 1)) * 0.38;
    const ellipse = 1 + Math.sin((i + 1) * 2.17) * effect.radialAsymmetry;
    return `
      --diameter:${diameter}cqmin; --ring-opacity:${effect.opacity * fade};
      --softness:${effect.softness}px; --ellipse:${ellipse};
      --pulse-depth:${effect.pulseDepth}; --pulse-duration:${effect.pulseDuration}s;
      --phase:${(-i * 0.37).toFixed(2)}s; --scintillation:${effect.scintillation};
      --ring-colour:${i % 3 === 0 ? 'var(--c0)' : i % 3 === 1 ? 'var(--c1)' : 'var(--c2)'};
      --chromatic:${effect.chromaticSpread};
    `;
  }

  function gloryRingStyle(effect: AtmosphericEffectConfig, i: number): string {
    const count = Math.max(3, Math.round(effect.ringCount));
    const step = (effect.haloDiameter * (1 - effect.ringCompression * 0.52)) / count;
    const diameter = effect.haloDiameter - i * step;
    const ellipse = 1 + Math.sin((i + 2) * 1.73) * effect.radialIrregularity;
    return `
      --diameter:${diameter}cqmin; --ellipse:${ellipse};
      --ring-opacity:${effect.opacity * (0.78 - i / count * 0.28)};
      --softness:${effect.edgeDiffusion * 0.34}px;
      --ring-colour:${i % 3 === 0 ? 'var(--c0)' : i % 3 === 1 ? 'var(--c1)' : 'var(--c2)'};
      animation-delay:${(-i * 0.24).toFixed(2)}s;
    `;
  }

  function dogStyle(effect: AtmosphericEffectConfig, side: -1 | 1): string {
    const imbalance = (1 - effect.pairSymmetry) * side;
    const yShift = imbalance * 4;
    const onset = side === -1 ? 0 : effect.onsetDelay;
    const fadeBias = effect.fadeOrder === 'together'
      ? 0
      : effect.fadeOrder === 'leftFirst'
        ? (side === -1 ? -0.5 : 0.25)
        : (side === 1 ? -0.5 : 0.25);
    return `
      left:calc(${effect.x}% + ${side * effect.lateralOffset}cqmin);
      top:calc(${effect.y}% + ${yShift}cqmin);
      --dog-brightness:${Math.max(0, effect.brightness + imbalance * 0.12)};
      --fringe:${effect.colorFringe}; --drift:${effect.hoverDrift}cqmin;
      --dog-delay:${effect.delay + onset}s; --dog-duration:${Math.max(1, effect.duration + fadeBias)}s;
    `;
  }

  function noise(seed: number): number {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function beadStyle(effect: AtmosphericEffectConfig, i: number): string {
    const count = Math.max(3, Math.round(effect.beadCount));
    const jitter = (noise(i + 1) * 2 - 1) * effect.beadIrregularity;
    const angle = -90 + (i / count) * 360 + jitter * 14;
    const radius = effect.beadRadius * (1 + jitter * 0.12);
    const x = Math.cos((angle * Math.PI) / 180) * radius;
    const y = Math.sin((angle * Math.PI) / 180) * radius;
    const order = effect.beadSequence === 'sequential'
      ? i / count
      : noise(i * 3.71 + 4);
    const size = effect.beadSize * (0.76 + noise(i + 20) * 0.48);
    return `
      left:calc(${effect.x}% + ${x.toFixed(2)}cqmin);
      top:calc(${effect.y}% + ${y.toFixed(2)}cqmin);
      --bead-size:${size.toFixed(2)}px; --bead-brightness:${effect.beadBrightness};
      --bead-delay:${(effect.delay + order * effect.ignitionSpread).toFixed(3)}s;
      --bead-duration:${Math.max(1.4, effect.duration - order * effect.ignitionSpread).toFixed(3)}s;
      --final-flash:${effect.finalFlash};
    `;
  }

  function pillarSparkStyle(effect: AtmosphericEffectConfig, i: number): string {
    const count = Math.max(3, Math.round(4 + effect.suspendedDensity * 22));
    const progress = (i + 0.5) / count;
    const jitter = (noise(i * 2.71 + 8) * 2 - 1) * effect.pillarWidth * 0.42;
    const x = effect.x + (effect.targetX - effect.x) * progress + jitter;
    const y = effect.y + (effect.targetY - effect.y) * progress;
    const size = 1 + noise(i + 31) * 2.2;
    return `
      left:${x.toFixed(2)}%; top:${y.toFixed(2)}%;
      --spark-size:${size.toFixed(2)}px;
      --spark-delay:${(effect.delay + effect.riseTime * progress).toFixed(2)}s;
      --spark-duration:${Math.max(1.2, effect.holdTime + effect.decayTime).toFixed(2)}s;
      --spark-drift:${((noise(i + 77) * 2 - 1) * 1.8).toFixed(2)}cqmin;
      --spark-opacity:${Math.min(1, 0.18 + effect.suspendedDensity * 0.52 + effect.residualShimmer * 0.3).toFixed(2)};
    `;
  }

  function dewStyle(effect: AtmosphericEffectConfig, i: number): string {
    const count = Math.max(5, Math.round(7 + effect.dewDensity * 34));
    const angle = noise(i * 3.13 + 2) * Math.PI * 2;
    const radius = Math.sqrt(noise(i * 4.71 + 9)) * effect.contactRadius;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * 0.34;
    const size = 1 + noise(i + 48) * 2.4;
    const alignment = effect.viewerAlignment * (1 - Math.min(1, radius / effect.contactRadius));
    return `
      left:calc(${effect.x}% + ${x.toFixed(2)}cqmin);
      top:calc(${effect.y}% + ${y.toFixed(2)}cqmin);
      --dew-size:${size.toFixed(2)}px;
      --dew-delay:${(effect.delay + noise(i + 12) * effect.shimmerFrequency).toFixed(2)}s;
      --dew-period:${Math.max(1.2, effect.shimmerFrequency + noise(i + 64) * 2).toFixed(2)}s;
      --dew-brightness:${Math.min(1, effect.retroBrightness + alignment).toFixed(2)};
    `;
  }

  function virgaStyle(effect: AtmosphericEffectConfig, i: number): string {
    const count = Math.max(1, Math.round(effect.strandCount));
    const spread = Math.min(34, 9 + count * 1.15);
    const x = effect.x + ((i + 0.5) / count - 0.5) * spread + (noise(i + 21) * 2 - 1) * 2.2;
    const available = Math.max(3, effect.evaporationHeight - effect.y);
    const length = Math.min(effect.trailLength * (0.72 + noise(i + 44) * 0.32), available);
    const fadeStop = effect.virgaFadeCurve === 'soft'
      ? 52
      : effect.virgaFadeCurve === 'balanced'
        ? 68
        : 82;
    return `
      left:${x.toFixed(2)}%; top:${effect.y}%;
      --trail-length:${length.toFixed(2)}%;
      --virga-delay:${(effect.delay + noise(i + 6) * 1.4).toFixed(2)}s;
      --virga-speed:${Math.max(1.2, effect.descentSpeed * (0.82 + noise(i + 70) * 0.35)).toFixed(2)}s;
      --virga-wind:${((noise(i + 95) * 0.45 + 0.55) * effect.lateralWind).toFixed(2)}cqmin;
      --droplet-brightness:${effect.dropletBrightness};
      --terminal-opacity:${effect.terminalOpacity};
      --fade-stop:${fadeStop}%;
    `;
  }

  function spectreWispStyle(effect: AtmosphericEffectConfig, i: number): string {
    const angle = noise(i * 2.81 + 5) * Math.PI * 2;
    const radius = 24 + noise(i * 4.17 + 18) * 34;
    const x = 50 + Math.cos(angle) * radius;
    const y = 48 + Math.sin(angle) * radius * 0.72;
    const width = 5 + noise(i + 40) * 8;
    const height = 28 + noise(i + 71) * 38;
    return `
      left:${x.toFixed(2)}%; top:${y.toFixed(2)}%;
      --wisp-width:${width.toFixed(2)}%;
      --wisp-height:${height.toFixed(2)}%;
      --wisp-delay:${(-noise(i + 92) * 7).toFixed(2)}s;
      --wisp-period:${(5.8 + noise(i + 113) * 4.2).toFixed(2)}s;
      --wisp-turn:${((noise(i + 137) * 2 - 1) * 24).toFixed(1)}deg;
      --wisp-drift:${((noise(i + 151) * 2 - 1) * (7 + effect.distortionNoise * 12)).toFixed(2)}%;
    `;
  }
</script>

<div class="atmospheric-stack" aria-hidden="true">
  {#each effects.filter((effect) => effect.enabled) as effect (effect.id)}
    <div
      class="atmospheric-effect {effect.phenomenon}"
      data-narrative={effect.narrative}
      style={rootStyle(effect)}
    >
      {#if effect.phenomenon === 'corona'}
        <div class="corona-field">
          {#each indices(effect.ringCount) as i}
            <span class="corona-ring" style={coronaRingStyle(effect, i)}></span>
          {/each}
        </div>
      {:else if effect.phenomenon === 'glory'}
        <div
          class="glory-mist"
          style={`
            --halo:${effect.haloDiameter * 1.38}cqmin;
            --mist-density:${effect.mistDensity};
            --mist-softness:${effect.edgeDiffusion}px;
            --reveal:${effect.revealDuration}s;
            --mist-fade:${effect.mistFadeDuration}s;
            --effect-delay:${effect.delay}s;
            --mist-out-delay:${Math.max(
              effect.delay + effect.duration - effect.mistFadeDuration,
              effect.delay
            )}s;
          `}
        ></div>
        <div class="glory-field">
          {#if effect.opacity > 0.01}
            {#each indices(Math.max(3, effect.ringCount)) as i}
              <span class="glory-ring" style={gloryRingStyle(effect, i)}></span>
            {/each}
          {/if}
          <span
            class="presence-silhouette"
            style={`--silhouette-opacity:${effect.silhouetteOpacity}; --silhouette-blur:${effect.edgeDiffusion * 0.42}px;`}
          >
            <i class="presence-head"></i>
            <i class="presence-body"></i>
          </span>
        </div>
      {:else if effect.phenomenon === 'moonDogs'}
        <div
          class="dog-arc"
          style={`left:${effect.x}%; top:${effect.y}%; --arc-width:${effect.lateralOffset * 2.25}cqmin; --arc-opacity:${effect.brightness * 0.16};`}
        ></div>
        <span class="moon-dog left" style={dogStyle(effect, -1)}></span>
        <span class="moon-dog right" style={dogStyle(effect, 1)}></span>
      {:else if effect.phenomenon === 'bailyBeads'}
        {#each indices(effect.beadCount) as i}
          <span
            class="bead"
            class:final={i === Math.max(3, Math.round(effect.beadCount)) - 1}
            style={beadStyle(effect, i)}
          ></span>
        {/each}
      {:else if effect.phenomenon === 'lightPillar'}
        <svg
          class="pillar-field"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={`
            --pillar-width:${effect.pillarWidth}px;
            --pillar-softness:${effect.verticalSoftness}px;
            --pillar-core:${effect.coreBrightness};
            --pillar-taper:${effect.pillarTaper};
            --rise:${effect.riseTime}s;
            --hold:${effect.holdTime}s;
            --decay:${effect.decayTime}s;
          `}
        >
          <line
            class="pillar-haze"
            x1={effect.x}
            y1={effect.y}
            x2={effect.targetX}
            y2={effect.targetY}
            pathLength="1"
          ></line>
          <line
            class="pillar-core"
            x1={effect.x}
            y1={effect.y}
            x2={effect.targetX}
            y2={effect.targetY}
            pathLength="1"
          ></line>
        </svg>
        <span
          class="pillar-target"
          style={`left:${effect.targetX}%; top:${effect.targetY}%; --target-glow:${effect.coreBrightness};`}
        ></span>
        {#each indices(4 + effect.suspendedDensity * 22) as i}
          <i class="pillar-spark" style={pillarSparkStyle(effect, i)}></i>
        {/each}
      {:else if effect.phenomenon === 'heiligenschein'}
        <div
          class="dew-halo"
          style={`
            left:${effect.x}%; top:${effect.y}%;
            --contact-radius:${effect.contactRadius * 2}cqmin;
            --retro:${effect.retroBrightness};
            --falloff:${effect.localFalloff};
            --persistence:${effect.dewPersistence};
          `}
        ></div>
        {#each indices(7 + effect.dewDensity * 34) as i}
          <i class="dew-point" style={dewStyle(effect, i)}></i>
        {/each}
      {:else if effect.phenomenon === 'virga'}
        <div
          class="virga-veil"
          style={`left:${effect.x}%; top:${effect.y}%; --veil-width:${Math.min(42, 14 + effect.strandCount * 1.4)}cqmin;`}
        ></div>
        {#each indices(effect.strandCount) as i}
          <i class="virga-strand" style={virgaStyle(effect, i)}></i>
        {/each}
      {:else if effect.phenomenon === 'brockenSpectre'}
        <div
          class="spectre-field"
          style={`
            left:calc(${effect.x}% + ${effect.projectionOffsetX}cqmin);
            top:calc(${effect.y}% + ${effect.projectionOffsetY}cqmin);
            --projection-scale:${effect.projectionScale};
            --projection-stretch:${effect.perspectiveStretch};
            --projection-blur:${effect.projectionBlur}px;
            --projection-opacity:${effect.projectionOpacity};
            --fog-depth:${effect.fogDepth};
            --motion-lag:${effect.motionLag}s;
            --spectre-halo:${effect.haloIntensity};
            --distortion:${effect.distortionNoise};
          `}
        >
          <span class="spectre-fog"></span>
          <span class="spectre-glory">
            <i></i><i></i><i></i>
          </span>
          <span class="spectre-aura">
            {#each indices(9) as i}
              <i class="spectre-wisp" style={spectreWispStyle(effect, i)}></i>
            {/each}
          </span>
          <span class="spectre-silhouette">
            <i class="spectre-head"></i>
            <i class="spectre-body"></i>
            <i class="spectre-arm left"></i>
            <i class="spectre-arm right"></i>
          </span>
        </div>
      {/if}

      {#if effect.previewSource && !sourcePresent}
        <span class="source-guide" class:body-source={effect.source === 'baily'}>
          {#if effect.source === 'baily'}
            <i class="source-head"></i>
            <i class="source-body"></i>
          {/if}
        </span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .atmospheric-stack,
  .atmospheric-effect {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .atmospheric-stack { z-index: 0; }
  .atmospheric-effect {
    opacity: 0;
    transform-origin: var(--x) var(--y);
    animation: atmospheric-envelope var(--duration) cubic-bezier(0.35, 0, 0.2, 1) var(--delay) both;
  }
  @keyframes atmospheric-envelope {
    0% { opacity: 0; transform: scale(var(--n0)); }
    18% { opacity: var(--intensity); transform: scale(var(--n1)); }
    74% { opacity: var(--intensity); transform: scale(var(--n1)); }
    100% { opacity: 0; transform: scale(var(--n2)); }
  }
  .atmospheric-effect[data-narrative='remain'] {
    animation-name: atmospheric-remain;
  }
  @keyframes atmospheric-remain {
    0% { opacity: 0; transform: scale(var(--n0)); }
    24%, 100% { opacity: var(--intensity); transform: scale(var(--n1)); }
  }
  .atmospheric-effect[data-narrative='refuse'] {
    animation-timing-function: cubic-bezier(0.42, 0, 0.72, 0.55);
  }

  .corona-field,
  .glory-field {
    position: absolute;
    inset: 0;
  }
  .corona-ring,
  .glory-ring {
    position: absolute;
    left: var(--x);
    top: var(--y);
    width: var(--diameter);
    aspect-ratio: 1;
    box-sizing: border-box;
    border-radius: 50%;
    border: 1.5px solid var(--ring-colour);
    opacity: var(--ring-opacity);
    filter:
      blur(var(--softness))
      drop-shadow(0 0 calc(2px + var(--softness)) var(--ring-colour));
    transform: translate(-50%, -50%) scaleX(var(--ellipse));
  }
  .corona-ring {
    box-shadow:
      calc(var(--chromatic) * 3px) 0 calc(var(--chromatic) * 5px) color-mix(in srgb, var(--c1) 62%, transparent),
      calc(var(--chromatic) * -3px) 0 calc(var(--chromatic) * 5px) color-mix(in srgb, var(--c2) 54%, transparent);
    animation: corona-breathe var(--pulse-duration) ease-in-out var(--phase) infinite alternate;
  }
  @keyframes corona-breathe {
    from {
      opacity: calc(var(--ring-opacity) * (0.88 - var(--scintillation) * 0.2));
      transform: translate(-50%, -50%) scaleX(var(--ellipse)) scale(1);
    }
    to {
      opacity: min(1, calc(var(--ring-opacity) * (1 + var(--scintillation) * 0.42)));
      transform: translate(-50%, -50%) scaleX(var(--ellipse)) scale(calc(1 + var(--pulse-depth)));
    }
  }

  .glory-mist {
    position: absolute;
    left: var(--x);
    top: var(--y);
    width: var(--halo);
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background:
      radial-gradient(circle, color-mix(in srgb, var(--c0) calc(var(--mist-density) * 42%), transparent) 0 18%, transparent 58%),
      radial-gradient(circle, transparent 34%, color-mix(in srgb, var(--c1) calc(var(--mist-density) * 34%), transparent) 56%, transparent 76%);
    filter: blur(var(--mist-softness));
    animation:
      glory-mist-in var(--reveal) ease-out var(--effect-delay) both,
      glory-mist-breathe 5.8s ease-in-out calc(var(--effect-delay) + var(--reveal)) infinite alternate,
      glory-mist-out var(--mist-fade) ease-in var(--mist-out-delay) forwards;
  }
  @keyframes glory-mist-in {
    from { opacity: 0; transform: translate(-50%, -50%) scale(0.84); }
    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
  @keyframes glory-mist-breathe {
    from { transform: translate(-50%, -50%) scale(0.98); }
    to { transform: translate(-50%, -50%) scale(1.035); }
  }
  @keyframes glory-mist-out {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  .glory-ring {
    animation: glory-drift 5.2s ease-in-out infinite alternate;
  }
  @keyframes glory-drift {
    from { transform: translate(-50%, -50%) scaleX(var(--ellipse)) scale(0.985); }
    to { transform: translate(-50%, -50%) scaleX(var(--ellipse)) scale(1.02); }
  }
  .presence-silhouette {
    position: absolute;
    left: var(--x);
    top: var(--y);
    width: 7cqmin;
    height: 12cqmin;
    transform: translate(-50%, -48%);
    opacity: var(--silhouette-opacity);
    filter: blur(var(--silhouette-blur));
  }
  .presence-head,
  .presence-body {
    position: absolute;
    display: block;
    left: 50%;
    transform: translateX(-50%);
    background: color-mix(in srgb, var(--c0) 18%, #10131d);
    box-shadow: 0 0 12px color-mix(in srgb, var(--c0) 22%, transparent);
  }
  .presence-head {
    top: 2%;
    width: 48%;
    aspect-ratio: 1;
    border-radius: 50%;
  }
  .presence-body {
    bottom: 0;
    width: 76%;
    height: 72%;
    border-radius: 48% 48% 34% 34%;
  }

  .dog-arc {
    position: absolute;
    width: var(--arc-width);
    height: calc(var(--arc-width) * 0.5);
    transform: translate(-50%, -50%);
    border-top: 1px solid var(--c0);
    border-radius: 50% 50% 0 0;
    opacity: var(--arc-opacity);
    filter: blur(1.2px);
  }
  .moon-dog {
    position: absolute;
    width: 5.5cqmin;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    opacity: 0;
    background:
      radial-gradient(circle,
        color-mix(in srgb, white 84%, var(--c0)) 0 8%,
        color-mix(in srgb, var(--c0) 84%, transparent) 20%,
        color-mix(in srgb, var(--c1) calc(var(--fringe) * 56%), transparent) 46%,
        color-mix(in srgb, var(--c2) calc(var(--fringe) * 38%), transparent) 62%,
        transparent 76%);
    filter: drop-shadow(0 0 7px color-mix(in srgb, var(--c0) 66%, transparent));
    animation: dog-arrive var(--dog-duration) ease-in-out var(--dog-delay) both;
  }
  @keyframes dog-arrive {
    0% { opacity: 0; transform: translate(-50%, -50%) translateY(var(--drift)) scale(0.72); }
    24% { opacity: var(--dog-brightness); transform: translate(-50%, -50%) translateY(0) scale(1); }
    72% { opacity: var(--dog-brightness); transform: translate(-50%, -50%) translateY(calc(var(--drift) * -0.45)) scale(1.03); }
    100% { opacity: 0; transform: translate(-50%, -50%) translateY(calc(var(--drift) * -0.8)) scale(0.94); }
  }

  .bead {
    position: absolute;
    width: var(--bead-size);
    aspect-ratio: 1;
    margin-left: calc(var(--bead-size) / -2);
    margin-top: calc(var(--bead-size) / -2);
    border-radius: 50%;
    opacity: 0;
    background: color-mix(in srgb, white 76%, var(--c0));
    box-shadow:
      0 0 calc(var(--bead-size) * 1.4) color-mix(in srgb, var(--c0) 92%, transparent),
      0 0 calc(var(--bead-size) * 3.2) color-mix(in srgb, var(--c1) 64%, transparent);
    animation: bead-ignite var(--bead-duration) linear var(--bead-delay) both;
  }
  .bead.final {
    animation-name: bead-final;
  }
  @keyframes bead-ignite {
    0%, 18% { opacity: 0; transform: scale(0.35); }
    27% { opacity: var(--bead-brightness); transform: scale(1.45); }
    38% { opacity: calc(var(--bead-brightness) * 0.72); transform: scale(0.86); }
    58% { opacity: calc(var(--bead-brightness) * 0.26); transform: scale(0.62); }
    70%, 100% { opacity: 0; transform: scale(0.25); }
  }
  @keyframes bead-final {
    0%, 24% { opacity: 0; transform: scale(0.3); }
    34% { opacity: var(--bead-brightness); transform: scale(calc(1.35 + var(--final-flash))); }
    48% { opacity: calc(var(--bead-brightness) * 0.78); transform: scale(1); }
    68%, 100% { opacity: 0; transform: scale(0.3); }
  }

  .pillar-field {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .pillar-field line {
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    fill: none;
  }
  .pillar-haze {
    stroke: color-mix(in srgb, var(--c1) 68%, transparent);
    stroke-width: calc(var(--pillar-width) * 2.8);
    opacity: calc(0.16 + var(--pillar-taper) * 0.22);
    filter: blur(var(--pillar-softness));
  }
  .pillar-core {
    stroke: color-mix(in srgb, white 56%, var(--c0));
    stroke-width: var(--pillar-width);
    opacity: var(--pillar-core);
    filter:
      drop-shadow(0 0 3px var(--c0))
      drop-shadow(0 0 calc(var(--pillar-softness) * 0.7) var(--c1));
    animation: pillar-condense calc(var(--rise) + var(--hold) + var(--decay)) ease-in-out var(--delay) both;
  }
  @keyframes pillar-condense {
    0% { opacity: 0; stroke-width: calc(var(--pillar-width) * 0.18); }
    24% { opacity: var(--pillar-core); stroke-width: var(--pillar-width); }
    72% { opacity: var(--pillar-core); stroke-width: calc(var(--pillar-width) * 0.84); }
    100% { opacity: 0; stroke-width: calc(var(--pillar-width) * 0.24); }
  }
  .pillar-target {
    position: absolute;
    width: 11cqmin;
    aspect-ratio: 2.5;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: radial-gradient(ellipse, color-mix(in srgb, var(--c0) 46%, transparent), transparent 70%);
    filter: blur(2.5px);
    opacity: 0;
    animation: target-receive calc(var(--duration) * 0.72) ease-out calc(var(--delay) + var(--rise) * 0.72) both;
  }
  @keyframes target-receive {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
    35%, 70% { opacity: calc(var(--target-glow) * 0.66); transform: translate(-50%, -50%) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.28); }
  }
  .pillar-spark {
    position: absolute;
    width: var(--spark-size);
    aspect-ratio: 1;
    margin: calc(var(--spark-size) / -2);
    border-radius: 50%;
    background: color-mix(in srgb, white 72%, var(--c0));
    box-shadow: 0 0 5px var(--c1);
    opacity: 0;
    animation: pillar-suspend var(--spark-duration) ease-in-out var(--spark-delay) both;
  }
  @keyframes pillar-suspend {
    0% { opacity: 0; transform: translateX(var(--spark-drift)) scale(0.4); }
    28% { opacity: var(--spark-opacity); transform: translateX(0) scale(1); }
    62% { opacity: calc(var(--spark-opacity) * 0.72); transform: translateX(calc(var(--spark-drift) * -0.4)) scale(0.78); }
    100% { opacity: 0; transform: translateX(calc(var(--spark-drift) * -0.8)) scale(0.3); }
  }

  .dew-halo {
    position: absolute;
    width: var(--contact-radius);
    aspect-ratio: 2.5;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background:
      radial-gradient(ellipse,
        color-mix(in srgb, white calc(var(--retro) * 30%), transparent) 0 8%,
        color-mix(in srgb, var(--c0) calc(var(--retro) * 48%), transparent) 22%,
        color-mix(in srgb, var(--c1) calc(var(--retro) * 28%), transparent) calc(48% + var(--falloff) * 12%),
        transparent 76%);
    filter: blur(2px);
    opacity: 0;
    animation: dew-gather var(--duration) ease-in-out var(--delay) both;
  }
  @keyframes dew-gather {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.78); }
    28% { opacity: var(--persistence); transform: translate(-50%, -50%) scale(1); }
    82% { opacity: var(--persistence); transform: translate(-50%, -50%) scale(1.015); }
    100% { opacity: calc(var(--persistence) * 0.78); transform: translate(-50%, -50%) scale(1.02); }
  }
  .dew-point {
    position: absolute;
    width: var(--dew-size);
    aspect-ratio: 1;
    margin: calc(var(--dew-size) / -2);
    border-radius: 50%;
    background: color-mix(in srgb, white 76%, var(--c0));
    box-shadow: 0 0 5px color-mix(in srgb, var(--c1) 72%, transparent);
    opacity: 0;
    animation: dew-shimmer var(--dew-period) ease-in-out var(--dew-delay) infinite alternate;
  }
  @keyframes dew-shimmer {
    0%, 18% { opacity: 0.08; transform: scale(0.6); }
    48% { opacity: var(--dew-brightness); transform: scale(1.3); }
    78%, 100% { opacity: 0.18; transform: scale(0.72); }
  }

  .virga-veil {
    position: absolute;
    width: var(--veil-width);
    height: 38%;
    transform: translateX(-50%);
    background: linear-gradient(to bottom, color-mix(in srgb, var(--c1) 14%, transparent), transparent 86%);
    filter: blur(8px);
    opacity: 0.7;
  }
  .virga-strand {
    position: absolute;
    width: 1.2px;
    height: var(--trail-length);
    transform-origin: top center;
    background: linear-gradient(
      to bottom,
      transparent 0,
      color-mix(in srgb, var(--c0) calc(var(--droplet-brightness) * 72%), transparent) 16%,
      color-mix(in srgb, var(--c1) calc(var(--droplet-brightness) * 54%), transparent) var(--fade-stop),
      color-mix(in srgb, var(--c2) calc(var(--terminal-opacity) * 100%), transparent) 100%
    );
    filter: blur(0.35px) drop-shadow(0 0 2px color-mix(in srgb, var(--c0) 34%, transparent));
    opacity: 0;
    animation: virga-descend var(--virga-speed) cubic-bezier(0.24, 0.52, 0.36, 1) var(--virga-delay) both;
  }
  @keyframes virga-descend {
    0% { opacity: 0; transform: translate(0, -4%) scaleY(0.18); }
    24% { opacity: var(--droplet-brightness); transform: translate(calc(var(--virga-wind) * 0.16), 0) scaleY(0.68); }
    64% { opacity: calc(var(--droplet-brightness) * 0.74); transform: translate(calc(var(--virga-wind) * 0.68), 5%) scaleY(1); }
    100% { opacity: var(--terminal-opacity); transform: translate(var(--virga-wind), 10%) scaleY(0.84); }
  }

  .spectre-field {
    position: absolute;
    width: 14cqmin;
    height: 22cqmin;
    transform: translate(-50%, -50%) scale(var(--projection-scale)) scaleY(var(--projection-stretch));
    transform-origin: center bottom;
    animation: spectre-arrive var(--duration) cubic-bezier(0.2, 0.55, 0.22, 1) calc(var(--delay) + var(--motion-lag)) both;
  }
  @keyframes spectre-arrive {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(calc(var(--projection-scale) * 0.64)) scaleY(calc(var(--projection-stretch) * 0.82)); }
    30% { opacity: 1; transform: translate(-50%, -50%) scale(var(--projection-scale)) scaleY(var(--projection-stretch)); }
    76% { opacity: 1; transform: translate(-50%, -50%) scale(calc(var(--projection-scale) * (1 + var(--distortion) * 0.055))) scaleY(calc(var(--projection-stretch) * 1.015)); }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(calc(var(--projection-scale) * 1.08)) scaleY(calc(var(--projection-stretch) * 1.04)); }
  }
  .spectre-fog,
  .spectre-glory,
  .spectre-aura,
  .spectre-silhouette {
    position: absolute;
    inset: 0;
  }
  .spectre-fog {
    inset: -58%;
    border-radius: 46%;
    background:
      radial-gradient(ellipse at 50% 32%,
        transparent 0 13%,
        color-mix(in srgb, var(--c2) calc(var(--fog-depth) * 19%), transparent) 26%,
        transparent 55%),
      radial-gradient(ellipse,
        color-mix(in srgb, var(--c1) calc(var(--fog-depth) * 28%), transparent),
        transparent 68%);
    filter: blur(calc(var(--projection-blur) * 2.2)) contrast(1.08);
    animation: spectre-fog-drift 6.8s ease-in-out infinite alternate;
  }
  @keyframes spectre-fog-drift {
    from { opacity: 0.72; transform: translate(calc(var(--distortion) * -9cqmin), 1%) scale(0.94) rotate(-1deg); }
    to { opacity: 1; transform: translate(calc(var(--distortion) * 9cqmin), -2%) scale(1.08) rotate(1.5deg); }
  }
  .spectre-glory {
    left: 5%;
    top: -18%;
    right: auto;
    bottom: auto;
    width: 90%;
    aspect-ratio: 1;
    border-radius: 50%;
    opacity: var(--spectre-halo);
    filter: blur(1.4px) drop-shadow(0 0 8px color-mix(in srgb, var(--c1) 58%, transparent));
    animation: spectre-glory-waver 4.9s ease-in-out infinite alternate;
  }
  .spectre-glory i {
    position: absolute;
    left: 50%;
    top: 50%;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--c0) 70%, transparent);
  }
  .spectre-glory i:nth-child(1) {
    width: 46%;
    border-color: color-mix(in srgb, var(--c2) 66%, transparent);
  }
  .spectre-glory i:nth-child(2) {
    width: 69%;
    border-color: color-mix(in srgb, var(--c1) 58%, transparent);
  }
  .spectre-glory i:nth-child(3) {
    width: 92%;
    border-color: color-mix(in srgb, var(--c0) 46%, transparent);
  }
  @keyframes spectre-glory-waver {
    from { transform: scale(0.94) translateX(calc(var(--distortion) * -4%)); opacity: calc(var(--spectre-halo) * 0.7); }
    to { transform: scale(1.08) translateX(calc(var(--distortion) * 4%)); opacity: var(--spectre-halo); }
  }
  .spectre-aura {
    inset: -34%;
    filter: blur(calc(1.2px + var(--projection-blur) * 0.42));
  }
  .spectre-wisp {
    position: absolute;
    width: var(--wisp-width);
    height: var(--wisp-height);
    transform-origin: center bottom;
    border-radius: 58% 42% 66% 34%;
    background: linear-gradient(
      to top,
      transparent,
      color-mix(in srgb, #05030b 72%, var(--c2)) 42%,
      color-mix(in srgb, var(--c2) 24%, transparent) 78%,
      transparent
    );
    box-shadow: 0 0 8px color-mix(in srgb, var(--c2) 22%, transparent);
    opacity: calc(0.18 + var(--distortion) * 0.48);
    animation: spectre-writhe var(--wisp-period) ease-in-out var(--wisp-delay) infinite alternate;
  }
  @keyframes spectre-writhe {
    from {
      transform: translate(-50%, -50%) translateX(calc(var(--wisp-drift) * -1)) rotate(calc(var(--wisp-turn) * -1)) scaleY(0.72);
      opacity: 0.12;
    }
    to {
      transform: translate(-50%, -50%) translateX(var(--wisp-drift)) translateY(-18%) rotate(var(--wisp-turn)) scaleY(1.16);
      opacity: calc(0.2 + var(--distortion) * 0.52);
    }
  }
  .spectre-silhouette {
    opacity: var(--projection-opacity);
    filter:
      blur(calc(var(--projection-blur) * 0.56))
      drop-shadow(0 0 calc(4px + var(--projection-blur)) color-mix(in srgb, var(--c2) 32%, transparent));
    animation: spectre-shadow-swim 5.6s ease-in-out infinite alternate;
  }
  @keyframes spectre-shadow-swim {
    from { transform: translateX(calc(var(--distortion) * -5%)) skewX(calc(var(--distortion) * -2deg)); }
    to { transform: translateX(calc(var(--distortion) * 5%)) skewX(calc(var(--distortion) * 2deg)); }
  }
  .spectre-head,
  .spectre-body,
  .spectre-arm {
    position: absolute;
    display: block;
    left: 50%;
    transform: translateX(-50%);
    background: color-mix(in srgb, #030208 80%, var(--c2));
  }
  .spectre-head {
    top: 1%;
    width: 39%;
    aspect-ratio: 1;
    border-radius: 48% 52% 44% 56%;
    box-shadow:
      inset 0 0 7px #000,
      0 0 10px color-mix(in srgb, var(--c2) 30%, transparent);
  }
  .spectre-body {
    bottom: 0;
    width: 80%;
    height: 81%;
    clip-path: polygon(25% 0, 75% 0, 91% 18%, 78% 49%, 70% 100%, 30% 100%, 22% 49%, 9% 18%);
    border-radius: 46% 46% 18% 18%;
    transform: translateX(-50%) skewX(calc((var(--distortion) - 0.18) * 7deg));
  }
  .spectre-arm {
    top: 26%;
    width: 18%;
    height: 60%;
    border-radius: 50% 50% 70% 70%;
    transform-origin: top center;
  }
  .spectre-arm.left {
    left: 22%;
    transform: translateX(-50%) rotate(calc(-8deg - var(--distortion) * 7deg));
  }
  .spectre-arm.right {
    left: 78%;
    transform: translateX(-50%) rotate(calc(8deg + var(--distortion) * 7deg));
  }

  .source-guide {
    position: absolute;
    left: var(--x);
    top: var(--y);
    width: 8cqmin;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background:
      radial-gradient(circle at 38% 34%, #fffdf4 0 18%, color-mix(in srgb, var(--c0) 76%, #d9deea) 52%, #667084 100%);
    box-shadow:
      0 0 2px rgba(255, 255, 255, 0.8),
      0 0 14px color-mix(in srgb, var(--c0) 48%, transparent);
    opacity: 0.86;
  }
  .source-guide.body-source {
    width: 6cqmin;
    height: 11cqmin;
    aspect-ratio: auto;
    border-radius: 0;
    background: none;
    box-shadow: none;
    opacity: 0.76;
  }
  .source-head,
  .source-body {
    position: absolute;
    display: block;
    left: 50%;
    transform: translateX(-50%);
    background: color-mix(in srgb, var(--c0) 28%, #252a38);
    box-shadow: 0 0 7px color-mix(in srgb, var(--c0) 38%, transparent);
  }
  .source-head {
    top: 3%;
    width: 48%;
    aspect-ratio: 1;
    border-radius: 50%;
  }
  .source-body {
    bottom: 0;
    width: 74%;
    height: 72%;
    border-radius: 48% 48% 34% 34%;
  }

  /* Pale diffraction can disappear completely on daytime themes. Preserve
     the authored hue, but borrow a little foreground contrast so the optical
     structure remains inspectable instead of becoming a dark cartoon line. */
  :global([data-theme='light']) .corona-ring,
  :global([data-theme='light']) .glory-ring {
    border-color: color-mix(in srgb, var(--ring-colour) 52%, var(--text) 48%);
    filter:
      blur(var(--softness))
      drop-shadow(0 0 calc(2px + var(--softness))
        color-mix(in srgb, var(--ring-colour) 50%, var(--text) 50%));
  }
  :global([data-theme='light']) .glory-mist {
    filter: blur(var(--mist-softness)) contrast(1.08);
  }
  :global([data-theme='light']) .moon-dog {
    filter:
      drop-shadow(0 0 7px color-mix(in srgb, var(--c0) 58%, var(--text) 42%))
      drop-shadow(0 0 1px color-mix(in srgb, var(--text) 28%, transparent));
  }
  :global([data-theme='light']) .bead {
    background: color-mix(in srgb, var(--c0) 62%, var(--text) 38%);
    box-shadow:
      0 0 calc(var(--bead-size) * 1.4) color-mix(in srgb, var(--c0) 62%, var(--text) 38%),
      0 0 calc(var(--bead-size) * 3.2) color-mix(in srgb, var(--c1) 52%, transparent);
  }
</style>
