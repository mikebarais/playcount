const intervalPattern = /^(\d+):(\d{2}):(\d{2})$/;

function addInterval(date, interval) {
  const match = interval?.match(intervalPattern);
  if (!match) return null;
  const [, hours, minutes, seconds] = match.map(Number);
  return new Date(date.getTime() + ((hours * 60 + minutes) * 60 + seconds) * 1000);
}

const dateFormat = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const timeFormat = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export default function AttendanceMatrix({ board, memberId, onToggle }) {
  const { sessions, players, attendances, guests } = board;

  if (sessions.length === 0) {
    return <p className="sessions-empty">No upcoming sessions.</p>;
  }

  const present = new Set(
    attendances
      .filter((attendance) => attendance.status === 'present')
      .map((attendance) => `${attendance.session_id}:${attendance.member_id}`),
  );
  const participantCounts = new Map(sessions.map((session) => [session.id, 0]));

  for (const attendance of attendances) {
    if (attendance.status === 'present') {
      participantCounts.set(attendance.session_id, participantCounts.get(attendance.session_id) + 1);
    }
  }

  for (const guest of guests) {
    participantCounts.set(guest.session_id, participantCounts.get(guest.session_id) + 1);
  }

  return (
    <div className="matrix-scroll">
      <table className="attendance-matrix">
        <thead>
          <tr>
            <th scope="col" className="matrix-corner">Players</th>
            {sessions.map((session) => {
              const startsAt = new Date(session.starts_at);
              const endsAt = addInterval(startsAt, session.duration);
              const cancelled = session.status === 'cancelled';
              const title = session.event_name || session.event_type;
              const minimum = session.min_players ?? session.schedule_patterns?.min_players;
              const participantCount = participantCounts.get(session.id);
              const minimumReached = Number.isInteger(minimum) && participantCount >= minimum;
              const thresholdLabel = Number.isInteger(minimum)
                ? minimumReached ? 'Minimum met' : `${minimum - participantCount} needed`
                : 'Minimum not set';

              return (
                <th
                  key={session.id}
                  scope="col"
                  className={cancelled ? 'session-head session-cancelled' : 'session-head'}
                  title={session.location}
                >
                  <span className="session-date">{dateFormat.format(startsAt)}</span>
                  <span className="session-time">
                    {timeFormat.format(startsAt)}
                    {endsAt && `–${timeFormat.format(endsAt)}`}
                  </span>
                  {title && <span className="session-title">{title}</span>}
                  <span className={minimumReached ? 'session-count is-met' : 'session-count is-under'}>
                    {participantCount} / {minimum ?? '?'} players
                  </span>
                  <span className={minimumReached ? 'session-threshold is-met' : 'session-threshold is-under'}>
                    {thresholdLabel}
                  </span>
                  {cancelled && (
                    <span className="session-status">
                      Cancelled{session.cancellation_reason && `: ${session.cancellation_reason}`}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const isSelf = player.id === memberId;

            return (
              <tr key={player.id} className={isSelf ? 'player-row player-self' : 'player-row'}>
                <th scope="row">{player.name}</th>
                {sessions.map((session) => {
                  const checked = present.has(`${session.id}:${player.id}`);
                  const editable = isSelf && session.status !== 'cancelled';

                  return (
                    <td key={session.id}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!editable}
                        onChange={() => onToggle(session.id, !checked)}
                        aria-label={`${player.name} present on ${dateFormat.format(new Date(session.starts_at))}`}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {guests.map((guest) => (
            <tr key={guest.id} className="guest-row">
              <th scope="row">
                {guest.name} <span className="guest-label">guest</span>
              </th>
              {sessions.map((session) => (
                <td key={session.id}>
                  {session.id === guest.session_id && (
                    <input
                      type="checkbox"
                      checked
                      disabled
                      aria-label={`${guest.name} present on ${dateFormat.format(new Date(session.starts_at))}`}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
