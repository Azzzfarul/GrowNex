// Who can use a zone: zones.memberIds holds the owner (zones.userId) plus the users the owner
// added. Zones created before sharing existed have no memberIds: then it's the owner alone.
export function memberIdsOf(zone) {
  const ids = Array.isArray(zone?.memberIds) && zone.memberIds.length ? zone.memberIds : [zone?.userId]
  return [...new Set(ids.filter(id => typeof id === 'string' && id))]
}

export const isMember = (zone, uid) => memberIdsOf(zone).includes(uid)
