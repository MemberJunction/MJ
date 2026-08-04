function MJFormFields({
  // Identity + data
  entityName,
  record,
  draft,                 // map of field -> edited value (the form's draft state)
  mode,                  // 'view' | 'edit' | 'create'
  editMode,              // boolean alternative to mode
  onFieldChange,         // (fieldName, value) => void
  // Options
  excludeFields,         // string[] of field names to omit
  showSystemSection = true,
  // Standard interactive-component props
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings,
}) {
  const { MJFormField } = components || {};
  const d = draft || {};

  // ── style helpers ──────────────────────────────────────────────────────────
  const s = styles || {};
  const colors = s.colors || {};
  const spacing = s.spacing || {};
  const typo = s.typography || {};
  const fsz = typo.fontSize || {};
  const text = colors.text || '#1f2937';
  const textSecondary = colors.textSecondary || '#6b7280';
  const border = colors.border || '#e5e7eb';
  const surface = colors.surface || '#ffffff';
  const radius = (() => { const r = s.borders && s.borders.radius; return typeof r === 'object' ? (r.md || r.sm || '8px') : (r || '8px'); })();
  const lg = spacing.lg || '20px';
  const md = spacing.md || '16px';

  // ── metadata + section layout (mirrors MJ CodeGen / scaffold) ────────────────
  const entity = React.useMemo(
    () => (utilities && utilities.md && utilities.md.Entities
      ? utilities.md.Entities.find(e => e.Name === entityName) : null) || null,
    [utilities, entityName],
  );

  const layout = React.useMemo(() => {
    const result = { top: [], sections: [], system: [] };
    if (!entity || !entity.Fields) return result;
    const exclude = new Set(excludeFields || []);
    const sectionMap = new Map(); // title -> fields[]
    const sorted = [...entity.Fields].sort((a, b) => (a.Sequence ?? 0) - (b.Sequence ?? 0));
    for (const f of sorted) {
      if (exclude.has(f.Name)) continue;
      if (f.IsVirtual) continue;                                   // computed / joined — skip (matches scaffold)
      const isAudit = f.Name.startsWith('__mj_') || f.Name === 'CreatedAt' || f.Name === 'UpdatedAt';
      if (f.IsPrimaryKey || isAudit) { result.system.push(f); continue; }
      switch (f.GeneratedFormSectionType) {
        case 'Top':
          result.top.push(f);
          break;
        case 'Category': {
          const cat = (f.Category && f.Category.trim()) || 'Details';
          if (!sectionMap.has(cat)) sectionMap.set(cat, []);
          sectionMap.get(cat).push(f);
          break;
        }
        default: {
          if (!sectionMap.has('Details')) sectionMap.set('Details', []);
          sectionMap.get('Details').push(f);
        }
      }
    }
    result.sections = [...sectionMap.entries()].map(([title, fields]) => ({ title, fields }));
    return result;
  }, [entity, excludeFields]);

  // ── collapse state (persisted) ───────────────────────────────────────────────
  const [collapsed, setCollapsed] = React.useState(() => (savedUserSettings && savedUserSettings.collapsedSections) || {});
  const toggle = (title) => {
    setCollapsed(prev => {
      const next = { ...prev, [title]: !prev[title] };
      if (onSaveUserSettings) onSaveUserSettings({ ...savedUserSettings, collapsedSections: next });
      return next;
    });
  };

  // ── field + section rendering ─────────────────────────────────────────────────
  const renderField = (f) => (
    MJFormField
      ? <MJFormField
          key={f.Name}
          entityName={entityName}
          fieldName={f.Name}
          record={record}
          value={f.Name in d ? d[f.Name] : (record ? record[f.Name] : undefined)}
          mode={mode}
          editMode={editMode}
          onChange={(v) => { if (onFieldChange) onFieldChange(f.Name, v); }}
          utilities={utilities}
          styles={styles}
          components={components}
          callbacks={callbacks}
        />
      : (
        <div key={f.Name} style={{ marginBottom: md }}>
          <label style={{ display: 'block', fontWeight: 500, color: textSecondary }}>{f.Name}</label>
          <div>{String((record && record[f.Name]) ?? '')}</div>
        </div>
      )
  );

  const fieldGrid = (fields) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: md }}>
      {fields.map(renderField)}
    </div>
  );

  const renderSection = (title, fields, defaultCollapsed) => {
    const isCollapsed = title in collapsed ? collapsed[title] : !!defaultCollapsed;
    return (
      <div key={title} style={{ border: `1px solid ${border}`, borderRadius: radius, background: surface, marginBottom: lg, overflow: 'hidden' }}>
        <div
          onClick={() => toggle(title)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: `${md} ${lg}`, borderBottom: isCollapsed ? 'none' : `1px solid ${border}`, fontWeight: 600, fontSize: fsz.lg || '16px', color: text }}
        >
          <span>{title}</span>
          <span style={{ color: textSecondary, fontSize: '12px' }}>{isCollapsed ? '▸' : '▾'}</span>
        </div>
        {!isCollapsed ? <div style={{ padding: lg }}>{fieldGrid(fields)}</div> : null}
      </div>
    );
  };

  if (!entity) {
    return <div style={{ padding: md, color: textSecondary }}>Loading fields…</div>;
  }

  return (
    <div>
      {layout.top.length > 0 ? <div style={{ marginBottom: lg }}>{fieldGrid(layout.top)}</div> : null}
      {layout.sections.map(sec => renderSection(sec.title, sec.fields, false))}
      {showSystemSection && layout.system.length > 0 ? renderSection('System Metadata', layout.system, true) : null}
    </div>
  );
}
