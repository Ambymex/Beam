<script lang="ts">
  // 🎨 2D Fish Studio — Color Wheel & Mini Palette Generator
  import {
    hexToHsl,
    hslToHex,
    getHarmonies,
    type ColorHarmony,
  } from './colorHarmony';
  import { addSwatch } from './fishSwatches';

  export let baseColor: string = '#70d6ff';
  export let targetLabel: string = 'Base Core';
  export let onApplyColor: ((hex: string) => void) | undefined = undefined;

  let isDragging = false;
  let wheelCanvas: HTMLCanvasElement;

  $: hsl = hexToHsl(baseColor);
  $: harmonies = getHarmonies(baseColor);
  $: complementary = harmonies.find((h) => h.name === 'Complementary') || harmonies[0];

  function updateHueFromPoint(clientX: number, clientY: number) {
    if (!wheelCanvas) return;
    const rect = wheelCanvas.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const dx = clientX - cx;
    const dy = clientY - cy;

    // Angle in degrees: 0 -> 360
    let rad = Math.atan2(dy, dx);
    let deg = Math.round((rad * 180) / Math.PI);
    if (deg < 0) deg += 360;

    const newHex = hslToHex(deg, hsl.s || 85, hsl.l || 60);
    baseColor = newHex;
    if (onApplyColor) {
      onApplyColor(newHex);
    }
  }

  function handlePointerDown(e: PointerEvent) {
    isDragging = true;
    updateHueFromPoint(e.clientX, e.clientY);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging) return;
    updateHueFromPoint(e.clientX, e.clientY);
  }

  function handlePointerUp() {
    isDragging = false;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }

  function handleHarmonyClick(harmony: ColorHarmony) {
    if (onApplyColor) {
      onApplyColor(harmony.hex);
    }
  }
</script>

