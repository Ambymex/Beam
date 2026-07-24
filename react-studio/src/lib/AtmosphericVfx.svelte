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
      {/if}

      {#if effect.previewSource && !sourcePresent}
        <span class="source-guide"></span>
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
