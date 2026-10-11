import { useLayoutEffect, useRef, useState } from 'react';
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
  const viewRef = useRef(null);
  const stripRef = useRef(null);

  function alignDetailBorder() {
    const view = viewRef.current;
    const strip = stripRef.current;
    if (!view || !strip) return;

    const selected = strip.querySelector('.session-head.is-selected');
    const table = view.querySelector('.attendance-matrix');
    if (!selected || !table) return;

    const viewBounds = view.getBoundingClientRect();
    const stripBounds = strip.getBoundingClientRect();
    const tabBounds = selected.getBoundingClientRect();
    const tableBounds = table.getBoundingClientRect();
    const left = Math.max(0, Math.min(tableBounds.width, Math.max(stripBounds.left, tabBounds.left) - tableBounds.left));
    const right = Math.max(left, Math.min(tableBounds.width, Math.min(stripBounds.right, tabBounds.right) - tableBounds.left));

    view.style.setProperty('--tab-left', `${left}px`);
    view.style.setProperty('--tab-right', `${right}px`);
    view.style.setProperty('--detail-top', `${tableBounds.top - viewBounds.top}px`);
  }

  useLayoutEffect(() => {
    if (sessions.length === 0) return;

    const observer = new ResizeObserver(alignDetailBorder);
    observer.observe(viewRef.current);
    observer.observe(stripRef.current);
    alignDetailBorder();
    return () => observer.disconnect();
  }, [selectedSessionId, sessions]);

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
  const minimum = selectedSession.schedule_pattern_id === null ? null : selectedSession.min_players;
  const minimumReached = participantCount >= minimum;

  function followVisibleSession(event) {
    alignDetailBorder();
    const strip = event.currentTarget;
    const viewport = strip.getBoundingClientRect();
    const headers = strip.children;
    const selectedIndex = sessions.findIndex((session) => session.id === selectedSession.id);
    const selectedBounds = headers[selectedIndex].getBoundingClientRect();
    const clippedOnLeft = selectedBounds.left < viewport.left - 0.5;
    const clippedOnRight = selectedBounds.right > viewport.right + 0.5;

    if (!clippedOnLeft && !clippedOnRight) return;

    const direction = clippedOnLeft ? 1 : -1;
    for (let index = selectedIndex + direction; index >= 0 && index < sessions.length; index += direction) {
      const bounds = headers[index].getBoundingClientRect();
      const candidateWidth = Math.min(bounds.right, viewport.right) - Math.max(bounds.left, viewport.left);
      if (candidateWidth >= bounds.width / 2) {
        setSelectedSessionId(sessions[index].id);
        return;
      }
    }
  }

  return (
    <div ref={viewRef} className={`attendance-view attendance-${sessionKind(selectedSession)}${selectedSession.status === 'cancelled' ? ' attendance-cancelled' : ''}`}>
      <nav ref={stripRef} className="session-strip" aria-label="Upcoming sessions" onScroll={followVisibleSession} onTransitionEnd={alignDetailBorder}>
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
