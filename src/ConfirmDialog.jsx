export function ChangeSummary({ changes }) {
  if (changes.length === 0) return <p>Nothing has changed.</p>;

  return (
    <dl className="admin-change-summary">
      {changes.map(({ label, value, previous }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{previous === null ? value : <>{previous} <span aria-hidden="true">→</span> {value}</>}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ConfirmDialog({ title, confirmLabel, busy, error, onCancel, onConfirm, children }) {
  return (
    <div className="admin-dialog-backdrop">
      <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h3 id="confirm-title">{title}</h3>
        {children}
        {error && <p className="admin-alert" role="alert">{error}</p>}
        <div className="admin-form-actions">
          <button className="admin-secondary-button" type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button className="admin-primary-button" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
