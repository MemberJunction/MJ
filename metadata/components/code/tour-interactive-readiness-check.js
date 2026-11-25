function TourInteractiveReadinessCheck(props) {
  const { data, callbacks } = props;
  const title = (data && data.title) || 'Pre-Publish Tour Readiness Check';

  const defaultChecks = [
    { id: 'anchors', label: 'All steps use Registered or Semantic anchors (no fragile CSS selectors)' },
    { id: 'length', label: 'Tour stays focused (5 steps or fewer with clear progress)' },
    { id: 'goal', label: 'Concrete outcome Goal defined (EntityEvent, Navigation, or Signal)' },
    { id: 'a11y', label: 'Titles, concise copy, and contrast meet WCAG 2.2 AA standards' }
  ];

  const checks = Array.isArray(data && data.checks) && data.checks.length > 0 ? data.checks : defaultChecks;
  const [checkedMap, setCheckedMap] = useState({});

  const checkedCount = checks.filter((c) => Boolean(checkedMap[c.id])).length;
  const allReady = checkedCount === checks.length;

  const toggleCheck = (id) => {
    setCheckedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleConfirm = () => {
    if (!allReady) return;
    if (callbacks && typeof callbacks.OnEvent === 'function') {
      callbacks.OnEvent('completeStep', {
        allReady: true,
        checkedCount,
        checkedItems: checks.map((c) => c.id)
      });
    }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: '12px', color: 'var(--mj-text-secondary, #475569)' }}>
          {checkedCount} / {checks.length} verified
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {checks.map((item) => {
          const isChecked = Boolean(checkedMap[item.id]);
          return (
            <label
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid var(--mj-border-default, #cbd5e1)',
                background: isChecked
                  ? 'var(--mj-bg-surface-hover, #f0fdf4)'
                  : 'var(--mj-bg-surface, #ffffff)',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleCheck(item.id)}
                style={{ marginTop: '2px' }}
              />
              <span>{item.label}</span>
            </label>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
        <button
          type="button"
          disabled={!allReady}
          onClick={handleConfirm}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: 'none',
            background: allReady
              ? 'var(--mj-brand-primary, #16a34a)'
              : 'var(--mj-bg-disabled, #94a3b8)',
            color: 'var(--mj-text-inverse, #ffffff)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: allReady ? 'pointer' : 'not-allowed'
          }}
        >
          Confirm Readiness &amp; Continue
        </button>
      </div>
    </div>
  );
}
