// config → paste-ready code for CompanionReacts.svelte, reproducing exactly
// what Preview.svelte renders. Everything is namespaced by the react id so it
// drops into the existing file without colliding with the other reacts.
//
// v2 layout: one shared particle interface + shared keyframes per react;
// each layer gets its own array (`${id}_l1`…), base class (`.${id}-l1`) with
// its scale/ease baked in, and its own block in the fire() branch.
import { SHAPES, type ShapeDef } from './shapes';
import { EASES, type ReactConfig, type LayerConfig } from './reactConfig';

const n = (x: number) => Number(x.toFixed(3)).toString();

function shapeDef(layer: LayerConfig): ShapeDef {
  if (layer.shape === 'custom') {
    return { render: 'path', viewBox: '0 0 24 24', d: layer.customPath || SHAPES.heart.d };
  }
  return SHAPES[layer.shape];
}

// per-particle colour expression, evaluated in the generated fire()
function colorExpr(layer: LayerConfig): string {
  if (layer.colorMode === 'signal') return `'var(--signal)'`;
  if (layer.colorMode === 'contrast') return `'var(--signal-contrast)'`;
  if (layer.colors.length === 1) return `'${layer.colors[0]}'`;
  const arr = layer.colors.map((c) => `'${c}'`).join(', ');
  return `[${arr}][Math.floor(Math.random() * ${layer.colors.length})]`;
}

// per-particle fixed glow, evaluated in fire() (only when glowMode === 'fixed')
function glowExpr(layer: LayerConfig): string {
  if (layer.glowColor === 'auto') return `\`drop-shadow(0 0 ${layer.glowBlur}px \${color})\``;
  return `'drop-shadow(0 0 ${layer.glowBlur}px ${layer.glowColor})'`;
}

function txExpr(layer: LayerConfig): string {
  if (layer.direction === 'burst') return '`${(Math.cos(angle * Math.PI / 180) * distance).toFixed(1)}vmin`';
  return `\`\${(-${n(layer.driftX)} + Math.random() * ${n(layer.driftX * 2)}).toFixed(1)}vw\``;
}
function tyExpr(layer: LayerConfig): string {
  if (layer.direction === 'fall') return `'112vh'`;
  if (layer.direction === 'rise') return `'-72vh'`;
  if (layer.direction === 'fountain') return `'0vh'`; // Y lives on the arc wrapper
  return '`${(Math.sin(angle * Math.PI / 180) * distance * 0.7 + 8).toFixed(1)}vmin`';
}

export interface Generated {
  reactId: string;
  idsLine: string;
  script: string;
  markup: string;
  css: string;
  prompt: string;
  combined: string;
}

