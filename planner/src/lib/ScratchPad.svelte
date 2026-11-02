<script lang="ts">
  // Distraction-free Collaborative Notes & Solenoid's Desk overlay (§9, §13).
  // Saved automatically with debouncing inside IndexedDB.
  import { createEventDispatcher } from 'svelte';
  import { scratchpadContent, scratchpadStatus, saveScratchpad } from './scratchpad';
  import { deskContent, deskStatus, saveDesk } from './desk';

  export let activeTab: 'notes' | 'desk' = 'notes';

  const dispatch = createEventDispatcher<{ close: void }>();

  let textareaEl: HTMLTextAreaElement;

  $: currentContent = activeTab === 'notes' ? $scratchpadContent : $deskContent;
  $: currentStatus = activeTab === 'notes' ? $scratchpadStatus : $deskStatus;

  function handleInput(e: Event) {
    const val = (e.currentTarget as HTMLTextAreaElement).value;
    if (activeTab === 'notes') {
      saveScratchpad(val);
    } else {
      saveDesk(val);
    }
  }

  // Insert markdown helpers at current cursor position
  function insertMarkdown(prefix: string, suffix = '') {
    if (!textareaEl) return;
    
    const start = textareaEl.selectionStart;
    const end = textareaEl.selectionEnd;
    const text = textareaEl.value;
    const selected = text.substring(start, end);
    
    const replacement = prefix + selected + suffix;
    const newText = text.substring(0, start) + replacement + text.substring(end);
    
    if (activeTab === 'notes') {
      saveScratchpad(newText);
    } else {
      saveDesk(newText);
    }
    
    // Reset focus and cursor position
    setTimeout(() => {
      textareaEl.focus();
      textareaEl.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 50);
  }

  let copyStatus = 'Copy';
  function handleCopy() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(currentContent).then(() => {
        copyStatus = 'Copied! ✓';
        setTimeout(() => {
          copyStatus = 'Copy';
        }, 1500);
      });
    }
  }
</script>

<div class="overlay" role="dialog" aria-label={activeTab === 'notes' ? 'Scratch Pad notes' : "Solenoid's Desk"}>
  <header>
    <div class="tab-pills">
      <button
        type="button"
        class="tab-pill"
        class:active={activeTab === 'notes'}
        on:click={() => (activeTab = 'notes')}
      >
        📝 Shared Notes
      </button>
      <button
        type="button"
        class="tab-pill"
        class:active={activeTab === 'desk'}
        on:click={() => (activeTab = 'desk')}
      >
        ⚓ Solenoid's Desk
      </button>
    </div>
    <div class="header-right">
      <span class="status-indicator" class:saving={currentStatus === 'saving'}>
        {currentStatus === 'saving' ? 'Saving…' : 'Saved ✓'}
      </span>
      <button class="close" on:click={() => dispatch('close')} aria-label="Close">✕</button>
    </div>
  </header>

  {#if activeTab === 'desk'}
    <div class="desk-subbanner">
      <span>⚓ Solenoid’s permanent keepsake shelf. Things he curates so they never scroll out of reach.</span>
    </div>
  {/if}

  <div class="toolbar">
    <button on:click={() => insertMarkdown('- [ ] ')} title="Add checklist item">☑ Check</button>
    <button on:click={() => insertMarkdown('- ')} title="Add bullet point">List</button>
    <button on:click={() => insertMarkdown('**', '**')} title="Make text bold"><b>B</b></button>
    <button on:click={() => insertMarkdown('*', '*')} title="Make text italic"><i>I</i></button>
    <button on:click={() => insertMarkdown('`', '`')} title="Add code inline">Code</button>
    <button on:click={() => insertMarkdown('\n---\n')} title="Add horizontal divider">Divider</button>
    <button on:click={handleCopy} style="margin-left: auto; border-color: var(--signal); color: var(--text);" title={`Copy ${activeTab === 'notes' ? 'notes' : 'desk'} content`}>{copyStatus}</button>
  </div>

  <div class="editor-container">
    <textarea
      bind:this={textareaEl}
      value={currentContent}
      on:input={handleInput}
      placeholder={activeTab === 'notes'
        ? "Start typing thoughts, feature requests, or notes here..."
        : "Solenoid's personal keepsake drawer. Curate permanent anchors, reminders, or shared treasures here..."}
      aria-label="Text content"
    ></textarea>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: var(--ambient-gradient, var(--app-bg));
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
  }
  .tab-pills {
    display: flex;
    gap: 4px;
    background: var(--surface-2);
    padding: 3px;
    border-radius: 8px;
    border: 1px solid var(--hairline);
  }
  .tab-pill {
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text-dim);
    font-size: 12px;
    font-weight: 600;
    padding: 5px 12px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .tab-pill.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .desk-subbanner {
    padding: 7px 16px;
    background: rgba(140, 140, 150, 0.08);
    border-bottom: 1px solid var(--hairline);
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.4;
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
  .close {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 16px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--hairline);
  }
  .toolbar button {
    background: var(--surface);
    border: 1px solid var(--border-2);
    border-radius: 6px;
    color: var(--text-dim);
    font-size: 11px;
    font-weight: 600;
    padding: 5px 10px;
    cursor: pointer;
    transition: border-color 0.08s ease, color 0.08s ease;
  }
  .toolbar button:active {
    border-color: var(--text-faint);
    color: var(--text);
  }
  .editor-container {
    flex: 1;
    padding: 16px;
    background: var(--surface);
    display: flex;
  }
  textarea {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    font-family: 'Outfit', 'Inter', monospace;
    font-size: 15px;
    line-height: 1.5;
    color: var(--text);
  }
  textarea::placeholder {
    color: var(--text-faint);
  }
</style>
