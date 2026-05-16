// Worked example for the Interactive Forms substrate (PR #2609).
// Renders MJ Application records via a React component, mounted by the
// Angular InteractiveFormComponent wrapper. The wrapper passes FormHostProps
// (entityName, record, mode, canEdit, etc.) as additional props alongside the
// standard utilities/callbacks/styles/components.
//
// Save flow:
//   1. User edits inputs -> local `draft` state mutates.
//   2. User clicks Save -> emit `BeforeSave` with the dirty-field diff.
//   3. Wrapper applies the diff to the BaseEntity, calls record.Save(),
//      emits `AfterSave`.
//
// Mode handling:
//   - `mode` from props is the source of truth.
//   - We never call setState({ mode }); we request a switch with
//     `EditModeChangeRequested` and let the wrapper toggle the real mode,
//     which re-flows props in (FormHostProps).

function InteractiveApplicationForm({
  // FormHostProps (from the Angular wrapper)
  entityName,
  primaryKey,
  record,
  entityMetadata,
  mode,
  canEdit,
  canDelete,
  canCreate,
  // Standard component props
  utilities,
  styles,
  components,
  callbacks,
  savedUserSettings,
  onSaveUserSettings,
}) {
  const [draft, setDraft] = React.useState({});

  // Reset draft whenever a new record loads or we re-enter view mode.
  React.useEffect(() => {
    setDraft({});
  }, [primaryKey && JSON.stringify(primaryKey), mode === 'view']);

  const value = (field) => (field in draft ? draft[field] : record?.[field]);
  const isDirty = Object.keys(draft).length > 0;
  const editing = mode === 'edit' || mode === 'create';

  const setField = (field, v) => {
    setDraft((d) => ({ ...d, [field]: v }));
    callbacks?.NotifyEvent?.('FieldChanged', {
      fieldName: field,
      oldValue: record?.[field],
      newValue: v,
      timestamp: new Date(),
    });
  };

  const requestEdit = () =>
    callbacks?.NotifyEvent?.('EditModeChangeRequested', {
      requestedMode: 'edit',
      cancel: false,
      timestamp: new Date(),
    });

  const requestCancel = () => {
    setDraft({});
    callbacks?.NotifyEvent?.('EditModeChangeRequested', {
      requestedMode: 'view',
      cancel: false,
      timestamp: new Date(),
    });
  };

  const requestSave = () => {
    callbacks?.NotifyEvent?.('BeforeSave', {
      dirtyFields: { ...draft },
      cancel: false,
      timestamp: new Date(),
    });
    // Wrapper handles the actual Save and re-flows mode/record back via props.
    // We optimistically clear our local diff; if the save fails, the wrapper
    // keeps record as-is and our `value()` falls back to record fields.
    setDraft({});
  };

  // ── styles ─────────────────────────────────────────────────────────────
  const colors = {
    panel: 'var(--mj-bg-surface, #fff)',
    border: 'var(--mj-border-default, #e0e0e0)',
    text: 'var(--mj-text-primary, #1f2937)',
    muted: 'var(--mj-text-muted, #64748b)',
    primary: 'var(--mj-brand-primary, #5B4FE9)',
    primaryHover: 'var(--mj-brand-primary-hover, #4538d6)',
    success: 'var(--mj-status-success, #16a34a)',
    successBg: 'var(--mj-status-success-bg, #dcfce7)',
    badge: 'var(--mj-bg-surface-sunken, #f1f5f9)',
  };

  const wrap = {
    padding: 24,
    background: colors.panel,
    color: colors.text,
    fontFamily: '-apple-system, "Inter", "Segoe UI", Roboto, sans-serif',
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
  };

  const header = {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    paddingBottom: 16,
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: 20,
  };

  const iconBox = {
    width: 56,
    height: 56,
    borderRadius: 12,
    background: colors.badge,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    color: colors.primary,
    flexShrink: 0,
  };

  const titleBlock = { flex: 1, minWidth: 0 };

  const title = {
    margin: 0,
    fontSize: 22,
    fontWeight: 600,
    lineHeight: 1.2,
    color: colors.text,
  };

  const subtitle = {
    margin: '4px 0 0',
    fontSize: 13,
    color: colors.muted,
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  };

  const badge = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    background: colors.badge,
    borderRadius: 999,
    fontSize: 12,
    color: colors.text,
  };

  const successBadge = {
    ...badge,
    background: colors.successBg,
    color: colors.success,
  };

  const fieldRow = { display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, padding: '10px 0', alignItems: 'start' };
  const label = { color: colors.muted, fontSize: 13, paddingTop: 6 };
  const textInput = {
    width: '100%',
    padding: '8px 12px',
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    fontSize: 14,
    color: colors.text,
    background: colors.panel,
    boxSizing: 'border-box',
  };
  const textArea = { ...textInput, minHeight: 80, fontFamily: 'inherit', resize: 'vertical' };
  const readOnlyValue = { padding: '6px 0', fontSize: 14, color: colors.text, whiteSpace: 'pre-wrap' };

  const footer = {
    display: 'flex',
    gap: 8,
    paddingTop: 16,
    marginTop: 20,
    borderTop: `1px solid ${colors.border}`,
  };

  const btn = {
    padding: '8px 16px',
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    background: colors.panel,
    color: colors.text,
    fontSize: 14,
    cursor: 'pointer',
  };

  const primaryBtn = {
    ...btn,
    background: colors.primary,
    color: '#fff',
    borderColor: colors.primary,
    fontWeight: 500,
  };

  // ── render ─────────────────────────────────────────────────────────────
  if (!record) {
    return React.createElement('div', { style: { ...wrap, color: colors.muted } }, 'No application record loaded.');
  }

  const name = value('Name') ?? '';
  const description = value('Description') ?? '';
  const icon = value('Icon') ?? 'fa-cube';
  const defaultForNewUser = !!value('DefaultForNewUser');
  const status = value('Status') ?? '';

  return React.createElement(
    'div',
    { style: wrap },

    // header
    React.createElement(
      'div',
      { style: header },
      React.createElement('div', { style: iconBox }, React.createElement('i', { className: `fa-solid ${icon}` })),
      React.createElement(
        'div',
        { style: titleBlock },
        React.createElement('h2', { style: title }, name || '(unnamed application)'),
        React.createElement(
          'div',
          { style: subtitle },
          React.createElement('span', { style: badge }, '🧪  Interactive Form (PR #2609 example)'),
          status &&
            React.createElement('span', { style: status === 'Active' ? successBadge : badge }, status),
          defaultForNewUser && React.createElement('span', { style: successBadge }, 'Default for new users'),
        ),
      ),
    ),

    // fields
    React.createElement(
      'div',
      null,
      React.createElement(
        'div',
        { style: fieldRow },
        React.createElement('div', { style: label }, 'Name'),
        editing
          ? React.createElement('input', {
              type: 'text',
              style: textInput,
              value: name,
              onChange: (e) => setField('Name', e.target.value),
              disabled: !canEdit && !canCreate,
            })
          : React.createElement('div', { style: readOnlyValue }, name || '—'),
      ),
      React.createElement(
        'div',
        { style: fieldRow },
        React.createElement('div', { style: label }, 'Description'),
        editing
          ? React.createElement('textarea', {
              style: textArea,
              value: description,
              onChange: (e) => setField('Description', e.target.value),
              disabled: !canEdit && !canCreate,
            })
          : React.createElement('div', { style: readOnlyValue }, description || '—'),
      ),
      React.createElement(
        'div',
        { style: fieldRow },
        React.createElement('div', { style: label }, 'Icon'),
        editing
          ? React.createElement('input', {
              type: 'text',
              style: textInput,
              value: icon,
              placeholder: 'fa-* class name (e.g. fa-cube)',
              onChange: (e) => setField('Icon', e.target.value),
              disabled: !canEdit && !canCreate,
            })
          : React.createElement('div', { style: readOnlyValue }, icon || '—'),
      ),
      React.createElement(
        'div',
        { style: fieldRow },
        React.createElement('div', { style: label }, 'Default for new users'),
        editing
          ? React.createElement('input', {
              type: 'checkbox',
              checked: defaultForNewUser,
              onChange: (e) => setField('DefaultForNewUser', e.target.checked),
              disabled: !canEdit && !canCreate,
            })
          : React.createElement('div', { style: readOnlyValue }, defaultForNewUser ? 'Yes' : 'No'),
      ),
    ),

    // footer
    React.createElement(
      'div',
      { style: footer },
      editing
        ? React.createElement(
            React.Fragment,
            null,
            React.createElement(
              'button',
              { style: primaryBtn, onClick: requestSave, disabled: !isDirty },
              isDirty ? 'Save' : 'No changes',
            ),
            React.createElement('button', { style: btn, onClick: requestCancel }, 'Cancel'),
          )
        : canEdit
          ? React.createElement('button', { style: primaryBtn, onClick: requestEdit }, 'Edit')
          : null,
    ),
  );
}
