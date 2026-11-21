<script lang="ts">
  // The day-thumbnail gallery (§12 tier 1) + Solenoid's persistent Art Archive.
  import { createEventDispatcher, onMount } from 'svelte';
  import { days, currentKey, dayKeysDesc, todayKey, futureKeys } from './days';
  import { parseKey, emptyDay } from './daydata';
  import DayThumbnail from './DayThumbnail.svelte';
  import { artGalleryItems, loadArtGallery, deleteArtFromGallery, type GeneratedArtItem } from './artGallery';

  export let activeTab: 'days' | 'art' = 'days';

  const dispatch = createEventDispatcher<{ close: void }>();
  const tKey = todayKey();
  const fmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const artDateFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const future = futureKeys(14); // the time machine forward (§8)

  let selectedArt: GeneratedArtItem | null = null;
  let showPrompt = false;

  onMount(() => {
    loadArtGallery();
  });

  function pick(key: string) {
    currentKey.set(key);
    dispatch('close');
  }
  function label(key: string): string {
    if (key === tKey) return 'Today';
    return fmt.format(parseKey(key));
  }
  function formatArtDate(iso: string): string {
    try {
      return artDateFmt.format(new Date(iso));
    } catch {
      return '';
    }
  }
  async function removeArt(item: GeneratedArtItem) {
    if (!confirm(`Delete “${item.title}” from Solenoid’s Gallery?`)) return;
    await deleteArtFromGallery(item.id);
    if (selectedArt?.id === item.id) {
      selectedArt = null;
      showPrompt = false;
    }
  }
</script>