<div class="color-wheel-card">
  <div class="wheel-header">
    <div class="header-left-title">
      <span class="wheel-title">🌈 Harmony Wheel</span>
      <span class="target-chip">{targetLabel}</span>
    </div>
    <span class="wheel-deg">{hsl.h}° Hue</span>
  </div>

  <!-- Interactive Wheel Stage -->
  <div class="wheel-stage">
    <!-- Wheel Ring -->
    <div
      class="wheel-ring"
      bind:this={wheelCanvas}
      on:pointerdown={handlePointerDown}
      role="slider"
      aria-label="Color Wheel Hue Selector"
      aria-valuenow={hsl.h}
      aria-valuemin={0}
      aria-valuemax={360}
      tabindex="0"
    >
      <!-- Base Color Marker Node -->
      <div
        class="marker-node base-marker"
        style="
          transform: rotate({hsl.h}deg) translate(40px) rotate(-{hsl.h}deg);
          background-color: {baseColor};
        "
        title="Active Color: {targetLabel} ({baseColor})"
      />

      <!-- Complementary Node (180° Opposite) -->
      <div
        class="marker-node comp-marker"
        style="
          transform: rotate({(hsl.h + 180) % 360}deg) translate(40px) rotate(-{(hsl.h + 180) % 360}deg);
          background-color: {complementary.hex};
        "
        title="Complementary Opposite ({complementary.hex})"
      />

      <!-- Center Hub -->
      <div class="wheel-center">
        <input
          type="color"
          class="center-color-input"
          bind:value={baseColor}
          on:input={(e) => onApplyColor && onApplyColor(e.currentTarget.value)}
          title="Click to choose precise hex for {targetLabel}"
        />
        <div class="center-preview" style="background-color: {baseColor};"></div>
      </div>
    </div>

    <!-- Direct Complementary Hero Strip -->
    <div class="comp-hero-strip">
      <div class="hero-color-col">
        <span class="hero-label">Base</span>
        <div class="hero-pill-wrap">
          <span class="hero-pill" style="background-color: {baseColor};"></span>
          <span class="hero-hex">{baseColor.toUpperCase()}</span>
          <button
            type="button"
            class="mini-add-btn"
            on:click={() => addSwatch(baseColor)}
            title="Add Base to Swatches"
          >+</button>
        </div>
      </div>

      <div class="hero-divider">
        <span class="comp-icon">⇄</span>
        <span class="comp-text">180° Comp</span>
      </div>

      <div class="hero-color-col">
        <span class="hero-label">Complementary</span>
        <div class="hero-pill-wrap">
          <span class="hero-pill" style="background-color: {complementary.hex};"></span>
          <span class="hero-hex">{complementary.hex.toUpperCase()}</span>
          <button
            type="button"
            class="mini-add-btn"
            on:click={() => addSwatch(complementary.hex)}
            title="Add Complementary to Swatches"
          >+</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Mini Harmony Palette Generator Suggestions -->
  <div class="harmonies-section">
    <div class="harmonies-label">✨ Harmonic Palette Suggestions</div>
    <div class="harmonies-grid">
      {#each harmonies as harm (harm.name)}
        <div
          class="harmony-card"
          title="{harm.name} — {harm.role} (Click to apply)"
          on:click={() => handleHarmonyClick(harm)}
          on:keydown={(e) => e.key === 'Enter' && handleHarmonyClick(harm)}
          tabindex="0"
          role="button"
        >
          <div class="harmony-top">
            <span class="harmony-chip" style="background-color: {harm.hex};"></span>
            <span class="harmony-hex">{harm.hex.toUpperCase()}</span>
            <button
              type="button"
              class="harmony-add-btn"
              on:click|stopPropagation={() => addSwatch(harm.hex)}
              title="Add {harm.hex} to Swatch Dock"
            >+</button>
          </div>
          <span class="harmony-name">{harm.name}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .color-wheel-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--surface-1, rgba(0, 0, 0, 0.15));
    border: 1px solid var(--hairline, var(--border));
    border-radius: 10px;
    padding: 10px 12px;
  }

  .wheel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-left-title {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .wheel-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .target-chip {
    font-size: 9.5px;
    font-weight: 700;
    color: var(--signal, #70d6ff);
    background: rgba(112, 214, 255, 0.12);
    border: 1px solid rgba(112, 214, 255, 0.3);
    padding: 1px 5px;
    border-radius: 4px;
  }

  .wheel-deg {
    font-size: 10px;
    font-family: monospace;
    font-weight: 700;
    color: var(--signal, #70d6ff);
  }

  .wheel-stage {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .wheel-ring {
    position: relative;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background: conic-gradient(
      from 0deg,
      #ff0000 0deg,
      #ffff00 60deg,
      #00ff00 120deg,
      #00ffff 180deg,
      #0000ff 240deg,
      #ff00ff 300deg,
      #ff0000 360deg
    );
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), inset 0 0 4px rgba(0, 0, 0, 0.6);
    cursor: crosshair;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    touch-action: none;
  }

  .marker-node {
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid #ffffff;
    box-shadow: 0 0 6px rgba(0, 0, 0, 0.8);
    pointer-events: none;
    transition: background-color 0.1s ease;
  }

  .base-marker {
    z-index: 3;
    box-shadow: 0 0 8px #ffffff, 0 0 4px rgba(0, 0, 0, 0.9);
  }

  .comp-marker {
    z-index: 2;
    border-style: dashed;
    box-shadow: 0 0 6px var(--signal, #70d6ff);
  }

  .wheel-center {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--surface-bg, #11141c);
    border: 2px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    cursor: pointer;
  }

  .center-preview {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.3);
    pointer-events: none;
  }

  .center-color-input {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .comp-hero-strip {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
    flex: 1 1 auto;
  }

  .hero-color-col {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .hero-label {
    font-size: 9.5px;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .hero-pill-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--surface-2);
    padding: 3px 6px;
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  .hero-pill {
    width: 14px;
    height: 14px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    flex: 0 0 auto;
  }

  .hero-hex {
    font-family: monospace;
    font-size: 10.5px;
    font-weight: 700;
    color: var(--text);
    flex: 1 1 auto;
  }

  .mini-add-btn {
    background: var(--surface-1);
    border: 1px solid var(--border);
    color: var(--text-dim);
    border-radius: 3px;
    width: 15px;
    height: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
    transition: all 0.12s ease;
  }

  .mini-add-btn:hover {
    border-color: var(--signal);
    color: var(--signal);
    background: var(--surface-2);
    transform: scale(1.15);
  }

  .hero-divider {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    color: var(--signal, #70d6ff);
    font-weight: 700;
    padding-left: 2px;
  }

  .comp-icon {
    font-size: 11px;
  }

  .harmonies-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--hairline, rgba(255, 255, 255, 0.08));
  }

  .harmonies-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .harmonies-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  .harmony-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 6px;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .harmony-card:hover {
    border-color: var(--signal);
    background: var(--surface-1);
    transform: translateY(-1px);
  }

  .harmony-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
  }

  .harmony-chip {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    flex: 0 0 auto;
  }

  .harmony-hex {
    font-family: monospace;
    font-size: 9.5px;
    font-weight: 700;
    color: var(--text);
    flex: 1 1 auto;
  }

  .harmony-add-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-dim);
    border-radius: 3px;
    width: 13px;
    height: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
    transition: all 0.12s ease;
  }

  .harmony-add-btn:hover {
    border-color: var(--signal);
    color: var(--signal);
    transform: scale(1.2);
  }

  .harmony-name {
    font-size: 8.5px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
