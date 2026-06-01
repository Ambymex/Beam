<script lang="ts">
  // Vibe palette (§6). The 77 vibes cluster into categories. Browsing happens in
  // a VERTICAL bottom sheet that stacks categories top-to-bottom — horizontal
  // scrolling read as "far away" to this brain, a stack reads as "here". The
  // sheet may cover the ring while open (intentional); picking a vibe closes it
  // so you can draw.
  //
  // No category invents a hue — a category swatch is one of its own member hexes
  // (categories.ts), so all colour still originates in the user's DB (§2).
  import { VIBES, type Vibe } from './vibes';
  import { categoryList, categoryVibeById, type ResolvedCategory } from './categories';
  import { customVibes, addCustomVibe, removeCustomVibe } from './customVibes';
  import { addCustomCategory, removeCustomCategory } from './customCategories';
  import { downloadJSON, downloadText, copyTextList } from './exportVibes';
  import { armedVibe } from './stores';

  let sheetOpen = false;
  let expandedId: string | null = null; // the category whose members are shown
  let showAll = false; // flat full-list section inside the sheet

  // create-a-vibe form (§4/§6). targetCat = the category to file it under
  // (null = uncategorised → "yours"). Set when launched from a category row.
  let creating = false;
  let newHex = '#7c8cff';
  let newEmotion = '';
  let targetCat: string | null = null;

  // new-category form
  let addingCat = false;
  let newCatLabel = '';
  let newCatIcon = '✦';

  function armVibe(v: Vibe) {
    armedVibe.set(v);
    sheetOpen = false; // picked — get out of the way so they can draw
  }
  function disarm() {
    armedVibe.set(null);
  }

  function openCreate(catId: string | null) {
    targetCat = catId;
    creating = true;
    addingCat = false;
    if (catId) expandedId = catId; // show where it'll land
  }
  function createVibe() {
    const v = addCustomVibe(newHex, newEmotion, targetCat ?? undefined);
    creating = false;
    newEmotion = '';
    if (targetCat) {
      // filed into a category — keep the sheet open so she can keep adding
      targetCat = null;
    } else {
      armVibe(v); // standalone vibe → arm + close
    }
  }

  function createCategory() {
    const c = addCustomCategory(newCatLabel, newCatIcon);
    addingCat = false;
    newCatLabel = '';
    newCatIcon = '✦';
    expandedId = c.id;
    openCreate(c.id); // immediately offer to add its first vibe
  }

  function tapCategory(cat: ResolvedCategory) {
    const cv = categoryVibeById(cat.id);
    if (cv) armVibe(cv); // arm the category as-is + close
  }
  function toggleExpand(id: string) {
    expandedId = expandedId === id ? null : id;
  }

  let copied = false;
  async function doCopy() {
    copied = await copyTextList();
    if (copied) setTimeout(() => (copied = false), 1500);
  }
</script>

