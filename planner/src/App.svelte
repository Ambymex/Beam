<script lang="ts">
  import RadialCanvas from './lib/RadialCanvas.svelte';
  import Palette from './lib/Palette.svelte';
</script>

<main>
  <div class="ring">
    <RadialCanvas />
  </div>
  <div class="tray-wrap">
    <Palette />
  </div>
</main>

<style>
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    /* min-width:0 stops the wide palette grid from ballooning the column past
       the viewport (flexbox min-width:auto trap) — keeps the ring viewport-sized
       and lets the tray's own overflow-x scroll instead. */
    min-width: 0;
    width: 100%;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
      env(safe-area-inset-left);
  }
  .ring {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }
  .tray-wrap {
    flex: 0 0 auto;
    min-width: 0;
    padding: 6px 10px 4px;
    border-top: 1px solid #1b1b22;
    background: #0b0b0e;
  }
</style>
