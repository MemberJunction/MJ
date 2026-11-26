function TourWorkspaceQuickConfigurator(props) {
  const { data, callbacks } = props;
  const heading = (data && data.heading) || 'Where would you like to start in MemberJunction?';

  const defaultTracks = [
    {
      key: 'data',
      title: 'Explore Data & Views',
      subtitle: 'Browse entities, build filters, and save custom views.'
    },
    {
      key: 'chat',
      title: 'Collaborate with Sage',
      subtitle: 'Ask questions, analyze records, and automate workflows.'
    },
    {
      key: 'records',
      title: 'Work Inside Records',
      subtitle: 'Inspect form fields, history, comments, and related lists.'
    }
  ];

  const tracks = Array.isArray(data && data.tracks) && data.tracks.length > 0 ? data.tracks : defaultTracks;
  const [selectedKey, setSelectedKey] = useState(tracks[0].key);
  const [confirmed, setConfirmed] = useState(false);

  const emitEvent = (eventName, payload) => {
    if (callbacks && typeof callbacks.OnEvent === 'function') {
      callbacks.OnEvent(eventName, payload);
    }
  };

  const handleSelectAndContinue = () => {
    setConfirmed(true);
    emitEvent('chooseBranch', { choiceKey: selectedKey });
    emitEvent('completeStep', { choiceKey: selectedKey, completed: true });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '4px 0',
        color: 'var(--mj-text-primary, #1e293b)',
        fontFamily: 'inherit'
      }}
    >
      <div style={{ fontSize: '13px', fontWeight: 600 }}>{heading}</div>
      <div role="radiogroup" aria-label={heading} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tracks.map((track) => {
          const isSelected = selectedKey === track.key;
          return (
            <button
              key={track.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelectedKey(track.key)}
              style={{
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                border: isSelected
                  ? '2px solid var(--mj-brand-primary, #2563eb)'
                  : '1px solid var(--mj-border-default, #cbd5e1)',
                background: isSelected
                  ? 'var(--mj-bg-surface-hover, #eff6ff)'
                  : 'var(--mj-bg-surface, #ffffff)',
                color: 'var(--mj-text-primary, #0f172a)'
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{track.title}</div>
              <div style={{ fontSize: '12px', color: 'var(--mj-text-secondary, #475569)', marginTop: '2px' }}>
                {track.subtitle}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
        <button
          type="button"
          onClick={handleSelectAndContinue}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: 'none',
            background: 'var(--mj-brand-primary, #2563eb)',
            color: 'var(--mj-text-inverse, #ffffff)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          {confirmed ? 'Continuing…' : 'Use This Track'}
        </button>
      </div>
    </div>
  );
}