export function generate(cfg: ReactConfig): Generated {
  const id = cfg.id || 'my_react';
  const Cap = id.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase());
  const layers = cfg.layers;
  const anyFixedGlow = layers.some((l) => l.glowMode === 'fixed');
  const anyFountain = layers.some((l) => l.direction === 'fountain');
  const lifeMs = Math.round(
    Math.max(...layers.map((l) => l.layerDelay + l.spawnWindow + l.durMax)) * 1000 + 400,
  );

  const idsLine = `// add '${id}' to REACT_IDS:\nexport const REACT_IDS = [/* …existing…, */ '${id}'];`;

  const arrayNames = layers.map((_, k) => (layers.length === 1 ? id : `${id}_l${k + 1}`));

  const script = `  // ${cfg.label} — ${cfg.register}
  interface ${Cap}P {
    id: number; x: number; size: number; color: string; delay: number;
    dur: number; op: number; inDur: number; outDelay: number; outDur: number;
    rotEnd: number; swayAmp: number; swayDur: number; swayPhase: number;
    tx: string; ty: string;${anyFountain ? ' apex: number;' : ''}${anyFixedGlow ? ' glow: string;' : ''}
  }
${arrayNames.map((a) => `  let ${a}: ${Cap}P[] = [];`).join('\n')}
  let ${id}Timer: ReturnType<typeof setTimeout>;`;

  // ---- fire() branch: one block per layer ----
  const layerBlocks = layers
    .map((l, k) => {
      const arr = arrayNames[k];
      const durRange = l.durMax - l.durMin;
      const swayRange = l.swayMax - l.swayMin;
      const sizeRange = l.sizeMax - l.sizeMin;
      const opRange = l.opacityMax - l.opacityMin;
      const fixedGlow = l.glowMode === 'fixed';
      // depth-linked: one sample drives size/speed/opacity; else independent
      const sampled = l.depthLink
        ? `const t = Math.random(); // depth: 0 far, 1 near
        const size = Math.round(${n(l.sizeMin)} + t * ${n(sizeRange)});
        const dur = ${n(l.durMax)} - t * ${n(durRange)};
        const op = ${n(l.opacityMin)} + (0.3 + t * 0.7) * ${n(opRange)};`
        : `const size = Math.round(${n(l.sizeMin)} + Math.random() * ${n(sizeRange)});
        const dur = ${n(l.durMin)} + Math.random() * ${n(durRange)};
        const op = ${n(l.opacityMin)} + Math.random() * ${n(opRange)};`;
      return `      // layer ${k + 1}: ${l.name}
      const b${k + 1}: ${Cap}P[] = [];
      for (let i = 0; i < ${l.count}; i++) {
        ${sampled}
        const swayDur = ${n(l.swayMin)} + Math.random() * ${n(swayRange)};
        const delay = ${n(l.layerDelay)} + Math.random() * ${n(l.spawnWindow)};
        const angle = Math.random() * 360;
        const distance = 20 + Math.random() * 22;
        const color = ${colorExpr(l)};
        b${k + 1}.push({
          id: burstId++,
          x: 4 + Math.random() * 92,
          size,
          color,
          delay,
          dur,
          op,
          inDur: +(dur * ${n(l.fadeInPct / 100)}).toFixed(3),
          outDelay: +(delay + dur * ${n(l.fadeOutPct / 100)}).toFixed(3),
          outDur: +(dur * ${n((100 - l.fadeOutPct) / 100)}).toFixed(3),
          rotEnd: ${l.spin ? `(Math.random() < 0.5 ? -1 : 1) * ${n(l.rotMax)} * dur` : '0'},
          swayAmp: ${l.swayAmp ? `${n(l.swayAmp * 0.6)} + Math.random() * ${n(l.swayAmp * 0.4)}` : '0'},
          swayDur,
          swayPhase: Math.random() * swayDur,
          tx: ${txExpr(l)},
          ty: ${tyExpr(l)},${anyFountain ? `\n          apex: ${l.direction === 'fountain' ? `${n(l.arcApex * 0.7)} + Math.random() * ${n(l.arcApex * 0.3)}` : '0'},` : ''}${anyFixedGlow ? `\n          glow: ${fixedGlow ? glowExpr(l) : `''`},` : ''}
        });
      }
      ${arr} = b${k + 1};`;
    })
    .join('\n');

  const fireBranch = `    } else if (type === '${id}') {
${layerBlocks}
      clearTimeout(${id}Timer);
      ${id}Timer = setTimeout(() => {
${arrayNames.map((a) => `        ${a} = [];`).join('\n')}
      }, ${lifeMs});
    }`;

  // ---- markup: one {#each} per layer ----
  const markup = layers
    .map((l, k) => {
      const arr = arrayNames[k];
      const cls = layers.length === 1 ? id : `${id}-l${k + 1}`;
      const sd = shapeDef(l);
      const fixedGlow = l.glowMode === 'fixed';
      const adaptiveGlow = l.glowMode === 'adaptive';
      const shapeAttr = fixedGlow
        ? ` style="filter:{p.glow};"`
        : adaptiveGlow
          ? ` style="--rim:${n(l.glowBlur)}px;"`
          : '';
      const shapeInner =
        sd.render === 'path'
          ? `            <svg viewBox="${sd.viewBox}" width={p.size} height={p.size} style="display:block;">
              <path fill={p.color} d="${sd.d}" />
            </svg>`
          : `            <span style="display:block; width:{p.size}px; height:{p.size}px; background:{p.color}; border-radius:${sd.radius};"></span>`;
      const shapeMarkup = `          <span class="${cls}-shape"${shapeAttr}>
${shapeInner}
          </span>`;
      const swayMarkup = `        <span class="${id}-sway">
${shapeMarkup}
        </span>`;
      const inner =
        l.direction === 'fountain'
          ? `      <span class="${id}-arc">
${swayMarkup}
      </span>`
          : swayMarkup;
      const leftAttr = l.direction === 'burst' ? '' : 'left:{p.x}%; ';
      const apexVar = l.direction === 'fountain' ? ' --apex:{p.apex}vh;' : '';
      return `  <!-- ${cfg.label}, layer ${k + 1}: ${l.name} -->
  {#each ${arr} as p (p.id)}
    <span
      class="${cls}"
      style="${leftAttr}--size:{p.size}px; --dur:{p.dur}s; --delay:{p.delay}s; --op:{p.op}; --indur:{p.inDur}s; --outdelay:{p.outDelay}s; --outdur:{p.outDur}s; --tx:{p.tx}; --ty:{p.ty}; --sway:{p.swayAmp}px; --swaydur:{p.swayDur}s; --swayphase:{p.swayPhase}s; --rot:{p.rotEnd}deg;${apexVar}"
    >
${inner}
    </span>
  {/each}`;
    })
    .join('\n');

  // ---- CSS: shared keyframes + one base class per layer ----
  const layerCss = layers
    .map((l, k) => {
      const cls = layers.length === 1 ? id : `${id}-l${k + 1}`;
      const basePos =
        l.direction === 'fall'
          ? 'top: calc(-1 * var(--size) - 10px);'
          : l.direction === 'burst'
            ? 'top: 50%; left: 50%; margin-top: calc(var(--size) / -2);'
            : 'bottom: calc(-1 * var(--size) - 10px);'; // rise + fountain
      const adaptiveGlow = l.glowMode === 'adaptive';
      const spinAnim = l.spin
        ? `\n    animation: ${id}-spin var(--dur) linear var(--delay) both;`
        : '';
      return `  /* layer ${k + 1}: ${l.name} */
  .${cls} {
    position: absolute;
    width: var(--size);
    height: var(--size);
    margin-left: calc(var(--size) / -2);
    ${basePos}
    --s0: ${n(l.scaleFrom)};
    --s1: ${n(l.scaleTo)};
    animation:
      ${id}-travel var(--dur) ${EASES[l.travelEase].css} var(--delay) both,
      ${id}-in var(--indur) linear var(--delay) both,
      ${id}-out var(--outdur) linear var(--outdelay) forwards;
  }
  .${cls}-shape {
    display: block;${spinAnim}
  }${
    adaptiveGlow
      ? `
  /* adaptive readability rim: light on dark themes, soft dark on light */
  :global([data-theme='dark']) .${cls}-shape {
    filter: drop-shadow(0 0 1px rgba(255, 255, 255, 0.6)) drop-shadow(0 0 var(--rim, 6px) rgba(255, 255, 255, 0.35));
  }
  :global([data-theme='light']) .${cls}-shape {
    filter: drop-shadow(0 0 var(--rim, 6px) rgba(40, 30, 30, 0.32));
  }`
      : ''
  }`;
    })
    .join('\n');

  const arcCss = anyFountain
    ? `
  .${id}-arc {
    display: block;
    animation: ${id}-arc var(--dur) linear var(--delay) both;
  }
  /* the arc: decelerate up (spending energy), tip over, accelerate down
     (gravity) — two easings on one property, composed with the X travel */
  @keyframes ${id}-arc {
    0% { transform: translateY(0); animation-timing-function: cubic-bezier(0.16, 0.6, 0.44, 1); }
    45% { transform: translateY(calc(-1 * var(--apex))); animation-timing-function: cubic-bezier(0.55, 0, 0.83, 0.4); }
    100% { transform: translateY(14vh); }
  }`
    : '';

  const css = `${layerCss}
  @keyframes ${id}-travel {
    from { transform: translate(0, 0) scale(var(--s0, 1)); }
    to { transform: translate(var(--tx), var(--ty)) scale(var(--s1, 1)); }
  }
  /* fade envelope: rise to --op over --indur, hold, fall over --outdur.
     ${id}-out has NO backwards fill — ${id}-in owns the early frames. */
  @keyframes ${id}-in {
    from { opacity: 0; }
    to { opacity: var(--op); }
  }
  @keyframes ${id}-out {
    from { opacity: var(--op); }
    to { opacity: 0; }
  }${arcCss}
  .${id}-sway {
    display: block;
    animation: ${id}-sway var(--swaydur) ease-in-out calc(-1 * var(--swayphase)) infinite alternate;
  }
  @keyframes ${id}-sway {
    from { transform: translateX(calc(-1 * var(--sway))); }
    to { transform: translateX(var(--sway)); }
  }
  @keyframes ${id}-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(var(--rot)); }
  }`;

  const prompt = `- "${id}": ${cfg.register}`;

  const combined = `/* ============================================================
   ${cfg.label}  (react id: ${id}${layers.length > 1 ? `, ${layers.length} layers` : ''})
   Paste each part into src/lib/CompanionReacts.svelte, and the
   prompt line into the REACTS section of ChatCompanion.svelte.
   ============================================================ */

/* 1 — REACT_IDS (module script at top) */
${idsLine}

/* 2 — state + interface (instance <script>, near the other reacts) */
${script}

/* 3 — fire() branch (inside export function fire(type), as another else-if) */
${fireBranch}

/* 4 — markup (inside <div class="react-layer">) */
${markup}

/* 5 — CSS (inside <style>) */
${css}

/* 6 — companion prompt line (REACTS section of ChatCompanion.svelte) */
${prompt}
`;

  return { reactId: id, idsLine, script, markup, css, prompt, combined };
}
