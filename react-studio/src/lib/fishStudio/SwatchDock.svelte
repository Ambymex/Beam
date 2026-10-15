<script lang="ts">
  // 🎨 2D Fish Studio — Persistent Color Palette Swatch Dock
  import {
    paletteSwatches,
    addSwatch,
    removeSwatch,
    resetDefaultSwatches,
    type ColorSwatch,
  } from './fishSwatches';

  export let activeColor: string = '#70d6ff';
  export let onApplyColor: ((hex: string) => void) | undefined = undefined;

  let selectedSwatchId: string | null = null;
  let newColorInput = '#70d6ff';
  let copiedHex: string | null = null;
  let copiedTimer: any = null;

  $: selectedSwatch = $paletteSwatches.find((s) => s.id === selectedSwatchId) || null;

  function handleAddSwatch() {
    if (newColorInput) {
      addSwatch(newColorInput);
    }
  }

  function handleSaveCurrent() {
    if (activeColor) {
      addSwatch(activeColor);
    }
  }

  function handleDeleteSelected() {
    if (selectedSwatchId) {
      removeSwatch(selectedSwatchId);
      selectedSwatchId = null;
    }
  }

  function handleSwatchClick(swatch: ColorSwatch) {
    selectedSwatchId = swatch.id;
    if (onApplyColor) {
      onApplyColor(swatch.hex);
    }
    // Copy to clipboard
    try {
      navigator.clipboard.writeText(swatch.hex);
      copiedHex = swatch.hex;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        copiedHex = null;
      }, 2000);
    } catch {
      /* clipboard fallback */
    }
  }
</script>

<div class="swatch-dock">
  <div class="dock-header">
    <div class="header-left">
      <span class="dock-title">🎨 Swatches</span>
      <span class="dock-count">({$paletteSwatches.length})</span>
      {#if copiedHex}
        <span class="copied-badge">Copied {copiedHex}!</span>
      {/if}
    </div>
    <div class="header-right">
      <button class="icon-btn" on:click={handleSaveCurrent} title="Save current fish color to dock">
        + Save Current
      </button>
      {#if selectedSwatchId}
        <button class="icon-btn del-btn" on:click={handleDeleteSelected} title="Delete selected swatch">
          ✕ Delete
        </button>
      {/if}
      <button class="reset-link" on:click={resetDefaultSwatches} title="Reset to default starter swatches">
        ↺
      </button>
    </div>
  </div>

  <div class="swatches-grid">
    {#each $paletteSwatches as swatch (swatch.id)}
      <div class="swatch-item">
        <button
          class="swatch-btn"
          class:selected={selectedSwatchId === swatch.id}
          style="background-color: {swatch.hex};"
          title="{swatch.name || swatch.hex} (Click to select & apply)"
          on:click={() => handleSwatchClick(swatch)}
        />
      </div>
    {/each}

    <!-- Add New Swatch Button & Picker -->
    <div class="add-swatch-box" title="Pick a color to add to dock">
      <input
        type="color"
        class="add-color-picker"
        bind:value={newColorInput}
        on:change={handleAddSwatch}
      />
      <span class="add-plus-icon">+</span>
    </div>
  </div>

  <!-- Selected Swatch Info Footer -->
  {#if selectedSwatch}
    <div class="selected-swatch-row">
      <div class="selected-left">
        <span class="color-preview-dot" style="background-color: {selectedSwatch.hex};"></span>
        <span class="selected-hex-code">{selectedSwatch.hex.toUpperCase()}</span>
        {#if selectedSwatch.name}
          <span class="selected-name">({selectedSwatch.name})</span>
        {/if}
      </div>
      <span class="applied-hint">Applied to active element</span>
    </div>
  {/if}
</div>

<style>
  .swatch-dock {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--surface-1, rgba(0, 0, 0, 0.3));
    border: 1px solid var(--hairline, var(--border));
    border-radius: 8px;
    margin-top: 10px;
    flex: 0 0 auto;
  }

  .dock-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .dock-title {
    font-weight: 700;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 10.5px;
  }

  .dock-count {
    color: var(--text-dim);
    font-size: 10px;
  }

  .copied-badge {
    background: var(--signal);
    color: var(--signal-contrast, #000);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 9.5px;
    font-weight: 700;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-2px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .icon-btn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .icon-btn:hover {
    border-color: var(--signal);
    color: var(--text);
  }

  .del-btn {
    background: rgba(230, 57, 70, 0.15);
    border-color: rgba(230, 57, 70, 0.4);
    color: #ff6b6b;
  }

  .del-btn:hover {
    background: #e63946;
    color: #ffffff;
    border-color: #ffffff;
  }

  .reset-link {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 12px;
    cursor: pointer;
    padding: 0 2px;
  }

  .reset-link:hover {
    color: var(--signal);
  }

  .swatches-grid {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .swatch-item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .swatch-btn {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
    padding: 0;
  }

  .swatch-btn:hover {
    transform: translateY(-2px) scale(1.08);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.5);
    border-color: #ffffff;
  }

  .swatch-btn.selected {
    outline: 2px solid var(--signal, #70d6ff);
    outline-offset: 1px;
    border-color: #ffffff;
    transform: scale(1.06);
  }

  .add-swatch-box {
    position: relative;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px dashed var(--border);
    background: var(--surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    overflow: hidden;
  }

  .add-swatch-box:hover {
    border-color: var(--signal);
    background: var(--surface-1);
  }

  .add-plus-icon {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-dim);
    pointer-events: none;
  }

  .add-color-picker {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .selected-swatch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 6px;
    border-top: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
    font-size: 10.5px;
  }

  .selected-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .color-preview-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.4);
  }

  .selected-hex-code {
    font-family: monospace;
    font-weight: 700;
    color: var(--signal, #70d6ff);
    letter-spacing: 0.5px;
  }

  .selected-name {
    color: var(--text-dim);
    font-size: 10px;
  }

  .applied-hint {
    color: var(--text-dim);
    font-size: 9.5px;
    font-style: italic;
  }
</style>
