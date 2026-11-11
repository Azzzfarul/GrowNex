import { collection, documentId, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { flattenDailyStats } from './analytics.js'

// A zone's hourly readings since `since` (a Date), oldest first. One read per UTC day touched:
// 8 for 7 days, 2 for the last 24h. Mobile: ZoneService.getStats.
export async function fetchZoneStats(zoneId, since) {
  const fromDay = since.toISOString().slice(0, 10)
  const snap = await getDocs(query(
    collection(db, 'zones', zoneId, 'statsDaily'),
    where(documentId(), '>=', fromDay),
  ))
  return flattenDailyStats(snap.docs.map(d => d.data()), since.getTime())
}
