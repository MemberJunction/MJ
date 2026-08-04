/**
 * Pure-function code generator: FormCanvasModel → JSX string.
 *
 * The output conforms to the form-role component contract:
 *  - Destructures FormHostProps (record, mode, entityMetadata, callbacks, ...)
 *  - Maintains a local draft diff so edits don't mutate the BaseEntity snapshot
 *  - Registers RequestSave / RequestCancel via callbacks.RegisterMethod
 *  - Emits BeforeSave with dirtyFields when the host toolbar fires Save
 *  - No Save / Cancel buttons in the body — the host toolbar owns them
 *  - References only fields from the curated schema (linter requirement)
 *
 * This file is *intentionally* a pure function with no side effects so it can
 * be unit-tested without DOM / Angular wiring.
 */
import type { CuratedFormSchema, CuratedFormField } from '@memberjunction/interactive-component-types/forms';
import type { FormCanvasModel, FormCanvasSection, FormCanvasElement } from './form-canvas-model';

/**
 * Build a JS-safe identifier from a free-form component name. Caller is
 * responsible for handling empty results.
 */
export function toComponentIdentifier(name: string): string {
    const cleaned = name.replace(/[^A-Za-z0-9]/g, '');
    if (!cleaned) return 'Form';
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Generate the full Component code string from a canvas model.
 *
 * @param canvas - the canvas model to render
 * @param schema - the curated form schema for the canvas's entity (used to
 *   resolve field types / FK display fields / enum allowed values)
 * @param componentName - human-readable component name (used for the JS
 *   function identifier)
 */
export function generateCodeFromCanvas(
    canvas: FormCanvasModel,
    schema: CuratedFormSchema,
    componentName: string,
): string {
    const fnName = toComponentIdentifier(componentName);
    const fieldsByName = new Map<string, CuratedFormField>(
        schema.fields.map(f => [f.name, f]),
    );

    const sectionBlocks = canvas.sections
        .map(section => renderSection(section, fieldsByName))
        .filter(s => s.length > 0)
        .join('\n\n');

    const title = canvas.title?.trim() || schema.displayName;

    return [
        `function ${fnName}({`,
        `  entityName,`,
        `  primaryKey,`,
        `  record,`,
        `  entityMetadata,`,
        `  mode,`,
        `  canEdit,`,
        `  canDelete,`,
        `  canCreate,`,
        `  utilities,`,
        `  styles,`,
        `  components,`,
        `  callbacks,`,
        `  savedUserSettings,`,
        `  onSaveUserSettings,`,
        `}) {`,
        `  const [draft, setDraft] = React.useState({});`,
        `  const [fkOptions, setFkOptions] = React.useState({});`,
        ``,
        `  // Track the latest draft in a ref so the registered methods always`,
        `  // see fresh values without re-registering on every keystroke. The`,
        `  // ref is updated SYNCHRONOUSLY inside setField below — relying on a`,
        `  // useEffect to sync would create a race where Save reads a stale`,
        `  // draft if it fires before the effect commits.`,
        `  const draftRef = React.useRef({});`,
        ``,
        `  const isCreate = mode === "create";`,
        `  const isEdit = mode === "edit";`,
        `  const isView = mode === "view";`,
        `  const editing = isEdit || isCreate;`,
        ``,
        `  // Reset draft on new record load. Keep the ref in sync.`,
        `  React.useEffect(() => {`,
        `    draftRef.current = {};`,
        `    setDraft({});`,
        `  }, [primaryKey && JSON.stringify(primaryKey)]);`,
        ``,
        `  // Register the host-callable methods exactly once.`,
        `  React.useEffect(() => {`,
        `    callbacks?.RegisterMethod?.("RequestSave", () => {`,
        `      callbacks?.NotifyEvent?.("BeforeSave", {`,
        `        dirtyFields: { ...draftRef.current },`,
        `        cancel: false,`,
        `        timestamp: new Date(),`,
        `      });`,
        `    });`,
        `    callbacks?.RegisterMethod?.("RequestCancel", () => {`,
        `      draftRef.current = {};`,
        `      setDraft({});`,
        `    });`,
        `  }, []);`,
        ``,
        renderFkLoaders(canvas, fieldsByName),
        ``,
        `  const value = (f) => (f in draft ? draft[f] : record?.[f] ?? "");`,
        ``,
        `  const setField = (f, v) => {`,
        `    // Update the ref SYNCHRONOUSLY so RequestSave (which reads via`,
        `    // draftRef) always sees the latest values, even if Save fires`,
        `    // before React commits the next render.`,
        `    draftRef.current = { ...draftRef.current, [f]: v };`,
        `    setDraft(draftRef.current);`,
        `    callbacks?.NotifyEvent?.("FieldChanged", {`,
        `      fieldName: f,`,
        `      oldValue: record?.[f],`,
        `      newValue: v,`,
        `      timestamp: new Date(),`,
        `    });`,
        `  };`,
        ``,
        `  if (!record && !isCreate) {`,
        `    return <div style={{ padding: 24 }}>No record loaded.</div>;`,
        `  }`,
        ``,
        `  return (`,
        `    <div style={{`,
        `      padding: 24,`,
        `      background: "var(--mj-bg-surface)",`,
        `      color: "var(--mj-text-primary)",`,
        `      borderRadius: 8,`,
        `      border: "1px solid var(--mj-border-default)",`,
        `      display: "flex",`,
        `      flexDirection: "column",`,
        `      gap: 20,`,
        `    }}>`,
        `      <h2 style={{ margin: 0, color: "var(--mj-text-primary)" }}>${escapeJsxText(title)}</h2>`,
        sectionBlocks ? indent(sectionBlocks, 6) : '      {/* No sections — add some in Form Studio. */}',
        `    </div>`,
        `  );`,
        `}`,
    ].join('\n');
}

