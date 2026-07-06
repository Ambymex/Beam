<script lang="ts">
  import { PRESETS, type ReactConfig } from './reactConfig';
  import { SHAPE_LABELS, type ShapeKind } from './shapes';

  // Two-way bound from App; reassigning `config` (even to itself) is what tells
  // Svelte a nested field changed, so the live preview re-fires.
  export let config: ReactConfig;

  const bump = () => (config = config);

  function loadPreset(key: string) {
    config = { ...PRESETS[key] };
  }
  function addColor() {
    config.colors = [...config.colors, '#ffffff'];
    bump();
  }
  function removeColor(i: number) {
    config.colors = config.colors.filter((_, j) => j !== i);
    bump();
  }
  // keep the id a safe snake_case identifier as they type
  function sanitizeId() {
    config.id = config.id.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    bump();
  }

  const shapeKinds = Object.keys(SHAPE_LABELS) as ShapeKind[];
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
    <h3>Emission</h3>
    <label class="field">
      <span>Direction</span>
      <select bind:value={config.direction} on:change={bump}>
        <option value="fall">Fall (top → down)</option>
        <option value="rise">Rise (bottom → up)</option>
        <option value="burst">Burst (from centre)</option>
      </select>
    </label>
    <label class="field">
      <span>Count <b>{config.count}</b></span>
      <input type="range" min="4" max="80" bind:value={config.count} on:input={bump} />
    </label>
    <label class="field">
      <span>Spawn trickle <b>{config.spawnWindow.toFixed(1)}s</b></span>
      <input type="range" min="0" max="4" step="0.1" bind:value={config.spawnWindow} on:input={bump} />
    </label>
    <div class="pair">
      <label class="field">
        <span>Travel min <b>{config.durMin.toFixed(1)}s</b></span>
        <input type="range" min="0.4" max="8" step="0.1" bind:value={config.durMin} on:input={bump} />
      </label>
      <label class="field">
        <span>Travel max <b>{config.durMax.toFixed(1)}s</b></span>
        <input type="range" min="0.4" max="8" step="0.1" bind:value={config.durMax} on:input={bump} />
      </label>
    </div>
    {#if config.direction !== 'burst'}
      <label class="field">
        <span>Horizontal drift <b>{config.driftX}vw</b></span>
        <input type="range" min="0" max="30" bind:value={config.driftX} on:input={bump} />
      </label>
    {/if}
  </section>

  <section>
    <h3>Particle</h3>
    <label class="field">
      <span>Shape</span>
      <select bind:value={config.shape} on:change={bump}>
        {#each shapeKinds as k}<option value={k}>{SHAPE_LABELS[k]}</option>{/each}
      </select>
    </label>
    {#if config.shape === 'custom'}
      <label class="field col">
        <span>Custom SVG path (viewBox 0 0 24 24)</span>
        <textarea rows="2" bind:value={config.customPath} on:input={bump} placeholder="M12 2 L22 22 L2 22 Z"></textarea>
      </label>
    {/if}
    <div class="pair">
      <label class="field">
        <span>Size min <b>{config.sizeMin}px</b></span>
        <input type="range" min="3" max="40" bind:value={config.sizeMin} on:input={bump} />
      </label>
      <label class="field">
        <span>Size max <b>{config.sizeMax}px</b></span>
        <input type="range" min="3" max="48" bind:value={config.sizeMax} on:input={bump} />
      </label>
    </div>
    <label class="field">
      <span>Colour source</span>
      <select bind:value={config.colorMode} on:change={bump}>
        <option value="fixed">Fixed colour(s)</option>
        <option value="signal">Theme --signal</option>
        <option value="contrast">Theme --signal-contrast</option>
      </select>
    </label>
    {#if config.colorMode === 'fixed'}
      <div class="colors">
        {#each config.colors as c, i}
          <div class="color-chip">
            <input type="color" bind:value={config.colors[i]} on:input={bump} />
            {#if config.colors.length > 1}
              <button class="x" on:click={() => removeColor(i)} aria-label="Remove colour">✕</button>
            {/if}
          </div>
        {/each}
        <button class="add-color" on:click={addColor} title="Add a colour for per-particle variation">＋</button>
      </div>
    {/if}
  </section>

  <section>
    <h3>Motion</h3>
    <label class="field check">
      <input type="checkbox" bind:checked={config.spin} on:change={bump} />
      <span>Spin as it travels</span>
    </label>
    {#if config.spin}
      <label class="field">
        <span>Rotation rate <b>{config.rotMax}°/s</b></span>
        <input type="range" min="0" max="180" bind:value={config.rotMax} on:input={bump} />
      </label>
    {/if}
    <label class="field">
      <span>Flutter amplitude <b>{config.swayAmp}px</b></span>
      <input type="range" min="0" max="40" bind:value={config.swayAmp} on:input={bump} />
    </label>
    {#if config.swayAmp > 0}
      <div class="pair">
        <label class="field">
          <span>Flutter min <b>{config.swayMin.toFixed(1)}s</b></span>
          <input type="range" min="0.4" max="3" step="0.1" bind:value={config.swayMin} on:input={bump} />
        </label>
        <label class="field">
          <span>Flutter max <b>{config.swayMax.toFixed(1)}s</b></span>
          <input type="range" min="0.4" max="3.5" step="0.1" bind:value={config.swayMax} on:input={bump} />
        </label>
      </div>
    {/if}
  </section>

  <section>
    <h3>Look</h3>
    <div class="pair">
      <label class="field">
        <span>Opacity min <b>{config.opacityMin.toFixed(2)}</b></span>
        <input type="range" min="0" max="1" step="0.05" bind:value={config.opacityMin} on:input={bump} />
      </label>
      <label class="field">
        <span>Opacity max <b>{config.opacityMax.toFixed(2)}</b></span>
        <input type="range" min="0" max="1" step="0.05" bind:value={config.opacityMax} on:input={bump} />
      </label>
    </div>
    <label class="field">
      <span>Glow blur <b>{config.glowBlur}px</b></span>
      <input type="range" min="0" max="16" bind:value={config.glowBlur} on:input={bump} />
    </label>
    {#if config.glowBlur > 0}
      <label class="field">
        <span>Glow colour</span>
        <select bind:value={config.glowColor} on:change={bump}>
          <option value="auto">Auto (from particle fill)</option>
          <option value="#ffffff">White</option>
          <option value="#ffd98a">Warm gold</option>
          <option value="#ffcde4">Blossom pink</option>
        </select>
      </label>
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
</style>
