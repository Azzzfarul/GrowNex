// Plant species identification from a photo, via Pl@ntNet (https://my.plantnet.org, free tier:
// 500 identifications/day). Used by POST /api/ai/identify-plant; the key stays on the server.

const PLANTNET_URL = 'https://my-api.plantnet.org/v2/identify/all'

const MIN_SCORE = 0.05  // Pl@ntNet pads its list with ~0% guesses; not worth showing

// Pl@ntNet's answer is outside data: keep only what the apps show, typed and capped.
export function parsePlantNetResults(json, max = 3) {
  const results = Array.isArray(json?.results) ? json.results : []
  return results.slice(0, max).map(r => {
    const sp = r?.species ?? {}
    const species = typeof sp.scientificNameWithoutAuthor === 'string' ? sp.scientificNameWithoutAuthor.trim().slice(0, 80) : ''
    const common = Array.isArray(sp.commonNames) ? sp.commonNames.find(n => typeof n === 'string' && n.trim()) : null
    const score = typeof r?.score === 'number' && Number.isFinite(r.score) ? Math.min(1, Math.max(0, r.score)) : 0
    return { species, commonName: common ? common.trim().slice(0, 60) : null, score: Math.round(score * 100) / 100 }
  }).filter(r => r.species && r.score >= MIN_SCORE)
}

// The first bytes of a JPEG or PNG (what the apps send, and what Pl@ntNet accepts)
export const isPlantPhoto = (buf) => Buffer.isBuffer(buf) && buf.length > 8 &&
  ((buf[0] === 0xFF && buf[1] === 0xD8) || buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47])))

/**
 * @returns {Promise<Array<{ species, commonName, score }>>} best matches first; [] if nothing matched
 * @throws if Pl@ntNet can't be reached or refuses the request
 */
export async function identifyPlant(key, image, contentType) {
  const form = new FormData()
  form.append('images', new Blob([image], { type: contentType }), 'plant')
  form.append('organs', 'auto')
  const res = await fetch(`${PLANTNET_URL}?api-key=${encodeURIComponent(key)}&nb-results=3&lang=en`, {
    method: 'POST', body: form, signal: AbortSignal.timeout(20000),
  })
  if (res.status === 404) return []  // Pl@ntNet's "Species not found"
  if (!res.ok) throw new Error(`Pl@ntNet ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return parsePlantNetResults(await res.json())
}
