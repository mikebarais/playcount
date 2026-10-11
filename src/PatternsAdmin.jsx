import { useEffect, useState } from 'react';
import { createPattern, deletePattern, listPatterns, setPatternPaused, updatePattern } from './adminApi';
import ConfirmDialog from './ConfirmDialog';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const conversionWarning = 'Upcoming sessions from this pattern will become exceptional training sessions. Their attendance and cancellations remain unchanged. You can delete them individually.';

function emptyDraft() {
  return { day: '', time: '', durationMinutes: '', location: '', minPlayers: '' };
}

export default function PatternsAdmin({ client }) {
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState(null);
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [pendingPause, setPendingPause] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const rows = await listPatterns(client);
        if (active) setPatterns(rows || []);
      } catch (loadError) {
        if (active) setError(loadError.message || 'Unable to load weekly patterns.');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [client]);

  function beginEdit(pattern) {
    setError('');
    setMessage('');
    setDraft({
      id: pattern.id,
      day: String(pattern.day_of_week),
      time: pattern.time.slice(0, 5),
      durationMinutes: String(pattern.duration_minutes),
      location: pattern.location,
      minPlayers: String(pattern.min_players),
      isPaused: pattern.is_paused,
    });
  }

  function stageSave(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    const values = {
      ...draft,
      day: Number(draft.day),
      durationMinutes: Number(draft.durationMinutes),
      location: draft.location.trim(),
      minPlayers: Number(draft.minPlayers),
    };
    if (draft.day === '' || !values.time || !values.location
      || !Number.isInteger(values.durationMinutes) || values.durationMinutes < 1 || values.durationMinutes > 1440
      || !Number.isInteger(values.minPlayers) || values.minPlayers < 1) {
      setError('Enter a day, time, duration (1-1440 minutes), location, and minimum players (at least 1).');
      return;
    }

    if (draft.id) {
      const original = patterns.find((pattern) => pattern.id === draft.id);
      if (original && values.day === original.day_of_week && values.time === original.time.slice(0, 5)
        && values.durationMinutes === original.duration_minutes && values.location === original.location
        && values.minPlayers === original.min_players) {
        setDraft(null);
        setMessage('No changes to save.');
        return;
      }
      setPendingUpdate(values);
    } else {
      savePattern(values);
    }
  }

  async function savePattern(values) {
    setPendingUpdate(null);
    setBusy(true);
    try {
      if (values.id) {
        await updatePattern(client, values);
      } else {
        await createPattern(client, values);
      }
      setDraft(null);
      setMessage(values.id
        ? values.isPaused ? 'Pattern saved. New sessions will be generated when resumed.' : 'Pattern saved. New sessions generated.'
        : 'Weekly pattern created.');
      try {
        setPatterns((await listPatterns(client)) || []);
      } catch (refreshError) {
        setError(refreshError.message || 'The pattern was saved, but the list could not be refreshed.');
      }
    } catch (saveError) {
      setError(saveError.message || 'Unable to save the weekly pattern.');
    } finally {
      setBusy(false);
    }
  }

  async function togglePause(pattern, paused) {
    setPendingPause(null);
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await setPatternPaused(client, pattern.id, paused);
      setMessage(paused ? 'Pattern paused. Upcoming sessions are now exceptional.' : 'Pattern resumed. New sessions generated.');
      try {
        setPatterns((await listPatterns(client)) || []);
      } catch (refreshError) {
        setError(refreshError.message || 'The change was saved, but the pattern list could not be refreshed.');
      }
    } catch (saveError) {
      setError(saveError.message || 'Unable to change the pattern status.');
    } finally {
      setBusy(false);
    }
  }

  async function removePattern(pattern) {
    setPendingDelete(null);
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await deletePattern(client, pattern.id);
      setMessage('Pattern deleted. Upcoming sessions are now exceptional.');
      try {
        setPatterns((await listPatterns(client)) || []);
      } catch (refreshError) {
        setError(refreshError.message || 'The pattern was deleted, but the list could not be refreshed.');
      }
    } catch (saveError) {
      setError(saveError.message || 'Unable to delete the weekly pattern.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-section">
      {error && <p className="admin-alert" role="alert">{error}</p>}
      {message && <p className="admin-notice" role="status">{message}</p>}
      {!draft && (
        <div className="admin-list-toolbar">
          <p>{patterns.length} weekly {patterns.length === 1 ? 'pattern' : 'patterns'}</p>
          <button className="admin-primary-button" type="button" disabled={busy} onClick={() => { setDraft(emptyDraft()); setError(''); setMessage(''); }}>
            Add pattern
          </button>
        </div>
      )}
      {draft && (
        <form className="admin-inline-form admin-create-session" onSubmit={stageSave}>
          <h3>{draft.id ? 'Edit weekly pattern' : 'New weekly pattern'}</h3>
          <label>
            Day
            <select autoFocus required value={draft.day} onChange={(event) => setDraft({ ...draft, day: event.target.value })}>
              <option value="" disabled>Select day</option>
              {days.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </label>
          <label>
            Start time
            <input type="time" required value={draft.time} onChange={(event) => setDraft({ ...draft, time: event.target.value })} />
          </label>
          <label>
            Duration (minutes)
            <input type="number" min={1} max={1440} step={1} required value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value })} />
          </label>
          <label>
            Location
            <input maxLength={200} required value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} />
          </label>
          <label>
            Minimum players
            <input type="number" min={1} step={1} required value={draft.minPlayers} onChange={(event) => setDraft({ ...draft, minPlayers: event.target.value })} />
          </label>
          <div className="admin-form-actions">
            <button className="admin-secondary-button" type="button" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
            <button className="admin-primary-button" type="submit" disabled={busy}>Save pattern</button>
          </div>
        </form>
      )}
      {!draft && (loading ? (
        <p role="status">Loading weekly patterns</p>
      ) : patterns.length === 0 ? (
        !error && <p>No weekly patterns.</p>
      ) : (
        <ul className="admin-session-list">
          {patterns.map((pattern) => (
            <li className="admin-session" key={pattern.id}>
              <div className="admin-session-header">
                <div className="admin-session-info">
                  <h3>{days[pattern.day_of_week]} at {pattern.time.slice(0, 5)}</h3>
                  {pattern.is_paused && <p className="admin-session-status">Paused</p>}
                  <p>{pattern.location}</p>
                  <p>{pattern.duration_minutes} minutes</p>
                  <p>Minimum players: {pattern.min_players}</p>
                </div>
                <div className="admin-member-actions">
                  <button type="button" disabled={busy} onClick={() => beginEdit(pattern)}>Edit</button>
                  <button type="button" disabled={busy} onClick={() => pattern.is_paused ? togglePause(pattern, false) : setPendingPause(pattern)}>
                    {pattern.is_paused ? 'Resume' : 'Pause'}
                  </button>
                  <button type="button" className="admin-danger-button" disabled={busy} onClick={() => { setError(''); setMessage(''); setPendingDelete(pattern); }}>
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ))}
      {pendingUpdate && (
        <ConfirmDialog
          title="Update weekly pattern"
          confirmLabel="Update pattern"
          busy={busy}
          error={error}
          onCancel={() => setPendingUpdate(null)}
          onConfirm={() => savePattern(pendingUpdate)}
        >
          <p>{conversionWarning} {pendingUpdate.isPaused ? 'New sessions will be generated when the pattern resumes.' : 'New sessions will be generated immediately.'}</p>
        </ConfirmDialog>
      )}
      {pendingPause && (
        <ConfirmDialog
          title="Pause weekly pattern"
          confirmLabel="Pause pattern"
          busy={busy}
          error={error}
          onCancel={() => setPendingPause(null)}
          onConfirm={() => togglePause(pendingPause, true)}
        >
          <p>{conversionWarning} The pattern will stop generating new sessions until you resume it.</p>
        </ConfirmDialog>
      )}
      {pendingDelete && (
        <ConfirmDialog
          title="Delete weekly pattern"
          confirmLabel="Delete pattern"
          busy={busy}
          error={error}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => removePattern(pendingDelete)}
        >
          <p>{conversionWarning} The pattern will be removed and cannot be resumed. Past sessions retain their history.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}