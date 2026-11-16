// Zone sharing goes through the server (server/src/routes/zones.js): finding a user by email
// needs the Admin SDK, and the security rules don't let the apps change zones.memberIds.
// Both resolve {} on success or { error } with a message to show.

const API = import.meta.env.VITE_API_URL || ''

async function call(user, path, init) {
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    })
    if (res.ok) return {}
    return { error: (await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})` }
  } catch {
    return { error: "Couldn't reach the server. Check that it's running." }
  }
}

export const addZoneMember = (user, zoneId, email) =>
  call(user, `/api/zones/${zoneId}/members`, { method: 'POST', body: JSON.stringify({ email }) })

// The owner removing a member, or a member removing themselves (leaving)
export const removeZoneMember = (user, zoneId, uid) =>
  call(user, `/api/zones/${zoneId}/members/${uid}`, { method: 'DELETE' })
