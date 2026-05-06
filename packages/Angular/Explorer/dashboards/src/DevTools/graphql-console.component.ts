import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ViewChild, HostListener, inject } from '@angular/core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { EntityInfo, EntityFieldInfo, getGraphQLTypeNameBase } from '@memberjunction/core';
import { GraphQLDataProvider, FieldMapper } from '@memberjunction/graphql-dataprovider';
import { DevToolsPrefs } from './dev-tools-prefs';

interface HistoryEntry {
    id: string;
    query: string;
    variables: string;
    timestamp: Date;
    durationMs?: number;
    status: 'ok' | 'error' | 'pending';
    favorite: boolean;
    label?: string;
}

/** GraphQL introspection — minimal subset sufficient for the explorer. */
interface IntrospectedTypeRef {
    kind: 'NON_NULL' | 'LIST' | 'SCALAR' | 'OBJECT' | 'ENUM' | 'INPUT_OBJECT' | 'INTERFACE' | 'UNION' | string;
    name: string | null;
    ofType?: IntrospectedTypeRef | null;
}
interface IntrospectedArg {
    name: string;
    description?: string | null;
    type: IntrospectedTypeRef;
    defaultValue?: string | null;
}
interface IntrospectedField {
    name: string;
    description?: string | null;
    args: IntrospectedArg[];
    type: IntrospectedTypeRef;
}
interface IntrospectedType {
    kind: string;
    name: string;
    description?: string | null;
    fields?: IntrospectedField[] | null;
}
interface SchemaOperation {
    name: string;
    kind: 'query' | 'mutation';
    description: string;
    argSummary: string;
    returnSummary: string;
    field: IntrospectedField;
}

type SidebarTab = 'history' | 'schema' | 'entities';
type EntityOpKind = 'view' | 'byId' | 'create' | 'update' | 'delete';

interface EntityListItem {
    info: EntityInfo;
    typeName: string;
    schema: string;
    /** True when this entity is currently expanded showing operation buttons. */
    expanded: boolean;
}

const PREFS_KEY = 'graphqlConsole';
const HISTORY_LIMIT = 30;

const SAMPLE_QUERY = `# Welcome to the GraphQL Console
# Press Cmd/Ctrl+Enter to run.
# Authentication is handled by the active GraphQL provider.

query GetCurrentUser {
  CurrentUser {
    ID
    Name
    Email
  }
}
`;

/**
 * GraphQL Console — write and run arbitrary GraphQL queries against the
 * connected MJ API. Re-uses the active GraphQLDataProvider client (auth +
 * session intact). Local history with copy / favorite / replay; copy-as-curl;
 * keyboard shortcut (Cmd/Ctrl+Enter) to run.
 */
@RegisterClass(BaseResourceComponent, 'GraphQLConsoleInspector')
@Component({
    standalone: false,
    selector: 'mj-graphql-console',
    templateUrl: './graphql-console.component.html',
    styleUrls: ['./inspector-shared.css', './graphql-console.component.css']
})
export class GraphQLConsoleComponent extends BaseResourceComponent implements OnInit, OnDestroy {

    @ViewChild('queryEditor') queryEditor?: ElementRef<HTMLTextAreaElement>;

    public Query = SAMPLE_QUERY;
    public Variables = '{}';
    public ShowVariables = false;

    public Running = false;
    public ResponseJson = '';
    public ResponseStatus: 'ok' | 'error' | 'idle' = 'idle';
    public ResponseDurationMs: number | null = null;
    public ResponseSizeBytes: number | null = null;
    public ErrorMessage: string | null = null;

    public History: HistoryEntry[] = [];
    public ShowHistory = true;
    public CopyConfirmed = false;

    public ApiUrl = '';

    // Schema explorer state
    public SidebarTab: SidebarTab = 'history';
    public SchemaLoading = false;
    public SchemaError: string | null = null;
    public SchemaIntrospectionDisabled = false;
    public SchemaSearch = '';
    public SchemaKindFilter: 'all' | 'query' | 'mutation' = 'all';
    public Operations: SchemaOperation[] = [];
    private schemaLoaded = false;

