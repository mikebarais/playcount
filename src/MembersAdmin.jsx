import { useEffect, useState } from 'react';
import {
  createMember,
  deleteMember,
  listMembers,
  regenerateMemberLink,
  updateMember,
} from './adminApi';
import ConfirmDialog from './ConfirmDialog';
import { getPersonalPagePath } from './supabaseClient';

function emptyDraft() {
  return { name: '', googleEmail: '', isPlayer: true, isAdmin: false };
}

function roleNames(member) {
  const isPlayer = member.isPlayer ?? member.is_player;
  const isAdmin = member.isAdmin ?? member.is_admin;
  return [isPlayer && 'Player', isAdmin && 'Admin'].filter(Boolean).join(', ');
}

function personalUrl(personalLink) {
  return new URL(getPersonalPagePath(personalLink), window.location.origin).toString();
}

export default function MembersAdmin({ client, currentMemberId }) {
  const [members, setMembers] = useState([]);
  const [mode, setMode] = useState('list');
  const [draft, setDraft] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [createdLink, setCreatedLink] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refreshMembers() {
    const rows = await listMembers(client);
    setMembers(rows || []);
  }

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const rows = await listMembers(client);
        if (active) setMembers(rows || []);
      } catch (loadError) {
        if (active) setError(loadError.message || 'Unable to load members.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [client]);

  function beginCreate() {
    setError('');
    setMessage('');
    setCreatedLink(null);
    setDraft(emptyDraft());
    setMode('form');
  }

  function beginEdit(member) {
    setError('');
    setMessage('');
    setCreatedLink(null);
    setDraft({
      id: member.member_id,
      name: member.name,
      googleEmail: member.google_email || '',
      isPlayer: member.is_player,
      isAdmin: member.is_admin,
      original: member,
    });
    setMode('form');
  }

  function stageSave(event) {
    event.preventDefault();
    setError('');

    if (!draft.name.trim()) {
      setError('Enter a member name.');
      return;
    }
    if (!draft.isPlayer && !draft.isAdmin) {
      setError('Select at least one role.');
      return;
    }
    if (draft.id === currentMemberId && !draft.isAdmin) {
      setError('You cannot remove your own administrator role.');
      return;
    }

    runAction({
      kind: 'save',
      member: { ...draft, name: draft.name.trim(), googleEmail: draft.googleEmail.trim() },
      isNew: !draft.id,
    });
  }

  function beginAction(kind, member) {
    setError('');
    setMessage('');
    setCreatedLink(null);
    if (kind === 'delete') {
      setDeleting(member);
    } else {
      runAction({ kind, member });
    }
  }

  async function copyLink(link, memberName) {
    try {
      await navigator.clipboard.writeText(personalUrl(link));
      setMessage(`Personal link copied for ${memberName}.`);
      setError('');
    } catch (copyError) {
      setError(copyError.message || 'Unable to copy the personal link.');
    }
  }

  // Only member deletion goes through the confirmation dialog first.
  async function runAction(action) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (action.kind === 'save') {
        if (action.isNew) {
          const created = await createMember(client, action.member);
          setCreatedLink(created.personal_link);
          setMessage('Member created. Share this personal link securely.');
        } else {
          await updateMember(client, action.member);
          setMessage('Member changes saved.');
        }
        setDraft(null);
        setMode('list');
      } else if (action.kind === 'regenerate') {
        const newLink = await regenerateMemberLink(client, action.member.member_id);
        setCreatedLink(newLink);
        setMessage(`Personal link regenerated for ${action.member.name}. The old link cannot start another session; tokens already issued can remain valid for up to one hour.`);
      } else if (action.kind === 'delete') {
        await deleteMember(client, action.member.member_id);
        setMessage(`${action.member.name} deleted. Their attendance history was also deleted.`);
        setDeleting(null);
      }
      try {
        await refreshMembers();
      } catch (refreshError) {
        setError(refreshError.message || 'The change was saved, but the member list could not be refreshed.');
      }
    } catch (saveError) {
      setError(saveError.message || 'The requested change could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  function cancelDelete() {
    setDeleting(null);
    setError('');
  }

  return (
    <div className="admin-section">
      {error && !deleting && <p className="admin-alert" role="alert">{error}</p>}
      {message && <p className="admin-notice" role="status">{message}</p>}
      {createdLink && (
        <div className="admin-link-result">
          <p>{personalUrl(createdLink)}</p>
          <button type="button" onClick={() => copyLink(createdLink, 'the member')}>
            Copy personal link
          </button>
        </div>
      )}

      {mode !== 'form' && (
        <>
          <div className="admin-list-toolbar">
            <p>{members.length} {members.length === 1 ? 'member' : 'members'}</p>
            <button className="admin-primary-button" type="button" onClick={beginCreate}>
              Create member
            </button>
          </div>
          {loading ? (
            <p role="status">Loading members</p>
          ) : members.length === 0 ? (
            <p>No members found.</p>
          ) : (
            <ul className="admin-member-list">
              {members.map((memberRow) => {
                const isCurrent = memberRow.member_id === currentMemberId;
                return (
                  <li className="admin-member" key={memberRow.member_id}>
                    <div className="admin-member-info">
                      <h3>{memberRow.name}{isCurrent && <span className="admin-you">You</span>}</h3>
                      <p>{memberRow.google_email || 'No Google email'}</p>
                      <div className="admin-member-meta">
                        <span>{roleNames(memberRow) || 'No role'}</span>
                      </div>
                    </div>
                    <div className="admin-member-actions">
                      <button type="button" onClick={() => copyLink(memberRow.personal_link, memberRow.name)}>
                        Copy link
                      </button>
                      <button type="button" onClick={() => beginEdit(memberRow)}>Edit</button>
                      <button
                        type="button"
                        disabled={isCurrent || busy}
                        title={isCurrent ? 'Regenerate your link from another administrator account.' : undefined}
                        onClick={() => beginAction('regenerate', memberRow)}
                      >
                        Regenerate link
                      </button>
                      <button
                        type="button"
                        className="admin-danger-button"
                        disabled={isCurrent}
                        title={isCurrent ? 'You cannot delete your own account.' : undefined}
                        onClick={() => beginAction('delete', memberRow)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {mode === 'form' && draft && (
        <form className="admin-form" onSubmit={stageSave}>
          <h3>{draft.id ? 'Edit member' : 'New member'}</h3>
          <label>
            Name
            <input
              autoFocus
              maxLength={120}
              required
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label>
            Google email
            <input
              type="email"
              maxLength={254}
              value={draft.googleEmail}
              onChange={(event) => setDraft({ ...draft, googleEmail: event.target.value })}
            />
          </label>
          <fieldset>
            <legend>Roles</legend>
            <label className="admin-role-option">
              <input
                type="checkbox"
                checked={draft.isPlayer}
                onChange={(event) => setDraft({ ...draft, isPlayer: event.target.checked })}
              />
              Player
            </label>
            <label className="admin-role-option">
              <input
                type="checkbox"
                checked={draft.isAdmin}
                disabled={draft.id === currentMemberId}
                onChange={(event) => setDraft({ ...draft, isAdmin: event.target.checked })}
              />
              Administrator
            </label>
          </fieldset>
          <div className="admin-form-actions">
            <button className="admin-secondary-button" type="button" onClick={() => setMode('list')}>
              Cancel
            </button>
            <button className="admin-primary-button" type="submit" disabled={busy}>Save</button>
          </div>
        </form>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete member"
          confirmLabel="Delete member"
          busy={busy}
          error={error}
          onCancel={cancelDelete}
          onConfirm={() => runAction({ kind: 'delete', member: deleting })}
        >
          <p>Permanently delete <strong>{deleting.name}</strong>? Their attendance responses will also be deleted. This cannot be undone. Their Google account, if any, is not deleted.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
