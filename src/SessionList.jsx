const intervalPattern = /^(\d+):(\d{2}):(\d{2})$/;

function addInterval(date, interval) {
  const match = interval?.match(intervalPattern);
  if (!match) return null;
  const [, hours, minutes, seconds] = match.map(Number);
  return new Date(date.getTime() + ((hours * 60 + minutes) * 60 + seconds) * 1000);
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export default function SessionList({ sessions }) {
  if (sessions.length === 0) {
    return <p className="sessions-empty">No upcoming sessions.</p>;
  }

  return (
    <ol className="session-list">
      {sessions.map((session) => {
        const startsAt = new Date(session.starts_at);
        const endsAt = addInterval(startsAt, session.duration);
        const cancelled = session.status === 'annulée';
        const title = session.event_name || session.event_type;

        return (
          <li key={session.id} className={cancelled ? 'session-card session-cancelled' : 'session-card'}>
            <p className="session-date">{dateFormat.format(startsAt)}</p>
            <p className="session-time">
              {timeFormat.format(startsAt)}
              {endsAt && ` – ${timeFormat.format(endsAt)}`}
            </p>
            {title && <p className="session-title">{title}</p>}
            <p className="session-location">{session.location}</p>
            {cancelled && (
              <p className="session-status">
                Cancelled{session.cancellation_reason && `: ${session.cancellation_reason}`}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