    // Entities tab state
    public EntitiesSearch = '';
    public Entities: EntityListItem[] = [];
    public EntitySchemaFilter = ''; // '' = all
    public KnownSchemas: string[] = [];

    // Pane sizing (resizable splitters)
    public SidebarWidthPx = 280;
    public EditorHeightPct = 50; // % of main pane height for editor (50/50 split default)
    private resizing: 'sidebar' | 'editor' | null = null;
    private elementRef = inject(ElementRef);

    constructor(private cdr: ChangeDetectorRef) {
        super();
    }

    public ngOnInit(): void {
        this.loadFromStorage();
        try {
            this.ApiUrl = GraphQLDataProvider.Instance.ConfigData?.URL ?? '';
        } catch { /* not configured */ }
        this.loadEntities();
        this.NotifyLoadComplete();
    }

    public ngOnDestroy(): void {
        this.saveToStorage();
        this.detachResizeListeners();
    }

    private loadEntities(): void {
        try {
            const md = this.ProviderToUse;
            if (!md) return;
            const items: EntityListItem[] = (md.Entities ?? []).map(e => ({
                info: e,
                typeName: getGraphQLTypeNameBase(e),
                schema: e.SchemaName ?? '(unknown)',
                expanded: false
            })).sort((a, b) => a.info.Name.localeCompare(b.info.Name));
            this.Entities = items;
            const schemas = new Set<string>();
            for (const i of items) schemas.add(i.schema);
            this.KnownSchemas = Array.from(schemas).sort();
        } catch { /* metadata not ready */ }
    }

    public override async GetResourceDisplayName(): Promise<string> { return 'GraphQL Console'; }
    public override async GetResourceIconClass(): Promise<string> { return 'fa-solid fa-code'; }

