<script lang="ts">
  import Controls from './lib/Controls.svelte';
  import Preview from './lib/Preview.svelte';
  import { PRESETS, type ReactConfig } from './lib/reactConfig';
  import { generate } from './lib/generate';

  // start on something pretty so the stage is alive on first load
  let config: ReactConfig = { ...PRESETS.cherry_blossoms };
  let showExport = false;
  let copied = false;

  $: gen = generate(config);

  function copyAll() {
    navigator.clipboard.writeText(gen.combined).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 1500);
    });
  }
</script>

<div class="studio">
  <header class="topbar">
    <div class="brand">React Studio<span class="sub">companion react builder</span></div>
    <button class="export-btn" on:click={() => (showExport = !showExport)}>
      {showExport ? 'Hide code' : '⟨ ⟩ Export code'}
    </button>
  </header>

  <div class="body">
    <div class="controls-wrap">
      <Controls bind:config />
    </div>
    <div class="right">
      <Preview {config} />
      {#if showExport}
        <div class="export-panel">
          <div class="export-head">
            <span>Paste-ready code for <code>{config.id || 'my_react'}</code></span>
            <button on:click={copyAll}>{copied ? 'Copied ✓' : 'Copy all'}</button>
          </div>
          <pre>{gen.combined}</pre>
        </div>
      {/if}
    </div>
  </div>
</div>
