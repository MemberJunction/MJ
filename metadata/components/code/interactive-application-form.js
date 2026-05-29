// Worked example for the Interactive Forms substrate (PR #2609).
// Renders MJ Application records via a React component, mounted by the
// Angular InteractiveFormComponent wrapper.
//
// Modes (driven by FormHostProps.mode from the wrapper):
//   - view   : read-only card — no buttons (toolbar above handles Edit/Delete)
//   - edit   : inputs editable — no buttons (toolbar above handles Save/Cancel)
//   - create : header swaps to "New Application" — no buttons (toolbar handles)
//
// Toolbar wiring (Save / Cancel come from <mj-record-form-container>, not here):
//   1. Component registers `RequestSave` + `RequestCancel` methods via
//      `callbacks.RegisterMethod` in a useEffect.
//   2. Host toolbar Save -> wrapper invokes `RequestSave` on this component.
//   3. `RequestSave` handler emits `BeforeSave({ dirtyFields })` -> wrapper
//      applies diff to BaseEntity -> record.Save() -> re-flows new record.
//   4. Host toolbar Cancel -> wrapper invokes `RequestCancel` -> handler
//      clears local draft -> wrapper calls EndEditMode -> re-flows mode='view'.
//
// We use a draftRef so the registered method always reads the latest draft
// (registering inside a useEffect with `[draft]` would re-register on every
// keystroke, which is wasteful; useRef tracks the current value without
// breaking the closure).
//
// Mode handling rule of thumb: never setState({ mode }) locally. The wrapper
// owns mode; this component only reads it from FormHostProps.

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

  // Track latest draft in a ref so the methods we register below always see
  // the current value without us having to re-register on every keystroke.
  const draftRef = React.useRef({});
  React.useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const isCreate = mode === "create";
  const isEdit = mode === "edit";
  const isView = mode === "view";
  const editing = isEdit || isCreate;

  // Reset draft when a new record loads, or when we return to view mode.
  React.useEffect(() => {
    setDraft({});
  }, [primaryKey && JSON.stringify(primaryKey), isView]);

  // Register the host-callable methods exactly once. The wrapper invokes
  // these when the toolbar fires Save / Cancel — that's how the toolbar
  // above this component gets the React draft state flushed.
  React.useEffect(() => {
    callbacks?.RegisterMethod?.("RequestSave", () => {
      callbacks?.NotifyEvent?.("BeforeSave", {
        dirtyFields: { ...draftRef.current },
        cancel: false,
        timestamp: new Date(),
      });
      // Don't clear draft here — wait for the wrapper to confirm save
      // succeeded and re-flow the record. If save fails, the draft is
      // still around for the user to retry.
    });
    callbacks?.RegisterMethod?.("RequestCancel", () => {
      setDraft({});
      // Wrapper will EndEditMode itself after this method returns.
    });
  }, []);

  const value = (field) => (field in draft ? draft[field] : record?.[field]);

  const setField = (field, v) => {
    setDraft((d) => ({ ...d, [field]: v }));
    callbacks?.NotifyEvent?.("FieldChanged", {
      fieldName: field,
      oldValue: record?.[field],
      newValue: v,
      timestamp: new Date(),
    });
  };

  // ── styles ─────────────────────────────────────────────────────────────
  const colors = {
    panel: "var(--mj-bg-surface, #fff)",
    border: "var(--mj-border-default, #e0e0e0)",
    text: "var(--mj-text-primary, #1f2937)",
    muted: "var(--mj-text-muted, #64748b)",
    primary: "var(--mj-brand-primary, #5B4FE9)",
    primaryHover: "var(--mj-brand-primary-hover, #4538d6)",
    success: "var(--mj-status-success, #16a34a)",
    successBg: "var(--mj-status-success-bg, #dcfce7)",
    danger: "var(--mj-status-error, #dc2626)",
    dangerBg: "var(--mj-status-error-bg, #fee2e2)",
    badge: "var(--mj-bg-surface-sunken, #f1f5f9)",
    createBg: "var(--mj-status-info-bg, #dbeafe)",
    createText: "var(--mj-status-info-text, #1e40af)",
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
    display: "flex",
    alignItems: "center",
    gap: 16,
    paddingBottom: 16,
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: 20,
  };

  const createHeader = {
    paddingBottom: 16,
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: 20,
  };

  const iconBox = {
    width: 56,
    height: 56,
    borderRadius: 12,
    background: colors.badge,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
    margin: "4px 0 0",
    fontSize: 13,
    color: colors.muted,
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  };

  const badge = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
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

  const createBadge = {
    ...badge,
    background: colors.createBg,
    color: colors.createText,
  };

  const fieldRow = { display: "grid", gridTemplateColumns: "160px 1fr", gap: 12, padding: "10px 0", alignItems: "start" };
  const label = { color: colors.muted, fontSize: 13, paddingTop: 6 };
  const textInput = {
    width: "100%",
    padding: "8px 12px",
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    fontSize: 14,
    color: colors.text,
    background: colors.panel,
    boxSizing: "border-box",
  };
  const textArea = { ...textInput, minHeight: 80, fontFamily: "inherit", resize: "vertical" };
  const readOnlyValue = { padding: "6px 0", fontSize: 14, color: colors.text, whiteSpace: "pre-wrap" };

  // No button/footer styles — Edit / Save / Cancel / Delete all come from
  // the host's <mj-record-form-container> toolbar above this component.

  // ── render ─────────────────────────────────────────────────────────────
  if (!record) {
    return <div style={{ ...wrap, color: colors.muted }}>No application record loaded.</div>;
  }

  const name = value("Name") ?? "";
  const description = value("Description") ?? "";
  const icon = value("Icon") ?? "fa-cube";
  const defaultForNewUser = !!value("DefaultForNewUser");
  const status = value("Status") ?? "";

  // Header: distinct treatment in create mode so the user knows they're
  // making a fresh record (no name yet, no status badge, no icon to render).
  const renderHeader = () => {
    if (isCreate) {
      return (
        <div style={createHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={createBadge}>＋ New Application</span>
            <span style={badge}>🧪 PR #2609 example (create mode)</span>
          </div>
          <h2 style={{ ...title, marginTop: 12 }}>{name || "Untitled application"}</h2>
          <p style={{ ...subtitle, marginTop: 4 }}>Fill in the fields below, then Save to create.</p>
        </div>
      );
    }
    return (
      <div style={header}>
        <div style={iconBox}>
          <i className={`fa-solid ${icon}`} />
        </div>
        <div style={titleBlock}>
          <h2 style={title}>{name || "(unnamed application)"}</h2>
          <div style={subtitle}>
            <span style={badge}>🧪 Interactive Form (PR #2609 example)</span>
            {status && <span style={status === "Active" ? successBadge : badge}>{status}</span>}
            {defaultForNewUser && <span style={successBadge}>Default for new users</span>}
          </div>
        </div>
      </div>
    );
  };

  // No in-form footer. Edit / Save / Cancel / Delete are all owned by the
  // host's <mj-record-form-container> toolbar above this component. When
  // the toolbar fires Save, the wrapper invokes `RequestSave` (registered
  // in the useEffect above) which emits BeforeSave with the current draft;
  // same for Cancel via `RequestCancel`.

  return (
    <div style={wrap}>
      {renderHeader()}

      {/* fields — always render, but use input vs read-only display based on `editing` */}
      <div>
        <div style={fieldRow}>
          <div style={label}>Name</div>
          {editing ? (
            <input
              type="text"
              style={textInput}
              value={name}
              onChange={(e) => setField("Name", e.target.value)}
              disabled={!canEdit && !canCreate}
              placeholder={isCreate ? "My Application" : ""}
            />
          ) : (
            <div style={readOnlyValue}>{name || "—"}</div>
          )}
        </div>
        <div style={fieldRow}>
          <div style={label}>Description</div>
          {editing ? (
            <textarea
              style={textArea}
              value={description}
              onChange={(e) => setField("Description", e.target.value)}
              disabled={!canEdit && !canCreate}
              placeholder={isCreate ? "What does this application do?" : ""}
            />
          ) : (
            <div style={readOnlyValue}>{description || "—"}</div>
          )}
        </div>
        <div style={fieldRow}>
          <div style={label}>Icon</div>
          {editing ? (
            <input
              type="text"
              style={textInput}
              value={icon}
              placeholder="fa-* class name (e.g. fa-cube)"
              onChange={(e) => setField("Icon", e.target.value)}
              disabled={!canEdit && !canCreate}
            />
          ) : (
            <div style={readOnlyValue}>{icon || "—"}</div>
          )}
        </div>
        <div style={fieldRow}>
          <div style={label}>Default for new users</div>
          {editing ? (
            <input
              type="checkbox"
              checked={defaultForNewUser}
              onChange={(e) => setField("DefaultForNewUser", e.target.checked)}
              disabled={!canEdit && !canCreate}
            />
          ) : (
            <div style={readOnlyValue}>{defaultForNewUser ? "Yes" : "No"}</div>
          )}
        </div>
      </div>

      {/* No footer — toolbar handles Save / Cancel / Edit / Delete. */}
    </div>
  );
}
