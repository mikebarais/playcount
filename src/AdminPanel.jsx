import { useState } from 'react';
import MembersAdmin from './MembersAdmin';
import SessionsAdmin from './SessionsAdmin';

const sections = [
  { id: 'members', label: 'Members' },
  { id: 'sessions', label: 'Sessions' },
];

export default function AdminPanel({ client, currentMemberId }) {
  const [section, setSection] = useState('members');

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
      {section === 'sessions' && <SessionsAdmin client={client} />}
    </section>
  );
}
