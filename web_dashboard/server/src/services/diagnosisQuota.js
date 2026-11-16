// The daily cap on plant diagnoses (POST /api/ai/plant-diagnosis), one doc per user:
// diagnosisQuota/{uid} = { day: 'YYYY-MM-DD' (UTC), count }. Server-only: no security rule
// matches it, so a client can neither read nor reset it (users/{uid} is the user's to edit).

export const MAX_DIAGNOSES_PER_DAY = 30   // caps what one account can spend on the vision model

// Takes one of today's diagnoses, or returns false when they're used up. A transaction, so
// parallel requests can't all pass the check. Called right before the model call: a call that
// then fails still counts, since it was paid for.
export function reserveDiagnosis(db, uid, { max = MAX_DIAGNOSES_PER_DAY, day = new Date().toISOString().slice(0, 10) } = {}) {
  const ref = db.collection('diagnosisQuota').doc(uid)
  return db.runTransaction(async (tx) => {
    const q = (await tx.get(ref)).data()
    const used = q?.day === day ? q.count : 0
    if (used >= max) return false
    tx.set(ref, { day, count: used + 1 })
    return true
  })
}
