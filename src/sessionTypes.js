export const sessionTypes = [
  { value: 'training', label: 'Training' },
  { value: 'match', label: 'Match' },
];

// Regular sessions come from a weekly schedule pattern; exceptional ones are training or match.
export function sessionKind(session) {
  const exceptional = session.is_exceptional ?? session.schedule_pattern_id === null;
  if (!exceptional) return 'regular';
  return session.event_type === 'match' ? 'match' : 'training';
}

export function sessionTypeLabel(session) {
  return session.event_type === 'match' ? 'Match' : 'Training';
}
