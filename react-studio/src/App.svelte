<script lang="ts">
  import Controls from './lib/Controls.svelte';
  import Preview from './lib/Preview.svelte';
  import Coach from './lib/Coach.svelte';
  import { PRESETS, migrateConfig, type ReactConfig } from './lib/reactConfig';
  import { generate } from './lib/generate';
  import { drafts, saveDraft, deleteDraft } from './lib/drafts';

  // 🐟 Fish Studio Components & Stores
  import FishCanvas from './lib/fishStudio/FishCanvas.svelte';
  import FishControls from './lib/fishStudio/FishControls.svelte';
  import FishCoach from './lib/fishStudio/FishCoach.svelte';
  import { DEFAULT_FISH_CONFIG, migrateFishConfig, type FishConfig } from './lib/fishStudio/fishConfig';
  import { generateFishCode } from './lib/fishStudio/fishGenerate';
  import { fishDrafts, saveFishDraft, deleteFishDraft } from './lib/fishStudio/fishDrafts';

  // Studio Mode State: 'fish' (2D Koi Builder) | 'react' (Ambient Particle Gestures)
  let studioMode: 'react' | 'fish' = 'fish';

  // React Studio State
  let config: ReactConfig = migrateConfig(PRESETS.cherry_blossoms);
  let draftName = '';
  let loadSel = '';

  // Fish Studio State
  let fishConfig: FishConfig = migrateFishConfig(DEFAULT_FISH_CONFIG);
  let fishDraftName = '';
  let fishLoadSel = '';

  let showExport = false;
  let copied = false;

  $: genReact = generate(config);
  $: genFish = generateFishCode(fishConfig);
  $: currentExportCode = studioMode === 'react' ? genReact.combined : genFish.combined;
  $: currentExportId = studioMode === 'react' ? (config.id || 'my_react') : (fishConfig.id || 'custom_koi');

  function copyAll() {
    navigator.clipboard.writeText(currentExportCode).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 1500);
    });
  }

  // React Draft Handlers
  function doSaveReact() {
    const nm = (draftName || config.label || config.id || 'untitled').trim();
    saveDraft(nm, config);
    draftName = nm;
    loadSel = nm;
  }
  function doLoadReact(name: string) {
    if (name && $drafts[name]) config = migrateConfig($drafts[name]);
  }
  function doDeleteReact() {
    if (loadSel && $drafts[loadSel]) {
      deleteDraft(loadSel);
      loadSel = '';
    }
  }

  // Fish Draft Handlers
  function doSaveFish() {
    const nm = (fishDraftName || fishConfig.label || fishConfig.id || 'untitled_fish').trim();
    saveFishDraft(nm, fishConfig);
    fishDraftName = nm;
    fishLoadSel = nm;
  }
  function doLoadFish(name: string) {
    if (name && $fishDrafts[name]) fishConfig = migrateFishConfig($fishDrafts[name]);
  }
  function doDeleteFish() {
    if (fishLoadSel && $fishDrafts[fishLoadSel]) {
      deleteFishDraft(fishLoadSel);
      fishLoadSel = '';
    }
  }
</script>

<div class="studio">
  <header class="topbar">
    <div class="brand-wrap">
      <div class="brand">
        {studioMode === 'fish' ? 'Fish Studio' : 'React Studio'}
        <span class="sub">{studioMode === 'fish' ? '2D Top-Down Koi visual designer' : 'companion react builder'}</span>
      </div>

      <!-- Studio Mode Switcher -->
      <div class="mode-switcher" role="tablist" aria-label="Studio mode">
        <button
          role="tab"
          aria-selected={studioMode === 'fish'}
          class="mode-btn"
          class:active={studioMode === 'fish'}
          on:click={() => (studioMode = 'fish')}
        >
          🐟 Fish Studio
        </button>
        <button
          role="tab"
          aria-selected={studioMode === 'react'}
          class="mode-btn"
          class:active={studioMode === 'react'}
          on:click={() => (studioMode = 'react')}
        >
          ✨ React Studio
        </button>
      </div>
    </div>

    <div class="topbar-actions">
      <!-- Mode-aware Draft Persistence -->
      {#if studioMode === 'react'}
        <div class="drafts">
          <input
            class="draft-name"
            type="text"
            bind:value={draftName}
            placeholder={config.label || 'draft name'}
          />
          <button class="draft-btn" on:click={doSaveReact}>Save draft</button>
          {#if Object.keys($drafts).length}
            <select class="draft-load" bind:value={loadSel} on:change={() => doLoadReact(loadSel)}>
              <option value="">Load draft…</option>
              {#each Object.keys($drafts) as name}
                <option value={name}>{name}</option>
              {/each}
            </select>
            {#if loadSel}
              <button class="draft-del" on:click={doDeleteReact} title="Delete this draft" aria-label="Delete draft">✕</button>
            {/if}
          {/if}
        </div>
      {:else}
        <div class="drafts">
          <input
            class="draft-name"
            type="text"
            bind:value={fishDraftName}
            placeholder={fishConfig.label || 'fish skin draft'}
          />
          <button class="draft-btn" on:click={doSaveFish}>Save draft</button>
          {#if Object.keys($fishDrafts).length}
            <select class="draft-load" bind:value={fishLoadSel} on:change={() => doLoadFish(fishLoadSel)}>
              <option value="">Load draft…</option>
              {#each Object.keys($fishDrafts) as name}
                <option value={name}>{name}</option>
              {/each}
            </select>
            {#if fishLoadSel}
              <button class="draft-del" on:click={doDeleteFish} title="Delete this draft" aria-label="Delete draft">✕</button>
            {/if}
          {/if}
        </div>
      {/if}

      <button class="export-btn" on:click={() => (showExport = !showExport)}>
        {showExport ? 'Hide code' : '⟨ ⟩ Export code'}
      </button>
    </div>
  </header>

  <div class="body">
    {#if studioMode === 'react'}
      <div class="controls-wrap">
        <Controls bind:config />
      </div>
      <div class="right">
        <Preview {config} />
        <Coach {config} />
        {#if showExport}
          <div class="export-panel">
            <div class="export-head">
              <span>Paste-ready code for <code>{currentExportId}</code></span>
              <button on:click={copyAll}>{copied ? 'Copied ✓' : 'Copy all'}</button>
            </div>
            <pre>{currentExportCode}</pre>
          </div>
        {/if}
      </div>
    {:else}
      <!-- 🐟 2D Fish Studio Mode -->
      <div class="controls-wrap">
        <FishControls bind:config={fishConfig} />
      </div>
      <div class="right">
        <FishCanvas config={fishConfig} />
        <FishCoach config={fishConfig} />
        {#if showExport}
          <div class="export-panel">
            <div class="export-head">
              <span>Paste-ready <code>species_ontology.js</code> & 3D Uniforms for <code>{currentExportId}</code></span>
              <button on:click={copyAll}>{copied ? 'Copied ✓' : 'Copy all'}</button>
            </div>
            <pre>{currentExportCode}</pre>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
