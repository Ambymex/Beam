// config → paste-ready code for CompanionReacts.svelte, reproducing exactly
// what Preview.svelte renders. Everything is namespaced by the react id so it
// drops into the existing file without colliding with the other reacts.
import { SHAPES, type ShapeDef } from './shapes';
import type { ReactConfig } from './reactConfig';

const n = (x: number) => Number(x.toFixed(3)).toString();

function ease(cfg: ReactConfig): string {
  return cfg.direction === 'burst' ? 'cubic-bezier(0.2, 0.7, 0.3, 1)' : 'linear';
}
function s0(cfg: ReactConfig): string {
  return cfg.direction === 'burst' ? '0.3' : '1';
}
function shapeDef(cfg: ReactConfig): ShapeDef {
  if (cfg.shape === 'custom') {
    return { render: 'path', viewBox: '0 0 24 24', d: cfg.customPath || SHAPES.heart.d };
  }
  return SHAPES[cfg.shape];
}

// per-particle colour expression, evaluated in the generated fire()
function colorExpr(cfg: ReactConfig): string {
  if (cfg.colorMode === 'signal') return `'var(--signal)'`;
  if (cfg.colorMode === 'contrast') return `'var(--signal-contrast)'`;
  if (cfg.colors.length === 1) return `'${cfg.colors[0]}'`;
  const arr = cfg.colors.map((c) => `'${c}'`).join(', ');
  return `[${arr}][Math.floor(Math.random() * ${cfg.colors.length})]`;
}

function glowExpr(cfg: ReactConfig): string {
  if (!cfg.glowBlur) return `'none'`;
  if (cfg.glowColor === 'auto') return `\`drop-shadow(0 0 ${cfg.glowBlur}px \${color})\``;
  return `'drop-shadow(0 0 ${cfg.glowBlur}px ${cfg.glowColor})'`;
}