/**
 * Render a single section: header + grid of elements. Elements that
 * reference fields not in the schema are skipped (linter would reject them).
 */
function renderSection(
    section: FormCanvasSection,
    fieldsByName: Map<string, CuratedFormField>,
): string {
    const elements = section.elements
        .map(el => renderElement(el, fieldsByName, section.columns))
        .filter(s => s.length > 0);

    if (elements.length === 0 && !section.title) {
        return '';
    }

    const gridStyle = section.columns === 2
        ? '{{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}'
        : '{{ display: "flex", flexDirection: "column", gap: 12 }}';

    return [
        `<section style={{ display: "flex", flexDirection: "column", gap: 12 }}>`,
        section.title
            ? `  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--mj-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>${escapeJsxText(section.title)}</h3>`
            : '',
        `  <div style=${gridStyle}>`,
        ...elements.map(e => indent(e, 4)),
        `  </div>`,
        `</section>`,
    ].filter(s => s.length > 0).join('\n');
}

/**
 * Render a single element. Routes to type-specific renderers and respects
 * the per-element column span.
 */
function renderElement(
    el: FormCanvasElement,
    fieldsByName: Map<string, CuratedFormField>,
    sectionColumns: 1 | 2,
): string {
    const span = sectionColumns === 2 && el.span === 2 ? ' gridColumn: "span 2",' : '';
    const wrapperStyleOpen = `<div style={{ display: "flex", flexDirection: "column", gap: 4,${span} }}>`;
    const wrapperClose = `</div>`;

    if (el.type === 'static-text') {
        return [
            wrapperStyleOpen,
            `  <div style={{ color: "var(--mj-text-secondary)", fontSize: 13 }}>${escapeJsxText(el.text ?? '')}</div>`,
            wrapperClose,
        ].join('\n');
    }

    if (el.type === 'spacer') {
        return `<div style={{ minHeight: 12,${span} }} />`;
    }

    if (el.type === 'computed') {
        // Expression is rendered as a runtime expression against `record`.
        // We don't validate it here — the linter / runtime will surface bugs.
        const expr = (el.expression ?? '""').trim() || '""';
        return [
            wrapperStyleOpen,
            el.label
                ? `  <label style={{ fontSize: 11, color: "var(--mj-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>${escapeJsxText(el.label)}</label>`
                : '',
            `  <div>{(() => { try { return ${expr}; } catch (e) { return "—"; } })()}</div>`,
            el.helper ? `  <small style={{ color: "var(--mj-text-muted)" }}>${escapeJsxText(el.helper)}</small>` : '',
            wrapperClose,
        ].filter(Boolean).join('\n');
    }

    // type === 'field'
    if (!el.fieldName) return '';
    const field = fieldsByName.get(el.fieldName);
    if (!field) return '';

    const label = el.label ?? field.displayName ?? field.name;
    const required = el.required ?? field.required;
    const labelMarkup = `<label style={{ fontSize: 11, color: "var(--mj-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>${escapeJsxText(label)}${required ? ' <span style={{ color: "var(--mj-status-error)" }}>*</span>' : ''}</label>`;
    const helperMarkup = el.helper
        ? `<small style={{ color: "var(--mj-text-muted)" }}>${escapeJsxText(el.helper)}</small>`
        : '';

    const inputMarkup = renderFieldInput(field);

    return [
        wrapperStyleOpen,
        `  ${labelMarkup}`,
        `  ${inputMarkup}`,
        helperMarkup ? `  ${helperMarkup}` : '',
        wrapperClose,
    ].filter(Boolean).join('\n');
}

