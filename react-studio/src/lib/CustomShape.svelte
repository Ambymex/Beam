<script lang="ts">
  // Custom shapes have two doors: import path-based SVG artwork (the friendly
  // route for Krita) or draw a small polygon on the original 24×24 grid.
  import { createEventDispatcher, onMount } from 'svelte';
  import type { CustomPathPart } from './shapes';
  import { parseSvgShape } from './svgImport';

  export let path: string;
  export let viewBox = '0 0 24 24';
  export let paths: CustomPathPart[] = [];
  export let sourceName = '';

  const dispatch = createEventDispatcher<{ change: void }>();
  const GRID = 24;
  const VIEW = 200;
  const MAX_FILE_BYTES = 2 * 1024 * 1024;
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

  function round(n: number): number { return Math.round(n * 2) / 2; }
  function clamp(n: number): number { return Math.max(0, Math.min(GRID, n)); }

  function parse(p: string): Pt[] {
    const nums = (p.match(/-?[\d.]+/g) ?? []).map(Number);
    const pts: Pt[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
    return pts.length >= 3 ? pts : STARTERS.triangle.map((q) => ({ ...q }));
  }

  let points: Pt[] = parse(path);
  let handPath = paths.length ? '' : path;
  let svgEl: SVGSVGElement;
  let fileInput: HTMLInputElement;
  let importError = '';
  let importNote = '';

  $: imported = paths.length > 0;

  function toPath(pts: Pt[]): string {
    return pts.length >= 2
      ? 'M ' + pts.map((p, i) => `${i ? 'L ' : ''}${round(p.x)} ${round(p.y)}`).join(' ') + ' Z'
      : '';
  }
  $: pathStr = toPath(points);

  function commitGrid() {
    path = toPath(points);
    handPath = path;
    viewBox = '0 0 24 24';
    paths = [];
    sourceName = '';
    importError = '';
    importNote = '';
    dispatch('change');
  }

  onMount(() => {
    if (!path && !paths.length) commitGrid();
  });

  function addPoint(e: MouseEvent) {
    const r = svgEl.getBoundingClientRect();
    const x = clamp(round(((e.clientX - r.left) / r.width) * GRID));
    const y = clamp(round(((e.clientY - r.top) / r.height) * GRID));
    points = [...points, { x, y }];
    commitGrid();
  }
  function undo() { points = points.slice(0, -1); commitGrid(); }
  function clear() { points = []; commitGrid(); }
  function loadStarter(k: string) { points = STARTERS[k].map((p) => ({ ...p })); commitGrid(); }

  async function importSvg(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    importError = '';
    importNote = '';
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error('That SVG is over 2 MB. Simplify it in Krita, then export again.');
      const text = await file.text();
      const imported = parseSvgShape(text);

      if (!paths.length) handPath = path;
      viewBox = imported.viewBox;
      paths = imported.paths;
      path = imported.paths[0].d; // legacy fallback for older saved-draft readers
      sourceName = file.name;
      importNote = `${imported.paths.length} path${imported.paths.length === 1 ? '' : 's'} imported. Studio uses the react colour, not the SVG's original paint.`;
      dispatch('change');
    } catch (error) {
      importError = error instanceof Error ? error.message : 'Studio could not import that SVG.';
    }
  }

  function useGrid() {
    paths = [];
    sourceName = '';
    viewBox = '0 0 24 24';
    path = handPath || toPath(STARTERS.triangle);
    points = parse(path);
    commitGrid();
  }
</script>

<div class="shape-editor">
  <div class="import-card">
    <input
      bind:this={fileInput}
      class="file-input"
      type="file"
      accept=".svg,image/svg+xml"
      tabindex="-1"
      aria-hidden="true"
      on:change={importSvg}
    />
    <button type="button" class="import-btn" on:click={() => fileInput.click()}>
      {imported ? 'Replace SVG' : 'Import SVG'}
    </button>
    <div>
      <strong>{imported ? sourceName || 'Imported SVG' : 'Bring in a shape from Krita'}</strong>
      <p>In Krita: Layer → Import/Export → Save Vector Layer as SVG. Studio supplies its animated colour.</p>
    </div>
  </div>

  {#if importError}<p class="message error" role="alert">{importError}</p>{/if}
  {#if importNote}<p class="message success">{importNote}</p>{/if}

  {#if imported}
    <div class="editor-row">
      <svg class="grid imported-preview" {viewBox} role="img" aria-label="Imported custom shape preview">
        {#each paths as part}
          <path
            d={part.d}
            transform={part.transform || undefined}
            fill-rule={part.fillRule || undefined}
            class="poly"
          />
        {/each}
      </svg>
      <div class="editor-side">
        <span class="meta">{paths.length} path{paths.length === 1 ? '' : 's'}</span>
        <code class="pathout">viewBox {viewBox}</code>
        <button type="button" class="ebtn" on:click={useGrid}>Draw on grid instead</button>
        <p class="tip">The imported outline is preserved in preview and paste-ready export.</p>
      </div>
    </div>
  {:else}
    <div class="starter-row">
      <span class="or">Or draw:</span>
      {#each Object.keys(STARTERS) as k}
        <button type="button" class="starter" on:click={() => loadStarter(k)}>{k}</button>
      {/each}
    </div>
    <div class="editor-row">
      <button type="button" class="grid-button" on:click={addPoint} aria-label="Click to add polygon points">
        <svg bind:this={svgEl} class="grid" viewBox="0 0 {VIEW} {VIEW}" aria-hidden="true">
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
      </button>
      <div class="editor-side">
        <button type="button" class="ebtn" on:click={undo} disabled={!points.length}>Undo</button>
        <button type="button" class="ebtn" on:click={clear} disabled={!points.length}>Clear</button>
        <p class="tip">Click the grid to add points. Start from a shape above, then nudge.</p>
        <code class="pathout">{pathStr || '(no points)'}</code>
      </div>
    </div>
  {/if}
</div>

<style>
  .shape-editor { display: flex; flex-direction: column; gap: 8px; }
  .import-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface-2);
  }
  .import-card strong { display: block; color: var(--text-2); font-size: 11px; }
  .import-card p { margin: 2px 0 0; color: var(--text-faint); font-size: 10px; line-height: 1.35; }
  .file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .import-btn {
    flex: 0 0 auto;
    background: var(--signal);
    border: 1px solid color-mix(in srgb, var(--signal) 76%, var(--text));
    color: var(--signal-contrast);
    border-radius: 7px;
    padding: 7px 10px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }
  .message { margin: 0; padding: 6px 8px; border-radius: 6px; font-size: 10px; line-height: 1.4; }
  .message.error { color: #b83a3a; background: rgba(190, 55, 55, 0.1); }
  .message.success { color: var(--text-dim); background: color-mix(in srgb, var(--signal) 10%, transparent); }
  .starter-row { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .or { font-size: 10px; color: var(--text-faint); margin-right: 2px; }
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
  .grid-button { display: block; flex: 0 0 auto; padding: 0; border: 0; border-radius: 8px; background: none; cursor: crosshair; }
  .grid {
    width: 150px;
    height: 150px;
    display: block;
    flex: 0 0 auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    cursor: crosshair;
  }
  .imported-preview { cursor: default; padding: 12px; box-sizing: border-box; }
  .gl { stroke: var(--hairline); stroke-width: 1; }
  .poly { fill: var(--signal); opacity: 0.7; stroke: var(--signal); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .vtx { fill: var(--signal-contrast); stroke: var(--signal); stroke-width: 1.5; }
  .editor-side { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .meta { color: var(--text-dim); font-size: 10px; }
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
