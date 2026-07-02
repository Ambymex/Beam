<script lang="ts">
  // Distraction-free Collaborative Notes Scratch Pad overlay (§9, §13).
  // Saved automatically with debouncing inside IndexedDB.
  import { createEventDispatcher } from 'svelte';
  import { scratchpadContent, scratchpadStatus, saveScratchpad } from './scratchpad';

  const dispatch = createEventDispatcher<{ close: void }>();

  let textareaEl: HTMLTextAreaElement;

  function handleInput(e: Event) {
    const val = (e.currentTarget as HTMLTextAreaElement).value;
    saveScratchpad(val);
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
    
    saveScratchpad(newText);
    
    // Reset focus and cursor position
    setTimeout(() => {
      textareaEl.focus();
      textareaEl.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 50);
  }

  let copyStatus = 'Copy Notes';
  function handleCopy() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText($scratchpadContent).then(() => {
        copyStatus = 'Copied! ✓';
        setTimeout(() => {
          copyStatus = 'Copy Notes';
        }, 1500);
      });
    }
  }
</script>

<div class="overlay" role="dialog" aria-label="Scratch Pad notes">
  <header>
    <div class="title-wrap">
      <span>Scratch Pad</span>
      <span class="status-indicator" class:saving={$scratchpadStatus === 'saving'}>
        {$scratchpadStatus === 'saving' ? 'Saving…' : 'Saved ✓'}
      </span>
    </div>
    <button class="close" on:click={() => dispatch('close')} aria-label="Close scratch pad">✕</button>
  </header>

  <div class="toolbar">
    <button on:click={() => insertMarkdown('- [ ] ')} title="Add checklist item">☑ Check</button>
    <button on:click={() => insertMarkdown('- ')} title="Add bullet point">List</button>
    <button on:click={() => insertMarkdown('**', '**')} title="Make text bold"><b>B</b></button>
    <button on:click={() => insertMarkdown('*', '*')} title="Make text italic"><i>I</i></button>
    <button on:click={() => insertMarkdown('`', '`')} title="Add code inline">Code</button>
    <button on:click={() => insertMarkdown('\n---\n')} title="Add horizontal divider">Divider</button>
    <button on:click={handleCopy} style="margin-left: auto; border-color: var(--signal); color: var(--text);" title="Copy all scratch pad notes">{copyStatus}</button>
  </div>

  <div class="editor-container">
    <textarea
      bind:this={textareaEl}
      value={$scratchpadContent}
      on:input={handleInput}
      placeholder="Start typing thoughts, feature requests, or notes here..."
      aria-label="Notes text content"
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