/**
 * Type-appropriate input rendering. Returns a single JSX expression.
 * Inputs are styled with token-backed CSS so they adapt to the host theme.
 */
function renderFieldInput(field: CuratedFormField): string {
    const baseStyle = 'padding: "8px 10px", border: "1px solid var(--mj-border-default)", borderRadius: 4, background: "var(--mj-bg-surface)", color: "var(--mj-text-primary)", fontFamily: "inherit", fontSize: 13';
    const name = field.name;

    switch (field.type) {
        case 'boolean':
            return [
                `{editing`,
                `    ? <input type="checkbox" checked={!!value("${name}")} onChange={(e) => setField("${name}", e.target.checked)} />`,
                `    : <div>{value("${name}") ? "Yes" : "No"}</div>}`,
            ].join('\n  ');

        case 'datetime':
            return [
                `{editing`,
                `    ? <input type="datetime-local" style={{ ${baseStyle} }} value={value("${name}") ? new Date(value("${name}")).toISOString().slice(0, 16) : ""} onChange={(e) => setField("${name}", e.target.value ? new Date(e.target.value).toISOString() : null)} />`,
                `    : <div>{value("${name}") ? new Date(value("${name}")).toLocaleString() : "—"}</div>}`,
            ].join('\n  ');

        case 'number':
            return [
                `{editing`,
                `    ? <input type="number" style={{ ${baseStyle} }} value={value("${name}") ?? ""} onChange={(e) => setField("${name}", e.target.value === "" ? null : Number(e.target.value))} />`,
                `    : <div>{value("${name}") ?? "—"}</div>}`,
            ].join('\n  ');

        case 'enum': {
            const opts = (field.allowedValues ?? [])
                .map(v => `      <option value=${escapeJsxAttr(v)}>${escapeJsxText(v)}</option>`)
                .join('\n');
            return [
                `{editing`,
                `    ? (<select style={{ ${baseStyle} }} value={value("${name}") ?? ""} onChange={(e) => setField("${name}", e.target.value)}>`,
                `        <option value="">—</option>`,
                opts,
                `      </select>)`,
                `    : <div>{value("${name}") ?? "—"}</div>}`,
            ].join('\n  ');
        }

        case 'foreign-key': {
            const display = field.references?.displayField ?? 'ID';
            return [
                `{editing`,
                `    ? (<select style={{ ${baseStyle} }} value={(value("${name}")?.ID) ?? value("${name}") ?? ""} onChange={(e) => setField("${name}", e.target.value || null)}>`,
                `        <option value="">—</option>`,
                `        {(fkOptions["${name}"] || []).map((o) => <option key={o.ID} value={o.ID}>{o.${safeIdent(display)}}</option>)}`,
                `      </select>)`,
                `    : <div>{(value("${name}")?.${safeIdent(display)}) ?? value("${name}") ?? "—"}</div>}`,
            ].join('\n  ');
        }

        case 'string':
        default: {
            const useTextarea = (field.maxLength ?? 0) === 0 || (field.maxLength ?? 0) > 200;
            if (useTextarea) {
                return [
                    `{editing`,
                    `    ? <textarea style={{ ${baseStyle}, minHeight: 80, fontFamily: "inherit", resize: "vertical" }} value={value("${name}") ?? ""} onChange={(e) => setField("${name}", e.target.value)} />`,
                    `    : <div style={{ whiteSpace: "pre-wrap" }}>{value("${name}") || "—"}</div>}`,
                ].join('\n  ');
            }
            return [
                `{editing`,
                `    ? <input type="text" style={{ ${baseStyle} }} value={value("${name}") ?? ""} onChange={(e) => setField("${name}", e.target.value)} />`,
                `    : <div>{value("${name}") || "—"}</div>}`,
            ].join('\n  ');
        }
    }
}