    @HostListener('keydown', ['$event'])
    public OnHostKeydown(event: KeyboardEvent): void {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            void this.OnRun();
        }
    }

    public async OnRun(): Promise<void> {
        const trimmedQuery = this.Query.trim();
        if (!trimmedQuery) {
            this.ErrorMessage = 'Query is empty.';
            return;
        }
        let parsedVars: Record<string, unknown> | null = null;
        if (this.Variables.trim()) {
            try {
                parsedVars = JSON.parse(this.Variables);
            } catch (err) {
                this.ResponseStatus = 'error';
                this.ErrorMessage = 'Variables must be valid JSON: ' + (err instanceof Error ? err.message : String(err));
                this.ResponseJson = '';
                this.cdr.markForCheck();
                return;
            }
        }

        this.Running = true;
        this.ErrorMessage = null;
        this.ResponseStatus = 'idle';
        this.ResponseJson = '';
        this.cdr.markForCheck();

        const start = performance.now();
        try {
            const data = await GraphQLDataProvider.ExecuteGQL(trimmedQuery, parsedVars);
            const elapsed = performance.now() - start;
            const text = JSON.stringify(data, null, 2);
            this.ResponseJson = text;
            this.ResponseStatus = 'ok';
            this.ResponseDurationMs = Math.round(elapsed);
            this.ResponseSizeBytes = new Blob([text]).size;
            this.recordHistory(trimmedQuery, this.Variables, 'ok', this.ResponseDurationMs);
        } catch (err: unknown) {
            const elapsed = performance.now() - start;
            this.ResponseStatus = 'error';
            this.ResponseDurationMs = Math.round(elapsed);
            const formatted = this.formatError(err);
            this.ResponseJson = formatted;
            this.ResponseSizeBytes = new Blob([formatted]).size;
            this.ErrorMessage = this.extractErrorSummary(err);
            this.recordHistory(trimmedQuery, this.Variables, 'error', this.ResponseDurationMs);
        } finally {
            this.Running = false;
            this.cdr.markForCheck();
        }
    }

    public OnRestoreHistory(entry: HistoryEntry): void {
        this.Query = entry.query;
        this.Variables = entry.variables;
        if (entry.variables.trim() && entry.variables.trim() !== '{}') {
            this.ShowVariables = true;
        }
        this.cdr.markForCheck();
    }

    public OnToggleFavorite(entry: HistoryEntry, event: Event): void {
        event.stopPropagation();
        entry.favorite = !entry.favorite;
        this.saveToStorage();
        this.cdr.markForCheck();
    }

    public OnDeleteHistory(entry: HistoryEntry, event: Event): void {
        event.stopPropagation();
        this.History = this.History.filter(h => h.id !== entry.id);
        this.saveToStorage();
        this.cdr.markForCheck();
    }

    public OnClearHistory(): void {
        // Keep favorites
        this.History = this.History.filter(h => h.favorite);
        this.saveToStorage();
        this.cdr.markForCheck();
    }

    public async OnCopyResponse(): Promise<void> {
        if (!this.ResponseJson) return;
        try {
            await navigator.clipboard.writeText(this.ResponseJson);
            this.CopyConfirmed = true;
            setTimeout(() => { this.CopyConfirmed = false; this.cdr.markForCheck(); }, 1800);
            this.cdr.markForCheck();
        } catch { /* unavailable */ }
    }

    public async OnCopyAsCurl(): Promise<void> {
        const url = this.ApiUrl || '<API_URL>';
        const body = JSON.stringify({
            query: this.Query.trim(),
            variables: this.Variables.trim() ? JSON.parse(this.Variables) : null
        });
        const escaped = body.replace(/'/g, `'\\''`);
        const curl = [
            `curl -X POST '${url}'`,
            `  -H 'Content-Type: application/json'`,
            `  -H 'Authorization: Bearer <YOUR_TOKEN>'`,
            `  -d '${escaped}'`
        ].join(' \\\n');
        try { await navigator.clipboard.writeText(curl); } catch { /* unavailable */ }
    }

    public OnFormatQuery(): void {
        // Tiny pretty-printer: collapse multiple blank lines + trim trailing whitespace
        this.Query = this.Query
            .split('\n')
            .map(line => line.replace(/\s+$/, ''))
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim() + '\n';
    }

    public ToggleHistoryPanel(): void {
        this.ShowHistory = !this.ShowHistory;
    }

    public ToggleVariables(): void {
        this.ShowVariables = !this.ShowVariables;
    }

    public OnSidebarTabChange(tab: SidebarTab): void {
        this.SidebarTab = tab;
        this.saveToStorage();
        if (tab === 'schema' && !this.schemaLoaded && !this.SchemaLoading) {
            void this.loadSchema();
        }
    }

    public async OnReloadSchema(): Promise<void> {
        this.schemaLoaded = false;
        await this.loadSchema();
    }

    public OnInsertOperation(op: SchemaOperation, event?: MouseEvent): void {
        const template = this.buildOperationTemplate(op);
        this.insertTemplate(template, !!event?.shiftKey);
    }

    public OnClearQuery(): void {
        this.Query = '';
        this.saveToStorage();
        this.cdr.markForCheck();
    }

    public get FilteredOperations(): SchemaOperation[] {
        const q = this.SchemaSearch.trim().toLowerCase();
        return this.Operations.filter(op => {
            if (this.SchemaKindFilter !== 'all' && op.kind !== this.SchemaKindFilter) return false;
            if (!q) return true;
            return op.name.toLowerCase().includes(q)
                || op.returnSummary.toLowerCase().includes(q)
                || op.description.toLowerCase().includes(q);
        });
    }

    public get OperationCounts(): { all: number; query: number; mutation: number } {
        const q = this.Operations.filter(o => o.kind === 'query').length;
        const m = this.Operations.filter(o => o.kind === 'mutation').length;
        return { all: this.Operations.length, query: q, mutation: m };
    }

    public TrackByOp = (_i: number, o: SchemaOperation) => o.kind + ':' + o.name;

    // ---------- Entities tab ----------

    public TrackByEntity = (_i: number, e: EntityListItem) => e.info.ID;

    public get FilteredEntities(): EntityListItem[] {
        const q = this.EntitiesSearch.trim().toLowerCase();
        return this.Entities.filter(e => {
            if (this.EntitySchemaFilter && e.schema !== this.EntitySchemaFilter) return false;
            if (!q) return true;
            return e.info.Name.toLowerCase().includes(q)
                || e.typeName.toLowerCase().includes(q)
                || e.schema.toLowerCase().includes(q)
                || (e.info.Description ?? '').toLowerCase().includes(q);
        });
    }

    public ToggleEntity(e: EntityListItem): void {
        e.expanded = !e.expanded;
    }

    public OnEntityOp(item: EntityListItem, op: EntityOpKind, event: MouseEvent): void {
        event.stopPropagation();
        const template = this.buildEntityOpTemplate(item, op);
        this.insertTemplate(template, !!event.shiftKey);
    }

    /**
     * Default: replace the editor contents with the new template.
     * Shift-click: append to the end (with a blank-line separator) so the
     * user can stage multiple operations in one document.
     */
    private insertTemplate(template: string, append: boolean): void {
        const trimmed = this.Query.trimEnd();
        const isFresh = trimmed.length === 0 || trimmed === SAMPLE_QUERY.trimEnd();
        if (append && !isFresh) {
            this.Query = trimmed + '\n\n' + template;
        } else {
            this.Query = template;
        }
        this.saveToStorage();
        this.cdr.markForCheck();
    }

    private buildEntityOpTemplate(item: EntityListItem, op: EntityOpKind): string {
        const e = item.info;
        const typeName = item.typeName;
        const mapper = new FieldMapper();
        const fieldList = this.pickRepresentativeFields(e).map(name => {
            const mapped = mapper.MapFieldName(name);
            // Annotate any remapped fields so users see why the GraphQL field
            // name differs from the database column. (`__` is reserved by the
            // GraphQL spec, so MJ rewrites `__mj_*` columns to `_mj__*` over
            // the wire.)
            return mapped === name ? mapped : `${mapped}    # from ${name}`;
        });
        const fieldSelection = fieldList.join('\n        ');
        const pkField = mapper.MapFieldName(e.PrimaryKeys?.[0]?.Name ?? 'ID');

        switch (op) {
            case 'view':
                return `# Run a dynamic view over ${e.Name}
query Run${typeName}DynamicView {
  Run${typeName}DynamicView(input: {
    EntityName: "${e.Name}"
    ExtraFilter: ""
    OrderBy: ""
    UserSearchString: ""
    Fields: null
    MaxRows: 100
    StartRow: 0
    IgnoreMaxRows: false
    ForceAuditLog: false
    ResultType: "simple"
  }) {
    Success
    RowCount
    TotalRowCount
    ExecutionTime
    ErrorMessage
    Results {
        ${fieldSelection}
    }
  }
}
`;
            case 'byId':
                return `# Fetch a single ${e.Name} record by primary key
query Run${typeName}ByID($id: String!) {
  Run${typeName}DynamicView(input: {
    EntityName: "${e.Name}"
    ExtraFilter: "${pkField}='" + $id + "'"
    Fields: null
    MaxRows: 1
    StartRow: 0
    IgnoreMaxRows: false
    ForceAuditLog: false
    ResultType: "simple"
    OrderBy: ""
    UserSearchString: ""
  }) {
    Success
    Results {
        ${fieldSelection}
    }
  }
}

# Variables (paste into the Variables panel):
# { "id": "<your-id-here>" }
`;
            case 'create':
                return `# Create a new ${e.Name}
mutation Create${typeName}($input: Create${typeName}Input!) {
  Create${typeName}(input: $input) {
        ${fieldSelection}
  }
}

# Variables — populate the writable fields, then Run
# {
#   "input": {
#     # required + writable fields go here
#   }
# }
`;
            case 'update':
                return `# Update an existing ${e.Name}
mutation Update${typeName}($input: Update${typeName}Input!) {
  Update${typeName}(input: $input) {
        ${fieldSelection}
  }
}

# Variables — must include the primary key (${pkField})
# {
#   "input": {
#     "${pkField}": "<id-here>"
#     # ...changed fields
#   }
# }
`;
            case 'delete':
                return `# Delete a ${e.Name}
mutation Delete${typeName}($input: Delete${typeName}Input!) {
  Delete${typeName}(input: $input) {
        ${pkField}
  }
}

# Variables:
# { "input": { "${pkField}": "<id-here>" } }
`;
        }
    }

    /** Pick the first ~10 displayable fields, prioritizing primary key and common fields. */
    private pickRepresentativeFields(e: EntityInfo): string[] {
        const fields = e.Fields ?? [];
        if (fields.length === 0) return ['ID'];
        const out: string[] = [];
        const seen = new Set<string>();
        const push = (n: string) => { if (n && !seen.has(n)) { seen.add(n); out.push(n); } };

        for (const f of fields) {
            if (f.IsPrimaryKey) push(f.Name);
        }
        // Prefer common, lightweight fields
        for (const f of fields) {
            if (out.length >= 10) break;
            if (f.IsBinaryFieldType) continue;
            const lower = f.Name.toLowerCase();
            if (lower === 'name' || lower === 'description' || lower === 'status' || lower === 'type') {
                push(f.Name);
            }
        }
        // Fill with the rest, skipping huge / private fields
        for (const f of fields) {
            if (out.length >= 10) break;
            if (f.IsBinaryFieldType) continue;
            if (this.isExpensiveField(f)) continue;
            push(f.Name);
        }
        return out;
    }

    private isExpensiveField(f: EntityFieldInfo): boolean {
        const t = (f.Type ?? '').toLowerCase();
        if (t === 'nvarchar(max)' || t === 'varchar(max)' || t === 'text' || t === 'ntext') return true;
        if (t.includes('blob') || t.includes('binary') || t === 'image' || t === 'varbinary') return true;
        return false;
    }

    public ClearEntityFilters(): void {
        this.EntitiesSearch = '';
        this.EntitySchemaFilter = '';
    }

    // ---------- Resizable splitters ----------

    public OnSplitterDown(event: MouseEvent, kind: 'sidebar' | 'editor'): void {
        event.preventDefault();
        this.resizing = kind;
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
        document.body.style.cursor = kind === 'sidebar' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
    }

    private onMouseMove = (e: MouseEvent): void => {
        if (!this.resizing) return;
        const host = this.elementRef.nativeElement as HTMLElement;
        if (this.resizing === 'sidebar') {
            const bodyRect = host.querySelector('.gc-body')?.getBoundingClientRect();
            if (!bodyRect) return;
            const x = e.clientX - bodyRect.left;
            this.SidebarWidthPx = Math.max(200, Math.min(560, x));
        } else if (this.resizing === 'editor') {
            const mainRect = host.querySelector('.gc-main')?.getBoundingClientRect();
            if (!mainRect) return;
            const yPct = ((e.clientY - mainRect.top) / mainRect.height) * 100;
            this.EditorHeightPct = Math.max(20, Math.min(80, yPct));
        }
        this.cdr.markForCheck();
    };

    private onMouseUp = (): void => {
        if (!this.resizing) return;
        this.resizing = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        this.detachResizeListeners();
        this.saveToStorage();
    };

    private detachResizeListeners(): void {
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
    }

    public get FormattedSize(): string {
        if (this.ResponseSizeBytes == null) return '';
        const b = this.ResponseSizeBytes;
        if (b < 1024) return `${b} B`;
        if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
        return `${(b / 1024 / 1024).toFixed(2)} MB`;
    }

    public TrackByHistory = (_i: number, h: HistoryEntry) => h.id;

    // ---------- private ----------

    private recordHistory(query: string, variables: string, status: 'ok' | 'error', durationMs: number): void {
        const entry: HistoryEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            query,
            variables,
            timestamp: new Date(),
            durationMs,
            status,
            favorite: false,
            label: this.deriveLabel(query)
        };
        // De-dupe: if last non-favorite entry has the same query+vars, replace it instead of stacking
        const last = this.History[0];
        if (last && !last.favorite && last.query === query && last.variables === variables) {
            this.History[0] = entry;
        } else {
            this.History = [entry, ...this.History];
        }
        // Trim history (preserve favorites)
        if (this.History.length > HISTORY_LIMIT) {
            const favorites = this.History.filter(h => h.favorite);
            const nonFavorites = this.History.filter(h => !h.favorite).slice(0, HISTORY_LIMIT - favorites.length);
            this.History = [...favorites, ...nonFavorites].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        }
        this.saveToStorage();
    }

    private deriveLabel(query: string): string {
        const m = query.match(/(query|mutation|subscription)\s+(\w+)/);
        if (m) return `${m[1]} ${m[2]}`;
        const firstField = query.match(/[\{\s](\w+)\s*[\(\{]/);
        if (firstField) return firstField[1];
        return 'unnamed';
    }

    private formatError(err: unknown): string {
        if (err && typeof err === 'object') {
            const e = err as { response?: { errors?: unknown[] }; message?: string };
            if (e.response?.errors) {
                return JSON.stringify({ errors: e.response.errors }, null, 2);
            }
            if (e.message) {
                return JSON.stringify({ error: e.message }, null, 2);
            }
        }
        return JSON.stringify({ error: String(err) }, null, 2);
    }

    private extractErrorSummary(err: unknown): string {
        if (err && typeof err === 'object') {
            const e = err as { response?: { errors?: Array<{ message?: string }> }; message?: string };
            if (e.response?.errors?.[0]?.message) return e.response.errors[0].message!;
            if (e.message) return e.message;
        }
        return String(err);
    }

    private loadFromStorage(): void {
        const parsed = DevToolsPrefs.Get<{
            history?: HistoryEntry[];
            query?: string;
            variables?: string;
            sidebarTab?: SidebarTab;
            schemaKindFilter?: 'all' | 'query' | 'mutation';
            entitiesSearch?: string;
            entitySchemaFilter?: string;
            sidebarWidthPx?: number;
            editorHeightPct?: number;
        }>(PREFS_KEY);
        if (!parsed) return;
        if (parsed.history) {
            this.History = parsed.history.map(h => ({ ...h, timestamp: new Date(h.timestamp) }));
        }
        if (parsed.query) this.Query = parsed.query;
        if (parsed.variables) this.Variables = parsed.variables;
        if (parsed.sidebarTab) this.SidebarTab = parsed.sidebarTab;
        if (parsed.schemaKindFilter) this.SchemaKindFilter = parsed.schemaKindFilter;
        if (parsed.entitiesSearch) this.EntitiesSearch = parsed.entitiesSearch;
        if (parsed.entitySchemaFilter) this.EntitySchemaFilter = parsed.entitySchemaFilter;
        if (typeof parsed.sidebarWidthPx === 'number') this.SidebarWidthPx = parsed.sidebarWidthPx;
        if (typeof parsed.editorHeightPct === 'number') this.EditorHeightPct = parsed.editorHeightPct;
    }

    private saveToStorage(): void {
        DevToolsPrefs.Save(PREFS_KEY, {
            history: this.History,
            query: this.Query,
            variables: this.Variables,
            sidebarTab: this.SidebarTab,
            schemaKindFilter: this.SchemaKindFilter,
            entitiesSearch: this.EntitiesSearch,
            entitySchemaFilter: this.EntitySchemaFilter,
            sidebarWidthPx: this.SidebarWidthPx,
            editorHeightPct: this.EditorHeightPct
        });
    }

    // ---------- schema introspection ----------

    private async loadSchema(): Promise<void> {
        this.SchemaLoading = true;
        this.SchemaError = null;
        this.SchemaIntrospectionDisabled = false;
        this.cdr.markForCheck();
        try {
            const data = await GraphQLDataProvider.ExecuteGQL(INTROSPECTION_QUERY, null);
            const schema = (data as { __schema?: { queryType?: { name: string }; mutationType?: { name: string } | null; types: IntrospectedType[] } }).__schema;
            if (!schema) throw new Error('No __schema in introspection response');

            const queryTypeName = schema.queryType?.name;
            const mutationTypeName = schema.mutationType?.name;
            const ops: SchemaOperation[] = [];

            for (const type of schema.types) {
                if (type.name === queryTypeName) {
                    for (const f of type.fields ?? []) ops.push(this.toOperation(f, 'query'));
                } else if (type.name === mutationTypeName) {
                    for (const f of type.fields ?? []) ops.push(this.toOperation(f, 'mutation'));
                }
            }

            ops.sort((a, b) => {
                if (a.kind !== b.kind) return a.kind === 'query' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            this.Operations = ops;
            this.schemaLoaded = true;
        } catch (err: unknown) {
            // Detect introspection-disabled (Apollo + most servers in production)
            const errStr = this.extractErrorSummary(err);
            const code = this.extractErrorCode(err);
            const looksDisabled =
                code === 'INTROSPECTION_DISABLED' ||
                code === 'GRAPHQL_VALIDATION_FAILED' ||
                /__schema|__type|introspection/i.test(errStr);

            if (looksDisabled) {
                this.SchemaIntrospectionDisabled = true;
                this.SchemaError = null;
            } else {
                // Trim huge stack-laden messages — show first 240 chars
                this.SchemaError = errStr.length > 240 ? errStr.slice(0, 240) + '…' : errStr;
            }
        } finally {
            this.SchemaLoading = false;
            this.cdr.markForCheck();
        }
    }

    private extractErrorCode(err: unknown): string | undefined {
        if (err && typeof err === 'object') {
            const e = err as { response?: { errors?: Array<{ extensions?: { code?: string } }> } };
            return e.response?.errors?.[0]?.extensions?.code;
        }
        return undefined;
    }

    private toOperation(field: IntrospectedField, kind: 'query' | 'mutation'): SchemaOperation {
        const argSummary = field.args.length === 0
            ? ''
            : field.args.map(a => `${a.name}: ${this.typeRefToString(a.type)}`).join(', ');
        return {
            name: field.name,
            kind,
            description: field.description ?? '',
            argSummary,
            returnSummary: this.typeRefToString(field.type),
            field
        };
    }

    private typeRefToString(t: IntrospectedTypeRef | null | undefined): string {
        if (!t) return '?';
        if (t.kind === 'NON_NULL') return this.typeRefToString(t.ofType) + '!';
        if (t.kind === 'LIST') return '[' + this.typeRefToString(t.ofType) + ']';
        return t.name ?? '?';
    }

    private isObjectReturn(t: IntrospectedTypeRef): boolean {
        let cur: IntrospectedTypeRef | null | undefined = t;
        while (cur && (cur.kind === 'NON_NULL' || cur.kind === 'LIST')) cur = cur.ofType;
        return !!cur && (cur.kind === 'OBJECT' || cur.kind === 'INTERFACE' || cur.kind === 'UNION');
    }

    private buildOperationTemplate(op: SchemaOperation): string {
        const opNameUpper = op.name.charAt(0).toUpperCase() + op.name.slice(1);
        const f = op.field;

        // Variable declarations + arg passing
        let varDecls = '';
        let argPass = '';
        if (f.args.length > 0) {
            varDecls = '(' + f.args.map(a => `$${a.name}: ${this.typeRefToString(a.type)}`).join(', ') + ')';
            argPass = '(' + f.args.map(a => `${a.name}: $${a.name}`).join(', ') + ')';
        }

        const isObject = this.isObjectReturn(f.type);
        const selection = isObject
            ? ' {\n    # TODO: select fields from ' + this.typeRefToString(f.type) + '\n  }'
            : '';

        return `${op.kind} ${opNameUpper}${varDecls} {\n  ${op.name}${argPass}${selection}\n}\n`;
    }
}

const INTROSPECTION_QUERY = `
query MJDevToolsIntrospection {
  __schema {
    queryType { name }
    mutationType { name }
    types {
      kind
      name
      description
      fields(includeDeprecated: false) {
        name
        description
        args {
          name
          description
          type { ...TypeRef }
          defaultValue
        }
        type { ...TypeRef }
      }
    }
  }
}
fragment TypeRef on __Type {
  kind
  name
  ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
}
`;
