// supabase/functions/translate-search/index.ts
// Translates a fuzzy natural language search string into structured query tags (vibeId, keyword).
// Search is then executed locally on the client over localStorage, preserving privacy.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Vibe {
  id: string;
  emotion: string;
}

interface RequestPayload {
  query: string;
  vibes: Vibe[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { query, vibes } = (await req.json()) as RequestPayload;

    if (!query) {
      return json({ error: 'query is required' }, 400);
    }

    const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterApiKey) {
      return json({ error: 'OPENROUTER_API_KEY environment variable is not set on the server' }, 500);
    }

    const modelName = Deno.env.get('OPENROUTER_MODEL') || 'google/gemma-2-27b-it';

    const systemPrompt = `You are a helper for the "Radial Day Planner". The user has autism, ADHD, and emotion-colour synesthesia.
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

    const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Search Query: "${query}"` }
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!openRouterRes.ok) {
      const errText = await openRouterRes.text();
      return json({ error: `OpenRouter API error: ${openRouterRes.status} ${errText}` }, 502);
    }

    const result = await openRouterRes.json();
    const completionText = result.choices?.[0]?.message?.content?.trim() ?? '';

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(completionText);
    } catch {
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
