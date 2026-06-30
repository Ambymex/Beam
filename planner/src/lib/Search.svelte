<script lang="ts">
  // Search Overlay Panel (§12).
  // Matches local storage data deterministically (keyword + vibe swatches + day of week)
  // and allows fuzzy semantic search queries translated via the translate-search Edge Function.
  import { createEventDispatcher } from 'svelte';
  import { days, currentKey } from './days';
  import { VIBES } from './vibes';
  import { resolveVibe } from './categories';
  import { selectedBlockStore } from './daystate';
  import type { Block } from './blocks';

  const dispatch = createEventDispatcher<{ close: void }>();

  let searchQuery = '';
  let selectedVibeId: string | null = null;
  let selectedDayOfWeek = ''; // "Monday", "Tuesday", etc.
  
  let isLoadingFuzzy = false;
  let fuzzyError = '';
  
  const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  interface SearchResult {
    date: string;
    block: Block;
    formattedTime: string;
    vibeColor: string;
    vibeText: string;
  }

  function formatTime(start: number, end: number): string {
    const formatHour = (h: number) => {
      const totalMins = Math.round(h * 60);
      let hh = Math.floor(totalMins / 60) % 24;
      const mm = totalMins % 60;
      const ampm = hh >= 12 ? 'PM' : 'AM';
      hh = hh % 12;
      if (hh === 0) hh = 12;
      return `${hh}:${String(mm).padStart(2, '0')} ${ampm}`;
    };
    return `${formatHour(start)} → ${formatHour(end)}`;
  }

  function getDayOfWeek(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return DAYS_OF_WEEK[date.getDay()];
  }

  // Deterministic local filtering query
  $: results = (() => {
    const list: SearchResult[] = [];
    const sortedKeys = Object.keys($days).sort().reverse();
    
    for (const dateKey of sortedKeys) {
      const day = $days[dateKey];
      if (!day || !day.blocks) continue;
      
      if (selectedDayOfWeek && getDayOfWeek(dateKey) !== selectedDayOfWeek) continue;
      
      for (const b of day.blocks) {
        if (selectedVibeId && b.vibeId !== selectedVibeId) continue;
        
        if (searchQuery) {
          const queryClean = searchQuery.toLowerCase().trim();
          const labelMatch = b.label && b.label.toLowerCase().includes(queryClean);
          const vibe = resolveVibe(b.vibeId);
          const vibeMatch = vibe && vibe.emotion.toLowerCase().includes(queryClean);
          
          if (!labelMatch && !vibeMatch) continue;
        }
        
        const vibe = resolveVibe(b.vibeId);
        list.push({
          date: dateKey,
          block: b,
          formattedTime: formatTime(b.startHours, b.coreEndHours),
          vibeColor: vibe ? vibe.hex : '#6a6a78',
          vibeText: vibe ? vibe.emotion : 'No vibe',
        });
      }
    }
    return list;
  })();

  // OpenRouter translate search call
  // OpenRouter translate search call
  const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
  const SUPABASE_ANON: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

  const getOpenRouterKey = () => typeof localStorage !== 'undefined' ? localStorage.getItem('radial-planner-openrouter-key') || import.meta.env.VITE_OPENROUTER_KEY || '' : '';
  const getSelectedModel = () => typeof localStorage !== 'undefined' ? localStorage.getItem('radial-planner-openrouter-model') || import.meta.env.VITE_OPENROUTER_MODEL || 'google/gemma-2-27b-it' : 'google/gemma-2-27b-it';

  function getSearchPrompt(vibes: any[]) {
    return `You are a helper for the "Radial Day Planner". The user has autism, ADHD, and emotion-colour synesthesia.
The user enters fuzzy search phrases, and you need to translate them into a structured query containing a matched "vibeId" from the synesthetic vibes database, and/or a raw "keyword".

VIBES DICTIONARY:
${vibes.map(v => `- [Vibe ID: ${v.id}] Description: "${v.emotion}"`).join('\n')}

---
RULES:
1. Semantically match the search query (e.g. "when did I last have a wading-through-mud day?" or "laundry times") to the best matching vibe ID based on the description. If it matches a vibe, return the vibeId.
2. If the user mentions a specific word that isn't primarily an emotional vibe (e.g. "physio", "dentist", "Bug", "school"), extract it as a "keyword".
3. If no vibe matches, return vibeId as null. If no specific keyword is needed, return keyword as null.

---
OUTPUT FORMAT:
You MUST respond with a single, valid JSON object containing exactly "vibeId" and "keyword". Do not output any other text.
{
  "vibeId": "matched_vibe_id_or_null",
  "keyword": "extracted_keyword_or_null"
}
`;
  }

  async function runFuzzySearch() {
    if (!searchQuery) return;
    isLoadingFuzzy = true;
    fuzzyError = '';
    
    try {
      const vibesPayload = VIBES.map(v => ({ id: v.id, emotion: v.emotion }));
      const openRouterKey = getOpenRouterKey();
      const selectedModel = getSelectedModel();
      
      let parsed;

      if (!SUPABASE_URL || openRouterKey) {
        if (!openRouterKey) {
          throw new Error('OpenRouter API key is not set. Please set it in the Companion Chat settings Cog "⚙" first!');
        }

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [
              { role: 'system', content: getSearchPrompt(vibesPayload) },
              { role: 'user', content: `Search Query: "${searchQuery}"` }
            ],
            response_format: { type: 'json_object' },
          }),
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`OpenRouter API error: ${res.status} ${txt}`);
        }

        const result = await res.json();
        const completionText = result.choices?.[0]?.message?.content?.trim() ?? '';
        
        try {
          parsed = JSON.parse(completionText);
        } catch {
          const jsonMatch = /\{[\s\S]*\}/.exec(completionText);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('LLM did not return a valid JSON structure.');
          }
        }
      } else {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/translate-search`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            apikey: SUPABASE_ANON,
            authorization: `Bearer ${SUPABASE_ANON}`,
          },
          body: JSON.stringify({ query: searchQuery, vibes: vibesPayload }),
        });
        
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Translation service error: ${res.status} ${txt}`);
        }
        
        parsed = await res.json();
      }
      
      // Update filters with model's structured prediction
      if (parsed.vibeId) {
        selectedVibeId = parsed.vibeId;
      }
      if (parsed.keyword) {
        searchQuery = parsed.keyword;
      } else if (parsed.vibeId) {
        // Clear search query text if it was fully translated to a vibe ID to avoid double filtering
        searchQuery = '';
      }
    } catch (err) {
      console.error('Fuzzy search translation failed:', err);
      fuzzyError = 'Failed to interpret fuzzy query. Falling back to keyword search.';
    } finally {
      isLoadingFuzzy = false;
    }
  }

  function toggleVibeFilter(vibeId: string) {
    selectedVibeId = selectedVibeId === vibeId ? null : vibeId;
  }

  function jumpTo(res: SearchResult) {
    currentKey.set(res.date);
    selectedBlockStore.set(res.block);
    dispatch('close');
  }

  function clearFilters() {
    searchQuery = '';
    selectedVibeId = null;
    selectedDayOfWeek = '';
    fuzzyError = '';
  }
