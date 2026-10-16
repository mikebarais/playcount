import { useState } from 'react';
import ClubNoticeAdmin from './ClubNoticeAdmin';
import MembersAdmin from './MembersAdmin';
import PatternsAdmin from './PatternsAdmin';
import SessionsAdmin from './SessionsAdmin';

const sections = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'members', label: 'Members' },
  { id: 'notice', label: 'Notice' },
  { id: 'patterns', label: 'Patterns' },
];

export default function AdminPanel({ client, currentMemberId, onNotificationChange }) {
  const [section, setSection] = useState('sessions');

  return (
    <section className="admin-panel" aria-labelledby="admin-title">
      <header className="admin-heading">
        <div>
          <p className="admin-eyebrow">Administration</p>
          <h2 id="admin-title">{sections.find(({ id }) => id === section).label}</h2>
        </div>
      </header>

      <nav className="admin-subtabs" aria-label="Administration sections">
        {sections.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={section === id ? 'admin-subtab is-selected' : 'admin-subtab'}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {section === 'members' && <MembersAdmin client={client} currentMemberId={currentMemberId} />}
      {section === 'notice' && <ClubNoticeAdmin client={client} onNotificationChange={onNotificationChange} />}
      {section === 'sessions' && <SessionsAdmin client={client} />}
      {section === 'patterns' && <PatternsAdmin client={client} />}
    </section>
  );
}
