import { useEffect, useState } from 'react';
import {
  addExceptionalPlayer,
  listSessions,
  removeExceptionalPlayer,
  setSessionCancelled,
  updateSession,
} from './adminApi';
import ConfirmDialog, { ChangeSummary } from './ConfirmDialog';

// Dates arrive as club-local calendar dates, so they are formatted in UTC to avoid shifting the day.
const dateFormat = new Intl.DateTimeFormat('en', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

function formatDate(localDate) {
  return dateFormat.format(new Date(`${localDate}T00:00:00Z`));
}

function shortTime(time) {
  return time?.slice(0, 5) ?? '';
}

function endTime(time, duration) {
  const [hours, minutes] = shortTime(time).split(':').map(Number);
  const match = duration?.match(/^(\d+):(\d{2})/);
  if (!match) return null;
  const total = hours * 60 + minutes + Number(match[1]) * 60 + Number(match[2]);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function minimumLabel(minPlayers, defaultMinPlayers) {
  return minPlayers === null ? `${defaultMinPlayers} (default)` : String(minPlayers);
}

export default function SessionsAdmin({ client }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [guestNames, setGuestNames] = useState({});
  const [pending, setPending] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function refreshSessions() {
    setSessions((await listSessions(client)) || []);
  }

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const rows = await listSessions(client);
        if (active) setSessions(rows || []);
      } catch (loadError) {
        if (active) setError(loadError.message || 'Unable to load sessions.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [client]);

  function resetFeedback() {
    setError('');
    setMessage('');
  }

  function beginEdit(session) {
    resetFeedback();
    setCancelling(null);
    setEditing({
      sessionId: session.session_id,
      time: shortTime(session.local_time),
      location: session.location,
      minPlayers: session.min_players === null ? '' : String(session.min_players),
    });
  }

  function beginCancel(session) {
    resetFeedback();
    setEditing(null);
    setCancelling({ sessionId: session.session_id, reason: '' });
  }

  function stageUpdate(event, session) {
    event.preventDefault();
    resetFeedback();

    const location = editing.location.trim();
    const minPlayers = editing.minPlayers.trim() === '' ? null : Number(editing.minPlayers);

    if (!editing.time) {
      setError('Enter a start time.');
      return;
    }
    if (!location) {
      setError('Enter a location.');
      return;
    }
    if (minPlayers !== null && (!Number.isInteger(minPlayers) || minPlayers < 1)) {
      setError('Minimum players must be a whole number of at least 1, or empty to use the default.');
      return;
    }

    const changes = [
      ['Start time', editing.time, shortTime(session.local_time)],
      ['Location', location, session.location],
      [
        'Minimum players',
        minimumLabel(minPlayers, session.default_min_players),
        minimumLabel(session.min_players, session.default_min_players),
      ],
    ]
      .filter(([, value, previous]) => value !== previous)
      .map(([label, value, previous]) => ({ label, value, previous }));

    setPending({ kind: 'update', session, changes, values: { time: editing.time, location, minPlayers } });
  }

  function stageCancel(event, session) {
    event.preventDefault();
    resetFeedback();
    setPending({ kind: 'cancel', session, reason: cancelling.reason.trim() });
  }

  function stageAddGuest(event, session) {
    event.preventDefault();
    resetFeedback();

    const name = (guestNames[session.session_id] || '').trim();
    if (!name) {
      setError('Enter the exceptional player\'s name.');
      return;
    }

    setPending({ kind: 'addGuest', session, name });
  }

  async function confirmPending() {
    const { kind, session } = pending;

    setBusy(true);
    setError('');
    try {
      if (kind === 'update') {
        await updateSession(client, session.session_id, pending.values);
        setEditing(null);
        setMessage(`Session on ${formatDate(session.local_date)} updated.`);
      } else if (kind === 'cancel') {
        await setSessionCancelled(client, session.session_id, true, pending.reason);
        setCancelling(null);
        setMessage(`Session on ${formatDate(session.local_date)} cancelled.`);
      } else if (kind === 'restore') {
        await setSessionCancelled(client, session.session_id, false);
        setMessage(`Session on ${formatDate(session.local_date)} restored.`);
      } else if (kind === 'addGuest') {
        await addExceptionalPlayer(client, session.session_id, pending.name);
        setGuestNames((current) => ({ ...current, [session.session_id]: '' }));
        setMessage(`${pending.name} added to the session on ${formatDate(session.local_date)}.`);
      } else if (kind === 'removeGuest') {
        await removeExceptionalPlayer(client, pending.guest.id);
        setMessage(`${pending.guest.name} removed from the session on ${formatDate(session.local_date)}.`);
      }
      setPending(null);
      try {
        await refreshSessions();
      } catch (refreshError) {
        setError(refreshError.message || 'The change was saved, but the session list could not be refreshed.');
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
  }

  const dialog = pending && {
    update: { title: 'Confirm session changes', confirmLabel: 'Confirm and save' },
    cancel: { title: 'Cancel session', confirmLabel: 'Confirm cancellation' },
    restore: { title: 'Restore session', confirmLabel: 'Confirm restore' },
    addGuest: { title: 'Add exceptional player', confirmLabel: 'Confirm and add' },
    removeGuest: { title: 'Remove exceptional player', confirmLabel: 'Confirm removal' },
  }[pending.kind];

  return (
    <div className="admin-section">
      {error && !pending && <p className="admin-alert" role="alert">{error}</p>}
      {message && <p className="admin-notice" role="status">{message}</p>}

      {loading ? (
        <p role="status">Loading sessions</p>
      ) : sessions.length === 0 ? (
        <p>No upcoming sessions.</p>
      ) : (
        <ul className="admin-session-list">
          {sessions.map((session) => {
            const cancelled = session.status === 'cancelled';
            const end = endTime(session.local_time, session.duration);
            const isEditing = editing?.sessionId === session.session_id;
            const isCancelling = cancelling?.sessionId === session.session_id;

            return (
              <li
                className={cancelled ? 'admin-session is-cancelled' : 'admin-session'}
                key={session.session_id}
              >
                <div className="admin-session-header">
                  <div className="admin-session-info">
                    <h3>{formatDate(session.local_date)}</h3>
                    <p className="admin-session-time">
                      {shortTime(session.local_time)}{end && `–${end}`}
                    </p>
                    <p>{session.location}</p>
                    <p>Minimum players: {minimumLabel(session.min_players, session.default_min_players)}</p>
                    {cancelled && (
                      <p className="admin-session-status">
                        Cancelled{session.cancellation_reason && `: ${session.cancellation_reason}`}
                      </p>
                    )}
                  </div>
                  <div className="admin-member-actions">
                    <button type="button" onClick={() => beginEdit(session)}>Edit</button>
                    {cancelled ? (
                      <button type="button" onClick={() => setPending({ kind: 'restore', session })}>
                        Restore
                      </button>
                    ) : (
                      <button type="button" className="admin-danger-button" onClick={() => beginCancel(session)}>
                        Cancel session
                      </button>
                    )}
                  </div>
                </div>

                {isEditing && (
                  <form className="admin-inline-form" onSubmit={(event) => stageUpdate(event, session)}>
                    <label>
                      Start time
                      <input
                        type="time"
                        required
                        value={editing.time}
                        onChange={(event) => setEditing({ ...editing, time: event.target.value })}
                      />
                    </label>
                    <label>
                      Location
                      <input
                        maxLength={200}
                        required
                        value={editing.location}
                        onChange={(event) => setEditing({ ...editing, location: event.target.value })}
                      />
                    </label>
                    <label>
                      Minimum players
                      <input
                        type="number"
                        min={1}
                        step={1}
                        placeholder={`${session.default_min_players} (default)`}
                        value={editing.minPlayers}
                        onChange={(event) => setEditing({ ...editing, minPlayers: event.target.value })}
                      />
                    </label>
                    <div className="admin-form-actions">
                      <button className="admin-secondary-button" type="button" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                      <button className="admin-primary-button" type="submit">Review changes</button>
                    </div>
                  </form>
                )}

                {isCancelling && (
                  <form className="admin-inline-form" onSubmit={(event) => stageCancel(event, session)}>
                    <label>
                      Reason (optional)
                      <input
                        maxLength={300}
                        value={cancelling.reason}
                        onChange={(event) => setCancelling({ ...cancelling, reason: event.target.value })}
                      />
                    </label>
                    <div className="admin-form-actions">
                      <button className="admin-secondary-button" type="button" onClick={() => setCancelling(null)}>
                        Keep session
                      </button>
                      <button className="admin-primary-button" type="submit">Review cancellation</button>
                    </div>
                  </form>
                )}

                <div className="admin-guests">
                  <h4>Exceptional players</h4>
                  {session.guests.length === 0 ? (
                    <p>None</p>
                  ) : (
                    <ul className="admin-guest-list">
                      {session.guests.map((guest) => (
                        <li key={guest.id}>
                          <span>{guest.name}</span>
                          <button
                            type="button"
                            className="admin-danger-button"
                            onClick={() => {
                              resetFeedback();
                              setPending({ kind: 'removeGuest', session, guest });
                            }}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form className="admin-guest-form" onSubmit={(event) => stageAddGuest(event, session)}>
                    <input
                      aria-label={`Exceptional player name for ${formatDate(session.local_date)}`}
                      placeholder="Name"
                      maxLength={120}
                      value={guestNames[session.session_id] || ''}
                      onChange={(event) => setGuestNames({ ...guestNames, [session.session_id]: event.target.value })}
                    />
                    <button type="submit">Add</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pending && (
        <ConfirmDialog
          title={dialog.title}
          confirmLabel={dialog.confirmLabel}
          busy={busy}
          error={error}
          onCancel={cancelDialog}
          onConfirm={confirmPending}
        >
          {pending.kind === 'update' && <ChangeSummary changes={pending.changes} />}
          {pending.kind === 'cancel' && (
            <p>
              Cancel the session on <strong>{formatDate(pending.session.local_date)}</strong>?
              {pending.reason ? ` Reason: ${pending.reason}.` : ' No reason given.'} Players will no longer be able to change their attendance for it.
            </p>
          )}
          {pending.kind === 'restore' && (
            <p>Restore the session on <strong>{formatDate(pending.session.local_date)}</strong>? Players will be able to change their attendance again.</p>
          )}
          {pending.kind === 'addGuest' && (
            <p>Add <strong>{pending.name}</strong> to the session on {formatDate(pending.session.local_date)}?</p>
          )}
          {pending.kind === 'removeGuest' && (
            <p>Remove <strong>{pending.guest.name}</strong> from the session on {formatDate(pending.session.local_date)}?</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
