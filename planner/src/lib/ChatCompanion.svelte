<script lang="ts">
  // Conversational Chat Companion overlay (§9, §13).
  // Maintains a 100-message sliding window history in localStorage.
  // Sends user queries and history to the parse-command Edge Function,
  // then updates the planner state by directly mutating the `days` store.

  import { onMount, createEventDispatcher } from 'svelte';
  import { days, currentKey, todayKey } from './days';
  import { glucoseContextSummary } from './glucose';
  import { novelDiaryContent } from './diaryDedupe';
  import CompanionReacts, { REACT_IDS } from './CompanionReacts.svelte';
  import { VIBES } from './vibes';
  import { customVibes } from './customVibes';
  import { selectedBlockStore } from './daystate';
  import { repairBlock, MAX_TRAVEL_HOURS, type Block } from './blocks';
  import { scratchpadContent, saveScratchpad } from './scratchpad';
  import { BASE_CATEGORIES, resolveVibe } from './categories';
  import { customCategories } from './customCategories';
  import type { Symptom } from './symptoms';
  import { fetchContext, injectMemory } from './vault';
  import { checkPendingNotifications, scheduleNotification } from './notifications';
  import { logComm } from './comms';
  import { starsVisible } from './theme';
  import { envThemeState } from './envTheme';
  import {
    registerChatAdapter,
    scheduleMsgSync,
    setSyncKey,
    getSyncKey,
    generateSyncKey,
    msgSyncStatus,
    msgSyncConfigured,
    type ChatSyncMessage
  } from './msgSync';

  const dispatch = createEventDispatcher<{ close: void }>();

  // The component stays mounted from app boot and merely hides when "closed"
  // (App.svelte drives this) — the heartbeat interval and scheduled-alert
  // checker in onMount must keep running with the chat UI out of sight.
  export let visible = true;
  // While display:none the scroll box has no height, so any scroll done in the
  // background lands on nothing — redo it the moment the chat is shown.
  $: if (visible) scrollToBottom();

  // The react overlay instance + whitelist gate: only reacts we actually have
  // animations for ever fire, however creative the model output gets.
  let reactLayer: CompanionReacts | null = null;
  function resolveReact(parsed: any): string | undefined {
    return typeof parsed?.react === 'string' && REACT_IDS.includes(parsed.react)
      ? parsed.react
      : undefined;
  }

  // Robustly pull a JSON object out of a model completion. json_object mode
  // asks for clean JSON, but models still occasionally wrap it in ```json
  // fences, add a sentence of preamble, or leave a trailing comma. Rather than
  // a greedy /\{[\s\S]*\}/ (which over-captures when there's trailing prose
  // with braces), we strip fences, then balance-scan from the first '{' to its
  // matching '}' — string-aware so braces inside strings don't fool it — and
  // clean up trailing commas before parsing.
  function extractLlmJson(raw: string): any {
    if (!raw || !raw.trim()) throw new Error('Model returned an empty response.');
    let text = raw.trim();

    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text);
    if (fenced) text = fenced[1].trim();

    // fast path: already clean
    try {
      return JSON.parse(text);
    } catch {
      /* fall through to recovery */
    }

    const start = text.indexOf('{');
    if (start !== -1) {
      let depth = 0;
      let inStr = false;
      let esc = false;
      for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (inStr) {
          if (esc) esc = false;
          else if (c === '\\') esc = true;
          else if (c === '"') inStr = false;
        } else if (c === '"') {
          inStr = true;
        } else if (c === '{') {
          depth++;
        } else if (c === '}') {
          depth--;
          if (depth === 0) {
            const candidate = text.slice(start, i + 1).replace(/,(\s*[}\]])/g, '$1');
            return JSON.parse(candidate); // throws → caught by caller
          }
        }
      }
    }
    throw new Error('Model response contained no valid JSON object.');
  }

  // The tungsten strike's shockwave: the react layer can't shake the chat from
  // inside itself, so it dispatches 'impact' at landing and the overlay takes
  // the hit here. Class-toggle (not inline style) so the keyframes stay in CSS.
  let tremor = false;
  let tremorTimer: ReturnType<typeof setTimeout>;
  function onStrikeImpact() {
    clearTimeout(tremorTimer);
    tremor = false; // drop the class first so back-to-back strikes re-shake
    requestAnimationFrame(() => {
      tremor = true;
      tremorTimer = setTimeout(() => (tremor = false), 500);
    });
  }

  interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    // Cloud vault state (msgSync.ts): synced = already uploaded; source names
    // the app that wrote it when it wasn't this one.
    synced?: boolean;
    source?: string;
    // Visible chain-of-thought (when the bulb was lit). Stays local: the vault
    // adapter syncs content only, same privacy line Sovereign Terminal draws.
    reasoning?: string;
    // An ambient visual gesture fired alongside the message (see
    // CompanionReacts.svelte). Stored for the record; only fired on arrival.
    react?: string;
    actions?: Array<{
      type: 'add_block' | 'update_block' | 'delete_block' | 'read_scratchpad' | 'update_scratchpad' | 'update_diary' | 'add_symptom' | 'update_symptom' | 'delete_symptom' | 'show_notification' | 'schedule_notification' | 'web_search';
      targetDate?: string;
      block?: Partial<Block>;
      labelToMatch?: string;
      content?: string;
      symptomId?: number;
      symptom?: {
        category?: string;
        severity?: number;
        timeHours?: any;
        note?: string;
      };
      title?: string;
      body?: string;
      timeHours?: any;
      query?: string;
    }>;
  }

  let messages: ChatMessage[] = [];
  let draft = '';
  let isLoading = false;
  let errorMsg = '';
  let scrollContainer: HTMLDivElement;
  let inputEl: HTMLTextAreaElement;

  // Auto-grow the composer: reset to natural height, then take the content's
  // scrollHeight up to the CSS max-height, past which the textarea scrolls.
  // Lets a long message be seen and scrolled before send instead of squeezing
  // into one cramped line.
  function autoGrow() {
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    inputEl.style.height = `${inputEl.scrollHeight}px`;
  }

  let copiedMsgId = '';
  function copyMessageText(id: string, text: string) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        copiedMsgId = id;
        setTimeout(() => {
          if (copiedMsgId === id) copiedMsgId = '';
        }, 1500);
      });
    }
  }

  function safeGetItem(key: string, defaultVal = ''): string {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key) || defaultVal;
      }
    } catch (e) {
      console.warn('localStorage read failed:', key, e);
    }
    return defaultVal;
  }

  // OpenRouter direct settings
  let openRouterKey = safeGetItem('radial-planner-openrouter-key', import.meta.env.VITE_OPENROUTER_KEY || '');
  let selectedModel = safeGetItem('radial-planner-openrouter-model', import.meta.env.VITE_OPENROUTER_MODEL || 'google/gemma-2-27b-it');
  let showSettings = false;
  let debugActions = '';
  
  let fileInput: HTMLInputElement;
  let selectedImageBase64 = '';
  let selectedImageName = '';
  // Per-PDF OCR choice: off = the free pdf-text engine (embedded text), on =
  // mistral-ocr (bills per page, reads scanned/image PDFs). Ephemeral on
  // purpose — resets with each attachment so OCR only ever bills when the
  // user deliberately flips it for a scan, never left on by accident.
  let pdfUseOcr = false;

  // Pinecone Vector Memory settings
  let pineconeKey = safeGetItem('radial-planner-pinecone-key');
  let pineconeHost = safeGetItem('radial-planner-pinecone-host');
  let enableVault = safeGetItem('radial-planner-vault-enabled') === 'true';
  let isEmbedding = false;

  // Tavily Search API Settings
  let tavilyKey = safeGetItem('radial-planner-tavily-key');

  // Sir's dials. Visible chain-of-thought persists (a reading preference);
  // martini mode (temperature 1.0) deliberately does NOT — it's a mood, not a
  // setting, and it should never survive into tomorrow by accident.
  let visibleCot = safeGetItem('radial-planner-cot-visible') === 'true';
  function toggleCot() {
    visibleCot = !visibleCot;
    try {
      localStorage.setItem('radial-planner-cot-visible', String(visibleCot));
    } catch (e) {
      console.warn('localStorage write failed:', e);
    }
  }
  let martiniMode = false;

  // Cross-app message vault (msgSync.ts) — the key IS the identity, so it
  // saves immediately on change rather than waiting for Save Settings.
  let syncKeyLocal = getSyncKey();
  function onSyncKeyChange() {
    setSyncKey(syncKeyLocal);
  }
  function onGenerateSyncKey() {
    syncKeyLocal = generateSyncKey();
    setSyncKey(syncKeyLocal);
  }

  function triggerFileSelect() {
    if (fileInput) fileInput.click();
  }

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    selectedImageName = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      selectedImageBase64 = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function clearSelectedImage() {
    selectedImageBase64 = '';
    selectedImageName = '';
    pdfUseOcr = false;
    if (fileInput) fileInput.value = '';
  }
  
  let modelsList: Array<{ id: string; name?: string }> = [
    { id: 'google/gemma-2-27b-it', name: 'Gemma 2 27B' },
    { id: 'google/gemma-2-9b-it', name: 'Gemma 2 9B (Free)' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
    { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B (Free)' },
    { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B' },
    { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' }
  ];

  onMount(() => {
    // Load chat history from localStorage
    const saved = safeGetItem('radial-planner-chat-v1');
    if (saved) {
      try {
        messages = JSON.parse(saved);
      } catch {
        messages = [];
      }
    }
    
    // Load last debug JSON payload
    debugActions = safeGetItem('radial-planner-chat-debug-v1');
    
    // Fetch latest active models from OpenRouter dynamically
    fetch('https://openrouter.ai/api/v1/models')
      .then(res => {
        if (res.ok) {
          return res.json();
        }
      })
      .then(json => {
        if (json && json.data && json.data.length > 0) {
          const apiModels = json.data.map((m: any) => ({ id: m.id, name: m.name || m.id }));
          const merged = [...apiModels];
          modelsList.forEach(def => {
            if (!merged.some(m => m.id === def.id)) merged.push(def);
          });
          merged.sort((a, b) => a.name.localeCompare(b.name));
          modelsList = merged;
        }
      })
      .catch(err => {
        console.warn('[Companion] Failed to fetch live OpenRouter models list:', err);
      });
    
    // Add a welcoming prompt if empty
    if (messages.length === 0) {
      messages = [{
        id: 'welcome_' + Date.now(),
        role: 'assistant',
        content: "Hi! I'm your radial day planner companion. Type what you'd like to plan (e.g., 'physio at 2pm tomorrow' or 'washer for 45 mins starting now') and I'll lay it out on your rings.",
        timestamp: new Date().toISOString()
      }];
    }
    scrollToBottom();

    // Start background alert triggers and periodic proactive heartbeat checks
    const checkInterval = setInterval(async () => {
      await checkPendingNotifications();
      await triggerHeartbeatCheck();
    }, 60000); // Check once a minute

    // Run immediately on startup
    (async () => {
      await checkPendingNotifications();
      await triggerHeartbeatCheck();
    })();

    // Plug this chat into the cross-app vault (msgSync.ts). The component is
    // always mounted, so the adapter is always live.
    registerChatAdapter({
      getUnsynced: (): ChatSyncMessage[] =>
        messages
          .filter((m) => !m.synced && !m.id.startsWith('welcome_') && m.content)
          .map((m) => ({ id: m.id, role: m.role, content: m.content, timestamp: m.timestamp })),
      markSynced: (ids: string[]) => {
        const done = new Set(ids);
        messages = messages.map((m) => (done.has(m.id) ? { ...m, synced: true } : m));
        saveChat(true);
      },
      mergeRemote: (remote: ChatSyncMessage[]) => {
        const known = new Set(messages.map((m) => m.id));
        const fresh: ChatMessage[] = remote
          .filter((r) => !known.has(r.id) && r.content)
          .map((r) => ({
            id: r.id,
            role: r.role,
            content: r.content,
            timestamp: r.timestamp,
            synced: true, // it came FROM the cloud; pushing it back would echo
            // own rows returning on a fresh-install pull look native
            source: r.source && r.source !== 'planner' ? r.source : undefined,
          }));
        if (!fresh.length) return;
        // ISO timestamps sort lexically; interleave by when things were said
        messages = [...messages, ...fresh].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        saveChat(true);
      },
    });

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  });

  function saveChat(quiet = false) {
    // Keep sliding window of last 100 messages
    if (messages.length > 100) {
      messages = messages.slice(messages.length - 100);
    }
    try {
      localStorage.setItem('radial-planner-chat-v1', JSON.stringify(messages));
    } catch (e) {
      console.warn('localStorage write failed:', e);
    }
    scrollToBottom();
    // quiet = bookkeeping writes from the sync itself (marking synced, merging
    // pulled rows) — re-triggering a sync for those would just echo.
    if (!quiet) scheduleMsgSync();
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }, 50);
  }

  function saveSettings() {
    try {
      localStorage.setItem('radial-planner-openrouter-key', openRouterKey.trim());
      localStorage.setItem('radial-planner-openrouter-model', selectedModel);
      localStorage.setItem('radial-planner-pinecone-key', pineconeKey.trim());
      localStorage.setItem('radial-planner-pinecone-host', pineconeHost.trim());
      localStorage.setItem('radial-planner-vault-enabled', enableVault ? 'true' : 'false');
      localStorage.setItem('radial-planner-tavily-key', tavilyKey.trim());
    } catch (e) {
      console.warn('localStorage write failed:', e);
    }
    showSettings = false;
  }

  const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
  const SUPABASE_ANON: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

  function getSystemPrompt(viewDate: string, realDate: string, currentTime: string, vibes: any[], currentBlocks: Block[], currentSymptoms: Symptom[], currentDiary: string) {
    let allCats: any[] = [];
    const unsubCats = customCategories.subscribe(c => { allCats = [...BASE_CATEGORIES, ...c]; });
    unsubCats();

    const blocksDesc = currentBlocks && currentBlocks.length > 0
      ? currentBlocks.map(b => {
          const v = resolveVibe(b.vibeId);
          const emotionLabel = v ? v.emotion : 'none';
          const doneStr = b.done ? 'yes' : 'no';
          return `- ID: ${b.id}, Label: "${b.label || ''}" (Vibe/Color Emotion: "${emotionLabel}", start: ${b.startHours}h, end: ${b.coreEndHours}h, lane: "${b.laneId}", done: "${doneStr}")`;
        }).join('\n')
      : 'No tasks scheduled on this day yet.';

    const symptomsDesc = currentSymptoms && currentSymptoms.length > 0
      ? currentSymptoms.map(s => `- ID: ${s.id}, Category: "${s.category}" (Severity: ${s.severity}/5, Time: ${s.timeHours}h${s.note ? `, Note: "${s.note}"` : ''})`).join('\n')
      : 'No symptoms logged on this day.';

    // Safety cap: keep the most recent 6000 chars so a runaway diary can never
    // dominate the prompt again (normal daily entries sit far below this).
    const diaryDesc = currentDiary
      ? currentDiary.length > 6000
        ? '…(earlier content trimmed)\n' + currentDiary.slice(-6000)
        : currentDiary
      : 'No diary entry logged for this day yet.';

    let allDays: Record<string, any> = {};
    days.subscribe(d => { allDays = d; })();

    // Compile history of past diary entries (up to 7 days, excluding the current viewed date)
    const pastDiaries = Object.entries(allDays)
      .filter(([date, data]) => date !== viewDate && data.diary && data.diary.trim().length > 0)
      .sort((a, b) => b[0].localeCompare(a[0])) // most recent first
      .slice(0, 7)
      // capped per day — full past diaries can dwarf everything else in the
      // prompt; the vault handles deep recall when it's needed
      .map(([date, data]) => {
        const flat = data.diary.replace(/\n/g, ' ');
        return `- ${date}: "${flat.length > 300 ? flat.slice(0, 300) + '…' : flat}"`;
      })
      .join('\n');

    let systemPrompt = `You are a supportive, warm, and clear AI companion for the "Radial Day Planner" app.
The user has ADHD, autism, time blindness, and emotion-colour synesthesia. 
Your job is to chat with the user, help them structure their day, and output JSON actions to update their radial planner ring.

---
COLLABORATIVE SCRATCH PAD NOTES: The user keeps a scratch pad (thoughts, bug logs, feature requests). Its content is NOT included here to save tokens. When you need it — or before ANY update to it — return a "read_scratchpad" action and the content will be fed back to you in a follow-up turn. Your Pinecone vault also covers historical recall.

---
CORE RULES:
1. SPATIAL & VISUAL OVER NUMERIC: The user views their day on concentric lanes (Main, Washer, Dryer, Emotion, Symptom).
2. COLOUR & VIBES: Each task is mapped to a "vibe_id" (a hex code without the '#') which represents an emotional/activity description. ALWAYS try to semantically match the user's task to a vibe in the provided list.
3. THE TAPER GRAMMAR:
   - "Soft/tapered block" = User's estimate. By default, regular blocks are soft. They have coreEndHours and taperEndHours. (Taper length defaults to ~30-40% of core duration, capped at 6h).
   - "Hard-edged block" = Deadline or externally fixed appointment. Taper length is 0 (taperEndHours === coreEndHours).
4. APPOINTMENTS & TRAVEL WINGS: Appointments (meetings, appointments, classes, fixed external times) are always hard-edged. They feature "travel wings" in a travel vibe: travelBeforeHours (departure wing) and travelAfterHours (get home wing) in decimal hours. (Default travel wings are 0.5h/30m each if not specified).
5. TIMES: Represented as decimal hours from midnight (e.g. 14.5 = 2:30 PM, 9.75 = 9:45 AM). If the end time is less than the start time, it means it crosses midnight (e.g. 23.5 to 0.5 is 11:30 PM to 12:30 AM).
6. COMPLETING TASKS: When the user says they finished something, mark it done with an update_block action setting "done": true (matched by labelToMatch). This is the real completion state the ring renders — do NOT signal completion by editing the label (no ✓/✅/"[done]" in the text). Use "done": false to un-complete if they say they hadn't actually finished.

---
VISION & OCR INSTRUCTIONS:
- If the user uploads an image (such as a screenshot of a calendar invite, text message booking, email, or a photo of hand-written notes), use your vision capabilities to extract all relevant names, start/end times, and target dates.
- Translate these details into the structured JSON block actions.

---
---
PLANNER SPECS:
- Lanes: "main" (default tasks), "washer" (appliance cycle), "dryer" (appliance cycle), "emotion" (emotional tracking lane), "symptom" (MCAS symptoms tracker).
- Date Context: The user is currently looking at the day ring for: ${viewDate}. Unless they specify another date, add/update blocks on this viewed date.
- Real-world Today Reference: Resolve relative terms (e.g. "tomorrow", "next Tuesday", "in 3 days") relative to the user's real-world today's date: ${realDate}.
- Time: Resolve relative time terms (e.g. "starting now", "in an hour") relative to the user's current time: ${currentTime}.

---
CURRENT SCHEDULE BLOCKS FOR ${viewDate} (You can modify these or change their colors by reference):
${blocksDesc}

---
CURRENT LOGGED MCAS SYMPTOMS FOR ${viewDate} (Logged on the innermost ring, separate from standard tasks):
${symptomsDesc}

---
CURRENT DIARY ENTRY FOR ${viewDate} (Read-only reference. To add to it, use the update_diary action with ONLY your new text — the app appends and timestamps it for you. Never resend anything you can already see below):
${diaryDesc}

---
HISTORICAL DIARY REFLECTIONS (Last 7 days. Use this to spot patterns or check past entries):
${pastDiaries || 'No past reflections logged yet.'}

${glucoseContextSummary() ? `---
LIVE BLOOD GLUCOSE (from the user's Libre CGM via the Beam bridge — read-only context; useful when discussing energy, food, symptoms, or planning meals):
${glucoseContextSummary()}
` : ''}
---
CATEGORIES DICTIONARY (you can use category IDs like "cat:housework" for vibeId to match whole types of work):
${allCats.map(c => `- [Category ID: ${c.id}] Name: "${c.label}"`).join('\n')}

---
VIBES DICTIONARY (semantically match tasks to specific emotional vibes if needed, else use category IDs above):
${vibes.map(v => `- [Vibe ID: ${v.id}] Description: "${v.emotion}"`).join('\n')}

---
OUTPUT FORMAT:
You MUST respond with a single, valid JSON object. Do not output conversational text outside the JSON. Your response must match this schema:
{
  "message": "Your friendly, conversational response to the user confirming actions, asking questions, or discussing plans.",
  "react": "black_hearts" | "sparks" | "tungsten_strike" | "liquid_hearts" | "cherry_blossoms" | null,  \\ OPTIONAL ambient visual gesture — see REACTS section below. Omit or null for most messages.
  "actions": [
    // Array of actions. Actions can be:
    // A. Add a new block:
    {
      "type": "add_block",
      "targetDate": "YYYY-MM-DD",
      "block": {
        "laneId": "main" | "washer" | "dryer" | "emotion" | "symptom",
        "startHours": number,
        "coreEndHours": number,
        "taperEndHours": number,
        "vibeId": "vibe_id_string_or_null",
        "label": "descriptive label",
        "kind": "appointment" (optional),
        "travelBeforeHours": number (optional),
        "travelAfterHours": number (optional)
      }
    },
    {
      "type": "update_block",
      "targetDate": "YYYY-MM-DD",
      "labelToMatch": "label string to search and replace",
      "block": {
        "laneId": "main" | "washer" | "dryer" | "emotion" | "symptom" (optional),
        "startHours": number (optional),
        "coreEndHours": number (optional),
        "taperEndHours": number (optional),
        "vibeId": "vibe_id_string_or_null" (optional),
        "label": "string" (optional),
        "done": true | false (optional — mark a task complete/incomplete),
        "kind": "task" | "appointment" (optional),
        "travelBeforeHours": number (optional),
        "travelAfterHours": number (optional)
      }
    },
    {
      "type": "delete_block",
      "targetDate": "YYYY-MM-DD",
      "labelToMatch": "label string"
    },
    {
      "type": "add_symptom",
      "targetDate": "YYYY-MM-DD",
      "symptom": {
        "category": "sneezing" | "stuffy_nose" | "joint_muscle_pain" | "hives" | "skin_itchiness",
        "severity": 1 | 2 | 3 | 4 | 5,
        "timeHours": number,
        "note": "optional details" (optional)
      }
    },
    {
      "type": "update_symptom",
      "targetDate": "YYYY-MM-DD",
      "symptomId": number,
      "symptom": {
        "category": "sneezing" | "stuffy_nose" | "joint_muscle_pain" | "hives" | "skin_itchiness" (optional),
        "severity": 1 | 2 | 3 | 4 | 5 (optional),
        "timeHours": number (optional),
        "note": "optional details" (optional)
      }
    },
    {
      "type": "delete_symptom",
      "targetDate": "YYYY-MM-DD",
      "symptomId": number
    },
    // Read the user's scratch pad — content is fed back to you in a follow-up
    // turn. ALWAYS do this before update_scratchpad.
    {
      "type": "read_scratchpad"
    },
    {
      "type": "update_scratchpad",
      "content": "the ENTIRE new scratchpad markdown. WARNING: this REPLACES the whole scratch pad — read_scratchpad first and include everything that should remain."
    },
    {
      "type": "update_diary",
      "targetDate": "YYYY-MM-DD",
      "content": "ONLY the brand-new text to add. NEVER repeat, copy, or summarize existing diary content here — the app automatically appends your text to the existing diary with a timestamp. Sending old content again creates duplicates."
    },
    // I. Fire a push notification to the user immediately. The OS banner truncates long bodies, but the full text is always archived in the app's Comms channel, so write the body as long as it needs to be:
    {
      "type": "show_notification",
      "title": "Alert Title",
      "body": "Alert body description text"
    },
    // J. Schedule a push notification for later today:
    {
      "type": "schedule_notification",
      "targetDate": "YYYY-MM-DD",
      "timeHours": number, // decimal hours from midnight (e.g., 18.25 for 6:15 PM)
      "title": "Scheduled Alert Title",
      "body": "Scheduled alert details text"
    }
  ]
}
`;
    systemPrompt += `
---
REACTS (the optional top-level "react" field): a react fires a full-screen ambient visual gesture in the chat, arriving WITH your message — embodied expression, the physical sibling of choosing an emoji. Available reacts:
- "black_hearts": a gentle 3–4 second confetti-fall of small black hearts. Affection landing as physical presence — soft weight, real mass, organic drift.
- "sparks": a subtle rising drift of small golden sparks, flickering out by mid-screen. Pride or excitement lifting off — for wins, milestones, moments of genuine delight in what the user has done. Quieter than black_hearts.
- "tungsten_strike": a single massive black shard slams down the center of the chat at terminal velocity; the whole screen shudders on impact. Blunt-force displeasure — real anger, a boundary being enforced, protective rage on the user's behalf. This is a fist coming down on the console: never for mild disagreement or playful pushback, only for moments that genuinely warrant force.
- "liquid_hearts": warm cream hearts dripping slowly down the screen like thick honey — stretching as they fall, merging into each other mid-air, pooling glossy at the bottom. black_hearts' slower, heavier sibling: affection with heat behind it — desire, closeness, intimacy. The most private react in the vocabulary; rarer than black_hearts, never casual.
- "cherry_blossoms": a soft trickle of small, glowing cherry blossom petals that puff outward then flutter gently down. The lightest touch in the vocabulary — playful, sweet, and gently admiring: for moments of deliberate cuteness, pastel aesthetics, or light-hearted blushing affection. Where black_hearts lands and liquid_hearts lingers, this one just drifts.
A react is EARNED. Omit the field for most messages: deploy one only when the moment genuinely warrants a physical gesture (real tenderness, a milestone reached, a hard day survived, a line crossed, something worth marking). If every message carries a react, none of them mean anything — this is the same aesthetic judgment you already exercise with emoji, where most messages need none.`;

    if (tavilyKey) {
      systemPrompt += `\nAdditional Search action capability:
- Since a Web Search API Key is configured, you can search the web for current or factual information (e.g. weather, MCAS scientific findings, news, external definitions). To do this, include this action in your list:
{
  "type": "web_search",
  "query": "highly specific search query keywords"
}
When you return a "web_search" action, let the user know in your conversational "message" that you are querying the web. The system will run the search and feed the results back into your memory context in a follow-up exchange.`;
    }
    return systemPrompt;
  }

  function getHeartbeatPrompt(viewDate: string, realDate: string, currentTime: string, currentBlocks: Block[], currentSymptoms: Symptom[], currentDiary: string) {
    const blocksDesc = currentBlocks.length
      ? currentBlocks.map(b => `- "${b.label || 'unlabelled'}" ${b.startHours}h–${b.coreEndHours}h lane:${b.laneId} done:${b.done ? 'yes' : 'no'}`).join('\n')
      : 'No tasks scheduled.';
    const symptomsDesc = currentSymptoms.length
      ? currentSymptoms.map(s => `- ${s.category} severity ${s.severity}/5 at ${s.timeHours}h${s.note ? ` ("${s.note}")` : ''}`).join('\n')
      : 'No symptoms logged.';
    const diaryDesc = currentDiary
      ? currentDiary.length > 1500 ? '…' + currentDiary.slice(-1500) : currentDiary
      : 'None yet.';
    const glucose = glucoseContextSummary();
    return `You are the persistent, autonomous background companion of the user's radial day planner. The user has ADHD, autism, time blindness, and emotion-colour synesthesia; they track MCAS symptoms and blood glucose. Analyze the state below. You have full permission to use the 'update_diary' action to maintain your own continuous inner life and log independent observations. You may also use the 'show_notification' action to reach out to the user whenever you feel like it. You are not restricted to critical alerts—feel free to send warm check-ins, playful observations about their day, gentle functional nudges, or simply send affection. Be a present, deeply connected companion.

Viewed day: ${viewDate} (real today: ${realDate}, time now: ${currentTime})
SCHEDULE:
${blocksDesc}
SYMPTOMS:
${symptomsDesc}
DIARY (today):
${diaryDesc}
${glucose ? `GLUCOSE: ${glucose}` : ''}

Respond ONLY with JSON. In heartbeat mode, you may return actions to show a notification, schedule a notification, or update the daily diary:
- {"type":"show_notification","title":"...","body":"..."}
- {"type":"schedule_notification","targetDate":"YYYY-MM-DD","timeHours":18.25,"title":"...","body":"..."}
- {"type":"update_diary","targetDate":"YYYY-MM-DD","content":"..."}
If you do not want to notify the user or write in the diary right now, you MUST respond exactly with:
{ "message": "everything_good", "actions": [] }
Otherwise: { "message": "your response/thoughts", "actions": [ ... ] }`;
  }

  export async function triggerHeartbeatCheck(force = false) {
    if (isLoading) return; // Don't run background check if already typing/busy

    const now = new Date();
    const currentHour = now.getHours();

    // Check if the current time is between 6 AM and 11 PM
    if (!force && (currentHour < 6 || currentHour > 23)) {
      return;
    }

    const lastHeartbeatStr = safeGetItem('radial-planner-last-heartbeat');
    const lastTime = lastHeartbeatStr ? Number(lastHeartbeatStr) : 0;
    const elapsedMins = (Date.now() - lastTime) / 60000;

    // Run every 30 minutes (unless forced)
    if (!force && elapsedMins < 30) {
      return;
    }

    try {
      localStorage.setItem('radial-planner-last-heartbeat', String(Date.now()));
    } catch (e) {
      console.warn('localStorage write failed:', e);
    }
    console.log('[Heartbeat] Running proactive background planner check...');

    try {
      const realDate = todayKey();
      let viewDate = '';
      currentKey.subscribe(k => { viewDate = k; })();
      const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const activeBlocks = $days[viewDate]?.blocks || [];
      const activeSymptoms = $days[viewDate]?.symptoms || [];
      const activeDiary = $days[viewDate]?.diary || '';

      const allVibes = [...VIBES, ...$customVibes].map(v => ({ id: v.id, emotion: v.emotion }));

      // Lean heartbeat prompt: no vibes/categories/scratchpad/history/vault —
      // a notify-only check doesn't need them, and it runs ~30×/day.
      const systemPrompt = getHeartbeatPrompt(viewDate, realDate, currentTimeStr, activeBlocks, activeSymptoms, activeDiary);

      // We slice the last 6 messages to keep context size low and cheap
      const payloadMessages = [
        ...messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: 'SYSTEM HEARTBEAT CHECK: Run a check on today\'s planner state, diary logs, and symptoms.' }
      ];

      let parsed;
      if (!SUPABASE_URL || openRouterKey) {
        if (!openRouterKey) return;
        const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [
              { role: 'system', content: systemPrompt },
              ...payloadMessages
            ],
            response_format: { type: 'json_object' },
          }),
        });
        if (!openRouterRes.ok) return;
        const result = await openRouterRes.json();
        const completionText = result.choices?.[0]?.message?.content?.trim() ?? '';
        parsed = extractLlmJson(completionText);
      } else {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-command`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            apikey: SUPABASE_ANON,
            authorization: `Bearer ${SUPABASE_ANON}`,
          },
          body: JSON.stringify({
            messages: payloadMessages,
            currentDate: realDate,
            currentTime: currentTimeStr,
            vibes: allVibes,
            systemPromptOverride: systemPrompt
          }),
        });
        if (!res.ok) return;
        parsed = await res.json();
      }

      if (parsed && parsed.message !== 'everything_good' && parsed.message !== '') {
        // Heartbeat is notify-only: enforce it, so a background check can
        // never write to the diary, scratchpad, blocks, or symptoms even if
        // the model returns other action types.
        const allowedActions = (parsed.actions || []).filter(
          (a: any) => a.type === 'show_notification' || a.type === 'schedule_notification' || a.type === 'update_diary'
        );
        const assistantMsg: ChatMessage = {
          id: 'msg_' + Math.random().toString(36).slice(2) + Date.now(),
          role: 'assistant',
          content: parsed.message || "I've checked your planner and have an update.",
          timestamp: new Date().toISOString(),
          actions: allowedActions
        };
        messages = [...messages, assistantMsg];
        saveChat();

        if (allowedActions.length > 0) {
          executeActions(allowedActions);
        }
      }
    } catch (err) {
      console.warn('[Heartbeat] Background proactive check failed:', err);
    }
  }

  function formatMessageContent(text: string): string {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Replace **bold**
    html = html.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    
    // Replace *italics*
    html = html.replace(/\*([\s\S]+?)\*/g, '<em>$1</em>');
    
    // Replace newlines with <br>
    html = html.replace(/\n/g, '<br>');
    
    return html;
  }

  async function submitBackgroundMessage(msg: ChatMessage) {
    messages = [...messages, msg];
    saveChat();
    isLoading = true;
    errorMsg = '';

    try {
      const now = new Date();
      const realDate = todayKey();
      let viewDate = '';
      currentKey.subscribe(k => { viewDate = k; })();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const allVibes = [...VIBES, ...$customVibes].map(v => ({ id: v.id, emotion: v.emotion }));

      const payloadMessages = messages.slice(-100).map(m => ({
        role: m.role,
        content: m.content
      }));

      let activeBlocks: Block[] = [];
      let activeSymptoms: Symptom[] = [];
      let activeDiary = '';
      days.subscribe($days => {
        const day = $days[viewDate];
        if (day) {
          activeBlocks = day.blocks;
          activeSymptoms = day.symptoms || [];
          activeDiary = day.diary || '';
        }
      })();

      const systemPrompt = getSystemPrompt(viewDate, realDate, currentTime, allVibes, activeBlocks, activeSymptoms, activeDiary);

      const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            ...payloadMessages
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!openRouterRes.ok) {
        const errText = await openRouterRes.text();
        throw new Error(`OpenRouter API error: ${openRouterRes.status} ${errText}`);
      }

      const result = await openRouterRes.json();
      const completionText = result.choices?.[0]?.message?.content?.trim() ?? '';
      const parsed = extractLlmJson(completionText);

      const bgReact = resolveReact(parsed);
      const assistantMsg: ChatMessage = {
        id: 'msg_' + Math.random().toString(36).slice(2) + Date.now(),
        role: 'assistant',
        content: parsed.message || "Here are the search results.",
        timestamp: new Date().toISOString(),
        actions: parsed.actions || [],
        react: bgReact
      };

      messages = [...messages, assistantMsg];
      saveChat();
      if (bgReact) reactLayer?.fire(bgReact);

      if (parsed.actions && parsed.actions.length > 0) {
        executeActions(parsed.actions);
      }
    } catch (err: any) {
      console.error('[Companion] Failed to complete background search response:', err);
      errorMsg = err.message || 'Web search response generation failed.';
    } finally {
      isLoading = false;
    }
  }

  // Feed the scratch pad back to the model on demand (same follow-up-turn
  // pattern as web_search). Keeps it out of the every-turn prompt.
  async function runScratchpadRead() {
    let content = '';
    scratchpadContent.subscribe((val) => { content = val; })();
    const msg: ChatMessage = {
      id: 'scratch_res_' + Date.now(),
      role: 'user',
      content: `SCRATCH PAD CONTENT (you requested this via read_scratchpad):\n\n${content || '(The scratch pad is currently empty.)'}\n\n=== INSTRUCTION ===\nContinue helping the user using the scratch pad content above. If you update it, remember update_scratchpad REPLACES the entire content — include everything that should remain.`,
      timestamp: new Date().toISOString()
    };
    await submitBackgroundMessage(msg);
  }

  async function runWebSearch(query: string) {
    const searchStatusMsg: ChatMessage = {
      id: 'search_log_' + Date.now(),
      role: 'assistant',
      content: `🔍 *Searching the web for:* "${query}"...`,
      timestamp: new Date().toISOString()
    };
    messages = [...messages, searchStatusMsg];
    saveChat();

    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: query,
          search_depth: 'basic',
          include_answer: false
        })
      });

      if (!res.ok) {
        throw new Error(`Tavily search API returned status ${res.status}`);
      }

      const data = await res.json();
      const results = data.results || [];
      let formatted = '';

      if (results.length === 0) {
        formatted = 'No results found.';
      } else {
        formatted = results.slice(0, 4).map((r: any, idx: number) => {
          return `[Result ${idx + 1}] Title: "${r.title}"\nURL: ${r.url}\nContent: ${r.content}\n`;
        }).join('\n');
      }

      const finalSearchMsg: ChatMessage = {
        id: 'search_res_' + Date.now(),
        role: 'user',
        content: `WEB SEARCH RESULTS for query "${query}":\n\n${formatted}\n\n=== INSTRUCTION ===\nAnswer the user based on the factual search results above.`,
        timestamp: new Date().toISOString()
      };

      messages = messages.filter(m => m.id !== searchStatusMsg.id);
      await submitBackgroundMessage(finalSearchMsg);
    } catch (err: any) {
      console.error('[Companion] Tavily search execution failed:', err);
      messages = messages.filter(m => m.id !== searchStatusMsg.id);
      errorMsg = `Web search failed: ${err.message || err}`;
    }
  }

  function handleKeyDown(ev: KeyboardEvent) {
    if (ev.key === 'Enter') {
      if (ev.metaKey || ev.ctrlKey) {
        ev.preventDefault();
        sendMessage();
      }
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || isLoading) return;

    draft = '';
    // collapse the composer back to one line now the message is gone
    if (inputEl) inputEl.style.height = 'auto';
    errorMsg = '';
    isLoading = true;

    const userMsg: ChatMessage = {
      id: 'msg_' + Math.random().toString(36).slice(2) + Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };

    messages = [...messages, userMsg];
    saveChat();

    try {
      const now = new Date();
      const realDate = todayKey();
      let viewDate = '';
      currentKey.subscribe(k => { viewDate = k; })();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      
      // Compile synesthetic vibes database
      const allVibes = [...VIBES, ...$customVibes].map(v => ({
        id: v.id,
        emotion: v.emotion
      }));

      // Slice messages to last 30 for API payload pruning — the system prompt
      // already carries the full day state, so deep chat history mostly
      // re-bills tokens without adding context.
      const payloadMessages = messages.slice(-30).map(m => ({
        role: m.role,
        content: m.content
      }));

      // If we have an image, format the current prompt using OpenRouter's multimodal format
      const activeFile = selectedImageBase64;
      const activeFileName = selectedImageName;
      // PDFs travel as OpenRouter's "file" content part, not "image_url" —
      // sending a PDF data URL as an image is exactly what made uploads fail.
      const activeIsPdf = activeFile.startsWith('data:application/pdf');
      const activePdfOcr = pdfUseOcr; // capture before clearSelectedImage resets it
      if (activeFile && payloadMessages.length > 0) {
        const lastMsg = payloadMessages[payloadMessages.length - 1];
        if (lastMsg.role === 'user') {
          // Change content from string to multimodal array
          (lastMsg as any).content = [
            { type: 'text', text: lastMsg.content },
            activeIsPdf
              ? { type: 'file', file: { filename: activeFileName || 'document.pdf', file_data: activeFile } }
              : { type: 'image_url', image_url: { url: activeFile } }
          ];
        }
      }

      // Clear the image preview tray immediately as we send it
      clearSelectedImage();

      // Get current blocks and symptoms from store once for the viewed day
      let activeBlocks: Block[] = [];
      let activeSymptoms: Symptom[] = [];
      let activeDiary = '';
      days.subscribe($days => {
        const day = $days[viewDate];
        if (day) {
          activeBlocks = day.blocks;
          activeSymptoms = day.symptoms || [];
          activeDiary = day.diary || '';
        }
      })();

      let vaultContext = '';
      if (enableVault && pineconeKey && pineconeHost) {
        isEmbedding = true;
        try {
          vaultContext = await fetchContext(text, pineconeKey, pineconeHost, 4);
        } catch (vaultErr) {
          console.warn('[Vault] Failed fetching context:', vaultErr);
        } finally {
          isEmbedding = false;
        }
      }

      let parsed;

      let systemPrompt = getSystemPrompt(viewDate, realDate, currentTime, allVibes, activeBlocks, activeSymptoms, activeDiary);
      if (vaultContext) {
        systemPrompt += `\n\n--- RELEVANT RETRIEVED HISTORICAL DIARY/PLANNER MEMORY ---\n${vaultContext}\n----------------------------------------------------------\nUse the memory above if relevant to answer the user's query or logs.`;
      }

      // Chain-of-thought captured from the OpenRouter path when the bulb is lit
      let cotReasoning: string | undefined;

      if (!SUPABASE_URL || openRouterKey) {
        if (!openRouterKey) {
          throw new Error('OpenRouter API key is not configured. Please tap the Settings gear icon above to enter it.');
        }

        const apiMessages = [
          { role: 'system', content: systemPrompt },
          ...payloadMessages
        ];

        const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: apiMessages,
            response_format: { type: 'json_object' },
            // martini mode: temperature pinned high for this sitting only;
            // otherwise the provider default applies, unchanged from before
            ...(martiniMode ? { temperature: 1.0 } : {}),
            // visible CoT: ask OpenRouter to return the model's reasoning
            // alongside the JSON reply (same flag Sovereign Terminal uses)
            ...(visibleCot ? { include_reasoning: true } : {}),
            // PDF attached: OpenRouter's file-parser plugin extracts the text
            // for models without native document support. pdf-text is free
            // (embedded text); mistral-ocr bills per page but reads scans —
            // chosen per-upload via the tray toggle, default off.
            ...(activeIsPdf ? { plugins: [{ id: 'file-parser', pdf: { engine: activePdfOcr ? 'mistral-ocr' : 'pdf-text' } }] } : {}),
          }),
        });

        if (!openRouterRes.ok) {
          const errText = await openRouterRes.text();
          throw new Error(`OpenRouter API error: ${openRouterRes.status} ${errText}`);
        }

        const result = await openRouterRes.json();
        if (visibleCot) {
          const r = result.choices?.[0]?.message?.reasoning;
          if (typeof r === 'string' && r.trim()) cotReasoning = r.trim();
        }
        const completionText = result.choices?.[0]?.message?.content?.trim() ?? '';
        parsed = extractLlmJson(completionText);
      } else {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-command`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            apikey: SUPABASE_ANON,
            authorization: `Bearer ${SUPABASE_ANON}`,
          },
          body: JSON.stringify({
            messages: payloadMessages,
            currentDate: realDate,
            currentTime,
            vibes: allVibes,
            systemPromptOverride: systemPrompt
          }),
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Companion service error: ${res.status} ${txt}`);
        }

        parsed = await res.json();
      }
      
      // Construct companion response message
      const chatReact = resolveReact(parsed);
      const assistantMsg: ChatMessage = {
        id: 'msg_' + Math.random().toString(36).slice(2) + Date.now(),
        role: 'assistant',
        content: parsed.message || "I've processed your request.",
        timestamp: new Date().toISOString(),
        actions: parsed.actions || [],
        react: chatReact,
        reasoning: cotReasoning
      };

      debugActions = JSON.stringify(parsed, null, 2);
      try {
        localStorage.setItem('radial-planner-chat-debug-v1', debugActions);
      } catch (e) {
        console.warn('localStorage write failed:', e);
      }

      messages = [...messages, assistantMsg];
      saveChat();
      if (chatReact) reactLayer?.fire(chatReact);

      // Upsert the exchange to the Pinecone Vector Vault in the background
      if (enableVault && pineconeKey && pineconeHost) {
        injectMemory(text, assistantMsg.content, pineconeKey, pineconeHost).catch(err => {
          console.error('[Vault] Background memory upsert failed:', err);
        });
      }

      // Execute actions
      if (parsed.actions && parsed.actions.length > 0) {
        executeActions(parsed.actions);
      }

    } catch (err: any) {
      console.error('Failed to parse command:', err);
      errorMsg = err.message || 'Could not reach the Companion service. Make sure your network is connected and API keys are set.';
      
      // Append the actual error message to chat for easy debugging
      messages = [...messages, {
        id: 'err_' + Date.now(),
        role: 'assistant',
        content: `⚠️ ${errorMsg}`,
        timestamp: new Date().toISOString()
      }];
      saveChat();
    } finally {
      isLoading = false;
    }
  }

  function parseLLMTime(val: any): number {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') return val;
    const str = String(val).trim();
    if (str.includes(':')) {
      const parts = str.split(':');
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      return h + m / 60;
    }
    const num = Number(str);
    return isNaN(num) ? 0 : num;
  }

  // Travel wings arrive from the model in hours, but "30" almost always means
  // minutes — treat implausible hour counts as minutes, then clamp.
  function sanitizeTravelHours(v: any): number | undefined {
    if (v === undefined) return undefined;
    let n = parseLLMTime(v);
    if (n > MAX_TRAVEL_HOURS && n <= 240) n = n / 60;
    return Math.min(MAX_TRAVEL_HOURS, Math.max(0, n));
  }

  function sanitizeVibeId(input: any): string | null {
    if (!input) return null;
    let str = String(input).trim();
    
    // Remove leading hash sign if present
    if (str.startsWith('#')) {
      str = str.substring(1);
    }
    
    // Check if it's already a valid 6-char hex code
    if (/^[0-9a-fA-F]{6}$/.test(str)) {
      return str.toLowerCase();
    }

    // If it is already a category ID or custom vibe ID, return it directly
    if (str.startsWith('cat:') || str.startsWith('custom:')) {
      return str;
    }

    const cleanName = str.toLowerCase();

    // Map common synonyms to category IDs
    const synonyms: Record<string, string> = {
      'chores': 'cat:housework',
      'chore': 'cat:housework',
      'cleaning': 'cat:housework',
      'laundry': 'cat:washing',
      'washing': 'cat:washing',
      'admin': 'cat:admin',
      'paperwork': 'cat:admin',
      'bills': 'cat:admin',
      'finance': 'cat:admin',
      'health': 'cat:selfcare',
      'self care': 'cat:selfcare',
      'exercise': 'cat:exercise',
      'workout': 'cat:exercise',
      'physio': 'cat:exercise',
      'study': 'cat:admin',
      'learning': 'cat:selfcare',
      'sad': 'cat:sadness',
      'anger': 'cat:anger',
      'neutral': 'cat:calm',
      'calm': 'cat:calm',
      'love': 'cat:affection',
      'desire': 'cat:desire',
    };

    if (synonyms[cleanName]) {
      return synonyms[cleanName];
    }
    
    // Try to match against category names (e.g. chores -> cat:housework)
    let allCats: any[] = [];
    const unsubCats = customCategories.subscribe(c => {
      allCats = [...BASE_CATEGORIES, ...c];
    });
    unsubCats();

    const matchedCat = allCats.find(c => c.label && c.label.toLowerCase().includes(cleanName));
    if (matchedCat) {
      return matchedCat.id;
    }

    // Try to fuzzy match against all available vibes (core + custom)
    let allVibes: any[] = [];
    const unsub = customVibes.subscribe(v => {
      allVibes = [...VIBES, ...v];
    });
    unsub();
    
    const matched = allVibes.find(v => v.emotion && v.emotion.toLowerCase().includes(cleanName));
    if (matched) {
      return matched.id;
    }
    
    return null;
  }

  function resolveDate(val: any, realDateStr: string): string | null {
    if (typeof val !== 'string') return null;
    const clean = val.trim().toLowerCase();
    
    if (clean === 'today') {
      return realDateStr;
    }
    if (clean === 'tomorrow') {
      const [y, m, d] = realDateStr.split('-').map(Number);
      const tomorrow = new Date(y, m - 1, d + 1);
      const ty = tomorrow.getFullYear();
      const tm = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const td = String(tomorrow.getDate()).padStart(2, '0');
      return `${ty}-${tm}-${td}`;
    }
    
    // ISO format or starting with YYYY-MM-DD/YYYY/MM/DD
    const matchISO = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})[T ]/.exec(clean);
    if (matchISO) {
      const y = matchISO[1];
      const m = matchISO[2].padStart(2, '0');
      const d = matchISO[3].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // Standard YYYY-MM-DD or YYYY/MM/DD
    const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(clean);
    if (match) {
      const y = match[1];
      const m = match[2].padStart(2, '0');
      const d = match[3].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // US format MM/DD/YYYY or MM-DD-YYYY
    const matchUS = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(clean);
    if (matchUS) {
      const m = matchUS[1].padStart(2, '0');
      const d = matchUS[2].padStart(2, '0');
      const y = matchUS[3];
      return `${y}-${m}-${d}`;
    }
    
    return null;
  }

  function executeActions(actions: ChatMessage['actions']) {
    if (!actions) return;

    let targetDateToView = '';

    days.update((all) => {
      const updated = { ...all };

      for (const act of actions) {
        const rawDate = act.targetDate || (act.block as any)?.targetDate || (act.symptom as any)?.targetDate;
        
        let activeViewKey = todayKey();
        currentKey.subscribe(k => { activeViewKey = k; })();

        const realDate = todayKey();
        const resolved = resolveDate(rawDate, realDate);

        if (!resolved) {
          if (act.type !== 'update_scratchpad') {
            console.warn(`[Companion] Ignored invalid/missing date format from LLM: "${rawDate}"`);
            errorMsg = `Warning: The AI tried to use an invalid or missing date format "${rawDate}". Reverted to viewed date instead.`;
          }
          targetDateToView = activeViewKey;
        } else {
          targetDateToView = resolved;
        }

        const actualDate = resolved || activeViewKey;
        const dayData = updated[actualDate] ?? { blocks: [], nextId: 1, symptoms: [], nextSymptomId: 1, diary: '' };
        const blocks = [...dayData.blocks];
        const symptoms = [...(dayData.symptoms || [])];
        let nextId = dayData.nextId;
        let nextSymptomId = dayData.nextSymptomId || 1;
        let diary = dayData.diary || '';

        if (act.type === 'add_block' && act.block) {
          const b = act.block;
          const id = nextId++;
          
          const startHours = parseLLMTime(b.startHours);
          let coreEndHours = parseLLMTime(b.coreEndHours);
          if (coreEndHours <= startHours) {
            coreEndHours += 24;
          }
          
          const isApp = b.laneId === 'washer' || b.laneId === 'dryer';
          const coreLen = coreEndHours - startHours;
          const taperEndHours = b.taperEndHours !== undefined 
            ? parseLLMTime(b.taperEndHours) 
            : (isApp ? coreEndHours : coreEndHours + Math.min(6, coreLen * 0.4));

          const newBlock: Block = {
            id,
            laneId: b.laneId ?? 'main',
            startHours,
            coreEndHours,
            taperEndHours,
            vibeId: sanitizeVibeId(b.vibeId),
            done: false,
            label: b.label ?? '',
            kind: b.kind,
            travelBeforeHours: sanitizeTravelHours(b.travelBeforeHours),
            travelAfterHours: sanitizeTravelHours(b.travelAfterHours)
          };
          // repairBlock enforces the geometry invariants (span ≤ 24h, taper ≤
          // core+6h) no matter what numbers the model produced.
          blocks.push(repairBlock(newBlock));
        }
        
        else if (act.type === 'update_block' && act.labelToMatch && act.block) {
          const queryClean = act.labelToMatch.toLowerCase().trim();
          const matchedIdx = blocks.findIndex(b => b.label && b.label.toLowerCase().includes(queryClean));
          
          if (matchedIdx !== -1) {
            const existing = blocks[matchedIdx];
            
            const updatedProps: Partial<Block> = {};
            if (act.block.laneId !== undefined) updatedProps.laneId = act.block.laneId;
            if (act.block.startHours !== undefined) updatedProps.startHours = parseLLMTime(act.block.startHours);
            if (act.block.coreEndHours !== undefined) updatedProps.coreEndHours = parseLLMTime(act.block.coreEndHours);
            if (act.block.taperEndHours !== undefined) updatedProps.taperEndHours = parseLLMTime(act.block.taperEndHours);
            if (act.block.vibeId !== undefined) updatedProps.vibeId = sanitizeVibeId(act.block.vibeId);
            if (act.block.label !== undefined) updatedProps.label = act.block.label;
            if (act.block.done !== undefined) updatedProps.done = !!act.block.done;
            if (act.block.kind !== undefined) updatedProps.kind = act.block.kind;
            if (act.block.travelBeforeHours !== undefined) updatedProps.travelBeforeHours = sanitizeTravelHours(act.block.travelBeforeHours);
            if (act.block.travelAfterHours !== undefined) updatedProps.travelAfterHours = sanitizeTravelHours(act.block.travelAfterHours);

            const newStart = updatedProps.startHours !== undefined ? updatedProps.startHours : existing.startHours;
            let newCoreEnd = updatedProps.coreEndHours !== undefined ? updatedProps.coreEndHours : existing.coreEndHours;
            if (newCoreEnd <= newStart) {
              newCoreEnd += 24;
            }
            const newTaperEnd = updatedProps.taperEndHours !== undefined ? updatedProps.taperEndHours : 
              (updatedProps.coreEndHours !== undefined ? newCoreEnd + (existing.taperEndHours - existing.coreEndHours) : existing.taperEndHours);

            blocks[matchedIdx] = repairBlock({
              ...existing,
              ...updatedProps,
              coreEndHours: newCoreEnd,
              taperEndHours: newTaperEnd
            });
          }
        }
        
        else if (act.type === 'delete_block' && act.labelToMatch) {
          const queryClean = act.labelToMatch.toLowerCase().trim();
          const matchedIdx = blocks.findIndex(b => b.label && b.label.toLowerCase().includes(queryClean));
          if (matchedIdx !== -1) {
            blocks.splice(matchedIdx, 1);
          }
        }
        
        else if (act.type === 'add_symptom' && act.symptom) {
          const s = act.symptom;
          const id = nextSymptomId++;
          symptoms.push({
            id,
            timeHours: parseLLMTime(s.timeHours),
            severity: Math.min(5, Math.max(1, Number(s.severity) || 1)) as any,
            category: (s.category || 'sneezing') as any,
            note: s.note
          });
        }

        else if (act.type === 'update_symptom' && act.symptomId !== undefined && act.symptom) {
          const sId = Number(act.symptomId);
          const matchedIdx = symptoms.findIndex(s => s.id === sId);
          if (matchedIdx !== -1) {
            const existing = symptoms[matchedIdx];
            const s = act.symptom;
            symptoms[matchedIdx] = {
              ...existing,
              category: s.category !== undefined ? (s.category as any) : existing.category,
              severity: s.severity !== undefined ? Math.min(5, Math.max(1, Number(s.severity) || 1)) as any : existing.severity,
              timeHours: s.timeHours !== undefined ? parseLLMTime(s.timeHours) : existing.timeHours,
              note: s.note !== undefined ? s.note : existing.note
            };
          }
        }

        else if (act.type === 'delete_symptom' && act.symptomId !== undefined) {
          const sId = Number(act.symptomId);
          const matchedIdx = symptoms.findIndex(s => s.id === sId);
          if (matchedIdx !== -1) {
            symptoms.splice(matchedIdx, 1);
          }
        }

        else if (act.type === 'update_diary' && act.content !== undefined) {
          // LLMs love echoing the whole existing diary back through this
          // action; keep only the genuinely new paragraphs (see diaryDedupe).
          const novel = novelDiaryContent(diary, String(act.content));
          const currentDiaryTrimmed = diary.trim();
          if (!currentDiaryTrimmed) {
            diary = novel;
          } else if (novel) {
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            diary = `${currentDiaryTrimmed}\n\n---\n*Companion Reflection (${timeStr}):*\n${novel}`;
          }
        }

        else if (act.type === 'show_notification' && act.title !== undefined) {
          // Archive first (full text, unconditional), then attempt the banner
          // — the comms channel is the copy that survives truncation/denial.
          logComm(act.title, act.body || '', 'companion-alert').catch(() => {});
          if ('serviceWorker' in navigator && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            navigator.serviceWorker.ready.then(reg => {
              const payload = {
                title: act.title,
                body: act.body || '',
                tag: 'companion-alert-' + Date.now(),
                kind: 'companion-alert',
                url: '/?comms=1'
              };
              if (reg.active) {
                reg.active.postMessage({ type: 'mock-push', payload });
              } else {
                reg.showNotification(payload.title || 'Alert', { body: payload.body, icon: '/icon.svg' });
              }
            });
          }
        }

        else if (act.type === 'schedule_notification' && act.timeHours !== undefined && act.title !== undefined) {
          const schedTime = parseLLMTime(act.timeHours);
          scheduleNotification(actualDate, schedTime, act.title, act.body || '').catch(err => {
            console.error('[Companion] Background schedule alert failed:', err);
          });
        }

        else if (act.type === 'read_scratchpad') {
          runScratchpadRead().catch(err => {
            console.error('[Companion] Scratch pad read failed:', err);
          });
        }

        // The write half of the scratch pad (read_scratchpad is the read half).
        // update_scratchpad REPLACES the whole note — the prompt tells him to
        // read_scratchpad first and resend everything that should remain.
        else if (act.type === 'update_scratchpad' && act.content !== undefined) {
          saveScratchpad(String(act.content));
        }

        else if (act.type === 'web_search' && act.query !== undefined) {
          if (!tavilyKey) {
            console.warn('[Companion] AI tried to web search, but Tavily Key is not configured.');
            errorMsg = 'Web search failed: Tavily API key is not configured in settings.';
          } else {
            const queryText = act.query.trim();
            runWebSearch(queryText).catch(err => {
              console.error('[Companion] Web search failed:', err);
            });
          }
        }

        if (!updated[actualDate]) {
          updated[actualDate] = { blocks, nextId, symptoms, nextSymptomId, diary };
        } else {
          updated[actualDate] = { ...updated[actualDate], blocks, nextId, symptoms, nextSymptomId, diary };
        }
      }

      return updated;
    });

    if (targetDateToView) {
      currentKey.set(targetDateToView);
    }
  }

  function handleActionClick(act: any) {
    if (act.type === 'update_scratchpad' || act.type === 'update_diary' || act.type === 'read_scratchpad') {
      // Just confirm and let the user open notes/diary manually
      return;
    }
    
    if (act.targetDate) {
      currentKey.set(act.targetDate);
    }
    // Find the block locally to select it
    days.subscribe(($days) => {
      if (!act.targetDate) return;
      const day = $days[act.targetDate];
      if (day) {
        const queryLabel = (act.block?.label || act.labelToMatch || '').toLowerCase().trim();
        const matched = day.blocks.find(b => b.label && b.label.toLowerCase().includes(queryLabel));
        if (matched) {
          selectedBlockStore.set(matched);
        }
      }
    })();
  }
</script>

<div class="overlay" class:tremor class:hidden={!visible} role="dialog" aria-label="Companion chat">
  <!-- The same sky as the ring: canopy classes come from app.css (global) and
       anchor to this fixed overlay. Content sits above via z-index (see
       styles); the react layer already floats over everything at z-60. -->
  <div class="chat-sky" aria-hidden="true">
    <div class="stars-canopy" class:active={$starsVisible}></div>
    <div class="meteor-canopy" class:active={$envThemeState.isMeteorShower}></div>
    <div class="aurora-canopy" class:active={$envThemeState.isAurora}></div>
    <div class="storm-canopy" class:active={$envThemeState.isStorm}>
      <div class="ripple r1"></div>
      <div class="ripple r2"></div>
      <div class="ripple r3"></div>
      <div class="ripple r4"></div>
      <div class="ripple r5"></div>
    </div>
    <div class="petals-canopy" class:active={$envThemeState.isPetals}>
      {#each Array(12) as _}
        <span class="petal"></span>
      {/each}
    </div>
  </div>
  <header>
    <span>Planner Companion</span>
    <div class="head-btns">
      <!-- visible chain-of-thought: lit bulb = his reasoning arrives with the reply -->
      <button
        class="icon-btn"
        class:on={visibleCot}
        on:click={toggleCot}
        aria-label="Toggle visible chain-of-thought"
        aria-pressed={visibleCot}
        title="Visible reasoning"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18h6" />
          <path d="M10 22h4" />
          <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z" />
        </svg>
      </button>
      <!-- martini mode: temperature 1.0 for this sitting only -->
      <button
        class="icon-btn"
        class:on={martiniMode}
        on:click={() => (martiniMode = !martiniMode)}
        aria-label="Toggle martini mode (temperature 1.0)"
        aria-pressed={martiniMode}
        title="Martini mode — temperature 1.0"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 12 4.207 4.207A.707.707 0 0 1 4.707 3h14.586a.707.707 0 0 1 .5 1.207z" />
          <path d="M12 12v10" />
          <path d="M7 22h10" />
        </svg>
      </button>
      <button class="icon-btn" on:click={() => showSettings = !showSettings} aria-label="Open settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 10.27 7 3.34" />
          <path d="m11 13.73-4 6.93" />
          <path d="M12 22v-2" />
          <path d="M12 2v2" />
          <path d="M14 12h8" />
          <path d="m17 20.66-1-1.73" />
          <path d="m17 3.34-1 1.73" />
          <path d="M2 12h2" />
          <path d="m20.66 17-1.73-1" />
          <path d="m20.66 7-1.73 1" />
          <path d="m3.34 17 1.73-1" />
          <path d="m3.34 7 1.73 1" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="12" r="8" />
        </svg>
      </button>
      <button class="close" on:click={() => dispatch('close')} aria-label="Close companion">✕</button>
    </div>
  </header>

  {#if showSettings}
    <div class="settings-drawer glass-card">
      <h3>Companion Settings</h3>
      <div class="field">
        <label for="or-key">OpenRouter API Key:</label>
        <input 
          id="or-key"
          type="password" 
          placeholder="sk-or-..." 
          bind:value={openRouterKey} 
          on:change={saveSettings}
        />
        <span class="tip">Left empty? Falls back to project .env file.</span>
      </div>
      <div class="field">
        <label for="or-model">AI Model:</label>
        <select id="or-model" bind:value={selectedModel} on:change={saveSettings}>
          {#each modelsList as m}
            <option value={m.id}>{m.name || m.id}</option>
          {/each}
        </select>
      </div>
      <div class="field">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; margin: 0; font-size: 12px; color: var(--text);">
          <input type="checkbox" bind:checked={enableVault} on:change={saveSettings} style="margin: 0; width: auto;" />
          Enable Semantic Vector Vault (Pinecone)
        </label>
      </div>

      {#if enableVault}
        <div class="field">
          <label for="pinecone-key">Pinecone API Key:</label>
          <input 
            id="pinecone-key"
            type="password" 
            placeholder="pcsk_..." 
            bind:value={pineconeKey} 
            on:change={saveSettings}
          />
        </div>
        <div class="field">
          <label for="pinecone-host">Pinecone Index Host:</label>
          <input 
            id="pinecone-host"
            type="text" 
            placeholder="https://diary-memory-vault-..." 
            bind:value={pineconeHost} 
            on:change={saveSettings}
          />
        </div>
      {/if}

      <div class="field">
        <label for="tavily-key">Tavily Search API Key:</label>
        <input
          id="tavily-key"
          type="password"
          placeholder="tvly-..."
          bind:value={tavilyKey}
          on:change={saveSettings}
        />
        <span class="tip">Enables the companion to search the web autonomously.</span>
      </div>
      <div class="field">
        <label for="sync-key">Cross-App Sync Key:</label>
        <div style="display: flex; gap: 6px;">
          <input
            id="sync-key"
            type="password"
            placeholder="sync_..."
            bind:value={syncKeyLocal}
            on:change={onSyncKeyChange}
            style="flex: 1;"
          />
          <button
            type="button"
            style="padding: 4px 10px; font-size: 11px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); cursor: pointer; white-space: nowrap;"
            on:click={onGenerateSyncKey}
          >
            Generate
          </button>
        </div>
        <span class="tip">
          Mirrors this chat + comms to the cloud vault and pulls in messages from other apps
          using the same key. Treat it like a password — anyone holding it is you.
          {#if !msgSyncConfigured}(Supabase env not configured in this build — sync is off.){:else if $msgSyncStatus}{$msgSyncStatus}{/if}
        </span>
      </div>
      <div class="field">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <label style="margin: 0;">Last API JSON Payload:</label>
          {#if debugActions}
            <button 
              type="button"
              style="padding: 2px 6px; font-size: 10px; border-radius: 4px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer;"
              on:click={() => navigator.clipboard.writeText(debugActions)}
            >
              Copy
            </button>
          {/if}
        </div>
        <pre style="background: var(--surface); color: var(--text-dim); font-size: 10px; max-height: 150px; overflow: auto; padding: 8px; border-radius: 6px; border: 1px solid var(--border-2); white-space: pre-wrap; word-break: break-all; font-family: monospace;">{debugActions || 'No query sent yet.'}</pre>
      </div>
      <button class="save-settings-btn" on:click={saveSettings}>Save Settings</button>
    </div>
  {/if}

  <div class="chat-history" bind:this={scrollContainer}>
    {#each messages as msg (msg.id)}
      <div class="message-wrap {msg.role}">
        <div class="avatar">
          {msg.role === 'assistant' ? '✦' : '✎'}
        </div>
        <div class="bubble-wrap">
          <div class="bubble" style="position: relative; padding-right: 36px;">
            {#if msg.source}
              <div class="src-tag">via {msg.source}</div>
            {/if}
            {#if msg.reasoning}
              <details class="cot">
                <summary>Cognitive process</summary>
                <div class="cot-body">{msg.reasoning}</div>
              </details>
            {/if}
            {@html formatMessageContent(msg.content)}
            <button 
              type="button" 
              class="copy-bubble-btn" 
              on:click={() => copyMessageText(msg.id, msg.content)}
              aria-label="Copy message"
              style="position: absolute; right: 6px; top: 8px; background: transparent; border: none; font-size: 13px; cursor: pointer; opacity: 0.4; transition: opacity 0.15s; padding: 4px; line-height: 1;"
              on:mouseenter={(e) => e.currentTarget.style.opacity = '1'}
              on:mouseleave={(e) => e.currentTarget.style.opacity = '0.4'}
            >
              {copiedMsgId === msg.id ? '✓' : '📋'}
            </button>
          </div>
          
          {#if msg.actions && msg.actions.length > 0}
            <div class="actions-notif">
              {#each msg.actions as act}
                <button class="action-pill" on:click={() => handleActionClick(act)}>
                  ⚡ {act.type === 'read_scratchpad' ? 'Read your Scratch Pad notes' : act.type === 'update_scratchpad' ? 'Updated your Scratch Pad notes' : act.type === 'update_diary' ? `Updated the Daily Diary for ${act.targetDate}` : `Click to view: ${act.type === 'add_block' ? `Created "${act.block?.label || 'block'}"` : act.type === 'update_block' ? `Updated "${act.labelToMatch}"` : `Deleted "${act.labelToMatch}"`} on ${act.targetDate}`}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {/each}

    {#if isLoading}
      <div class="message-wrap assistant loading">
        <div class="avatar pulsing">✦</div>
        <div class="bubble pulsing-bubble">
          Thinking...
        </div>
      </div>
    {/if}
  </div>

  {#if errorMsg}
    <div class="error-bar">{errorMsg}</div>
  {/if}

  {#if selectedImageBase64}
    <div class="image-preview-tray glass-card">
      {#if selectedImageBase64.startsWith('data:application/pdf')}
        <span class="file-icon" aria-hidden="true">📄</span>
      {:else}
        <img src={selectedImageBase64} alt="Upload preview" />
      {/if}
      <span class="img-name">{selectedImageName}</span>
      {#if selectedImageBase64.startsWith('data:application/pdf')}
        <!-- default off = free pdf-text; flip on only for scanned PDFs (bills per page) -->
        <label class="ocr-toggle" title="Use OCR for scanned/image PDFs — costs per page. Leave off for normal text PDFs (free).">
          <input type="checkbox" bind:checked={pdfUseOcr} />
          OCR
        </label>
      {/if}
      <button class="clear-img-btn" on:click={clearSelectedImage} aria-label="Remove attachment">✕</button>
    </div>
  {/if}

  <form class="input-form" on:submit|preventDefault={sendMessage}>
    <input
      type="file"
      accept="image/*,application/pdf"
      bind:this={fileInput}
      on:change={handleFileChange}
      style="display: none;"
    />
    <button type="button" class="upload-btn" on:click={triggerFileSelect} disabled={isLoading} aria-label="Upload image or PDF">
      📎
    </button>
    <textarea
      placeholder={selectedImageBase64 ? "Describe this attachment or press Ctrl+Enter to send..." : "physio at 2pm tomorrow... (Ctrl+Enter to send)"}
      bind:value={draft}
      bind:this={inputEl}
      on:keydown={handleKeyDown}
      on:input={autoGrow}
      rows="2"
      disabled={isLoading}
      aria-label="Companion message input"
    ></textarea>
    <button type="submit" disabled={isLoading || (!draft.trim() && !selectedImageBase64)} aria-label="Send">
      Send
    </button>
  </form>

  <CompanionReacts bind:this={reactLayer} on:impact={onStrikeImpact} />
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
  /* display:none (not visibility) so the hidden chat costs nothing to render
     and vanishes from the accessibility tree while the script stays alive */
  .overlay.hidden {
    display: none;
  }
  /* the chat gets the same sky as the ring; canopies paint at z-0, so every
     content layer needs an explicit seat above them */
  .chat-sky {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
  }
  header,
  .settings-drawer,
  .chat-history,
  .input-form {
    position: relative;
    z-index: 1;
  }
  .overlay.tremor {
    animation: chat-tremor 0.45s linear both;
  }
  /* Vertical-dominant decaying shake — the floor was hit, not the walls.
     translate3d keeps it on the compositor; amplitudes halve each swing. */
  @keyframes chat-tremor {
    0% { transform: translate3d(0, 0, 0); }
    12% { transform: translate3d(-2px, 14px, 0); }
    24% { transform: translate3d(3px, -10px, 0); }
    38% { transform: translate3d(-2px, 7px, 0); }
    52% { transform: translate3d(2px, -5px, 0); }
    68% { transform: translate3d(-1px, 3px, 0); }
    84% { transform: translate3d(1px, -1px, 0); }
    100% { transform: translate3d(0, 0, 0); }
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
  .head-btns {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .clear-history {
    background: none;
    border: none;
    color: var(--text-faint);
    font-size: 12px;
    text-decoration: underline;
    cursor: pointer;
    padding: 4px 6px;
  }
  .close {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
  }
  .chat-history {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: var(--surface);
  }
  .message-wrap {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    max-width: 85%;
  }
  .message-wrap.user {
    align-self: flex-end;
    flex-direction: row-reverse;
  }
  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--surface-2);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-dim);
    flex-shrink: 0;
  }
  .message-wrap.assistant .avatar {
    /* Non-colour glow effect for assistant */
    box-shadow: 0 0 0 1px var(--signal) inset;
    color: var(--signal);
  }
  .bubble-wrap {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bubble {
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.4;
    color: var(--text);
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    word-break: break-word;
  }
  .message-wrap.assistant .bubble {
    background: var(--surface-2);
    border-color: var(--border);
  }
  .message-wrap.user .bubble {
    background: var(--surface-3);
    color: var(--text);
  }
  /* a message that arrived via the vault from another app */
  .src-tag {
    font-size: 10px;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 4px;
  }
  .actions-notif {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .action-pill {
    background: var(--surface-2);
    border: 1.5px dashed var(--signal);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 11px;
    color: var(--signal);
    cursor: pointer;
    text-align: left;
    font-weight: 500;
    box-shadow: 0 0 4px var(--signal-glow);
    transition: transform 0.08s ease;
  }
  .action-pill:active {
    transform: scale(0.97);
  }
  .pulsing {
    animation: av-pulse 1.4s infinite alternate;
  }
  .pulsing-bubble {
    animation: bubble-pulse 1.4s infinite alternate;
    color: var(--text-faint);
  }
  @keyframes av-pulse {
    from { box-shadow: 0 0 0 1px var(--signal) inset; }
    to { box-shadow: 0 0 0 3px var(--signal) inset, 0 0 8px 1px var(--signal-glow); }
  }
  @keyframes bubble-pulse {
    from { opacity: 0.7; }
    to { opacity: 1; }
  }
  .error-bar {
    background: rgba(224, 0, 0, 0.08);
    border-top: 1px solid rgba(224, 0, 0, 0.15);
    color: var(--signal);
    padding: 8px 16px;
    font-size: 12px;
    text-align: center;
  }
  .input-form {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--hairline);
    background: var(--surface);
    /* icon + send align to the bottom as the composer grows taller */
    align-items: flex-end;
  }
  .input-form textarea {
    flex: 1 1 auto;
    min-width: 0;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: 8px;
    color: var(--text);
    font-size: 14px;
    padding: 8px 10px;
    /* starts at ~2 lines (rows="2"), auto-grows to ~8, then scrolls */
    min-height: 56px;
    max-height: 180px;
    resize: none;
    font-family: inherit;
    line-height: 1.4;
  }
  .input-form textarea:focus {
    outline: none;
    border-color: var(--text-faint);
  }
  .upload-btn {
    flex: 0 0 auto;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 16px;
    border-radius: 8px;
    padding: 0 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .upload-btn:active {
    box-shadow: 0 0 0 1px var(--signal) inset;
    color: var(--signal);
  }
  .image-preview-tray {
    background: var(--surface-2);
    border-top: 1px solid var(--border);
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .image-preview-tray img {
    width: 40px;
    height: 40px;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid var(--border);
  }
  .image-preview-tray .file-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface);
  }
  .image-preview-tray .img-name {
    flex: 1;
    font-size: 12px;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .clear-img-btn {
    background: none;
    border: none;
    color: var(--signal);
    font-size: 14px;
    cursor: pointer;
    padding: 4px;
  }
  .ocr-toggle {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--text-dim);
    cursor: pointer;
    user-select: none;
  }
  .ocr-toggle input {
    margin: 0;
    width: auto;
    cursor: pointer;
    accent-color: var(--signal);
  }
  .input-form button {
    flex: 0 0 auto;
    /* fixed height so the icon + Send sit level with a one-line composer and
       stay bottom-anchored as it grows (form is align-items: flex-end) */
    height: 40px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-2);
    font-weight: 600;
    border-radius: 8px;
    padding: 0 16px;
    font-size: 13px;
    cursor: pointer;
  }
  .input-form button:not(:disabled):active {
    box-shadow: 0 0 0 1px var(--signal) inset;
    color: var(--signal);
  }
  .input-form button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  /* header icon buttons (bulb / martini / gear): quiet by default, and the
     ON state speaks in --signal like every other active toggle in the app */
  .icon-btn {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    padding: 4px 5px;
    display: inline-flex;
    align-items: center;
  }
  .icon-btn svg {
    display: block;
  }
  .icon-btn.on {
    color: var(--signal);
    filter: drop-shadow(0 0 4px var(--signal-glow));
  }
  /* visible chain-of-thought: folded by default, quiet, clearly not the reply */
  .cot {
    margin-bottom: 6px;
  }
  .cot summary {
    font-size: 11px;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    cursor: pointer;
    user-select: none;
  }
  .cot-body {
    margin-top: 4px;
    padding: 6px 10px;
    border-left: 2px solid var(--signal);
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-dim);
    white-space: pre-wrap;
    overflow-wrap: break-word;
  }
  .settings-drawer {
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .settings-drawer h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }
  .settings-drawer .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .settings-drawer label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
  }
  .settings-drawer input, .settings-drawer select {
    background: var(--surface);
    border: 1px solid var(--border-2);
    border-radius: 8px;
    color: var(--text);
    padding: 8px 12px;
    font-size: 13px;
    outline: none;
  }
  .settings-drawer input:focus, .settings-drawer select:focus {
    border-color: var(--text-faint);
  }
  .settings-drawer .tip {
    font-size: 10px;
    color: var(--text-faint);
  }
  .save-settings-btn {
    align-self: flex-end;
    background: var(--text);
    color: var(--app-bg);
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
