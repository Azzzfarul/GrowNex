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

// Runs one chat completion in JSON mode. Returns the parsed object plus what the API says it
// actually ran (model, provider, token usage), which the vision evaluation records.
// images: data URLs, sent after the text. provider: pin one OpenRouter provider, no fallbacks.
// Throws on transport error, empty content, or unparseable JSON.
export async function chatJsonRaw({ system, user, maxTokens = 700, images = [], temperature = 0.3, model = MODEL, provider }) {
  const content = images.length
    ? [{ type: 'text', text: user }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))]
    : user
  const res = await getClient().chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content },
    ],
    ...(provider ? { provider: { order: [provider], allow_fallbacks: false } } : {}),
  })

  const raw = res?.choices?.[0]?.message?.content?.trim()
  if (!raw) throw new Error('AI returned empty content')
  const meta = { model: res.model ?? model, provider: res.provider ?? null, usage: res.usage ?? null }

  try {
    return { data: JSON.parse(raw), ...meta }
  } catch {
    // Some models wrap JSON in prose or a ```json fence — salvage the first object.
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) return { data: JSON.parse(match[0]), ...meta }
    throw new Error('AI returned non-JSON content')
  }
}

export async function chatJson(args) {
  return (await chatJsonRaw(args)).data
}
