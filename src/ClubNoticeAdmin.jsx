import { useEffect, useState } from 'react';
import { updateClubNotification } from './adminApi';

function localDateKey(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export default function ClubNoticeAdmin({ client, onNotificationChange }) {
  const [message, setMessage] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [timeZone, setTimeZone] = useState('UTC');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let active = true;

    async function loadNotification() {
      const { data, error: loadError } = await client
        .from('clubs')
        .select('notification_message, notification_expires_on, timezone')
        .limit(1)
        .maybeSingle();

      if (!active) return;
      if (loadError) {
        setError(loadError.message || 'Unable to load the club notification.');
      } else if (data) {
        setMessage(data.notification_message || '');
        setExpiresOn(data.notification_expires_on || '');
        setTimeZone(data.timezone || 'UTC');
      }
      setLoading(false);
    }

    loadNotification();
    return () => { active = false; };
  }, [client]);

  async function saveNotification(event) {
    event.preventDefault();
    setError('');
    setFeedback('');

    const normalizedMessage = message.trim();
    if (!normalizedMessage || !expiresOn) {
      setError('Enter a notification and its expiration date.');
      return;
    }
    if (expiresOn < localDateKey(new Date(), timeZone)) {
      setError('Choose today or a future expiration date.');
      return;
    }

    setBusy(true);
    try {
      await updateClubNotification(client, normalizedMessage, expiresOn);
      setMessage(normalizedMessage);
      onNotificationChange?.({ notification_message: normalizedMessage, notification_expires_on: expiresOn, timezone });
      setFeedback('Member notification saved.');
    } catch (saveError) {
      setError(saveError.message || 'Unable to save the club notification.');
    } finally {
      setBusy(false);
    }
  }

  async function clearNotification() {
    setError('');
    setFeedback('');
    setBusy(true);
    try {
      await updateClubNotification(client, null, null);
      setMessage('');
      setExpiresOn('');
      onNotificationChange?.(null);
      setFeedback('Member notification cleared.');
    } catch (clearError) {
      setError(clearError.message || 'Unable to clear the club notification.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p role="status">Loading club notification</p>;

  return (
    <form className="admin-form admin-notification-form" onSubmit={saveNotification}>
      <h3>Member notification</h3>
      {error && <p className="admin-alert" role="alert">{error}</p>}
      {feedback && <p className="admin-notice" role="status">{feedback}</p>}
      <label>
        Alert message
        <textarea
          maxLength={1000}
          required
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </label>
      <label>
        Display until
        <input
          type="date"
          min={localDateKey(new Date(), timeZone)}
          required
          value={expiresOn}
          onChange={(event) => setExpiresOn(event.target.value)}
        />
      </label>
      <div className="admin-form-actions">
        {message && (
          <button className="admin-danger-button" type="button" disabled={busy} onClick={clearNotification}>
            Clear notification
          </button>
        )}
        <button className="admin-primary-button" type="submit" disabled={busy}>
          Save notification
        </button>
      </div>
    </form>
  );
}