<div class="overlay" role="dialog" aria-label="Gallery">
  <header>
    <div class="tabs" role="tablist">
      <button
        type="button"
        role="tab"
        class="tab-btn"
        class:active={activeTab === 'days'}
        aria-selected={activeTab === 'days'}
        on:click={() => (activeTab = 'days')}
      >
        Days
      </button>
      <button
        type="button"
        role="tab"
        class="tab-btn"
        class:active={activeTab === 'art'}
        aria-selected={activeTab === 'art'}
        on:click={() => (activeTab = 'art')}
      >
        🎨 Solenoid’s Art
        {#if $artGalleryItems.length > 0}
          <span class="tab-count">{$artGalleryItems.length}</span>
        {/if}
      </button>
    </div>
    <button class="close" on:click={() => dispatch('close')} aria-label="Close gallery">✕</button>
  </header>

  <div class="scroll">
    {#if activeTab === 'days'}
      <div class="grid">
        {#each $dayKeysDesc as key (key)}
          <button class="cell" class:current={key === $currentKey} on:click={() => pick(key)}>
            <div class="thumb">
              <DayThumbnail day={$days[key] ?? emptyDay()} isToday={key === tKey} />
            </div>
            <span class="caption">{label(key)}</span>
          </button>
        {/each}
      </div>

      <!-- Future days (§8): pre-seeded empty rings — land on one and drop an
           appointment before its morning. -->
      <h2 class="section">Ahead</h2>
      <div class="grid">
        {#each future as key (key)}
          <button class="cell" class:current={key === $currentKey} on:click={() => pick(key)}>
            <div class="thumb">
              <DayThumbnail day={$days[key] ?? emptyDay()} isToday={false} />
            </div>
            <span class="caption">{label(key)}</span>
          </button>
        {/each}
      </div>
    {:else}
      {#if $artGalleryItems.length === 0}
        <div class="art-empty">
          <div class="art-empty-icon">🎨</div>
          <p class="art-empty-title">No images archived yet</p>
          <p class="art-empty-sub">
            Whenever Solenoid conjures an image in chat, it is automatically archived here so it never gets lost on reload.
          </p>
        </div>
      {:else}
        <div class="art-grid">
          {#each $artGalleryItems as item (item.id)}
            <button
              type="button"
              class="art-card"
              on:click={() => { selectedArt = item; showPrompt = false; }}
            >
              <div class="art-thumb-wrap">
                <img src={item.dataUrl} alt={item.title} loading="lazy" />
                <span class="art-model-pill">{item.modelLabel}</span>
              </div>
              <div class="art-meta">
                <span class="art-title">{item.title}</span>
                <span class="art-date">{formatArtDate(item.createdAt)}</span>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  {#if selectedArt}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="art-lightbox"
      role="dialog"
      aria-label={selectedArt.title}
      on:click={() => { selectedArt = null; showPrompt = false; }}
    >
      <div class="art-lightbox-inner" on:click|stopPropagation>
        <img src={selectedArt.dataUrl} alt={selectedArt.title} />
        <div class="art-lightbox-info">
          <div class="art-lb-head">
            <div>
              <div class="art-lb-title">{selectedArt.title}</div>
              <div class="art-lb-sub">{selectedArt.modelLabel} · {formatArtDate(selectedArt.createdAt)}</div>
            </div>
            <div class="art-lb-actions">
              <button
                type="button"
                class="lb-btn"
                on:click={() => (showPrompt = !showPrompt)}
              >
                {showPrompt ? 'Hide prompt' : 'Prompt'}
              </button>
              <a
                class="lb-btn save"
                href={selectedArt.dataUrl}
                download={`${(selectedArt.title || 'solenoid-image').replace(/[^\w\s-]/g, '').trim() || 'solenoid-image'}.png`}
              >
                ⬇ Save
              </a>
              <button
                type="button"
                class="lb-btn danger"
                on:click={() => selectedArt && removeArt(selectedArt)}
                title="Delete image"
              >
                🗑
              </button>
              <button
                type="button"
                class="lb-btn"
                on:click={() => { selectedArt = null; showPrompt = false; }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>
          {#if showPrompt && selectedArt.prompt}
            <p class="art-lb-prompt">{selectedArt.prompt}</p>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: var(--ambient-gradient, var(--app-bg));
    display: flex;
    flex-direction: column;
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    border-bottom: 1px solid var(--hairline);
    gap: 10px;
  }
  .tabs {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tab-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-dim);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, color 0.2s;
  }
  .tab-btn.active {
    color: var(--text);
    background: var(--surface-2, rgba(255, 255, 255, 0.08));
    border-color: var(--border, rgba(255, 255, 255, 0.16));
  }
  .tab-count {
    font-size: 10.5px;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--signal, #d7baff);
    color: var(--signal-contrast, #111);
    font-weight: 700;
  }
  .close {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
  }
  .scroll {
    flex: 1;
    overflow-y: auto;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
    gap: 14px;
    padding: 16px;
    align-content: start;
  }
  .section {
    margin: 0;
    padding: 4px 16px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-dim);
    border-top: 1px solid var(--hairline);
  }
  .cell {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .thumb {
    aspect-ratio: 1;
    border-radius: 12px;
    /* selection: non-colour ring */
    box-shadow: inset 0 0 0 1px var(--border);
  }
  .cell.current .thumb {
    box-shadow: 0 0 0 2px var(--signal);
  }
  .caption {
    font-size: 12px;
    color: var(--text-dim);
    text-align: center;
  }

  /* Solenoid's Art Grid */
  .art-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 56px 24px;
    gap: 8px;
  }
  .art-empty-icon {
    font-size: 36px;
    opacity: 0.75;
  }
  .art-empty-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
  }
  .art-empty-sub {
    margin: 0;
    max-width: 300px;
    font-size: 13px;
    line-height: 1.45;
    color: var(--text-dim);
  }
  .art-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(154px, 1fr));
    gap: 14px;
    padding: 16px;
  }
  .art-card {
    background: var(--surface, rgba(20, 20, 26, 0.72));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
    border-radius: 14px;
    overflow: hidden;
    padding: 0;
    cursor: pointer;
    text-align: left;
    display: flex;
    flex-direction: column;
    transition: transform 0.15s ease, border-color 0.2s ease;
  }
  .art-card:hover {
    transform: translateY(-2px);
    border-color: var(--signal, rgba(255, 255, 255, 0.35));
  }
  .art-thumb-wrap {
    position: relative;
    aspect-ratio: 1;
    width: 100%;
    background: rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }
  .art-thumb-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .art-model-pill {
    position: absolute;
    bottom: 6px;
    right: 6px;
    font-size: 9.5px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 999px;
    background: rgba(10, 10, 14, 0.78);
    color: #f3efea;
    border: 1px solid rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(6px);
  }
  .art-meta {
    padding: 8px 10px 9px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .art-title {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .art-date {
    font-size: 10.5px;
    color: var(--text-dim);
  }

  /* Lightbox */
  .art-lightbox {
    position: fixed;
    inset: 0;
    z-index: 90;
    background: rgba(6, 7, 10, 0.88);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }
  .art-lightbox-inner {
    max-width: min(92vw, 720px);
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    background: var(--surface, #14151a);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.14));
    border-radius: 16px;
    overflow: hidden;
  }
  .art-lightbox-inner img {
    max-width: 100%;
    max-height: 68vh;
    object-fit: contain;
    background: #08090c;
    display: block;
  }
  .art-lightbox-info {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .art-lb-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .art-lb-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }
  .art-lb-sub {
    font-size: 11px;
    color: var(--text-dim);
  }
  .art-lb-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .lb-btn {
    padding: 5px 10px;
    border-radius: 8px;
    border: 1px solid var(--border, rgba(255, 255, 255, 0.16));
    background: var(--surface-2, rgba(255, 255, 255, 0.08));
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
  }
  .lb-btn.save {
    border-color: var(--signal, rgba(215, 186, 255, 0.55));
  }
  .lb-btn.danger {
    color: #ff8a8a;
  }
  .art-lb-prompt {
    margin: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.3);
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-dim);
    max-height: 120px;
    overflow-y: auto;
  }
</style>
