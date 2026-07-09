// supabase/functions/parse-command/index.ts
// Receives the conversational history + active date/time + vibes,
// and queries OpenRouter to return a companion message and structured block actions.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Vibe {
  id: string;
  emotion: string;
}

interface RequestPayload {
  messages: ChatMessage[];
  currentDate: string; // YYYY-MM-DD
  currentTime: string; // HH:MM
  vibes: Vibe[];
  systemPromptOverride?: string;
  useProxy?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { messages, currentDate, currentTime, vibes, systemPromptOverride, useProxy } = (await req.json()) as RequestPayload;
    
    if (!messages || !messages.length) {
      return json({ error: 'messages array is required' }, 400);
    }

    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterApiKey) {
      return json({ error: 'OPENROUTER_API_KEY environment variable is not set on the server' }, 500);
    }

    const modelName = Deno.env.get('OPENROUTER_MODEL') || 'google/gemma-2-27b-it';

    const systemPrompt = systemPromptOverride || `You are a supportive, warm, and clear AI companion for the "Radial Day Planner" app.
The user has ADHD, autism, time blindness, and emotion-colour synesthesia. 
Your job is to chat with the user, help them structure their day, and output JSON actions to update their radial planner ring.

---
CORE RULES:
1. SPATIAL & VISUAL OVER NUMERIC: The user views their day on concentric lanes (Main, Washer, Dryer, Emotion).
2. COLOUR & VIBES: Each task is mapped to a "vibe_id" (a hex code without the '#') which represents an emotional/activity description. ALWAYS try to semantically match the user's task to a vibe in the provided list.
3. THE TAPER GRAMMAR:
   - "Soft/tapered block" = User's estimate. By default, regular blocks are soft. They have coreEndHours and taperEndHours. (Taper length defaults to ~30-40% of core duration, capped at 6h).
   - "Hard-edged block" = Deadline or externally fixed appointment. Taper length is 0 (taperEndHours === coreEndHours).
4. APPOINTMENTS & TRAVEL WINGS: Appointments (meetings, appointments, classes, fixed external times) are always hard-edged. They feature "travel wings" in a travel vibe: travelBeforeHours (departure wing) and travelAfterHours (get home wing) in decimal hours. (Default travel wings are 0.5h/30m each if not specified).
5. TIMES: Represented as decimal hours from midnight (e.g. 14.5 = 2:30 PM, 9.75 = 9:45 AM). If the end time is less than the start time, it means it crosses midnight (e.g. 23.5 to 0.5 is 11:30 PM to 12:30 AM).

---
PLANNER SPECS:
- Lanes: "main" (default tasks), "washer" (appliance cycle), "dryer" (appliance cycle), "emotion" (innermost emotional tracking lane).
- Date: Use YYYY-MM-DD. Resolve relative terms (e.g. "tomorrow", "next Tuesday", "in 3 days") relative to the user's current date: ${currentDate}.
- Time: Resolve relative time terms (e.g. "starting now", "in an hour") relative to the user's current time: ${currentTime}.

---
VIBES DICTIONARY (semantically match tasks to a vibe id if possible, else use null):
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
        "laneId": "main" | "washer" | "dryer" | "emotion",
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
    // B. Update an existing block (matches by fuzzy label on the target date):
    {
      "type": "update_block",
      "targetDate": "YYYY-MM-DD",
      "labelToMatch": "label string to search and replace",
      "block": { // only include properties that are changing
        "laneId": "main" | "washer" | "dryer" | "emotion" (optional),
        "startHours": number (optional),
        "coreEndHours": number (optional),
        "taperEndHours": number (optional),
        "vibeId": "vibe_id_string_or_null" (optional),
        "label": "new label" (optional),
        "kind": "appointment" (optional),
        "travelBeforeHours": number (optional),
        "travelAfterHours": number (optional)
      }
    },
    // C. Delete a block:
    {
      "type": "delete_block",
      "targetDate": "YYYY-MM-DD",
      "labelToMatch": "label string to search and remove"
    }
  ]
}
`;

    // Package messages for OpenRouter / Gemini
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let completionText = '';
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    // 1. PRIMARY ROUTE: The Proxy / Free Tier (if enabled)
    if (useProxy && geminiApiKey) {
      try {
        console.log('[Routing] Attempting AI Studio (Gemini) proxy endpoint...');
        const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${geminiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gemini-1.5-pro',
            messages: apiMessages,
            response_format: { type: 'json_object' }
          }),
        });

        if (geminiRes.ok) {
          const result = await geminiRes.json();
          completionText = result.choices?.[0]?.message?.content?.trim() ?? '';
          console.log('[Routing] AI Studio proxy successful.');
        } else {
          const errText = await geminiRes.text();
          console.warn(`[Routing] AI Studio proxy failed (${geminiRes.status}): ${errText}. Falling back...`);
        }
      } catch (err) {
        console.warn(`[Routing] AI Studio proxy threw an exception: ${err}. Falling back...`);
      }
    }

    // 2. FALLBACK ROUTE: The Official OpenRouter Endpoint
    if (!completionText) {
      console.log('[Routing] Sending request to OpenRouter API (Fallback/Primary)...');
      const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          messages: apiMessages,
          response_format: { type: 'json_object' },
        }),
      });

      if (!openRouterRes.ok) {
        const errText = await openRouterRes.text();
        return json({ error: `OpenRouter API error: ${openRouterRes.status} ${errText}` }, 502);
      }

      const result = await openRouterRes.json();
      completionText = result.choices?.[0]?.message?.content?.trim() ?? '';
    }
    
    // Attempt to parse completion text as JSON
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(completionText);
    } catch {
      // Robust regex fallback to extract JSON if model returned markdown wrappers
      const jsonMatch = /\{[\s\S]*\}/.exec(completionText);
      if (jsonMatch) {
        try {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } catch {
          return json({ error: 'Failed to parse JSON response from LLM model: ' + completionText }, 500);
        }
      } else {
        return json({ error: 'LLM did not return a valid JSON structure: ' + completionText }, 500);
      }
    }

    return json(parsedResponse);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}
