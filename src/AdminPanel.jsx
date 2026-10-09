import { useEffect, useState } from 'react';
import {
  createMember,
  deleteMember,
  listMembers,
  regenerateMemberLink,
  updateMember,
} from './adminApi';
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

function getSaveSummary(pending) {
  const fields = [
    ['Name', pending.member.name, pending.original?.name],
    ['Google email', pending.member.googleEmail || 'None', pending.original?.google_email || 'None'],
    ['Roles', roleNames(pending.member), pending.original ? roleNames(pending.original) : null],
  ];

  return fields
    .filter(([, value, previous]) => previous === null || value !== previous)
    .map(([label, value, previous]) => ({ label, value, previous }));
}

export default function AdminPanel({ client, currentMemberId }) {
  const [members, setMembers] = useState([]);
  const [mode, setMode] = useState('list');
  const [draft, setDraft] = useState(null);
  const [pending, setPending] = useState(null);
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
    setPending(null);
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
    setPending(null);
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

    setPending({
      kind: 'save',
      member: { ...draft, name: draft.name.trim(), googleEmail: draft.googleEmail.trim() },
      original: draft.original || null,
    });
    setMode('confirm');
  }

  function stageAction(kind, member) {
    setError('');
    setMessage('');
    setCreatedLink(null);
    setDraft(null);
    setPending({ kind, member, isActive });
    setMode('confirm');
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

  async function confirmPending() {
    if (!pending) return;

    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (pending.kind === 'save') {
        if (pending.original) {
          await updateMember(client, pending.member);
          setMessage('Member changes saved.');
        } else {
          const created = await createMember(client, pending.member);
          setCreatedLink(created.personal_link);
          setMessage('Member created. Share this personal link securely.');
        }
        setPending(null);
        setDraft(null);
        setMode('list');
        try {
          await refreshMembers();
        } catch (refreshError) {
          setError(refreshError.message || 'The change was saved, but the member list could not be refreshed.');
        }
      } else if (pending.kind === 'regenerate') {
        const newLink = await regenerateMemberLink(client, pending.member.member_id);
        setMembers((current) => current.map((member) => (
          member.member_id === pending.member.member_id
            ? { ...member, personal_link: newLink }
            : member
        )));
        setCreatedLink(newLink);
        setMessage(`Personal link regenerated for ${pending.member.name}. The old link cannot start another session; tokens already issued can remain valid for up to one hour.`);
        setPending(null);
        setMode('list');
      } else if (pending.kind === 'delete') {
        await deleteMember(client, pending.member.member_id);
        setMessage(`${pending.member.name} deleted. Their attendance history was also deleted.`);
        setPending(null);
        setMode('list');
        try {
          await refreshMembers();
        } catch (refreshError) {
          setError(refreshError.message || 'The change was saved, but the member list could not be refreshed.');
        }
      }
    } catch (saveError) {
      setError(saveError.message || 'The requested change could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  function cancelDialog() {
    setPending(null);
    setError('');
    setMode(draft ? 'form' : 'list');
  }

  const saveSummary = pending?.kind === 'save' ? getSaveSummary(pending) : [];
  const isSave = pending?.kind === 'save';
  const confirmationTitle = isSave
    ? pending.original ? 'Confirm member changes' : 'Confirm new member'
    : pending?.kind === 'regenerate' ? 'Regenerate personal link' : 'Delete member';

  return (
    <section className="admin-panel" aria-labelledby="admin-title">
      <header className="admin-heading">
        <div>
          <p className="admin-eyebrow">Administration</p>
          <h2 id="admin-title">Members</h2>
        </div>
      </header>

      {error && <p className="admin-alert" role="alert">{error}</p>}
      {message && <p className="admin-notice" role="status">{message}</p>}
      {createdLink && (
        <div className="admin-link-result">
          <p>{personalUrl(createdLink)}</p>
          <button type="button" onClick={() => copyLink(createdLink, 'the member')}>
            Copy personal link
          </button>
        </div>
      )}

      {mode === 'list' && (
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
                        <span>{roleNames({ isPlayer: memberRow.is_player, isAdmin: memberRow.is_admin }) || 'No role'}</span>
                      </div>
                    </div>
                    <div className="admin-member-actions">
                      <button
                        type="button"
                        onClick={() => copyLink(memberRow.personal_link, memberRow.name)}
                      >
                        Copy link
                      </button>
                      <button type="button" onClick={() => beginEdit(memberRow)}>Edit</button>
                      <button
                        type="button"
                        disabled={isCurrent}
                        title={isCurrent ? 'Regenerate your link from another administrator account.' : undefined}
                        onClick={() => stageAction('regenerate', memberRow)}
                      >
                        Regenerate link
                      </button>
                      <button
                        type="button"
                        className="admin-danger-button"
                        disabled={isCurrent}
                        title={isCurrent ? 'You cannot delete your own account.' : undefined}
                        onClick={() => stageAction('delete', memberRow)}
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
            <button className="admin-primary-button" type="submit">Review changes</button>
          </div>
        </form>
      )}

      {mode === 'confirm' && pending && (
        <div className="admin-dialog-backdrop">
          <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h3 id="confirm-title">{confirmationTitle}</h3>
            {isSave && (
              <dl className="admin-change-summary">
                {saveSummary.map(({ label, value, previous }) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{previous === null ? value : <>{previous} <span aria-hidden="true">→</span> {value}</>}</dd>
                  </div>
                ))}
                {saveSummary.length === 0 && <p>No member details have changed.</p>}
              </dl>
            )}
            {pending.kind === 'regenerate' && (
              <p>The old link will no longer start a session. Tokens already issued can remain valid for up to one hour. A new UUID link will be generated for <strong>{pending.member.name}</strong>.</p>
            )}
            {pending.kind === 'delete' && (
              <p>
                Permanently delete <strong>{pending.member.name}</strong>? Their attendance responses will also be deleted. This cannot be undone. Their Google account, if any, is not deleted.
              </p>
            )}
            {error && <p className="admin-alert" role="alert">{error}</p>}
            <div className="admin-form-actions">
              <button className="admin-secondary-button" type="button" disabled={busy} onClick={cancelDialog}>
                Cancel
              </button>
              <button className="admin-primary-button" type="button" disabled={busy} onClick={confirmPending}>
                {busy ? 'Saving…' : isSave ? 'Confirm and save' : pending.kind === 'regenerate' ? 'Confirm regeneration' : 'Confirm deletion'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
