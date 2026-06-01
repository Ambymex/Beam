<script lang="ts">
  // Two-level vibe palette (§6). The 77 vibes cluster into categories: tap a
  // category to arm it as-is, or expand it to reach a precise member. An "All"
  // view keeps every vibe flat-reachable so nothing is ever lost.
  //
  // No category invents a hue — a category swatch is one of its own member
  // hexes (categories.ts), so all colour still originates in the user's DB (§2).
  import { VIBES, type Vibe } from './vibes';
  import { CATEGORIES, categoryVibe, membersOf, type Category } from './categories';
  import { customVibes, addCustomVibe, removeCustomVibe } from './customVibes';
  import { armedVibe } from './stores';

  let expanded: Category | null = null; // the category whose members are shown
  let showAll = false; // flat full-list view

  // create-a-vibe form state (§4/§6 — the user extending her own vocabulary)
  let creating = false;
  let newHex = '#7c8cff';
  let newEmotion = '';

  function armVibe(v: Vibe) {
    armedVibe.update((cur) => (cur && cur.id === v.id ? null : v));
  }

  function createVibe() {
    const v = addCustomVibe(newHex, newEmotion);
    armedVibe.set(v); // arm it straight away — ready to draw
    creating = false;
    newEmotion = '';
  }

  function tapCategory(cat: Category) {
    // First tap arms the category; tapping the already-armed category expands it.
    const armed = $armedVibe;
    if (armed && armed.id === cat.id) {
      expanded = expanded?.id === cat.id ? null : cat;
    } else {
      armVibe(categoryVibe(cat));
      expanded = null;
    }
  }

  function toggleExpand(cat: Category) {
    expanded = expanded?.id === cat.id ? null : cat;
  }
</script>

<div class="palette">
  <!-- Armed readout: text is the index, colour is the content (§6). -->
  <div class="armed" class:none={!$armedVibe}>
    {#if $armedVibe}
      <span class="dot" style="background:{$armedVibe.hex}"></span>
      <span class="label">{$armedVibe.emotion}</span>
    {:else}
      <span class="label hint">Tap a vibe to arm it, then draw on the ring</span>
    {/if}
    <button class="more" on:click={() => (creating = !creating)} aria-label="Create a vibe">✛ new</button>
    <button class="more" class:on={showAll} on:click={() => (showAll = !showAll)}>
      {showAll ? 'categories' : 'all 77'}
    </button>
  </div>

  {#if creating}
    <!-- create-a-vibe: the user picks a hue and names what it feels like — how
         the whole DB was built. Native colour input opens the system picker. -->
    <div class="create">
      <label class="pick" aria-label="Pick a colour">
        <input type="color" bind:value={newHex} />
        <span class="chip-swatch" style="background:{newHex}"></span>
      </label>
      <input
        class="emotion-in"
        type="text"
        placeholder="what does it feel like?"
        bind:value={newEmotion}
        on:keydown={(e) => e.key === 'Enter' && createVibe()}
      />
      <button class="save" on:click={createVibe}>save</button>
    </div>
  {/if}

  {#if $customVibes.length}
    <!-- the user's own created vibes -->
    <div class="yours" role="group" aria-label="Your vibes">
      <span class="yours-label">yours</span>
      {#each $customVibes as v (v.id)}
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
          <button class="own-rm" aria-label="Delete {v.emotion}" on:click={() => removeCustomVibe(v.id)}>✕</button>
        </div>
      {/each}
    </div>
  {/if}

  {#if showAll}
    <!-- flat view: every vibe, for search / the precise pick -->
    <div class="tray" role="group" aria-label="All vibes">
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
    <!-- category row: tap to arm; tap the chevron (or the armed one again) to
         expand its members -->
    <div class="cats" role="group" aria-label="Vibe categories">
      {#each CATEGORIES as cat (cat.id)}
        {@const cv = categoryVibe(cat)}
        <div class="catwrap">
          <div class="cat" class:armed={$armedVibe?.id === cat.id}>
            <button
              class="cat-main"
              aria-pressed={$armedVibe?.id === cat.id}
              on:click={() => tapCategory(cat)}
            >
              <span class="swatch sm" style="background:{cv.hex}"></span>
              <span class="cat-ico">{cat.icon}</span>
              <span class="cat-label">{cat.label}</span>
            </button>
            <button
              class="chev"
              class:open={expanded?.id === cat.id}
              aria-label="Expand {cat.label}"
              on:click={() => toggleExpand(cat)}
            >›</button>
          </div>

          {#if expanded?.id === cat.id}
            <div class="members" role="group" aria-label="{cat.label} options">
              {#each membersOf(cat) as v (v.id)}
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
          {/if}
        </div>
      {/each}
    </div>
  {/if}
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
    box-shadow: 0 0 0 1px var(--swatch-edge);
  }
  .armed .label {
    color: var(--text-2);
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .armed .label.hint {
    color: var(--text-faint);
  }
  .more {
    flex: 0 0 auto;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-dim);
    border-radius: 999px;
    padding: 3px 10px;
    font-size: 11px;
    cursor: pointer;
  }
  .more.on {
    box-shadow: 0 0 0 1px var(--signal) inset;
    color: var(--signal);
  }

  /* create-a-vibe form */
  .create {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 4px 4px;
  }
  .pick {
    position: relative;
    width: 30px;
    height: 30px;
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
    width: 30px;
    height: 30px;
    border-radius: 7px;
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
    padding: 7px 10px;
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
    padding: 7px 12px;
    font-size: 13px;
    cursor: pointer;
  }

  /* the user's own created vibes */
  .yours {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    padding: 0 4px 6px;
    scrollbar-width: thin;
  }
  .yours-label {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .own {
    position: relative;
    flex: 0 0 auto;
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

  /* category row — a horizontal scroller of pills */
  .cats {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 2px 2px 8px;
    scrollbar-width: thin;
    -webkit-overflow-scrolling: touch;
  }
  .catwrap {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cat {
    display: flex;
    align-items: center;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-2);
    white-space: nowrap;
    overflow: hidden;
  }
  /* armed category: NON-colour signal — a luminous ring (§2) */
  .cat.armed {
    box-shadow: 0 0 0 1px var(--signal) inset;
  }
  .cat-main {
    display: flex;
    align-items: center;
    gap: 7px;
    background: none;
    border: none;
    padding: 5px 4px 5px 6px;
    cursor: pointer;
    color: inherit;
  }
  .cat-ico {
    font-size: 14px;
    line-height: 1;
  }
  .cat-label {
    font-size: 12.5px;
  }
  .chev {
    background: none;
    border: none;
    border-left: 1px solid var(--border);
    font-size: 15px;
    color: var(--text-faint);
    transition: transform 0.12s ease;
    padding: 4px 9px;
    cursor: pointer;
    align-self: stretch;
  }
  .chev.open {
    transform: rotate(90deg);
    color: var(--text-2);
  }

  .members {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(2, auto);
    gap: 7px;
    padding: 2px 0 2px;
  }

  /* flat full view */
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
    box-shadow: inset 0 0 0 1px var(--swatch-edge);
    transition:
      transform 0.08s ease,
      box-shadow 0.08s ease;
  }
  .swatch.sm {
    width: 18px;
    height: 18px;
    border-radius: 5px;
  }
  .swatch:active {
    transform: scale(0.92);
  }
  /* Armed swatch: NON-colour signal — page-gap + signal ring + glow (§2). */
  .swatch.armed {
    transform: scale(1.18);
    box-shadow:
      0 0 0 2px var(--app-bg),
      0 0 0 4px var(--signal),
      0 0 10px 2px var(--signal-glow);
  }
</style>