/**
 * Emit useEffect blocks that lazy-load FK option lists via
 * `utilities.rv.RunView`. Triggered only for foreign-key fields actually
 * referenced on the canvas.
 *
 * Returned string is empty when no FK fields are present, so the output
 * stays tight.
 */
function renderFkLoaders(
    canvas: FormCanvasModel,
    fieldsByName: Map<string, CuratedFormField>,
): string {
    const fkNames = new Set<string>();
    for (const section of canvas.sections) {
        for (const el of section.elements) {
            if (el.type !== 'field' || !el.fieldName) continue;
            const field = fieldsByName.get(el.fieldName);
            if (field?.type === 'foreign-key' && field.references?.entity) {
                fkNames.add(field.name);
            }
        }
    }
    if (fkNames.size === 0) return '';

    const loaders = Array.from(fkNames).map(n => {
        const field = fieldsByName.get(n);
        if (!field?.references?.entity) return '';
        const entity = field.references.entity;
        const displayField = field.references.displayField ?? 'ID';
        return [
            `  React.useEffect(() => {`,
            `    if (!editing) return;`,
            `    let cancelled = false;`,
            `    (async () => {`,
            `      const r = await utilities.rv.RunView({`,
            `        EntityName: ${JSON.stringify(entity)},`,
            `        Fields: ["ID", ${JSON.stringify(displayField)}],`,
            `        MaxRows: 200,`,
            `        ResultType: "simple",`,
            `      });`,
            `      if (cancelled) return;`,
            `      if (r?.Success && Array.isArray(r.Results)) {`,
            `        setFkOptions((m) => ({ ...m, ${JSON.stringify(n)}: r.Results }));`,
            `      }`,
            `    })();`,
            `    return () => { cancelled = true; };`,
            `  }, [editing]);`,
        ].join('\n');
    }).filter(s => s.length > 0);

    return loaders.join('\n\n');
}

/* ---------- string helpers ---------- */

function escapeJsxText(s: string): string {
    return s.replace(/[<>{}]/g, ch => {
        switch (ch) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '{': return '&#123;';
            case '}': return '&#125;';
        }
        return ch;
    });
}

/** Stringify an attribute value as a JSX attribute (always wraps in {"…"}). */
function escapeJsxAttr(s: string): string {
    return `{${JSON.stringify(s)}}`;
}

/**
 * Ensure a display field name is a safe JS identifier. Falls back to
 * bracket access if not. Most MJ display fields are "Name" or "Title" so
 * the simple path dominates.
 */
function safeIdent(name: string): string {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name;
    return `["${name.replace(/"/g, '\\"')}"]`;
}

function indent(block: string, spaces: number): string {
    const pad = ' '.repeat(spaces);
    return block.split('\n').map(line => line.length === 0 ? line : pad + line).join('\n');
}
