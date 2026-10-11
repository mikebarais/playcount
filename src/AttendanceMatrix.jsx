import { useState } from 'react';
import { sessionKind } from './sessionTypes';

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
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  if (sessions.length === 0) {
    return <p className="sessions-empty">No upcoming sessions.</p>;
  }

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0];
  const sessionGuests = guests.filter((guest) => guest.session_id === selectedSession.id);
  const present = new Set(
    attendances
      .filter((attendance) => attendance.session_id === selectedSession.id && attendance.status === 'present')
      .map((attendance) => attendance.member_id),
  );
  const participantCount = present.size + sessionGuests.length;
  const minimum = selectedSession.schedule_pattern_id === null
    ? null
    : selectedSession.min_players ?? selectedSession.schedule_patterns?.min_players;
  const minimumReached = participantCount >= minimum;

  return (
    <div className="attendance-view">
      <nav className="session-strip" aria-label="Upcoming sessions">
        {sessions.map((session) => {
          const startsAt = new Date(session.starts_at);
          const endsAt = addInterval(startsAt, session.duration);
          const cancelled = session.status === 'cancelled';

          return (
            <button
              key={session.id}
              type="button"
              className={`session-head session-${sessionKind(session)}${cancelled ? ' session-cancelled' : ''}${session.id === selectedSession.id ? ' is-selected' : ''}`}
              title={session.location}
              aria-pressed={session.id === selectedSession.id}
              onClick={() => setSelectedSessionId(session.id)}
            >
              <span className="session-date">{dateFormat.format(startsAt)}</span>
              <span className="session-time">
                {timeFormat.format(startsAt)}
                {endsAt && `–${timeFormat.format(endsAt)}`}
              </span>
              {session.event_description && <span className="session-title">{session.event_description}</span>}
              <span className="session-location">{session.location}</span>
              {cancelled && (
                <span className="session-status">
                  Cancelled{session.cancellation_reason && `: ${session.cancellation_reason}`}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <table className="attendance-matrix">
        <thead>
          <tr>
            <th scope="col">Players</th>
            <th scope="col">Present</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const isSelf = player.id === memberId;

            return (
              <tr key={player.id} className={isSelf ? 'player-row player-self' : 'player-row'}>
                <th scope="row">{player.name}</th>
                <td>
                  <input
                    type="checkbox"
                    checked={present.has(player.id)}
                    disabled={!isSelf || selectedSession.status === 'cancelled'}
                    onChange={() => onToggle(selectedSession.id, !present.has(player.id))}
                    aria-label={`${player.name} present on ${dateFormat.format(new Date(selectedSession.starts_at))}`}
                  />
                </td>
              </tr>
            );
          })}
          {sessionGuests.map((guest) => (
            <tr key={guest.id} className="guest-row">
              <th scope="row">
                {guest.name} <span className="guest-label">guest</span>
              </th>
              <td>
                <input
                  type="checkbox"
                  checked
                  disabled
                  aria-label={`${guest.name} present on ${dateFormat.format(new Date(selectedSession.starts_at))}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="matrix-total">
            <th scope="row">Total present</th>
            <td>
              {Number.isInteger(minimum) ? (
                <>
                  <span className={minimumReached ? 'session-count is-met' : 'session-count is-under'}>
                    {participantCount} / {minimum} players
                  </span>
                  <span className={minimumReached ? 'session-threshold is-met' : 'session-threshold is-under'}>
                    {minimumReached ? 'Minimum met' : `${minimum - participantCount} needed`}
                  </span>
                </>
              ) : <span className="session-count">{participantCount} players</span>}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