<!-- collapsed bar: armed readout + open-the-sheet -->
<div class="bar">
  <button class="readout" on:click={() => (sheetOpen = true)} aria-label="Browse vibes">
    {#if $armedVibe}
      <span class="dot" style="background:{$armedVibe.hex}"></span>
      <span class="label">{$armedVibe.emotion}</span>
    {:else}
      <span class="label hint">Tap to pick a vibe</span>
    {/if}
    <span class="open-cue">▴ vibes</span>
  </button>
  {#if $armedVibe}
    <button class="clear" on:click={disarm} aria-label="Clear armed vibe">✕</button>
  {/if}
</div>

{#if sheetOpen}
  <!-- backdrop + vertical sheet -->
  <div
    class="scrim"
    role="button"
    tabindex="-1"
    aria-label="Close vibe sheet"
    on:click={() => (sheetOpen = false)}
    on:keydown={(e) => e.key === 'Escape' && (sheetOpen = false)}
  ></div>

  <div class="sheet" role="dialog" aria-label="Vibes">
    <header class="sheet-head">
      <span class="grip" aria-hidden="true"></span>
      <div class="head-row">
        <strong>Vibes</strong>
        <div class="head-actions">
          <button class="more" on:click={() => openCreate(null)} aria-label="Create a vibe">✛ vibe</button>
          <button class="more" class:on={addingCat} on:click={() => { addingCat = !addingCat; creating = false; }} aria-label="Create a category">✛ category</button>
          <button class="more" class:on={showAll} on:click={() => (showAll = !showAll)}>
            {showAll ? 'categories' : 'all 77'}
          </button>
          <button class="more close" on:click={() => (sheetOpen = false)} aria-label="Close">✕</button>
        </div>
      </div>

      {#if creating}
        <!-- pick a hue + name what it feels like — how the whole DB was built -->
        <div class="create">
          <label class="pick" aria-label="Pick a colour">
            <input type="color" bind:value={newHex} />
            <span class="chip-swatch" style="background:{newHex}"></span>
          </label>
          <input
            class="emotion-in"
            type="text"
            placeholder={targetCat ? 'add a vibe to this category…' : 'what does it feel like?'}
            bind:value={newEmotion}
            on:keydown={(e) => e.key === 'Enter' && createVibe()}
          />
          <button class="save" on:click={createVibe}>save</button>
        </div>
      {/if}

      {#if addingCat}
        <div class="create">
          <input class="icon-in" type="text" maxlength="2" bind:value={newCatIcon} aria-label="Category icon" />
          <input
            class="emotion-in"
            type="text"
            placeholder="new category name…"
            bind:value={newCatLabel}
            on:keydown={(e) => e.key === 'Enter' && createCategory()}
          />
          <button class="save" on:click={createCategory}>add</button>
        </div>
      {/if}
    </header>

    <div class="sheet-body">
      {#if showAll}
        <!-- flat view: every built-in vibe, wrapped -->
        <div class="all" role="group" aria-label="All vibes">
          {#each VIBES as v (v.id)}
            <button
              class="swatch"
              class:armed={$armedVibe?.id === v.id}
              style="background:{v.hex}"
              title={v.emotion}
              aria-label={v.emotion}
              aria-pressed={$armedVibe?.id === v.id}
              on:click={() => armVibe(v)}
            ></button>
          {/each}
        </div>
      {:else}
        <!-- categories STACKED VERTICALLY, full-width rows (built-in + custom) -->
        {#each $categoryList as cat (cat.id)}
          <div class="cat" class:armed={$armedVibe?.id === cat.id}>
            <button class="cat-main" aria-pressed={$armedVibe?.id === cat.id} on:click={() => tapCategory(cat)}>
              <span class="swatch sm" style="background:{cat.repHex}"></span>
              <span class="cat-ico">{cat.icon}</span>
              <span class="cat-label">{cat.label}</span>
              {#if cat.custom}<span class="badge">custom</span>{/if}
            </button>
            <button
              class="chev"
              class:open={expandedId === cat.id}
              aria-label="Expand {cat.label}"
              on:click={() => toggleExpand(cat.id)}>›</button
            >
          </div>
          {#if expandedId === cat.id}
            <div class="members" role="group" aria-label="{cat.label} options">
              {#each cat.members as v (v.id)}
                <div class="own">
                  <button
                    class="swatch"
                    class:armed={$armedVibe?.id === v.id}
                    style="background:{v.hex}"
                    title={v.emotion}
                    aria-label={v.emotion}
                    aria-pressed={$armedVibe?.id === v.id}
                    on:click={() => armVibe(v)}
                  ></button>
                  {#if v.id.startsWith('custom:')}
                    <button class="own-rm" aria-label="Delete {v.emotion}" on:click={() => removeCustomVibe(v.id)}>✕</button>
                  {/if}
                </div>
              {/each}
              <button class="add-vibe" on:click={() => openCreate(cat.id)} aria-label="Add a vibe to {cat.label}">＋</button>
              {#if cat.custom}
                <button class="del-cat" on:click={() => removeCustomCategory(cat.id)} aria-label="Delete category {cat.label}">delete category</button>
              {/if}
            </div>
          {/if}
        {/each}
      {/if}

      <!-- export the master list (§6) -->
      <div class="export">
        <span class="rowlabel">master list</span>
        <button class="more" on:click={doCopy}>{copied ? 'copied ✓' : 'copy'}</button>
        <button class="more" on:click={downloadText}>.txt</button>
        <button class="more" on:click={downloadJSON}>.json</button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* collapsed bar */
  .bar {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .readout {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 9px 12px;
    font-size: 13px;
    cursor: pointer;
    color: var(--text-2);
    text-align: left;
  }
  .dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex: 0 0 auto;
    margin-top: 2px;
    box-shadow: 0 0 0 1px var(--swatch-edge);
  }
  .label {
    flex: 1 1 auto;
    min-width: 0;
    /* the descriptions are true unedited reactions — some are long; let them
       wrap (up to ~3 lines) rather than truncate. */
    line-height: 1.3;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .label.hint {
    color: var(--text-faint);
  }
  .open-cue {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--text-dim);
    margin-top: 2px;
  }
  .clear {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 13px;
    cursor: pointer;
  }

  /* sheet */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 25;
    background: rgba(0, 0, 0, 0.28);
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 26;
    max-height: 78vh;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-top-left-radius: 18px;
    border-top-right-radius: 18px;
    border-top: 1px solid var(--border);
    box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.35);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .sheet-head {
    flex: 0 0 auto;
    padding: 8px 14px 10px;
    border-bottom: 1px solid var(--hairline);
  }
  .grip {
    display: block;
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--border-2);
    margin: 2px auto 10px;
  }
  .head-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .head-row strong {
    font-size: 15px;
    color: var(--text);
  }
  .head-actions {
    display: flex;
    gap: 6px;
  }
  .more {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-dim);
    border-radius: 999px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
  }
  .more.on {
    box-shadow: 0 0 0 1px var(--signal) inset;
    color: var(--signal);
  }
  .more.close {
    padding: 4px 9px;
  }

  .sheet-body {
    flex: 1 1 auto;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 10px 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* create form */
  .create {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }
  .pick {
    position: relative;
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    cursor: pointer;
  }
  .pick input[type='color'] {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
  .chip-swatch {
    display: block;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    box-shadow:
      inset 0 0 0 1px var(--swatch-edge),
      0 0 0 1px var(--border);
  }
  .emotion-in {
    flex: 1 1 auto;
    min-width: 0;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: 8px;
    color: var(--text);
    font-size: 13px;
    padding: 8px 10px;
  }
  .icon-in {
    flex: 0 0 auto;
    width: 44px;
    text-align: center;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: 8px;
    color: var(--text);
    font-size: 18px;
    padding: 8px 4px;
  }
  .icon-in:focus {
    outline: none;
    border-color: var(--text-faint);
  }
  .emotion-in::placeholder {
    color: var(--text-faint);
  }
  .emotion-in:focus {
    outline: none;
    border-color: var(--text-faint);
  }
  .save {
    flex: 0 0 auto;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    border-radius: 8px;
    padding: 8px 13px;
    font-size: 13px;
    cursor: pointer;
  }

  .rowlabel {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .own {
    position: relative;
  }
  .own-rm {
    position: absolute;
    top: -5px;
    right: -5px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--surface-3);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 9px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
  }

  /* category rows — full width, stacked */
  .cat {
    display: flex;
    align-items: stretch;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    color: var(--text-2);
    overflow: hidden;
  }
  .cat.armed {
    box-shadow: 0 0 0 1px var(--signal) inset;
  }
  .cat-main {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    gap: 10px;
    background: none;
    border: none;
    padding: 11px 12px;
    cursor: pointer;
    color: inherit;
    text-align: left;
  }
  .cat-ico {
    font-size: 16px;
    line-height: 1;
  }
  .cat-label {
    font-size: 14px;
  }
  .chev {
    flex: 0 0 auto;
    background: none;
    border: none;
    border-left: 1px solid var(--border);
    font-size: 18px;
    color: var(--text-faint);
    transition: transform 0.12s ease;
    padding: 0 16px;
    cursor: pointer;
  }
  .chev.open {
    transform: rotate(90deg);
    color: var(--text-2);
  }

  .members {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 2px 4px 8px;
  }
  .add-vibe {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: none;
    border: 1px dashed var(--border-2);
    color: var(--text-dim);
    font-size: 16px;
    cursor: pointer;
  }
  .del-cat {
    background: none;
    border: none;
    color: var(--text-faint);
    font-size: 11px;
    cursor: pointer;
    text-decoration: underline;
    padding: 4px 6px;
  }
  .badge {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text-faint);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 4px;
    margin-left: 4px;
  }

  .export {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--hairline);
  }
  .export .rowlabel {
    flex: 1 1 auto;
  }

  .all {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 2px 0;
  }

  .swatch {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    padding: 0;
    cursor: pointer;
    box-shadow: inset 0 0 0 1px var(--swatch-edge);
    transition:
      transform 0.08s ease,
      box-shadow 0.08s ease;
  }
  .swatch.sm {
    width: 20px;
    height: 20px;
    border-radius: 5px;
  }
  .swatch:active {
    transform: scale(0.92);
  }
  /* Armed swatch: NON-colour signal — page-gap + signal ring + glow (§2). */
  .swatch.armed {
    transform: scale(1.14);
    box-shadow:
      0 0 0 2px var(--app-bg),
      0 0 0 4px var(--signal),
      0 0 10px 2px var(--signal-glow);
  }
</style>
