import { useEffect, useState } from 'react';
import {
  addExceptionalPlayer,
  createSession,
  listSessions,
  removeExceptionalPlayer,
  setSessionCancelled,
  updateSession,
} from './adminApi';
import { sessionKind, sessionTypeLabel, sessionTypes } from './sessionTypes';

const halfHourTimes = Array.from({ length: 48 }, (_, index) => (
  `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`
));

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

// Accepts typed times such as "9:37" or "09:37" and returns "09:37", or null when invalid.
function normalizeTime(value) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function TimeInput({ value, onChange }) {
  return (
    <input
      type="time"
      list="half-hour-times"
      required
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function endTime(time, duration) {
  const [hours, minutes] = shortTime(time).split(':').map(Number);
  const match = duration?.match(/^(\d+):(\d{2})/);
  if (!match) return null;
  const total = hours * 60 + minutes + Number(match[1]) * 60 + Number(match[2]);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function minimumLabel(minPlayers, defaultMinPlayers) {
  if (minPlayers !== null) return String(minPlayers);
  return defaultMinPlayers === null ? 'None' : `${defaultMinPlayers} (default)`;
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function emptySessionDraft() {
  return {
    date: todayIso(),
    time: '',
    durationMinutes: '120',
    location: '',
    description: '',
    type: 'training',
  };
}

export default function SessionsAdmin({ client }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);
  const [editing, setEditing] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [guestNames, setGuestNames] = useState({});
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

  function beginCreate() {
    resetFeedback();
    setEditing(null);
    setCancelling(null);
    setCreating(emptySessionDraft());
  }

  function stageCreate(event) {
    event.preventDefault();
    resetFeedback();

    const location = creating.location.trim();
    const description = creating.description.trim();
    const time = normalizeTime(creating.time);
    const durationMinutes = Number(creating.durationMinutes);

    if (!creating.date) {
      setError('Enter a date.');
      return;
    }
    if (!time) {
      setError('Enter the start time as HH:MM, for example 09:30.');
      return;
    }
    if (creating.date < todayIso()) {
      setError('The session date cannot be in the past.');
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
      setError('Duration must be a whole number of minutes between 1 and 1440.');
      return;
    }
    if (!location) {
      setError('Enter a location.');
      return;
    }
    runAction({ kind: 'create', values: { ...creating, time, location, description, durationMinutes, minPlayers: null } });
  }

  function beginEdit(session) {
    resetFeedback();
    setCreating(null);
    setCancelling(null);
    setEditing({
      sessionId: session.session_id,
      time: shortTime(session.local_time),
      location: session.location,
      minPlayers: session.is_exceptional || session.min_players === null ? '' : String(session.min_players),
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
    const time = normalizeTime(editing.time);
    const minPlayers = session.is_exceptional || editing.minPlayers.trim() === '' ? null : Number(editing.minPlayers);

    if (!time) {
      setError('Enter the start time as HH:MM, for example 09:30.');
      return;
    }
    if (!location) {
      setError('Enter a location.');
      return;
    }
    if (minPlayers !== null && (!Number.isInteger(minPlayers) || minPlayers < 1)) {
      setError('Minimum players must be a whole number of at least 1, or empty.');
      return;
    }

    runAction({ kind: 'update', session, values: { time, location, minPlayers } });
  }

  function stageCancel(event, session) {
    event.preventDefault();
    resetFeedback();
    runAction({ kind: 'cancel', session, reason: cancelling.reason.trim() });
  }

  function stageAddGuest(event, session) {
    event.preventDefault();
    resetFeedback();

    const name = (guestNames[session.session_id] || '').trim();
    if (!name) {
      setError('Enter the exceptional player\'s name.');
      return;
    }

    runAction({ kind: 'addGuest', session, name });
  }

  async function runAction(action) {
    const { kind, session } = action;

    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (kind === 'create') {
        await createSession(client, action.values);
        setCreating(null);
        setMessage(`Exceptional session on ${formatDate(action.values.date)} created.`);
      } else if (kind === 'update') {
        await updateSession(client, session.session_id, action.values);
        setEditing(null);
        setMessage(`Session on ${formatDate(session.local_date)} updated.`);
      } else if (kind === 'cancel') {
        await setSessionCancelled(client, session.session_id, true, action.reason);
        setCancelling(null);
        setMessage(`Session on ${formatDate(session.local_date)} cancelled.`);
      } else if (kind === 'restore') {
        await setSessionCancelled(client, session.session_id, false);
        setMessage(`Session on ${formatDate(session.local_date)} restored.`);
      } else if (kind === 'addGuest') {
        await addExceptionalPlayer(client, session.session_id, action.name);
        setGuestNames((current) => ({ ...current, [session.session_id]: '' }));
        setMessage(`${action.name} added to the session on ${formatDate(session.local_date)}.`);
      } else if (kind === 'removeGuest') {
        await removeExceptionalPlayer(client, action.guest.id);
        setMessage(`${action.guest.name} removed from the session on ${formatDate(session.local_date)}.`);
      }
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

  return (
    <div className="admin-section">
      <datalist id="half-hour-times">
        {halfHourTimes.map((time) => <option key={time} value={time} />)}
      </datalist>
      {error && <p className="admin-alert" role="alert">{error}</p>}
      {message && <p className="admin-notice" role="status">{message}</p>}

      <div className="admin-list-toolbar">
        <p>{sessions.length} upcoming {sessions.length === 1 ? 'session' : 'sessions'}</p>
        <button className="admin-primary-button" type="button" onClick={beginCreate}>
          Add exceptional session
        </button>
      </div>

      {creating && (
        <form className="admin-inline-form admin-create-session" onSubmit={stageCreate}>
          <h3>New exceptional session</h3>
          <label>
            Description (optional)
            <input
              maxLength={120}
              value={creating.description}
              onChange={(event) => setCreating({ ...creating, description: event.target.value })}
            />
          </label>
          <label>
            Type
            <select
              value={creating.type}
              onChange={(event) => setCreating({ ...creating, type: event.target.value })}
            >
              {sessionTypes.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Date
            <input
              type="date"
              required
              min={todayIso()}
              value={creating.date}
              onChange={(event) => setCreating({ ...creating, date: event.target.value })}
            />
          </label>
          <label>
            Start time
            <TimeInput value={creating.time} onChange={(time) => setCreating({ ...creating, time })} />
          </label>
          <label>
            Duration (minutes)
            <input
              type="number"
              min={1}
              max={1440}
              step={1}
              required
              value={creating.durationMinutes}
              onChange={(event) => setCreating({ ...creating, durationMinutes: event.target.value })}
            />
          </label>
          <label>
            Location
            <input
              maxLength={200}
              required
              value={creating.location}
              onChange={(event) => setCreating({ ...creating, location: event.target.value })}
            />
          </label>
          <div className="admin-form-actions">
            <button className="admin-secondary-button" type="button" onClick={() => setCreating(null)}>
              Cancel
            </button>
            <button className="admin-primary-button" type="submit" disabled={busy}>Create session</button>
          </div>
        </form>
      )}

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
            const title = session.event_description;

            return (
              <li
                className={`admin-session session-${sessionKind(session)}${cancelled ? ' is-cancelled' : ''}`}
                key={session.session_id}
              >
                <div className="admin-session-header">
                  <div className="admin-session-info">
                    <h3>
                      {formatDate(session.local_date)}
                      <span className="admin-session-badge admin-session-kind">{sessionTypeLabel(session)}</span>
                      {session.is_exceptional && <span className="admin-session-badge">Exceptional</span>}
                    </h3>
                    {title && <p className="admin-session-title">{title}</p>}
                    <p className="admin-session-time">
                      {shortTime(session.local_time)}{end && `–${end}`}
                    </p>
                    <p>{session.location}</p>
                    {!session.is_exceptional && (
                      <p>Minimum players: {minimumLabel(session.min_players, session.default_min_players)}</p>
                    )}
                    {cancelled && (
                      <p className="admin-session-status">
                        Cancelled{session.cancellation_reason && `: ${session.cancellation_reason}`}
                      </p>
                    )}
                  </div>
                  <div className="admin-member-actions">
                    <button type="button" onClick={() => beginEdit(session)}>Edit</button>
                    {cancelled ? (
                      <button type="button" disabled={busy} onClick={() => runAction({ kind: 'restore', session })}>
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
                      <TimeInput value={editing.time} onChange={(time) => setEditing({ ...editing, time })} />
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
                    {!session.is_exceptional && (
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
                    )}
                    <div className="admin-form-actions">
                      <button className="admin-secondary-button" type="button" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                      <button className="admin-primary-button" type="submit" disabled={busy}>Save</button>
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
                      <button className="admin-primary-button" type="submit" disabled={busy}>Cancel session</button>
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
                            disabled={busy}
                            onClick={() => {
                              resetFeedback();
                              runAction({ kind: 'removeGuest', session, guest });
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
                    <button type="submit" disabled={busy}>Add</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
