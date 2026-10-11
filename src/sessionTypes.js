export const sessionTypes = [
  { value: 'training', label: 'Training' },
  { value: 'match', label: 'Match' },
  { value: 'other', label: 'Other event' },
];

export function sessionTitle(session) {
  return session.event_name
    || sessionTypes.find(({ value }) => value === session.event_type)?.label
    || session.event_type
    || null;
}
