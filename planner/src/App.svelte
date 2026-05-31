<script lang="ts">
  import RadialCanvas from './lib/RadialCanvas.svelte';
</script>

<main>
  <RadialCanvas />
</main>

<style>
  main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
      env(safe-area-inset-left);
  }
</style>
