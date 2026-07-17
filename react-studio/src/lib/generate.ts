// config → paste-ready code for CompanionReacts.svelte, reproducing exactly
// what Preview.svelte renders. Everything is namespaced by the react id so it
// drops into the existing file without colliding with the other reacts.
//
// v2 layout: one shared particle interface + shared keyframes per react;
// each layer gets its own array (`${id}_l1`…), base class (`.${id}-l1`) with
// its scale/ease baked in, and its own block in the fire() branch.
import { SHAPES, type ShapeDef, type CustomPathPart } from './shapes';
import { EASES, type ReactConfig, type LayerConfig, type ColorMode, type GlowColorMode } from './reactConfig';

const n = (x: number) => Number(x.toFixed(3)).toString();

function shapeDef(layer: LayerConfig): ShapeDef {
  if (layer.shape === 'custom') {
    return {
      render: 'path',
      viewBox: layer.customViewBox || '0 0 24 24',
      d: layer.customPath || SHAPES.heart.d,
      paths: layer.customPaths.length ? layer.customPaths : undefined,
    };
  }
  return SHAPES[layer.shape];
}

const attr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function pathParts(sd: ShapeDef): CustomPathPart[] {
  return sd.paths?.length ? sd.paths : [{ d: sd.d ?? '' }];
}

// per-particle colour expression, evaluated in the generated fire()
function colorExpr(mode: ColorMode, colors: string[]): string {
  if (mode === 'signal') return `'var(--signal)'`;
  if (mode === 'contrast') return `'var(--signal-contrast)'`;
  if (colors.length === 1) return `'${colors[0]}'`;
  const arr = colors.map((c) => `'${c}'`).join(', ');
  return `[${arr}][Math.floor(Math.random() * ${colors.length})]`;
}

function glowColorExpr(mode: GlowColorMode, colors: string[], fillName: string): string {
  if (mode === 'auto') return fillName;
  if (colors.length === 1) return `'${colors[0]}'`;
  const arr = colors.map((c) => `'${c}'`).join(', ');
  return `[${arr}][Math.floor(Math.random() * ${colors.length})]`;
}

