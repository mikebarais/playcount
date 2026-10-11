export const sessionTypes = [
  { value: 'training', label: 'Training' },
  { value: 'match', label: 'Match' },
];

export function sessionKind(session) {
  if (session.event_type === 'regular') return 'regular';
  return session.event_type === 'match' ? 'match' : 'training';
}

export function sessionTypeLabel(session) {
  return session.event_type === 'match' ? 'Match' : 'Training';
}
