<script lang="ts">
  // A little visual polygon editor for the 'custom' shape: click to drop
  // vertices on a 24×24 grid (the shapes' viewBox), or start from a preset.
  // Owns its points; writes an `M …L …Z` path up via bind:path + a change event.
  import { createEventDispatcher, onMount } from 'svelte';

  export let path: string;
  const dispatch = createEventDispatcher<{ change: void }>();

  const GRID = 24;
  const VIEW = 200;
  const scale = VIEW / GRID;

  interface Pt { x: number; y: number; }

  const STARTERS: Record<string, Pt[]> = {
    triangle: [{ x: 12, y: 2 }, { x: 22, y: 22 }, { x: 2, y: 22 }],
    diamond: [{ x: 12, y: 1 }, { x: 22, y: 12 }, { x: 12, y: 23 }, { x: 2, y: 12 }],
    hexagon: [{ x: 12, y: 2 }, { x: 21, y: 7 }, { x: 21, y: 17 }, { x: 12, y: 22 }, { x: 3, y: 17 }, { x: 3, y: 7 }],
    star: star5(),
    arrow: [{ x: 12, y: 1 }, { x: 22, y: 12 }, { x: 16, y: 12 }, { x: 16, y: 23 }, { x: 8, y: 23 }, { x: 8, y: 12 }, { x: 2, y: 12 }],
  };

  function star5(): Pt[] {
    const pts: Pt[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 11 : 4.6;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push({ x: round(12 + r * Math.cos(a)), y: round(12 + r * Math.sin(a)) });
    }
    return pts;
  }

  // function declarations (hoisted) — STARTERS.star calls star5()→round during
  // init, above where these sit textually; a `const` arrow would be in its TDZ.
  function round(n: number): number { return Math.round(n * 2) / 2; }
  function clamp(n: number): number { return Math.max(0, Math.min(GRID, n)); }

  function parse(p: string): Pt[] {
    const nums = (p.match(/-?[\d.]+/g) ?? []).map(Number);
    const pts: Pt[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
    return pts.length >= 3 ? pts : STARTERS.triangle.map((q) => ({ ...q }));
  }

  let points: Pt[] = parse(path);
  let svgEl: SVGSVGElement;

  // Compute the path from points directly (not via the reactive pathStr, which
  // only updates on the NEXT tick — commit() runs synchronously right after a
  // points change, so it would otherwise read the previous path).
  function toPath(pts: Pt[]): string {
    return pts.length >= 2
      ? 'M ' + pts.map((p, i) => `${i ? 'L ' : ''}${round(p.x)} ${round(p.y)}`).join(' ') + ' Z'
      : '';
  }
  $: pathStr = toPath(points);

  function commit() {
    path = toPath(points);
    dispatch('change');
  }
  onMount(() => { if (!path) commit(); });

  function addPoint(e: MouseEvent) {
    const r = svgEl.getBoundingClientRect();
    const x = clamp(round(((e.clientX - r.left) / r.width) * GRID));
    const y = clamp(round(((e.clientY - r.top) / r.height) * GRID));
    points = [...points, { x, y }];
    commit();
  }
  function undo() { points = points.slice(0, -1); commit(); }
  function clear() { points = []; commit(); }
  function loadStarter(k: string) { points = STARTERS[k].map((p) => ({ ...p })); commit(); }
</script>

<div class="shape-editor">
  <div class="starter-row">
    {#each Object.keys(STARTERS) as k}
      <button class="starter" on:click={() => loadStarter(k)}>{k}</button>
    {/each}
  </div>
  <div class="editor-row">
    <svg
      bind:this={svgEl}
      class="grid"
      viewBox="0 0 {VIEW} {VIEW}"
      on:click={addPoint}
      role="application"
      aria-label="Click to add polygon points"
    >
      {#each Array(GRID + 1) as _, i}
        <line x1={i * scale} y1="0" x2={i * scale} y2={VIEW} class="gl" />
        <line x1="0" y1={i * scale} x2={VIEW} y2={i * scale} class="gl" />
      {/each}
      {#if pathStr}
        <path
          d={points.map((p, i) => `${i ? 'L' : 'M'} ${p.x * scale} ${p.y * scale}`).join(' ') + ' Z'}
          class="poly"
        />
      {/if}
      {#each points as p}
        <circle cx={p.x * scale} cy={p.y * scale} r="3.5" class="vtx" />
      {/each}
    </svg>
    <div class="editor-side">
      <button class="ebtn" on:click={undo} disabled={!points.length}>Undo</button>
      <button class="ebtn" on:click={clear} disabled={!points.length}>Clear</button>
      <p class="tip">Click the grid to add points. Start from a shape above, then nudge.</p>
      <code class="pathout">{pathStr || '(no points)'}</code>
    </div>
  </div>
</div>

<style>
  .shape-editor { display: flex; flex-direction: column; gap: 8px; }
  .starter-row { display: flex; flex-wrap: wrap; gap: 5px; }
  .starter {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    border-radius: 999px;
    padding: 3px 9px;
    font-size: 10px;
    text-transform: capitalize;
    cursor: pointer;
  }
  .editor-row { display: flex; gap: 10px; }
  .grid {
    width: 150px;
    height: 150px;
    flex: 0 0 auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: crosshair;
  }
  .gl { stroke: var(--hairline); stroke-width: 1; }
  .poly { fill: var(--signal); opacity: 0.5; stroke: var(--signal); stroke-width: 1.5; }
  .vtx { fill: var(--signal-contrast); stroke: var(--signal); stroke-width: 1.5; }
  .editor-side { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .ebtn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
  }
  .ebtn:disabled { opacity: 0.4; cursor: default; }
  .tip { margin: 0; font-size: 10px; color: var(--text-faint); line-height: 1.4; }
  .pathout {
    font-family: ui-monospace, monospace;
    font-size: 9px;
    color: var(--text-dim);
    background: var(--surface-2);
    border-radius: 6px;
    padding: 5px 7px;
    word-break: break-all;
    line-height: 1.4;
  }
</style>