function txExpr(layer: LayerConfig): string {
  if (layer.direction === 'burst' || layer.direction === 'converge')
    return '`${(Math.cos(angle * Math.PI / 180) * distance).toFixed(1)}vmin`';
  return `\`\${(-${n(layer.driftX)} + Math.random() * ${n(layer.driftX * 2)}).toFixed(1)}vw\``;
}
function tyExpr(layer: LayerConfig): string {
  if (layer.direction === 'fall') return `'112vh'`;
  if (layer.direction === 'rise') return `'-72vh'`;
  if (layer.direction === 'fountain') return `'0vh'`; // Y lives on the arc wrapper
  if (layer.direction === 'converge')
    return '`${(Math.sin(angle * Math.PI / 180) * distance * 0.7).toFixed(1)}vmin`';
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
  const anyFountain = layers.some((l) => l.direction === 'fountain');
  const anyConverge = layers.some((l) => l.direction === 'converge');
  const anySizeEnvelope = layers.some((l) => l.sizeEnvelope);
  const anyColorEnvelope = layers.some(
    (l) => l.colorMidMode !== 'hold' || l.colorEndMode !== 'hold',
  );
  const anyGlowEnvelope = layers.some(
    (l) => l.glowMode !== 'none' && (
      l.glowEnvelope
      || (l.glowMode === 'fixed' && (l.glowColorMidMode !== 'hold' || l.glowColorEndMode !== 'hold'))
    ),
  );
  const lifeMs = Math.round(
    Math.max(...layers.map((l) => l.layerDelay + l.spawnWindow + l.durMax)) * 1000 + 400,
  );

  const idsLine = `// add '${id}' to REACT_IDS:\nexport const REACT_IDS = [/* …existing…, */ '${id}'];`;

  const arrayNames = layers.map((_, k) => (layers.length === 1 ? id : `${id}_l${k + 1}`));

  const script = `  // ${cfg.label} — ${cfg.register}
  interface ${Cap}P {
    id: number; x: number; size: number; color: string; colorMid: string; colorEnd: string;
    glowColor: string; glowColorMid: string; glowColorEnd: string; delay: number;
    dur: number; op: number; inDur: number; outDelay: number; outDur: number;
    envMidDur: number; envEndDelay: number; envEndDur: number;
    rotEnd: number; swayAmp: number; swayDur: number; swayPhase: number;
    tx: string; ty: string;${anyFountain ? ' apex: number;' : ''}${anyConverge ? ' fromX: number; fromY: number;' : ''}
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
        const delay = ${n(l.layerDelay)} + Math.random() * ${n(l.spawnWindow)};${
        l.direction === 'burst'
          ? `
        const angle = Math.random() * 360;
        const distance = 20 + Math.random() * 22;`
          : l.direction === 'converge'
            ? `
        const angle = Math.random() * 360;
        const distance = Math.sqrt(Math.random()) * ${n(l.focusRadius)};
        const fromAngle = Math.random() * 360;
        const fromDistance = 28 + Math.random() * 40;`
          : ''
      }
        const color = ${colorExpr(l.colorMode, l.colors)};
        const colorMid = ${l.colorMidMode === 'hold' ? 'color' : colorExpr(l.colorMidMode, l.colorsMid)};
        const colorEnd = ${l.colorEndMode === 'hold' ? 'colorMid' : colorExpr(l.colorEndMode, l.colorsEnd)};
        const glowColor = ${l.glowMode === 'fixed' ? glowColorExpr(l.glowColorMode, l.glowColors, 'color') : 'color'};
        const glowColorMid = ${l.glowMode === 'fixed' ? (l.glowColorMidMode === 'hold' ? 'glowColor' : glowColorExpr(l.glowColorMidMode, l.glowColorsMid, 'colorMid')) : 'colorMid'};
        const glowColorEnd = ${l.glowMode === 'fixed' ? (l.glowColorEndMode === 'hold' ? 'glowColorMid' : glowColorExpr(l.glowColorEndMode, l.glowColorsEnd, 'colorEnd')) : 'colorEnd'};
        b${k + 1}.push({
          id: burstId++,
          x: 4 + Math.random() * 92,
          size,
          color,
          colorMid,
          colorEnd,
          glowColor,
          glowColorMid,
          glowColorEnd,
          delay,
          dur,
          op,
          inDur: +(dur * ${n(l.fadeInPct / 100)}).toFixed(3),
          outDelay: +(delay + dur * ${n(l.fadeOutPct / 100)}).toFixed(3),
          outDur: +(dur * ${n((100 - l.fadeOutPct) / 100)}).toFixed(3),
          envMidDur: +(dur * ${n(l.envelopeMidPct / 100)}).toFixed(3),
          envEndDelay: +(delay + dur * ${n(l.envelopeMidPct / 100)}).toFixed(3),
          envEndDur: +(dur * ${n((100 - l.envelopeMidPct) / 100)}).toFixed(3),
          rotEnd: ${l.spin ? `(Math.random() < 0.5 ? -1 : 1) * ${n(l.rotMax)} * dur` : '0'},
          swayAmp: ${l.swayAmp ? `${n(l.swayAmp * 0.6)} + Math.random() * ${n(l.swayAmp * 0.4)}` : '0'},
          swayDur,
          swayPhase: Math.random() * swayDur,
          tx: ${txExpr(l)},
          ty: ${tyExpr(l)},${anyFountain ? `\n          apex: ${l.direction === 'fountain' ? `${n(l.arcApex * 0.7)} + Math.random() * ${n(l.arcApex * 0.3)}` : '0'},` : ''}${anyConverge ? `\n          fromX: ${l.direction === 'converge' ? 'Math.cos(fromAngle * Math.PI / 180) * fromDistance' : '0'},\n          fromY: ${l.direction === 'converge' ? 'Math.sin(fromAngle * Math.PI / 180) * fromDistance * 0.7' : '0'},` : ''}
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
      const shapeInner =
        sd.render === 'path'
          ? `            <svg viewBox="${attr(sd.viewBox ?? '0 0 24 24')}" width={p.size} height={p.size} style="display:block;">
${pathParts(sd).map((part) => `              <path fill="currentColor" d="${attr(part.d)}"${part.transform ? ` transform="${attr(part.transform)}"` : ''}${part.fillRule ? ` fill-rule="${part.fillRule}"` : ''} />`).join('\n')}
            </svg>`
          : `            <span style="display:block; width:{p.size}px; height:{p.size}px; background:currentColor; border-radius:${sd.radius};"></span>`;
      const shapeMarkup = `            <span class="${cls}-shape">
${shapeInner}
            </span>`;
      const glowMarkup = `          <span class="${cls}-glow">
${shapeMarkup}
          </span>`;
      const swayMarkup = `        <span class="${id}-sway">
${glowMarkup}
        </span>`;
      const colorMarkup = `      <span class="${cls}-color">
${swayMarkup}
      </span>`;
      const scaleMarkup = `    <span class="${cls}-scale">
${colorMarkup}
    </span>`;
      const inner =
        l.direction === 'fountain'
          ? `  <span class="${id}-arc">
${scaleMarkup}
  </span>`
          : scaleMarkup;
      const leftAttr = l.direction === 'burst' || l.direction === 'converge' ? '' : 'left:{p.x}%; ';
      const apexVar = l.direction === 'fountain' ? ' --apex:{p.apex}vh;' : '';
      const convergeVars = l.direction === 'converge' ? ' --fx:{p.fromX}vmin; --fy:{p.fromY}vmin;' : '';
      return `  <!-- ${cfg.label}, layer ${k + 1}: ${l.name} -->
  {#each ${arr} as p (p.id)}
    <span
      class="${cls}"
      style="${leftAttr}--size:{p.size}px; --dur:{p.dur}s; --delay:{p.delay}s; --op:{p.op}; --indur:{p.inDur}s; --outdelay:{p.outDelay}s; --outdur:{p.outDur}s; --envmiddur:{p.envMidDur}s; --envenddelay:{p.envEndDelay}s; --envenddur:{p.envEndDur}s; --tx:{p.tx}; --ty:{p.ty}; --s0:${n(l.scaleFrom)}; --sm:${n(l.scaleMid)}; --s1:${n(l.scaleTo)}; --c0:{p.color}; --cm:{p.colorMid}; --c1:{p.colorEnd}; --gb0:${n(l.glowBlur)}px; --gbm:${n(l.glowEnvelope ? l.glowBlurMid : l.glowBlur)}px; --gb1:${n(l.glowEnvelope ? l.glowBlurEnd : l.glowBlur)}px; --fgc0:{p.glowColor}; --fgcm:{p.glowColorMid}; --fgc1:{p.glowColorEnd}; --sway:{p.swayAmp}px; --swaydur:{p.swayDur}s; --swayphase:{p.swayPhase}s; --rot:{p.rotEnd}deg;${apexVar}${convergeVars}"
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
          : l.direction === 'burst' || l.direction === 'converge'
            ? 'top: 50%; left: 50%; margin-top: calc(var(--size) / -2);'
            : 'bottom: calc(-1 * var(--size) - 10px);'; // rise + fountain
      const adaptiveGlow = l.glowMode === 'adaptive';
      const hasGlow = l.glowMode !== 'none';
      const glowEnvelope = hasGlow && (
        l.glowEnvelope
        || (l.glowMode === 'fixed' && (l.glowColorMidMode !== 'hold' || l.glowColorEndMode !== 'hold'))
      );
      const travelAnim = l.sizeEnvelope
        ? l.direction === 'converge' ? `${id}-converge-pos` : `${id}-travel-pos`
        : l.direction === 'converge' ? `${id}-converge` : `${id}-travel`;
      const colorEnvelope = l.colorMidMode !== 'hold' || l.colorEndMode !== 'hold';
      const scaleAnim = l.sizeEnvelope
        ? `
    animation:
      ${id}-scale-a var(--envmiddur) ${EASES[l.travelEase].css} var(--delay) both,
      ${id}-scale-b var(--envenddur) ${EASES[l.travelEase].css} var(--envenddelay) forwards;`
        : '';
      const colorAnim = colorEnvelope
        ? `
    animation:
      ${id}-color-a var(--envmiddur) linear var(--delay) both,
      ${id}-color-b var(--envenddur) linear var(--envenddelay) forwards;`
        : '';
      const spinAnim = l.spin
        ? `\n    animation: ${id}-spin var(--dur) linear var(--delay) both;`
        : '';
      const glowAnim = glowEnvelope
        ? `
    animation:
      ${id}-glow-a var(--envmiddur) linear var(--delay) both,
      ${id}-glow-b var(--envenddur) linear var(--envenddelay) forwards;`
        : '';
      const glowCss = hasGlow
        ? `
  .${cls}-glow {
    display: block;
    filter: drop-shadow(0 0 var(--gb0) var(--gc0, var(--fgc0)));${glowAnim}
  }`
        : `
  .${cls}-glow { display: block; }`;
      const adaptiveCss = adaptiveGlow
        ? `
  /* adaptive readability halo: light on dark themes, soft dark on light */
  :global([data-theme='dark']) .${cls}-glow {
    --gc0: rgba(255, 255, 255, 0.35);
    --gcm: rgba(255, 255, 255, 0.35);
    --gc1: rgba(255, 255, 255, 0.35);
  }
  :global([data-theme='light']) .${cls}-glow {
    --gc0: rgba(40, 30, 30, 0.32);
    --gcm: rgba(40, 30, 30, 0.32);
    --gc1: rgba(40, 30, 30, 0.32);
  }
  :global([data-theme='dark']) .${cls}-shape {
    filter: drop-shadow(0 0 1px rgba(255, 255, 255, 0.6));
  }`
        : '';
      return `  /* layer ${k + 1}: ${l.name} */
  .${cls} {
    position: absolute;
    width: var(--size);
    height: var(--size);
    margin-left: calc(var(--size) / -2);
    ${basePos}
    --s0: ${n(l.scaleFrom)};
    --sm: ${n(l.scaleMid)};
    --s1: ${n(l.scaleTo)};
    animation:
      ${travelAnim} var(--dur) ${EASES[l.travelEase].css} var(--delay) both,
      ${id}-in var(--indur) linear var(--delay) both,
      ${id}-out var(--outdur) linear var(--outdelay) forwards;
  }
  .${cls}-scale {
    display: block;${scaleAnim}
  }
  .${cls}-color {
    display: block;
    color: var(--c0);${colorAnim}
  }${glowCss}
  .${cls}-shape {
    display: block;${spinAnim}
  }${adaptiveCss}`;
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

  const convergeCss = anyConverge
    ? `
  /* scatter → focus arrives by 72%, then holds; the fade envelope owns exit */
  @keyframes ${id}-converge {
    0% { transform: translate(var(--fx), var(--fy)) scale(var(--s0, 1)); }
    72%, 100% { transform: translate(var(--tx), var(--ty)) scale(var(--s1, 1)); }
  }`
    : '';

  const sizeEnvelopeCss = anySizeEnvelope
    ? `
  @keyframes ${id}-travel-pos {
    from { transform: translate(0, 0); }
    to { transform: translate(var(--tx), var(--ty)); }
  }${anyConverge ? `
  @keyframes ${id}-converge-pos {
    0% { transform: translate(var(--fx), var(--fy)); }
    72%, 100% { transform: translate(var(--tx), var(--ty)); }
  }` : ''}
  @keyframes ${id}-scale-a {
    from { transform: scale(var(--s0, 1)); }
    to { transform: scale(var(--sm, 1)); }
  }
  @keyframes ${id}-scale-b {
    from { transform: scale(var(--sm, 1)); }
    to { transform: scale(var(--s1, 1)); }
  }`
    : '';

  const colorEnvelopeCss = anyColorEnvelope
    ? `
  @keyframes ${id}-color-a {
    from { color: var(--c0); }
    to { color: var(--cm); }
  }
  @keyframes ${id}-color-b {
    from { color: var(--cm); }
    to { color: var(--c1); }
  }`
    : '';

  const glowEnvelopeCss = anyGlowEnvelope
    ? `
  @keyframes ${id}-glow-a {
    from { filter: drop-shadow(0 0 var(--gb0) var(--gc0, var(--fgc0))); }
    to { filter: drop-shadow(0 0 var(--gbm) var(--gcm, var(--fgcm))); }
  }
  @keyframes ${id}-glow-b {
    from { filter: drop-shadow(0 0 var(--gbm) var(--gcm, var(--fgcm))); }
    to { filter: drop-shadow(0 0 var(--gb1) var(--gc1, var(--fgc1))); }
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
  }${arcCss}${convergeCss}${sizeEnvelopeCss}${colorEnvelopeCss}${glowEnvelopeCss}
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

/* 6 — roster entry (src/lib/reactRoster.ts — perennial, or add
   when: { seasons: […] } / { themes: […] } for a guest star) */
${prompt}
`;

  return { reactId: id, idsLine, script, markup, css, prompt, combined };
}
