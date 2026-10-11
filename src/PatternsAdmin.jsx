import { useEffect, useState } from 'react';
import { createPattern, listPatterns, updatePattern } from './adminApi';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function emptyDraft() {
  return { day: '', time: '', durationMinutes: '', location: '', minPlayers: '' };
}

export default function PatternsAdmin({ client }) {
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState(null);
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
    });
  }

  async function savePattern(event) {
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

    setBusy(true);
    try {
      if (draft.id) {
        await updatePattern(client, values);
      } else {
        await createPattern(client, values);
      }
      setDraft(null);
      setMessage(draft.id ? 'Weekly pattern saved. Existing session dates and times are unchanged.' : 'Weekly pattern created.');
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

  return (
    <div className="admin-section">
      {error && <p className="admin-alert" role="alert">{error}</p>}
      {message && <p className="admin-notice" role="status">{message}</p>}
      <div className="admin-list-toolbar">
        <p>{patterns.length} weekly {patterns.length === 1 ? 'pattern' : 'patterns'}</p>
        <button className="admin-primary-button" type="button" disabled={busy} onClick={() => { setDraft(emptyDraft()); setError(''); setMessage(''); }}>
          Add pattern
        </button>
      </div>
      {draft && (
        <form className="admin-inline-form admin-create-session" onSubmit={savePattern}>
          <h3>{draft.id ? 'Edit weekly pattern' : 'New weekly pattern'}</h3>
          <label>
            Day
            <select required value={draft.day} onChange={(event) => setDraft({ ...draft, day: event.target.value })}>
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
      {loading ? (
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
                  <p>{pattern.location}</p>
                  <p>{pattern.duration_minutes} minutes</p>
                  <p>Minimum players: {pattern.min_players}</p>
                </div>
                <div className="admin-member-actions">
                  <button type="button" disabled={busy} onClick={() => beginEdit(pattern)}>Edit</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}