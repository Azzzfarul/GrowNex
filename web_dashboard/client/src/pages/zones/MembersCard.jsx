import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Icon from '../../components/ui/Icon'
import TextField from '../../components/ui/TextField'
import Dialog from '../../components/ui/Dialog'
import { addZoneMember, removeZoneMember } from '../../lib/zoneMembers'

// Who can use this zone. The owner adds people by email and removes them; a member can leave.
// Mobile: _MembersCard in screens/plants/zone_detail/overview_tab.dart.
export default function MembersCard({ zone }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(null)  // 'add' | uid being removed
  const [error, setError] = useState(null)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const isOwner = zone.userId === user.uid
  const ids = zone.memberIds?.length ? zone.memberIds : [zone.userId]  // zones from before sharing
  const emailOf = (uid) => zone.members?.[uid] || (uid === user.uid ? user.email : 'Unknown user')

  async function add() {
    if (!email.trim()) return
    setBusy('add')
    setError(null)
    const { error } = await addZoneMember(user, zone.id, email.trim())
    if (error) setError(error)
    else setEmail('')
    setBusy(null)
  }

  async function remove(uid) {
    setBusy(uid)
    setError(null)
    const { error } = await removeZoneMember(user, zone.id, uid)
    setBusy(null)
    if (error) { setError(error); setConfirmLeave(false); return }
    if (uid === user.uid) navigate('/plants')  // left the zone
  }

  return (
    <section className="card p-5">
      {confirmLeave && (
        <Dialog
          icon="logout"
          title="Leave zone?"
          onClose={() => setConfirmLeave(false)}
          busy={busy === user.uid}
          actions={<>
            <button onClick={() => setConfirmLeave(false)} className="btn-text">Cancel</button>
            <button onClick={() => remove(user.uid)} className="btn-error">{busy === user.uid ? 'Leaving…' : 'Leave'}</button>
          </>}
        >
          You'll lose access to <span className="font-medium text-on-surface">“{zone.zoneName}”</span> until the owner adds you again.
        </Dialog>
      )}

      <h3 className="card-title mb-1">Members</h3>
      <p className="text-body-sm text-on-surface-variant mb-4">
        {isOwner
          ? 'People you add can see this zone, edit its plants and automation, and switch its pumps and light.'
          : 'Shared with you by the owner.'}
      </p>
      {error && <p className="banner banner-error mb-3"><Icon name="error" />{error}</p>}

      <ul className="space-y-3">
        {ids.map((uid) => (
          <li key={uid} className="flex items-center gap-3">
            <span className="list-icon"><Icon name={uid === zone.userId ? 'shield_person' : 'person'} /></span>
            <div className="flex-1 min-w-0">
              <p className="text-body-lg text-on-surface truncate">{emailOf(uid)}</p>
              <p className="text-body-sm text-on-surface-variant">
                {uid === zone.userId ? 'Owner' : 'Member'}{uid === user.uid ? ' · You' : ''}
              </p>
            </div>
            {isOwner && uid !== zone.userId && (
              <button onClick={() => remove(uid)} disabled={busy !== null} className="btn-text btn-sm text-error">
                <Icon name="person_remove" />{busy === uid ? 'Removing…' : 'Remove'}
              </button>
            )}
            {!isOwner && uid === user.uid && (
              <button onClick={() => setConfirmLeave(true)} disabled={busy !== null} className="btn-text btn-sm text-error">
                <Icon name="logout" />Leave
              </button>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <div className="flex items-start gap-2 mt-4">
          <TextField label="Add by email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()} className="flex-1 min-w-0" />
          <button onClick={add} disabled={!email.trim() || busy !== null} className="btn-tonal h-12">
            {busy === 'add' ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}
    </section>
  )
}
