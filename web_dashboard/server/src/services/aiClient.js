// Thin wrapper around OpenRouter (OpenAI-compatible chat-completions API).
// The model is chosen at runtime via OPENROUTER_MODEL so a free model and a paid
// one are a config change, not a code change. Every caller must be prepared for
// chatJson() to throw — the routes fall back to deterministic output on failure.

import OpenAI from 'openai'

const BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'
const MODEL    = process.env.OPENROUTER_MODEL    || 'openai/gpt-4o-mini'

let client = null

export function aiEnabled() {
  return !!process.env.OPENROUTER_API_KEY
}

function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: BASE_URL,
      timeout: 20000,
      maxRetries: 1,
      defaultHeaders: { 'X-Title': 'GrowNex' },
    })
  }
  return client
}

// Runs one chat completion in JSON mode and returns the parsed object.
// Throws on transport error, empty content, or unparseable JSON.
export async function chatJson({ system, user, maxTokens = 700 }) {
  const res = await getClient().chat.completions.create({
    model: MODEL,
    max_tokens: maxTokens,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })

  const raw = res?.choices?.[0]?.message?.content?.trim()
  if (!raw) throw new Error('AI returned empty content')

  try {
    return JSON.parse(raw)
  } catch {
    // Some models wrap JSON in prose or a ```json fence — salvage the first object.
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
    throw new Error('AI returned non-JSON content')
  }
}
