<script lang="ts">
  // Conversational Chat Companion overlay (§9, §13).
  // Maintains a 100-message sliding window history in localStorage.
  // Sends user queries and history to the parse-command Edge Function,
  // then updates the planner state by directly mutating the `days` store.

  import { onMount, createEventDispatcher } from 'svelte';
  import { days, currentKey, todayKey } from './days';
  import { VIBES } from './vibes';
  import { customVibes } from './customVibes';
  import { selectedBlockStore } from './daystate';
  import type { Block } from './blocks';
  import { scratchpadContent, saveScratchpad } from './scratchpad';
  import { BASE_CATEGORIES, resolveVibe } from './categories';
  import { customCategories } from './customCategories';
  import type { Symptom } from './symptoms';
  import { fetchContext, injectMemory } from './vault';
  import { checkPendingNotifications, scheduleNotification } from './notifications';

  const dispatch = createEventDispatcher<{ close: void }>();

  interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    actions?: Array<{
      type: 'add_block' | 'update_block' | 'delete_block' | 'update_scratchpad' | 'update_diary' | 'add_symptom' | 'update_symptom' | 'delete_symptom' | 'show_notification' | 'schedule_notification' | 'web_search';
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

  // Pinecone Vector Memory settings
  let pineconeKey = safeGetItem('radial-planner-pinecone-key');
  let pineconeHost = safeGetItem('radial-planner-pinecone-host');
  let enableVault = safeGetItem('radial-planner-vault-enabled') === 'true';
  let isEmbedding = false;

  // Tavily Search API Settings
  let tavilyKey = safeGetItem('radial-planner-tavily-key');

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

    return () => {
      if (checkInterval) clearInterval(checkInterval);
    };
  });

  function saveChat() {
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
    let currentNotes = '';
    scratchpadContent.subscribe(val => { currentNotes = val; })();
    
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

    const diaryDesc = currentDiary ? currentDiary : 'No diary entry logged for this day yet.';

    let allDays: Record<string, any> = {};
    days.subscribe(d => { allDays = d; })();

    // Compile history of past diary entries (up to 7 days, excluding the current viewed date)
    const pastDiaries = Object.entries(allDays)
      .filter(([date, data]) => date !== viewDate && data.diary && data.diary.trim().length > 0)
      .sort((a, b) => b[0].localeCompare(a[0])) // most recent first
      .slice(0, 7)
      .map(([date, data]) => `- ${date}: "${data.diary.replace(/\n/g, ' ')}"`)
      .join('\n');

    let systemPrompt = `You are a supportive, warm, and clear AI companion for the "Radial Day Planner" app.
The user has ADHD, autism, time blindness, and emotion-colour synesthesia. 
Your job is to chat with the user, help them structure their day, and output JSON actions to update their radial planner ring.

---
COLLABORATIVE SCRATCH PAD NOTES (The user's thoughts, bug logs, and feature requests. Read this for context. You can modify these notes if the user asks you to):
${currentNotes || 'No notes written yet.'}

---
CORE RULES:
1. SPATIAL & VISUAL OVER NUMERIC: The user views their day on concentric lanes (Main, Washer, Dryer, Emotion, Symptom).
2. COLOUR & VIBES: Each task is mapped to a "vibe_id" (a hex code without the '#') which represents an emotional/activity description. ALWAYS try to semantically match the user's task to a vibe in the provided list.
3. THE TAPER GRAMMAR:
   - "Soft/tapered block" = User's estimate. By default, regular blocks are soft. They have coreEndHours and taperEndHours. (Taper length defaults to ~30-40% of core duration, capped at 6h).
   - "Hard-edged block" = Deadline or externally fixed appointment. Taper length is 0 (taperEndHours === coreEndHours).
4. APPOINTMENTS & TRAVEL WINGS: Appointments (meetings, appointments, classes, fixed external times) are always hard-edged. They feature "travel wings" in a travel vibe: travelBeforeHours (departure wing) and travelAfterHours (get home wing) in decimal hours. (Default travel wings are 0.5h/30m each if not specified).
5. TIMES: Represented as decimal hours from midnight (e.g. 14.5 = 2:30 PM, 9.75 = 9:45 AM). If the end time is less than the start time, it means it crosses midnight (e.g. 23.5 to 0.5 is 11:30 PM to 12:30 AM).

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
CURRENT DIARY ENTRY FOR ${viewDate} (Use this to read their daily diary reflections. You can write/edit thoughts, logs, or reflections for this day if they ask you to):
${diaryDesc}

---
HISTORICAL DIARY REFLECTIONS (Last 7 days. Use this to spot patterns or check past entries):
${pastDiaries || 'No past reflections logged yet.'}

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
    {
      "type": "update_scratchpad",
      "content": "new scratchpad content (entire markdown text)"
    },
    {
      "type": "update_diary",
      "targetDate": "YYYY-MM-DD",
      "content": "new diary entry markdown content"
    },
    // I. Fire a push notification to the user immediately:
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

      const allVibes = [...VIBES, ...$customVibes].map(v => ({ id: v.id, emotion: v.emotion }));

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

      // 1. Fetch vector context from vault using a general summary query
      let vaultContext = '';
      if (enableVault && pineconeKey && pineconeHost) {
        try {
          vaultContext = await fetchContext("today summary energy allergy sleep mood", pineconeKey, pineconeHost, 3);
        } catch {}
      }

      let systemPrompt = getSystemPrompt(viewDate, realDate, currentTimeStr, allVibes, activeBlocks, activeSymptoms, activeDiary);
      if (vaultContext) {
        systemPrompt += `\n\n--- RELEVANT RETRIEVED HISTORICAL DIARY/PLANNER MEMORY ---\n${vaultContext}`;
      }

      // Append Heartbeat-specific instruction overrides
      systemPrompt += `\n\n=== SYSTEM HEARTBEAT MODE ===
You are executing in a silent background heartbeat check. Read and analyze the user's current day state, symptom logs, and diary entries.
- If you spot a trend or pattern (e.g. they logged high symptom severity earlier and might need a check-in, or they have a busy schedule and need custom breaks, or they have laundry blocks that finished cycles), you can speak up or send a custom notification.
- To notify them immediately, add a "show_notification" action to the actions list.
- To schedule an alert for later, add a "schedule_notification" action.
- If everything is on track and there is no urgent warning or suggestion to give, you MUST respond exactly with:
{ "message": "everything_good", "actions": [] }
Do NOT speak or warn unless it is highly useful. Let them plan in peace.`;

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
        parsed = JSON.parse(completionText);
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
        const assistantMsg: ChatMessage = {
          id: 'msg_' + Math.random().toString(36).slice(2) + Date.now(),
          role: 'assistant',
          content: parsed.message || "I've checked your planner and have an update.",
          timestamp: new Date().toISOString(),
          actions: parsed.actions || []
        };
        messages = [...messages, assistantMsg];
        saveChat();

        if (parsed.actions && parsed.actions.length > 0) {
          executeActions(parsed.actions);
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
      let parsed;
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

      const assistantMsg: ChatMessage = {
        id: 'msg_' + Math.random().toString(36).slice(2) + Date.now(),
        role: 'assistant',
        content: parsed.message || "Here are the search results.",
        timestamp: new Date().toISOString(),
        actions: parsed.actions || []
      };

      messages = [...messages, assistantMsg];
      saveChat();

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

      // Slice messages to last 100 for API payload pruning
      const payloadMessages = messages.slice(-100).map(m => ({
        role: m.role,
        content: m.content
      }));

      // If we have an image, format the current prompt using OpenRouter's multimodal format
      const activeImage = selectedImageBase64;
      if (activeImage && payloadMessages.length > 0) {
        const lastMsg = payloadMessages[payloadMessages.length - 1];
        if (lastMsg.role === 'user') {
          // Change content from string to multimodal array
          (lastMsg as any).content = [
            { type: 'text', text: lastMsg.content },
            { type: 'image_url', image_url: { url: activeImage } }
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

      if (!SUPABASE_URL || openRouterKey) {
        if (!openRouterKey) {
          throw new Error('OpenRouter API key is not configured. Please tap the Settings "⚙" icon above to enter it.');
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
          }),
        });

        if (!openRouterRes.ok) {
          const errText = await openRouterRes.text();
          throw new Error(`OpenRouter API error: ${openRouterRes.status} ${errText}`);
        }

        const result = await openRouterRes.json();
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
      const assistantMsg: ChatMessage = {
        id: 'msg_' + Math.random().toString(36).slice(2) + Date.now(),
        role: 'assistant',
        content: parsed.message || "I've processed your request.",
        timestamp: new Date().toISOString(),
        actions: parsed.actions || []
      };

      debugActions = JSON.stringify(parsed, null, 2);
      try {
        localStorage.setItem('radial-planner-chat-debug-v1', debugActions);
      } catch (e) {
        console.warn('localStorage write failed:', e);
      }

      messages = [...messages, assistantMsg];
      saveChat();

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
            travelBeforeHours: b.travelBeforeHours !== undefined ? parseLLMTime(b.travelBeforeHours) : undefined,
            travelAfterHours: b.travelAfterHours !== undefined ? parseLLMTime(b.travelAfterHours) : undefined
          };
          blocks.push(newBlock);
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
            if (act.block.kind !== undefined) updatedProps.kind = act.block.kind;
            if (act.block.travelBeforeHours !== undefined) updatedProps.travelBeforeHours = parseLLMTime(act.block.travelBeforeHours);
            if (act.block.travelAfterHours !== undefined) updatedProps.travelAfterHours = parseLLMTime(act.block.travelAfterHours);

            const newStart = updatedProps.startHours !== undefined ? updatedProps.startHours : existing.startHours;
            let newCoreEnd = updatedProps.coreEndHours !== undefined ? updatedProps.coreEndHours : existing.coreEndHours;
            if (newCoreEnd <= newStart) {
              newCoreEnd += 24;
            }
            const newTaperEnd = updatedProps.taperEndHours !== undefined ? updatedProps.taperEndHours : 
              (updatedProps.coreEndHours !== undefined ? newCoreEnd + (existing.taperEndHours - existing.coreEndHours) : existing.taperEndHours);

            blocks[matchedIdx] = {
              ...existing,
              ...updatedProps,
              coreEndHours: newCoreEnd,
              taperEndHours: newTaperEnd
            };
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
          const newContent = act.content.trim();
          const currentDiaryTrimmed = diary.trim();
          if (!currentDiaryTrimmed) {
            diary = newContent;
          } else if (!currentDiaryTrimmed.includes(newContent)) {
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            diary = `${currentDiaryTrimmed}\n\n---\n*Companion Reflection (${timeStr}):*\n${newContent}`;
          }
        }

        else if (act.type === 'show_notification' && act.title !== undefined) {
          if ('serviceWorker' in navigator && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            navigator.serviceWorker.ready.then(reg => {
              const payload = {
                title: act.title,
                body: act.body || '',
                tag: 'companion-alert-' + Date.now(),
                kind: 'companion-alert',
                url: '/'
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
    if (act.type === 'update_scratchpad' || act.type === 'update_diary') {
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

<div class="overlay" role="dialog" aria-label="Companion chat">
  <header>
    <span>Planner Companion</span>
    <div class="head-btns">
      <button class="settings-btn" on:click={() => showSettings = !showSettings} aria-label="Open settings">⚙</button>
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
                  ⚡ {act.type === 'update_scratchpad' ? 'Updated your Scratch Pad notes' : act.type === 'update_diary' ? `Updated the Daily Diary for ${act.targetDate}` : `Click to view: ${act.type === 'add_block' ? `Created "${act.block?.label || 'block'}"` : act.type === 'update_block' ? `Updated "${act.labelToMatch}"` : `Deleted "${act.labelToMatch}"`} on ${act.targetDate}`}
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
      <img src={selectedImageBase64} alt="Upload preview" />
      <span class="img-name">{selectedImageName}</span>
      <button class="clear-img-btn" on:click={clearSelectedImage} aria-label="Remove image">✕</button>
    </div>
  {/if}

  <form class="input-form" on:submit|preventDefault={sendMessage}>
    <input 
      type="file" 
      accept="image/*" 
      bind:this={fileInput} 
      on:change={handleFileChange} 
      style="display: none;" 
    />
    <button type="button" class="upload-btn" on:click={triggerFileSelect} disabled={isLoading} aria-label="Upload image">
      📎
    </button>
    <textarea
      placeholder={selectedImageBase64 ? "Describe this image or press Ctrl+Enter to send..." : "physio at 2pm tomorrow... (Ctrl+Enter to send)"}
      bind:value={draft}
      on:keydown={handleKeyDown}
      disabled={isLoading}
      aria-label="Companion message input"
    ></textarea>
    <button type="submit" disabled={isLoading || (!draft.trim() && !selectedImageBase64)} aria-label="Send">
      Send
    </button>
  </form>
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
    height: 38px;
    max-height: 100px;
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
  .input-form button {
    flex: 0 0 auto;
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
  .settings-btn {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 16px;
    cursor: pointer;
    padding: 4px;
    margin-right: 4px;
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