function txExpr(cfg: ReactConfig): string {
  if (cfg.direction === 'burst') return '`${(Math.cos(angle * Math.PI / 180) * distance).toFixed(1)}vmin`';
  return `\`\${(-${n(cfg.driftX)} + Math.random() * ${n(cfg.driftX * 2)}).toFixed(1)}vw\``;
}
function tyExpr(cfg: ReactConfig): string {
  if (cfg.direction === 'fall') return `'112vh'`;
  if (cfg.direction === 'rise') return `'-72vh'`;
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
  const sd = shapeDef(cfg);
  const lifeMs = Math.round((cfg.spawnWindow + cfg.durMax) * 1000 + 400);
  const durRange = cfg.durMax - cfg.durMin;
  const swayRange = cfg.swayMax - cfg.swayMin;
  const sizeRange = cfg.sizeMax - cfg.sizeMin;
  const opRange = cfg.opacityMax - cfg.opacityMin;

  const idsLine = `// add '${id}' to REACT_IDS:\nexport const REACT_IDS = [/* …existing…, */ '${id}'];`;

  const script = `  // ${cfg.label} — ${cfg.register}
  interface ${Cap}P {
    id: number; x: number; size: number; color: string; delay: number;
    dur: number; op: number; rotEnd: number; swayAmp: number; swayDur: number;
    swayPhase: number; tx: string; ty: string; glow: string;
  }
  let ${id}: ${Cap}P[] = [];
  let ${id}Timer: ReturnType<typeof setTimeout>;`;

  const fireBranch = `    } else if (type === '${id}') {
      const burst: ${Cap}P[] = [];
      const count = ${cfg.count};
      for (let i = 0; i < count; i++) {
        const dur = ${n(cfg.durMin)} + Math.random() * ${n(durRange)};
        const swayDur = ${n(cfg.swayMin)} + Math.random() * ${n(swayRange)};
        const angle = Math.random() * 360;
        const distance = 20 + Math.random() * 22;
        const color = ${colorExpr(cfg)};
        burst.push({
          id: burstId++,
          x: 4 + Math.random() * 92,
          size: Math.round(${n(cfg.sizeMin)} + Math.random() * ${n(sizeRange)}),
          color,
          delay: Math.random() * ${n(cfg.spawnWindow)},
          dur,
          op: ${n(cfg.opacityMin)} + Math.random() * ${n(opRange)},
          rotEnd: ${cfg.spin ? `(Math.random() < 0.5 ? -1 : 1) * ${n(cfg.rotMax)} * dur` : '0'},
          swayAmp: ${cfg.swayAmp ? `${n(cfg.swayAmp * 0.6)} + Math.random() * ${n(cfg.swayAmp * 0.4)}` : '0'},
          swayDur,
          swayPhase: Math.random() * swayDur,
          tx: ${txExpr(cfg)},
          ty: ${tyExpr(cfg)},
          glow: ${glowExpr(cfg)},
        });
      }
      ${id} = burst;
      clearTimeout(${id}Timer);
      ${id}Timer = setTimeout(() => (${id} = []), ${lifeMs});
    }`;

  const shapeMarkup =
    sd.render === 'path'
      ? `        <span class="${id}-shape" style="filter:{p.glow};">
          <svg viewBox="${sd.viewBox}" width={p.size} height={p.size} style="display:block;">
            <path fill={p.color} d="${sd.d}" />
          </svg>
        </span>`
      : `        <span class="${id}-shape" style="filter:{p.glow};">
          <span style="display:block; width:{p.size}px; height:{p.size}px; background:{p.color}; border-radius:${sd.radius};"></span>
        </span>`;

  const leftAttr = cfg.direction === 'burst' ? '' : 'left:{p.x}%; ';
  const markup = `  {#each ${id} as p (p.id)}
    <span
      class="${id}"
      style="${leftAttr}--size:{p.size}px; --dur:{p.dur}s; --delay:{p.delay}s; --op:{p.op}; --tx:{p.tx}; --ty:{p.ty}; --sway:{p.swayAmp}px; --swaydur:{p.swayDur}s; --swayphase:{p.swayPhase}s; --rot:{p.rotEnd}deg;"
    >
      <span class="${id}-sway">
${shapeMarkup}
      </span>
    </span>
  {/each}`;

  const basePos =
    cfg.direction === 'fall'
      ? 'top: calc(-1 * var(--size) - 10px);'
      : cfg.direction === 'rise'
        ? 'bottom: calc(-1 * var(--size) - 10px);'
        : 'top: 50%; left: 50%; margin-top: calc(var(--size) / -2);';

  const css = `  .${id} {
    position: absolute;
    width: var(--size);
    height: var(--size);
    margin-left: calc(var(--size) / -2);
    ${basePos}
    animation:
      ${id}-travel var(--dur) ${ease(cfg)} var(--delay) both,
      ${id}-fade var(--dur) linear var(--delay) both;
  }
  @keyframes ${id}-travel {
    from { transform: translate(0, 0) scale(${s0(cfg)}); }
    to { transform: translate(var(--tx), var(--ty)) scale(1); }
  }
  @keyframes ${id}-fade {
    0% { opacity: 0; }
    8% { opacity: var(--op); }
    72% { opacity: var(--op); }
    100% { opacity: 0; }
  }
  .${id}-sway {
    display: block;
    animation: ${id}-sway var(--swaydur) ease-in-out calc(-1 * var(--swayphase)) infinite alternate;
  }
  @keyframes ${id}-sway {
    from { transform: translateX(calc(-1 * var(--sway))); }
    to { transform: translateX(var(--sway)); }
  }
  .${id}-shape {
    display: block;
    animation: ${id}-spin var(--dur) linear var(--delay) both;
  }
  @keyframes ${id}-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(var(--rot)); }
  }`;

  const prompt = `- "${id}": ${cfg.register}`;

  const combined = `/* ============================================================
   ${cfg.label}  (react id: ${id})
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
