<script lang="ts">
  import Controls from './lib/Controls.svelte';
  import Preview from './lib/Preview.svelte';
  import Coach from './lib/Coach.svelte';
  import { PRESETS, migrateConfig, type ReactConfig } from './lib/reactConfig';
  import { generate } from './lib/generate';
  import { drafts, saveDraft, deleteDraft } from './lib/drafts';

  // start on something pretty so the stage is alive on first load
  let config: ReactConfig = migrateConfig(PRESETS.cherry_blossoms);
  let showExport = false;
  let copied = false;
  let draftName = '';
  let loadSel = '';

  $: gen = generate(config);

  function copyAll() {
    navigator.clipboard.writeText(gen.combined).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 1500);
    });
  }

  function doSave() {
    const nm = (draftName || config.label || config.id || 'untitled').trim();
    saveDraft(nm, config);
    draftName = nm;
    loadSel = nm;
  }
  function doLoad(name: string) {
    // migrate on load: old single-emitter drafts become one-layer configs
    if (name && $drafts[name]) config = migrateConfig($drafts[name]);
  }
  function doDelete() {
    if (loadSel && $drafts[loadSel]) {
      deleteDraft(loadSel);
      loadSel = '';
    }
  }
</script>

<div class="studio">
  <header class="topbar">
    <div class="brand">React Studio<span class="sub">companion react builder</span></div>
    <div class="topbar-actions">
      <div class="drafts">
        <input
          class="draft-name"
          type="text"
          bind:value={draftName}
          placeholder={config.label || 'draft name'}
        />
        <button class="draft-btn" on:click={doSave}>Save draft</button>
        {#if Object.keys($drafts).length}
          <select class="draft-load" bind:value={loadSel} on:change={() => doLoad(loadSel)}>
            <option value="">Load draft…</option>
            {#each Object.keys($drafts) as name}
              <option value={name}>{name}</option>
            {/each}
          </select>
          {#if loadSel}
            <button class="draft-del" on:click={doDelete} title="Delete this draft" aria-label="Delete draft">✕</button>
          {/if}
        {/if}
      </div>
      <button class="export-btn" on:click={() => (showExport = !showExport)}>
        {showExport ? 'Hide code' : '⟨ ⟩ Export code'}
      </button>
    </div>
  </header>

  <div class="body">
    <div class="controls-wrap">
      <Controls bind:config />
    </div>
    <div class="right">
      <Preview {config} />
      <Coach {config} />
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
