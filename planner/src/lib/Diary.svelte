<script lang="ts">
  // Daily Reflection Diary overlay (§13).
  // Saved automatically per-day inside Dexie IndexedDB.
  import { createEventDispatcher } from 'svelte';
  import { days, currentKey, todayKey } from './days';
  import { get } from 'svelte/store';

  const dispatch = createEventDispatcher<{ close: void }>();

  let textareaEl: HTMLTextAreaElement;
  let saveStatus: 'saved' | 'saving' = 'saved';
  let saveTimeout: number;

  $: activeKey = $currentKey;
  $: activeDay = $days[activeKey] ?? { blocks: [], symptoms: [], nextId: 1, nextSymptomId: 1, diary: '' };
  $: diaryContent = activeDay.diary ?? '';

  function handleInput(e: Event) {
    const val = (e.currentTarget as HTMLTextAreaElement).value;
    const keyToSave = activeKey;
    
    saveStatus = 'saving';
    if (saveTimeout) clearTimeout(saveTimeout);
    
    saveTimeout = window.setTimeout(() => {
      days.update((all) => {
        const day = all[keyToSave] ?? { blocks: [], symptoms: [], nextId: 1, nextSymptomId: 1, diary: '' };
        return {
          ...all,
          [keyToSave]: {
            ...day,
            diary: val
          }
        };
      });
      saveStatus = 'saved';
    }, 400); // 400ms debounce
  }

  // Generate list of past diary entries for pattern spotting
  $: diaryHistory = Object.entries($days)
    .filter(([_, data]) => data.diary && data.diary.trim().length > 0)
    .map(([date, data]) => ({
      date,
      snippet: data.diary!.length > 90 ? data.diary!.slice(0, 90) + '…' : data.diary!
    }))
    .sort((a, b) => b.date.localeCompare(a.date)); // most recent first

  let copyStatus = 'Copy Reflection';
  function handleCopy() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(diaryContent).then(() => {
        copyStatus = 'Copied! ✓';
        setTimeout(() => {
          copyStatus = 'Copy Reflection';
        }, 1500);
      });
    }
  }

  function selectHistoryDay(date: string) {
    currentKey.set(date);
  }

  function formatDateLabel(dateStr: string): string {
    if (dateStr === todayKey()) return 'Today';
    
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }
</script>

<div class="overlay" role="dialog" aria-label="Diary overlay">
  <header>
    <div class="title-wrap">
      <span>Daily Diary ({formatDateLabel(activeKey)})</span>
      <span class="status-indicator" class:saving={saveStatus === 'saving'}>
        {saveStatus === 'saving' ? 'Saving…' : 'Saved ✓'}
      </span>
    </div>
    <div class="head-btns">
      {#if diaryContent}
        <button class="copy-btn" on:click={handleCopy}>{copyStatus}</button>
      {/if}
      <button class="close" on:click={() => dispatch('close')} aria-label="Close diary">✕</button>
    </div>
  </header>

  <div class="workspace">
    <!-- Side Panel: Pattern Spotting History -->
    <aside class="history-panel glass-card">
      <h4>Reflection History</h4>
      <p class="panel-desc">Tap a past entry to view or edit its ring and log:</p>
      <div class="history-list">
        {#if diaryHistory.length === 0}
          <div class="empty-state">No diary logs written yet. Write in the editor on the right to start!</div>
        {:else}
          {#each diaryHistory as item (item.date)}
            <button 
              class="history-item" 
              class:active={item.date === activeKey}
              on:click={() => selectHistoryDay(item.date)}
            >
              <div class="item-header">
                <span class="item-date">{formatDateLabel(item.date)}</span>
                <span class="item-raw-date">{item.date}</span>
              </div>
              <div class="item-snippet">{item.snippet}</div>
            </button>
          {/each}
        {/if}
      </div>
    </aside>

    <!-- Main Editor Panel -->
    <div class="editor-container">
      {#key activeKey}
        <textarea
          bind:this={textareaEl}
          value={diaryContent}
          on:input={handleInput}
          placeholder="Record today's symptoms, sleep quality, food intake, allergy levels, energy levels, or notes here. Spotting patterns starts with simple logs..."
          aria-label="Diary text content"
        ></textarea>
      {/key}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    border-bottom: 1px solid var(--hairline);
    background: var(--surface-2);
  }
  .title-wrap {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .status-indicator {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-faint);
    transition: color 0.12s ease;
  }
  .status-indicator.saving {
    color: var(--signal);
    animation: status-pulse 1.2s infinite alternate;
  }
  @keyframes status-pulse {
    from { opacity: 0.6; }
    to { opacity: 1; }
  }
  .head-btns {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .copy-btn {
    background: var(--surface);
    border: 1px solid var(--border-2);
    border-radius: 6px;
    color: var(--text-dim);
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    cursor: pointer;
  }
  .copy-btn:hover {
    color: var(--text);
    border-color: var(--signal);
  }
  .close {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
  }
  .workspace {
    flex: 1;
    display: flex;
    overflow: hidden;
  }
  
  /* History Panel layout */
  .history-panel {
    width: 280px;
    border-right: 1px solid var(--hairline);
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    padding: 16px;
    box-sizing: border-box;
  }
  .history-panel h4 {
    margin: 0 0 4px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .panel-desc {
    margin: 0 0 12px 0;
    font-size: 11px;
    color: var(--text-dim);
  }
  .history-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    -webkit-overflow-scrolling: touch;
  }
  .empty-state {
    font-size: 12px;
    color: var(--text-faint);
    line-height: 1.4;
    text-align: center;
    margin-top: 24px;
    padding: 0 8px;
  }
  .history-item {
    background: var(--surface);
    border: 1px solid var(--border-2);
    border-radius: 8px;
    padding: 10px;
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    box-sizing: border-box;
    transition: transform 0.08s ease, border-color 0.12s ease;
  }
  .history-item:hover {
    border-color: var(--text-faint);
  }
  .history-item.active {
    border-color: var(--signal);
    box-shadow: 0 0 0 1px var(--signal), 0 0 6px var(--signal-glow);
  }
  .history-item:active {
    transform: scale(0.98);
  }
  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .item-date {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }
  .item-raw-date {
    font-size: 10px;
    color: var(--text-faint);
  }
  .item-snippet {
    font-size: 11px;
    color: var(--text-dim);
    line-height: 1.4;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Editor layout */
  .editor-container {
    flex: 1;
    padding: 20px;
    background: var(--surface);
    display: flex;
  }
  textarea {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    font-family: 'Outfit', 'Inter', sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: var(--text);
  }
  textarea::placeholder {
    color: var(--text-faint);
  }

  /* Responsive styling for small mobile screens */
  @media (max-width: 640px) {
    .workspace {
      flex-direction: column-reverse;
    }
    .history-panel {
      width: 100%;
      height: 160px;
      border-right: none;
      border-top: 1px solid var(--hairline);
      padding: 12px;
    }
    .history-list {
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
      height: max-content;
    }
    .history-item {
      width: 200px;
      flex-shrink: 0;
    }
    .panel-desc {
      display: none;
    }
    .editor-container {
      padding: 16px;
    }
  }
</style>
