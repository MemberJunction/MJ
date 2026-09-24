import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CompositeKey, type EntityInfo, type IEntityCloneConfiguration, type ICloneRelationshipPolicy } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import type { RecordClonePlanDetails } from '@memberjunction/core-entities';
import { RecordCloneService, CompositeKeyToRecordCloneKey } from '@memberjunction/ng-record-clone';
import {
    CloneConfigValidator,
    FieldMetaFromEntity,
    type CloneConfigEntityMeta,
    type CloneConfigValidationError,
} from '@memberjunction/record-cloning-base';

/** String-list rules under `Clone.Fields` the editor offers as field chips. */
export type CloneFieldListKey = 'PromptFor' | 'Exclude' | 'Ownership' | 'ServerAllocated';

/** One row of the relationships grid. */
export interface CloneRelationshipRow {
    RelatedEntity: string;
    JoinField: string;
    /**
     * Key of this row in `Clone.Relationships`: `"<RelatedEntity>"`, or `"<RelatedEntity>.<JoinField>"`
     * when the entity has several relationships to the same target (or the config already uses it).
     */
    ConfigKey: string;
    Policy: ICloneRelationshipPolicy['Policy'] | '';
    Locked: boolean;
    MaxRecords: number | null;
}

type Option<T> = { text: string; value: T };

/**
 * Editor for an entity's record-cloning configuration (`Configuration.Clone` on its MJ: Entities
 * record), shown in the Entities form's Settings section (plan §12.6).
 *
 * The common settings have controls; everything else (Reset values, Rules, JsonRemap, Presets,
 * Descendants, CreationPath) is editable in the Advanced JSON box, which always shows the whole
 * bag. Validate runs the client-safe `CloneConfigValidator`; Preview plan asks the server for a
 * dry-run plan of one record using the saved configuration; Copy metadata JSON produces the
 * `metadata/entities/.clone-configurations.json` entry for shipping the setting.
 */
