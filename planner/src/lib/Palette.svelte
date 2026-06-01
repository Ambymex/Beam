<script lang="ts">
  import { VIBES } from './vibes';
  import { armedVibe } from './stores';

  function arm(v: (typeof VIBES)[number]) {
    // Tap an armed swatch again to disarm.
    armedVibe.update((cur) => (cur && cur.id === v.id ? null : v));
  }
</script>

<div class="palette">
  <!-- Armed readout: text is the index, colour is the content (§6). The swatch
       shows its own hue (that's the data); selection is signalled non-colour. -->
  <div class="armed" class:none={!$armedVibe}>
    {#if $armedVibe}
      <span class="dot" style="background:{$armedVibe.hex}"></span>
      <span class="label">{$armedVibe.emotion}</span>
    {:else}
      <span class="label hint">Tap a vibe to arm it, then draw on the ring</span>
    {/if}
  </div>

  <div class="tray" role="group" aria-label="Vibe palette">
    {#each VIBES as v (v.id)}
      <button
        class="swatch"
        class:armed={$armedVibe?.id === v.id}
        style="background:{v.hex}"
        title={v.emotion}
        aria-label={v.emotion}
        aria-pressed={$armedVibe?.id === v.id}
        on:click={() => arm(v)}
      ></button>
    {/each}
  </div>
</div>

<style>
  .palette {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .armed {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 20px;
    padding: 0 4px;
    font-size: 13px;
    line-height: 1.25;
  }
  .armed .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex: 0 0 auto;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25);
  }
  .armed .label {
    color: var(--text-2);
  }
  .armed .label.hint {
    color: var(--text-faint);
  }

  /* Two-row, horizontally scrolling strip so all 77 vibes are swipe-reachable. */
  .tray {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(2, auto);
    gap: 7px;
    overflow-x: auto;
    padding: 4px 2px 8px;
    scrollbar-width: thin;
    -webkit-overflow-scrolling: touch;
  }

  .swatch {
    width: 30px;
    height: 30px;
    border-radius: 7px;
    border: none;
    padding: 0;
    cursor: pointer;
    /* faint neutral edge so pale swatches stay visible against the ground */
    box-shadow: inset 0 0 0 1px var(--swatch-edge);
    transition:
      transform 0.08s ease,
      box-shadow 0.08s ease;
  }
  .swatch:active {
    transform: scale(0.92);
  }
  /* Armed state: NON-colour signal only — a ring gap + signal ring + glow (§2).
     The gap is the page colour, the ring is the signal — both flip with theme. */
  .swatch.armed {
    transform: scale(1.18);
    box-shadow:
      0 0 0 2px var(--app-bg),
      0 0 0 4px var(--signal),
      0 0 10px 2px var(--signal-glow);
  }
</style>
