function MJFormField({
  // Identity
  entityName,
  fieldName,
  // Data
  record,
  value,            // controlled value; falls back to record[fieldName] when undefined
  mode,             // 'view' | 'edit' | 'create'
  editMode,         // boolean alternative to mode
  // Change callback (edit mode)
  onChange,
  // Display options
  showLabel = true,
  label,            // override the field's display name
  // Standard interactive-component props
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings,
}) {
  // ── style helpers (degrade gracefully if a token is missing) ─────────────
  const s = styles || {};
  const colors = s.colors || {};
  const spacing = s.spacing || {};
  const typo = s.typography || {};
  const fs = typo.fontSize || {};
  const radius = (() => {
    const r = s.borders && s.borders.radius;
    return typeof r === 'object' ? (r.sm || r.md || '4px') : (r || '4px');
  })();
  const text = colors.text || '#1f2937';
  const textSecondary = colors.textSecondary || '#6b7280';
  const border = colors.border || '#d1d5db';
  const primary = colors.primary || '#2563eb';
  const danger = colors.error || colors.danger || '#dc2626';
  const surface = colors.surface || '#ffffff';
  const pad = spacing.sm || '8px';

  // ── metadata resolution ──────────────────────────────────────────────────
  const entity = React.useMemo(
    () => (utilities && utilities.md && utilities.md.Entities
      ? utilities.md.Entities.find(e => e.Name === entityName) : null) || null,
    [utilities, entityName],
  );
  const field = React.useMemo(
    () => (entity && entity.Fields ? entity.Fields.find(f => f.Name === fieldName) : null) || null,
    [entity, fieldName],
  );

  const editing = mode === 'edit' || mode === 'create' || editMode === true;

  // Derived field facts (all from EntityFieldInfo)
  const tsType = (field && field.TSType) || 'string';
  const ext = (field && field.ExtendedType) || null;
  const valueListType = (field && field.ValueListTypeEnum) || 'None';
  const valueList = valueListType !== 'None' && field && field.EntityFieldValues ? field.EntityFieldValues : [];
  const relatedEntityName = (field && field.RelatedEntity) || null;
  const isFK = !!relatedEntityName;
  const isReadOnly = !field
    || field.IsPrimaryKey === true
    || field.AllowUpdateAPI === false
    || field.ReadOnly === true
    || field.IsVirtual === true;
  const required = field ? field.AllowsNull === false && !field.IsPrimaryKey : false;
  const displayName = label || (field && (field.DisplayName || field.Name)) || fieldName;

  const currentValue = value !== undefined ? value : (record ? record[fieldName] : undefined);

  // ── FK display-name + search state ─────────────────────────────────────────
  const relatedEntity = React.useMemo(
    () => (isFK && utilities && utilities.md && utilities.md.Entities
      ? utilities.md.Entities.find(e => e.Name === relatedEntityName) : null) || null,
    [isFK, utilities, relatedEntityName],
  );
  const relPK = (relatedEntity && relatedEntity.Fields && relatedEntity.Fields.find(f => f.IsPrimaryKey))
    || null;
  const relPKName = (field && field.RelatedEntityFieldName) || (relPK && relPK.Name) || 'ID';
  const relNameFieldName = (relatedEntity && relatedEntity.NameField && relatedEntity.NameField.Name)
    || 'Name';

  const [fkDisplay, setFkDisplay] = React.useState('');
  const [fkSearch, setFkSearch] = React.useState('');
  const [fkResults, setFkResults] = React.useState([]);
  const [fkOpen, setFkOpen] = React.useState(false);
  const debounceRef = React.useRef(null);

  // Resolve the display name for the current FK value.
  React.useEffect(() => {
    if (!isFK) return;
    // 1) joined name already on the record (no fetch)
    const mapName = field && field.RelatedEntityNameFieldMap;
    if (mapName && record && record[mapName] != null && record[mapName] !== '') {
      setFkDisplay(String(record[mapName]));
      return;
    }
    if (currentValue == null || currentValue === '') { setFkDisplay(''); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await utilities.rv.RunView({
          EntityName: relatedEntityName,
          ExtraFilter: `${relPKName} = '${String(currentValue).replace(/'/g, "''")}'`,
          Fields: [relPKName, relNameFieldName],
          MaxRows: 1,
        });
        if (!cancelled && res && res.Success && res.Results && res.Results.length > 0) {
          setFkDisplay(String(res.Results[0][relNameFieldName] ?? currentValue));
        }
      } catch (e) { /* leave raw value */ }
    })();
    return () => { cancelled = true; };
  }, [isFK, currentValue, relatedEntityName, relPKName, relNameFieldName]);

  const runFkSearch = React.useCallback((q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const filter = q && q.trim().length > 0
          ? `${relNameFieldName} LIKE '${q.replace(/'/g, "''")}%'`
          : undefined;
        const res = await utilities.rv.RunView({
          EntityName: relatedEntityName,
          ExtraFilter: filter,
          OrderBy: `${relNameFieldName} ASC`,
          Fields: [relPKName, relNameFieldName],
          MaxRows: 20,
        });
        setFkResults(res && res.Success ? (res.Results || []) : []);
      } catch (e) { setFkResults([]); }
    }, 250);
  }, [relatedEntityName, relNameFieldName, relPKName]);

  // ── shared visual atoms ────────────────────────────────────────────────────
  const labelEl = showLabel ? (
    <label style={{ display: 'block', fontSize: fs.sm || '13px', fontWeight: 500, color: textSecondary, marginBottom: '4px' }}>
      {displayName}{required && editing ? <span style={{ color: danger }}> *</span> : null}
    </label>
  ) : null;

  const inputStyle = {
    width: '100%',
    padding: pad,
    fontSize: fs.md || '14px',
    color: text,
    background: surface,
    border: `1px solid ${border}`,
    borderRadius: radius,
    boxSizing: 'border-box',
  };

  const readValueStyle = {
    padding: pad,
    fontSize: fs.md || '14px',
    color: text,
    minHeight: '20px',
    wordBreak: 'break-word',
  };

  const fieldWrap = { marginBottom: spacing.md || '16px', position: 'relative' };

  // ── READ MODE ──────────────────────────────────────────────────────────────
  if (!editing) {
    let display;
    if (currentValue == null || currentValue === '') {
      display = <span style={{ color: textSecondary, fontStyle: 'italic' }}>—</span>;
    } else if (tsType === 'boolean') {
      display = <span>{currentValue ? 'Yes' : 'No'}</span>;
    } else if (isFK && callbacks && callbacks.OpenEntityRecord) {
      display = (
        <a
          style={{ color: primary, cursor: 'pointer', textDecoration: 'none' }}
          onClick={() => callbacks.OpenEntityRecord(relatedEntityName, [{ FieldName: relPKName, Value: currentValue }])}
          title="View related record"
        >{fkDisplay || String(currentValue)}</a>
      );
    } else if (ext === 'Email') {
      display = <a style={{ color: primary }} href={`mailto:${currentValue}`}>{String(currentValue)}</a>;
    } else if (ext === 'URL') {
      display = <a style={{ color: primary }} href={String(currentValue)} target="_blank" rel="noopener noreferrer">{String(currentValue)}</a>;
    } else if (ext === 'Tel' || ext === 'SMS') {
      display = <a style={{ color: primary }} href={`tel:${currentValue}`}>{String(currentValue)}</a>;
    } else if (tsType === 'Date') {
      const d = new Date(currentValue);
      display = <span>{isNaN(d.getTime()) ? String(currentValue) : d.toLocaleString()}</span>;
    } else {
      display = <span>{String(currentValue)}</span>;
    }
    return (
      <div style={fieldWrap}>
        {labelEl}
        <div style={readValueStyle}>{display}</div>
      </div>
    );
  }

  // ── EDIT MODE ────────────────────────────────────────────────────────────────
  // Read-only fields render as read display even in edit mode.
  if (isReadOnly) {
    return (
      <div style={fieldWrap}>
        {labelEl}
        <div style={{ ...readValueStyle, background: colors.background || '#f3f4f6', border: `1px solid ${border}`, borderRadius: radius }}>
          {currentValue == null || currentValue === ''
            ? <span style={{ color: textSecondary, fontStyle: 'italic' }}>—</span>
            : String(currentValue)}
        </div>
      </div>
    );
  }

  const emit = (v) => { if (onChange) onChange(v); };
  const requiredEmpty = required && (currentValue == null || currentValue === '');
  const borderColor = requiredEmpty ? danger : border;

  let control;
  if (isFK) {
    control = (
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          style={{ ...inputStyle, borderColor }}
          value={fkOpen ? fkSearch : (fkDisplay || (currentValue != null ? String(currentValue) : ''))}
          placeholder="Search…"
          onFocus={() => { setFkOpen(true); setFkSearch(''); runFkSearch(''); }}
          onChange={(e) => { setFkSearch(e.target.value); runFkSearch(e.target.value); }}
          onBlur={() => setTimeout(() => setFkOpen(false), 150)}
        />
        {fkOpen && fkResults.length > 0 ? (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
            background: surface, border: `1px solid ${border}`, borderRadius: radius,
            maxHeight: '220px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          }}>
            {fkResults.map((r) => (
              <div
                key={String(r[relPKName])}
                style={{ padding: pad, cursor: 'pointer', fontSize: fs.md || '14px', color: text }}
                onMouseDown={() => {
                  emit(r[relPKName]);
                  setFkDisplay(String(r[relNameFieldName] ?? r[relPKName]));
                  setFkOpen(false);
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = colors.surfaceHover || '#f3f4f6'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >{String(r[relNameFieldName] ?? r[relPKName])}</div>
            ))}
          </div>
        ) : null}
      </div>
    );
  } else if (valueList.length > 0) {
    control = (
      <select style={{ ...inputStyle, borderColor }} value={currentValue == null ? '' : String(currentValue)} onChange={(e) => emit(e.target.value)}>
        <option value="">—</option>
        {valueList.map((v) => (
          <option key={v.Value} value={v.Value}>{v.Code || v.Value}</option>
        ))}
      </select>
    );
  } else if (tsType === 'boolean') {
    control = (
      <input
        type="checkbox"
        checked={!!currentValue}
        onChange={(e) => emit(e.target.checked)}
        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
      />
    );
  } else if (tsType === 'Date') {
    const iso = currentValue ? String(currentValue).slice(0, 10) : '';
    control = <input type="date" style={{ ...inputStyle, borderColor }} value={iso} onChange={(e) => emit(e.target.value)} />;
  } else if (tsType === 'number') {
    control = <input type="number" style={{ ...inputStyle, borderColor }} value={currentValue == null ? '' : currentValue} onChange={(e) => emit(e.target.value === '' ? null : Number(e.target.value))} />;
  } else if (ext === 'Email') {
    control = <input type="email" style={{ ...inputStyle, borderColor }} value={currentValue == null ? '' : currentValue} onChange={(e) => emit(e.target.value)} />;
  } else if (ext === 'URL') {
    control = <input type="url" style={{ ...inputStyle, borderColor }} value={currentValue == null ? '' : currentValue} onChange={(e) => emit(e.target.value)} />;
  } else {
    // long text → textarea, else single-line text
    const isLong = field && (field.MaxLength === -1 || field.MaxLength > 255);
    control = isLong
      ? <textarea rows={4} style={{ ...inputStyle, borderColor, resize: 'vertical' }} value={currentValue == null ? '' : currentValue} onChange={(e) => emit(e.target.value)} />
      : <input type="text" style={{ ...inputStyle, borderColor }} value={currentValue == null ? '' : currentValue} onChange={(e) => emit(e.target.value)} />;
  }

  return (
    <div style={fieldWrap}>
      {labelEl}
      {control}
      {requiredEmpty ? (
        <div style={{ color: danger, fontSize: fs.sm || '12px', marginTop: '4px' }}>{displayName} is required.</div>
      ) : null}
    </div>
  );
}