@Component({
    standalone: false,
    selector: 'mj-entity-clone-config-editor',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './entity-clone-config-editor.component.html',
    styleUrls: ['./entity-clone-config-editor.component.css'],
})
export class EntityCloneConfigEditorComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);
    private cloneService = inject(RecordCloneService);

    /** The entity whose configuration is edited; supplies fields and relationships. */
    @Input() Entity: EntityInfo | null = null;
    /** The current `Configuration.Clone` bag, or null when the entity has none. */
    @Input() CloneConfig: IEntityCloneConfiguration | null = null;
    /** Controls are read-only unless the form is in edit mode. */
    @Input() EditMode = false;
    /** Fires with the new bag (null to remove it) on every change. */
    @Output() CloneConfigChange = new EventEmitter<IEntityCloneConfiguration | null>();

    public readonly ScopeOptions = {
        Subtypes: [
            { text: 'Include (default)', value: 'include' },
            { text: 'Exclude', value: 'exclude' },
        ] as Option<string>[],
        Hierarchy: [
            { text: 'Whole subtree (default)', value: 'subtree' },
            { text: 'This node only', value: 'node' },
        ] as Option<string>[],
        SoftLinks: [
            { text: 'Skip (default)', value: 'skip' },
            { text: 'Include', value: 'include' },
        ] as Option<string>[],
        Hooks: [
            { text: 'Suppress (default)', value: 'suppress' },
            { text: 'Fire', value: 'fire' },
        ] as Option<string>[],
        UserEditable: [
            { text: 'All (default): users may narrow scope; widening needs Override Scope', value: 'all' },
            { text: 'Scope: users may narrow scope', value: 'scope' },
            { text: 'Fields only: values, no scope changes', value: 'fields' },
            { text: 'None: confirm only', value: 'none' },
        ] as Option<string>[],
        NamingStrategy: [
            { text: 'Suffix (default)', value: 'suffix' },
            { text: 'Increment', value: 'increment' },
            { text: 'Prompt the user', value: 'prompt' },
            { text: 'None', value: 'none' },
        ] as Option<string>[],
        Policy: [
            { text: 'Default', value: '' },
            { text: 'Deep (copy)', value: 'Deep' },
            { text: 'Reference', value: 'Reference' },
            { text: 'Skip', value: 'Skip' },
        ] as Option<string>[],
    };

    public readonly FieldLists: Array<{ Key: CloneFieldListKey; Label: string; Hint: string }> = [
        { Key: 'PromptFor', Label: 'Ask the user for', Hint: 'Required on the clone, e.g. a unique Email.' },
        { Key: 'Exclude', Label: 'Never copy', Hint: 'Left at the column default on the clone.' },
        { Key: 'Ownership', Label: 'Set to the cloning user', Hint: 'Owner or creator columns.' },
        { Key: 'ServerAllocated', Label: 'Let the server assign', Hint: 'Numbers or slugs the save hook allocates.' },
    ];

    public ValidationResults: CloneConfigValidationError[] | null = null;
    public JsonError = '';
    public CopyMessage = '';
    public PreviewRecordId = '';
    public PreviewPlan: RecordClonePlanDetails | null = null;
    public PreviewError = '';
    public IsPreviewing = false;
    /** Show every one-to-many relationship, not only the configured ones. */
    public ShowAllRelationships = false;

    /** Bumped after each add so the "Add field…" dropdowns re-render showing their placeholder. */
    public AddVersion = 0;
    private previewRequest = 0;

    // ── Read helpers ─────────────────────────────────────────────────────

    public get Config(): IEntityCloneConfiguration {
        return this.CloneConfig ?? {};
    }

    /** Fields a list rule may name: everything but key and __mj system columns. */
    public get FieldNames(): string[] {
        return (this.Entity?.Fields ?? [])
            .filter((f) => !f.IsPrimaryKey && !f.Name.startsWith('__mj_'))
            .map((f) => f.Name);
    }

    public FieldList(key: CloneFieldListKey): string[] {
        return (this.Config.Fields?.[key] as string[] | undefined) ?? [];
    }

    public AvailableFields(key: CloneFieldListKey): string[] {
        const chosen = new Set(this.FieldList(key));
        return this.FieldNames.filter((f) => !chosen.has(f));
    }

    public get NamingFields(): string[] {
        return this.Config.Naming?.Fields ?? [];
    }

    public get AvailableNamingFields(): string[] {
        const chosen = new Set(this.NamingFields);
        return this.FieldNames.filter((f) => !chosen.has(f));
    }

    /** One row per one-to-many relationship, with its configured policy. */
    public get RelationshipRows(): CloneRelationshipRow[] {
        const rels = (this.Entity?.RelatedEntities ?? []).filter((r) => r.Type?.trim().toLowerCase() === 'one to many');
        const perTarget = new Map<string, number>();
        for (const r of rels) perTarget.set(r.RelatedEntity, (perTarget.get(r.RelatedEntity) ?? 0) + 1);
        const configured = this.Config.Relationships ?? {};
        return rels.map((r) => {
                const qualified = `${r.RelatedEntity}.${r.RelatedEntityJoinField}`;
                // Prefer an existing qualified key; use the plain key only when this target is unambiguous.
                const configKey = qualified in configured || (perTarget.get(r.RelatedEntity) ?? 0) > 1 ? qualified : r.RelatedEntity;
                const cfg = configured[configKey];
                return {
                    RelatedEntity: r.RelatedEntity,
                    JoinField: r.RelatedEntityJoinField,
                    ConfigKey: configKey,
                    Policy: cfg?.Policy ?? '',
                    Locked: cfg?.Locked ?? false,
                    MaxRecords: cfg?.MaxRecords ?? null,
                };
            });
    }

    /** The rows the grid shows: configured relationships, or all of them when expanded. */
    public get VisibleRelationshipRows(): CloneRelationshipRow[] {
        const rows = this.RelationshipRows;
        return this.ShowAllRelationships ? rows : rows.filter((r) => r.Policy || r.Locked || r.MaxRecords);
    }

    public get AdvancedJson(): string {
        return this.CloneConfig ? JSON.stringify(this.CloneConfig, null, 2) : '';
    }

    public get HasConfig(): boolean {
        return !!this.CloneConfig && Object.keys(this.CloneConfig).length > 0;
    }

    // ── Edits ────────────────────────────────────────────────────────────

    /** Sets top-level keys; an undefined, empty or default-equivalent value removes the key. */
    public Patch(changes: Partial<IEntityCloneConfiguration>): void {
        const next: Record<string, unknown> = { ...this.Config };
        for (const [k, v] of Object.entries(changes)) {
            if (v === undefined || v === '' || v === null) delete next[k];
            else next[k] = v;
        }
        this.emit(next as IEntityCloneConfiguration);
    }

    public OnNumberChange(key: 'MaxDepth' | 'MaxRecords', value: number | null): void {
        this.Patch({ [key]: value && value > 0 ? Math.floor(value) : undefined });
    }

    public OnHooksChange(key: 'EntityActions' | 'AIActions', value: 'suppress' | 'fire'): void {
        const hooks = { ...(this.Config.Hooks ?? {}), [key]: value };
        if (value === 'suppress') delete hooks[key];
        this.Patch({ Hooks: Object.keys(hooks).length > 0 ? hooks : undefined });
    }

    public OnNamingChange(changes: { Template?: string; Strategy?: string }): void {
        const naming: Record<string, unknown> = { ...(this.Config.Naming ?? {}), ...changes };
        for (const k of Object.keys(naming)) {
            if (naming[k] === '' || naming[k] === undefined) delete naming[k];
        }
        this.Patch({ Naming: Object.keys(naming).length > 0 ? (naming as IEntityCloneConfiguration['Naming']) : undefined });
    }

    public AddNamingField(field: string | null): void {
        if (!field) return;
        this.AddVersion++;
        const naming = { ...(this.Config.Naming ?? {}), Fields: [...this.NamingFields, field] };
        this.Patch({ Naming: naming });
    }

    public RemoveNamingField(field: string): void {
        const fields = this.NamingFields.filter((f) => f !== field);
        const naming: Record<string, unknown> = { ...(this.Config.Naming ?? {}), Fields: fields };
        if (fields.length === 0) delete naming['Fields'];
        this.Patch({ Naming: Object.keys(naming).length > 0 ? (naming as IEntityCloneConfiguration['Naming']) : undefined });
    }

    public AddField(key: CloneFieldListKey, field: string | null): void {
        if (!field) return;
        this.AddVersion++;
        this.setFieldList(key, [...this.FieldList(key), field]);
    }

    public RemoveField(key: CloneFieldListKey, field: string): void {
        this.setFieldList(key, this.FieldList(key).filter((f) => f !== field));
    }

    public OnRelationshipChange(row: CloneRelationshipRow, changes: Partial<Pick<CloneRelationshipRow, 'Policy' | 'Locked' | 'MaxRecords'>>): void {
        const merged = { ...row, ...changes };
        const relationships: Record<string, ICloneRelationshipPolicy> = { ...(this.Config.Relationships ?? {}) };
        const existing: ICloneRelationshipPolicy = { ...(relationships[row.ConfigKey] ?? {}) };
        if (merged.Policy) existing.Policy = merged.Policy; else delete existing.Policy;
        if (merged.Locked) existing.Locked = true; else delete existing.Locked;
        if (merged.MaxRecords && merged.MaxRecords > 0) existing.MaxRecords = Math.floor(merged.MaxRecords); else delete existing.MaxRecords;
        if (Object.keys(existing).length > 0) relationships[row.ConfigKey] = existing;
        else delete relationships[row.ConfigKey];
        this.Patch({ Relationships: Object.keys(relationships).length > 0 ? relationships : undefined });
    }

    /** Replaces the whole bag with the Advanced JSON, if it parses to an object. */
    public OnApplyJson(text: string): void {
        const trimmed = text.trim();
        if (!trimmed) {
            this.JsonError = '';
            this.emit(null);
            return;
        }
        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                this.JsonError = 'The clone configuration must be a JSON object.';
            } else {
                this.JsonError = '';
                this.emit(parsed as IEntityCloneConfiguration);
            }
        } catch (err) {
            this.JsonError = `Not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
        }
        this.cdr.markForCheck();
    }

    // ── Actions ──────────────────────────────────────────────────────────

    /** Runs the client-side validator against this entity's fields and relationships. */
    public Validate(): void {
        if (!this.Entity) return;
        const toMeta = (e: EntityInfo, config?: IEntityCloneConfiguration | null): CloneConfigEntityMeta => ({
            Name: e.Name,
            // Same field flags the planner uses, so automatic fields aren't reported as unclassified.
            Fields: FieldMetaFromEntity(e),
            Relationships: e.RelatedEntities.map((r) => ({ ID: r.ID, RelatedEntity: r.RelatedEntity, RelatedEntityJoinField: r.RelatedEntityJoinField })),
            CloneConfiguration: (config ?? undefined) as CloneConfigEntityMeta['CloneConfiguration'],
        });
        const all = (this.ProviderToUse?.Entities ?? []).map((e) => toMeta(e, e.CloneConfig));
        this.ValidationResults = CloneConfigValidator.Validate(toMeta(this.Entity, { ...this.Config, Enabled: true }), all);
        this.cdr.markForCheck();
    }

    /** Copies the `.clone-configurations.json` entry for this entity to the clipboard. */
    public async CopyMetadataJson(): Promise<void> {
        if (!this.Entity) return;
        const entry = {
            fields: { Name: this.Entity.Name, Configuration: { Clone: this.Config } },
            primaryKey: { ID: `@lookup:MJ: Entities.Name=${this.Entity.Name}` },
        };
        try {
            await navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
            this.CopyMessage = 'Copied. Paste it into metadata/entities/.clone-configurations.json.';
        } catch {
            this.CopyMessage = 'Copy failed; select the Advanced JSON instead.';
        }
        this.cdr.markForCheck();
    }

    /** Asks the server for a dry-run plan of one record. Uses the saved configuration, not unsaved edits. */
    public async PreviewPlanFor(recordId: string): Promise<void> {
        const id = recordId.trim();
        if (!this.Entity || !id) return;
        // Only the latest request may update the preview, so a slow earlier answer can't overwrite it.
        const request = ++this.previewRequest;
        this.IsPreviewing = true;
        this.PreviewError = '';
        this.PreviewPlan = null;
        this.cdr.markForCheck();
        try {
            const out = await this.cloneService.PlanClone(
                {
                    EntityName: this.Entity.Name,
                    SourceRecordKey: CompositeKeyToRecordCloneKey(CompositeKey.FromURLSegment(this.Entity, id)),
                },
                this.ProviderToUse
            );
            if (request === this.previewRequest) this.PreviewPlan = out.Plan;
        } catch (err) {
            if (request === this.previewRequest) this.PreviewError = err instanceof Error ? err.message : String(err);
        } finally {
            if (request === this.previewRequest) this.IsPreviewing = false;
            this.cdr.markForCheck();
        }
    }

    // ── Internals ────────────────────────────────────────────────────────

    private setFieldList(key: CloneFieldListKey, values: string[]): void {
        const fields: Record<string, unknown> = { ...(this.Config.Fields ?? {}) };
        if (values.length > 0) fields[key] = values; else delete fields[key];
        this.Patch({ Fields: Object.keys(fields).length > 0 ? (fields as IEntityCloneConfiguration['Fields']) : undefined });
    }

    private emit(next: IEntityCloneConfiguration | null): void {
        const empty = !next || Object.keys(next).length === 0;
        this.ValidationResults = null;
        this.CloneConfigChange.emit(empty ? null : next);
        this.cdr.markForCheck();
    }
}