</script>

<div class="overlay" role="dialog" aria-label="Search day plans">
  <header>
    <span>Plan Search</span>
    <button class="close" on:click={() => dispatch('close')} aria-label="Close search">✕</button>
  </header>

  <div class="search-controls">
    <div class="search-bar-wrap">
      <input
        type="text"
        placeholder="Search keywords or fuzzy mood descriptors…"
        bind:value={searchQuery}
        on:keydown={(e) => e.key === 'Enter' && runFuzzySearch()}
        aria-label="Search query"
      />
      {#if searchQuery}
        <button class="clear-input" on:click={() => searchQuery = ''} aria-label="Clear text">✕</button>
      {/if}
      <button 
        class="fuzzy-btn" 
        on:click={runFuzzySearch} 
        disabled={isLoadingFuzzy || !searchQuery} 
        title="Translate fuzzy query using AI"
      >
        {isLoadingFuzzy ? '⌛' : '🔮 AI'}
      </button>
    </div>

    {#if fuzzyError}
      <div class="error-msg">{fuzzyError}</div>
    {/if}

    <!-- Swatch grid for visual vibe filtering -->
    <div class="swatches-filter">
      <div class="filter-header">
        <span>Vibe Filter</span>
        {#if selectedVibeId}
          <button class="clear-link" on:click={() => selectedVibeId = null}>clear</button>
        {/if}
      </div>
      <div class="swatches-grid">
        {#each VIBES as v (v.id)}
          <button
            class="swatch"
            class:armed={selectedVibeId === v.id}
            style="background:{v.hex}"
            title={v.emotion}
            aria-label={v.emotion}
            aria-pressed={selectedVibeId === v.id}
            on:click={() => toggleVibeFilter(v.id)}
          ></button>
        {/each}
      </div>
    </div>

    <!-- Day of week filter -->
    <div class="day-filter">
      <select bind:value={selectedDayOfWeek} aria-label="Day of week filter">
        <option value="">Any day of the week</option>
        {#each DAYS_OF_WEEK as day}
          <option value={day}>{day}s</option>
        {/each}
      </select>

      {#if searchQuery || selectedVibeId || selectedDayOfWeek}
        <button class="reset-all" on:click={clearFilters}>Reset Filters</button>
      {/if}
    </div>
  </div>

  <div class="results-header">
    Found {results.length} blocks
  </div>

  <div class="results-list">
    {#each results as res}
      <div on:click={() => jumpTo(res)} class="result-item" role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && jumpTo(res)}>
        <div class="result-dot" style="background:{res.vibeColor}"></div>
        <div class="result-details">
          <div class="result-row">
            <span class="result-label">{res.block.label || 'Untitled task'}</span>
            <span class="result-date">{res.date} ({getDayOfWeek(res.date).slice(0, 3)})</span>
          </div>
          <div class="result-row info">
            <span class="result-time">{res.formattedTime} ({res.block.laneId})</span>
            <span class="result-vibe">{res.vibeText}</span>
          </div>
        </div>
      </div>
    {:else}
      <div class="empty">No matching plan blocks found.</div>
    {/each}
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
  }
  .close {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
  }
  .search-controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--hairline);
    background: var(--surface-2);
  }
  .search-bar-wrap {
    display: flex;
    position: relative;
    gap: 8px;
  }
  .search-bar-wrap input {
    flex: 1 1 auto;
    min-width: 0;
    background: var(--surface);
    border: 1px solid var(--border-2);
    border-radius: 8px;
    color: var(--text);
    font-size: 14px;
    padding: 9px 36px 9px 12px;
  }
  .search-bar-wrap input:focus {
    outline: none;
    border-color: var(--text-faint);
  }
  .clear-input {
    position: absolute;
    right: 76px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--text-faint);
    cursor: pointer;
    padding: 4px;
    font-size: 12px;
  }
  .fuzzy-btn {
    flex: 0 0 auto;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--signal);
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    padding: 0 14px;
    cursor: pointer;
    box-shadow: 0 0 0 1px transparent;
    transition: box-shadow 0.12s ease;
  }
  .fuzzy-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .fuzzy-btn:not(:disabled):hover {
    box-shadow: 0 0 0 1px var(--signal) inset;
  }
  .error-msg {
    font-size: 11px;
    color: var(--signal);
    padding: 0 2px;
  }
  .swatches-filter {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .filter-header {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-dim);
    letter-spacing: 0.4px;
  }
  .clear-link {
    background: none;
    border: none;
    color: var(--signal);
    text-decoration: underline;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
  }
  .swatches-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 84px;
    overflow-y: auto;
    padding: 2px 0;
  }
  .swatch {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    box-shadow: inset 0 0 0 1px var(--swatch-edge);
    transition: transform 0.08s ease;
  }
  .swatch.armed {
    transform: scale(1.18);
    box-shadow:
      0 0 0 1.5px var(--surface-2),
      0 0 0 3px var(--signal),
      0 0 6px 1px var(--signal-glow);
  }
  .day-filter {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .day-filter select {
    background: var(--surface);
    border: 1px solid var(--border-2);
    border-radius: 8px;
    color: var(--text);
    font-size: 13px;
    padding: 6px 10px;
    cursor: pointer;
    outline: none;
  }
  .reset-all {
    background: none;
    border: none;
    color: var(--text-dim);
    text-decoration: underline;
    font-size: 12px;
    cursor: pointer;
    padding: 4px 8px;
  }
  .results-header {
    padding: 10px 16px;
    font-size: 12px;
    color: var(--text-dim);
    background: var(--surface);
    border-bottom: 1px solid var(--hairline);
  }
  .results-list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    flex: 1;
  }
  .result-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--hairline);
    cursor: pointer;
    transition: background 0.1s ease;
  }
  .result-item:hover, .result-item:focus {
    background: var(--surface-2);
    outline: none;
  }
  .result-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex: 0 0 auto;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.2);
  }
  .result-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .result-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .result-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .result-date {
    font-size: 12px;
    color: var(--text-dim);
    flex-shrink: 0;
  }
  .result-row.info {
    font-size: 12px;
    color: var(--text-dim);
  }
  .result-time {
    font-weight: 500;
    flex-shrink: 0;
  }
  .result-vibe {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-faint);
  }
  .empty {
    padding: 32px;
    text-align: center;
    color: var(--text-faint);
    font-size: 13px;
  }
</style>
