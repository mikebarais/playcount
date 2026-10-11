export const sessionTypes = [
  { value: 'training', label: 'Training' },
  { value: 'match', label: 'Match' },
];

// Regular weekly sessions have no type and count as training.
export function sessionKind(session) {
  return session.event_type === 'match' ? 'match' : 'training';
}

export function sessionTypeLabel(session) {
  return sessionTypes.find(({ value }) => value === sessionKind(session)).label;
}
