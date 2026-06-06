/**
 * @fileoverview Classify · Guided source setup wizard.
 *
 * A multi-step `mj-dialog` that walks an operator through standing up a new
 * content source: Source Type → Entity → Entity Document → Content Type →
 * Taxonomy Strategy → Domain Context → Review & Create. Steps whose prerequisite
 * already exists (e.g. a content type is already configured, or the chosen
 * entity already has an Entity Document) are auto-skipped.
 *
 * The wizard reuses the inline Entity Document create and the seed-taxonomy
 * review components, and the domain-context fields. It owns no business logic
 * beyond assembling the records — persistence is via the entity API
 * (`GetEntityObject` + `Save()` with result checking) threaded through
 * `ProviderToUse`.
 */
import { Component, ChangeDetectorRef, EventEmitter, Output, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import {
    KnowledgeHubMetadataEngine,
    MJContentSourceEntity,
    MJEntityDocumentEntity,
} from '@memberjunction/core-entities';
import { DropdownOption } from '../shared/classify.types';
import {
    IContentSourceClassificationConfiguration,
    ClassificationContextMode,
} from './source-type-form.dialog.component';

/** The ordered wizard steps. Some are conditionally skipped at run time. */
type WizardStep =
    | 'source-type'
    | 'entity'
    | 'entity-doc'
    | 'content-type'
    | 'taxonomy'
    | 'domain-context'
    | 'review';

@Component({
    standalone: false,
    selector: 'classify-setup-wizard',
    templateUrl: './classify-setup-wizard.component.html',
    styleUrls: ['./classify-setup-wizard.component.css']
})
export class ClassifySetupWizardComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    /** Emitted after the wizard creates a source, so the host reloads. */
    @Output() Created = new EventEmitter<{ SourceID: string }>();
    /** Emitted when the wizard is dismissed without creating anything. */
    @Output() Cancelled = new EventEmitter<void>();

    public Visible = false;
    public CurrentStep: WizardStep = 'source-type';
    public Saving = false;

    // ── Collected selections ──
    public SourceName = '';
    public SourceTypeID = '';
    public EntityID = '';
    public EntityDocID = '';
    public ContentTypeID = '';
    public SourceURL = '';

    // Domain context (source scope)
    public ClassificationContext = '';
    public ClassificationContextMode: ClassificationContextMode = 'additive';

    // ── Dropdown options ──
    public SourceTypeOptions: DropdownOption[] = [];
    public ContentTypeOptions: DropdownOption[] = [];
    public EntityOptions: { ID: string; Name: string }[] = [];

    /** A pending source ID is created up-front when we reach the taxonomy step so
     *  the embedded seed-taxonomy generator has a real source to sample. */
    public PendingSourceID: string | null = null;

    public get IsSubstitutiveMode(): boolean {
        return this.ClassificationContextMode === 'substitutive';
    }
    public set IsSubstitutiveMode(v: boolean) {
        this.ClassificationContextMode = v ? 'substitutive' : 'additive';
    }

    // ════════════════════════════════════════════
    // OPEN / CLOSE
    // ════════════════════════════════════════════

    public async Open(): Promise<void> {
        await this.loadOptions();
        this.resetState();
        this.Visible = true;
        this.cdr.detectChanges();
    }

    public Close(): void {
        this.Visible = false;
        this.Cancelled.emit();
        this.cdr.detectChanges();
    }

    private resetState(): void {
        this.CurrentStep = 'source-type';
        this.SourceName = '';
        this.SourceTypeID = '';
        this.EntityID = '';
        this.EntityDocID = '';
        this.ContentTypeID = '';
        this.SourceURL = '';
        this.ClassificationContext = '';
        this.ClassificationContextMode = 'additive';
        this.PendingSourceID = null;
    }

    private async loadOptions(): Promise<void> {
        try {
            const p = this.ProviderToUse;
            const engine = KnowledgeHubMetadataEngine.Instance;
            await engine.Config(false, p.CurrentUser, p);
            this.SourceTypeOptions = engine.ContentSourceTypes.map(t => ({ ID: t.ID, Name: t.Name }));
            this.ContentTypeOptions = engine.ContentTypes.map(t => ({ ID: t.ID, Name: t.Name }));
            // Entities that have active documents — the safe default for entity sources.
            const entityMap = new Map<string, string>();
            for (const doc of engine.GetActiveEntityDocuments()) {
                const info = doc.Entity ? p.Entities.find(e => e.Name === doc.Entity) : undefined;
                if (info && !entityMap.has(info.ID)) entityMap.set(info.ID, info.Name);
            }
            // Also include all entities so a brand-new entity (no doc yet) can be picked.
            for (const e of p.Entities) {
                if (!entityMap.has(e.ID)) entityMap.set(e.ID, e.Name);
            }
            this.EntityOptions = Array.from(entityMap.entries())
                .map(([ID, Name]) => ({ ID, Name }))
                .sort((a, b) => a.Name.localeCompare(b.Name));
        } catch (error) {
            console.error('[Classify Wizard] Error loading options:', error);
        }
    }

    // ════════════════════════════════════════════
    // STEP LOGIC
    // ════════════════════════════════════════════

    /** Whether the selected source type is the Entity type (name-based check). */
    public get IsEntitySource(): boolean {
        if (!this.SourceTypeID) return false;
        const t = this.SourceTypeOptions.find(o => UUIDsEqual(o.ID, this.SourceTypeID));
        return t?.Name?.toLowerCase() === 'entity';
    }

    /** EntityInfo for the selected entity, or null. */
    private get selectedEntityInfo() {
        if (!this.EntityID) return null;
        return this.ProviderToUse.Entities.find(e => UUIDsEqual(e.ID, this.EntityID)) ?? null;
    }

    public get SelectedEntityName(): string {
        return this.selectedEntityInfo?.Name ?? '';
    }

    /** True when the selected entity has no active Entity Document. */
    public get SelectedEntityHasNoDocument(): boolean {
        const info = this.selectedEntityInfo;
        if (!info) return false;
        try {
            return KnowledgeHubMetadataEngine.Instance.GetActiveEntityDocuments()
                .filter(d => d.Entity === info.Name).length === 0;
        } catch {
            return false;
        }
    }

    /** Whether any content type exists (drives the content-type step skip). */
    public get HasAnyContentType(): boolean {
        return this.ContentTypeOptions.length > 0;
    }

    /**
     * The ordered list of steps relevant to the current selections. Steps whose
     * prerequisite already exists are filtered out, so the progress UI + next/back
     * navigation only ever traverse meaningful steps.
     */
    public get ActiveSteps(): WizardStep[] {
        const steps: WizardStep[] = ['source-type'];
        if (this.IsEntitySource) {
            steps.push('entity');
            // Entity Document step only when the chosen entity lacks one.
            if (this.EntityID && this.SelectedEntityHasNoDocument) steps.push('entity-doc');
        }
        // Content type only matters for non-entity sources; skip when one already exists is
        // NOT done (operator may want to pick which) — but skip entirely for entity sources.
        if (!this.IsEntitySource) steps.push('content-type');
        steps.push('taxonomy');
        steps.push('domain-context');
        steps.push('review');
        return steps;
    }

    public get StepIndex(): number {
        return Math.max(0, this.ActiveSteps.indexOf(this.CurrentStep));
    }

    public get TotalSteps(): number {
        return this.ActiveSteps.length;
    }

    public get StepLabel(): string {
        switch (this.CurrentStep) {
            case 'source-type': return 'Source type';
            case 'entity': return 'Entity';
            case 'entity-doc': return 'Entity document';
            case 'content-type': return 'Content type';
            case 'taxonomy': return 'Taxonomy strategy';
            case 'domain-context': return 'Domain context';
            case 'review': return 'Review & create';
        }
    }

    public get CanGoNext(): boolean {
        switch (this.CurrentStep) {
            case 'source-type': return !!this.SourceName.trim() && !!this.SourceTypeID;
            case 'entity': return !!this.EntityID;
            case 'entity-doc': return !this.SelectedEntityHasNoDocument; // advance once a doc exists
            case 'content-type': return !!this.ContentTypeID;
            default: return true;
        }
    }

    public get IsLastStep(): boolean {
        return this.CurrentStep === 'review';
    }

    public async Next(): Promise<void> {
        if (!this.CanGoNext) return;
        const steps = this.ActiveSteps;
        const idx = steps.indexOf(this.CurrentStep);
        const nextStep = steps[idx + 1];
        if (!nextStep) return;

        // When advancing into the taxonomy step, create the source up front so the
        // seed generator has a real source to sample. If it fails, stay put.
        if (nextStep === 'taxonomy' && !this.PendingSourceID) {
            const ok = await this.ensurePendingSource();
            if (!ok) return;
        }

        if (nextStep === 'entity-doc') {
            this.PrimeEntityDocDefaults();
        }

        this.CurrentStep = nextStep;
        this.cdr.detectChanges();
    }

    public Back(): void {
        const steps = this.ActiveSteps;
        const idx = steps.indexOf(this.CurrentStep);
        if (idx > 0) {
            this.CurrentStep = steps[idx - 1];
            this.cdr.detectChanges();
        }
    }

    // ── Inline Entity Document creation (entity-doc step) ──
    public EntityDocSaving = false;
    public NewEntityDocName = '';
    public NewEntityDocSelectedFields: Record<string, boolean> = {};

    /** Fields of the selected entity, for the field-picker in the inline create. */
    public get SelectedEntityFields(): { Name: string; DisplayName: string }[] {
        const info = this.selectedEntityInfo;
        if (!info) return [];
        return info.Fields
            .filter(f => !f.IsVirtual)
            .map(f => ({ Name: f.Name, DisplayName: f.DisplayName || f.Name }));
    }

    public get SelectedEntityDocFieldCount(): number {
        return Object.values(this.NewEntityDocSelectedFields).filter(Boolean).length;
    }

    /** Prime the inline-create defaults when entering the entity-doc step. */
    public PrimeEntityDocDefaults(): void {
        const info = this.selectedEntityInfo;
        if (!info || this.NewEntityDocName) return;
        this.NewEntityDocName = `${info.Name} Document`;
        this.NewEntityDocSelectedFields = {};
        const preferred = ['Name', 'Title', 'Description', 'Notes', 'Body', 'Content'];
        for (const f of this.SelectedEntityFields) {
            if (preferred.includes(f.Name)) this.NewEntityDocSelectedFields[f.Name] = true;
        }
    }

    /** Create the Entity Document for the selected entity, then refresh + select it. */
    public async CreateEntityDocument(): Promise<void> {
        if (this.EntityDocSaving) return;
        const info = this.selectedEntityInfo;
        if (!info) return;
        if (!this.NewEntityDocName.trim()) {
            MJNotificationService.Instance.CreateSimpleNotification('Enter a document name.', 'warning', 3000);
            return;
        }
        this.EntityDocSaving = true;
        this.cdr.detectChanges();
        try {
            const p = this.ProviderToUse;
            const doc = await p.GetEntityObject<MJEntityDocumentEntity>('MJ: Entity Documents', p.CurrentUser);
            doc.NewRecord();
            doc.Name = this.NewEntityDocName.trim();
            doc.EntityID = info.ID;
            doc.Status = 'Active';
            const selectedFields = this.SelectedEntityFields
                .filter(f => this.NewEntityDocSelectedFields[f.Name])
                .map(f => f.Name);
            doc.Configuration = JSON.stringify({ Fields: selectedFields });
            const saved = await doc.Save();
            if (saved) {
                await KnowledgeHubMetadataEngine.Instance.Config(true, p.CurrentUser, p);
                this.EntityDocID = doc.ID;
                MJNotificationService.Instance.CreateSimpleNotification('Entity Document created', 'success', 2500);
            } else {
                const detail = doc.LatestResult?.CompleteMessage ?? 'Unknown error';
                MJNotificationService.Instance.CreateSimpleNotification(`Failed to create Entity Document: ${detail}`, 'error', 5000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
        } finally {
            this.EntityDocSaving = false;
            this.cdr.detectChanges();
        }
    }

    /** Called by the embedded seed-taxonomy after it persists tags. */
    public OnTaxonomyAccepted(_event: { Created: number }): void {
        this.cdr.detectChanges();
    }

    // ════════════════════════════════════════════
    // PERSISTENCE
    // ════════════════════════════════════════════

    /**
     * Create (once) the content source record so the taxonomy step can sample it.
     * Subsequent edits (domain context) are applied to this same record on Finish.
     */
    private async ensurePendingSource(): Promise<boolean> {
        this.Saving = true;
        this.cdr.detectChanges();
        try {
            const id = await this.saveSource();
            if (id) {
                this.PendingSourceID = id;
                return true;
            }
            return false;
        } finally {
            this.Saving = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Create or update the content source from the collected selections. Returns
     * the saved ID, or null on failure. Defaults required NOT NULL columns for
     * entity sources the same way the quick-edit form does.
     */
    private async saveSource(): Promise<string | null> {
        try {
            const p = this.ProviderToUse;
            const entity = await p.GetEntityObject<MJContentSourceEntity>('MJ: Content Sources', p.CurrentUser);
            if (this.PendingSourceID) {
                const loaded = await entity.Load(this.PendingSourceID);
                if (!loaded) {
                    entity.NewRecord();
                }
            } else {
                entity.NewRecord();
            }

            entity.Name = this.SourceName.trim();
            entity.ContentSourceTypeID = this.SourceTypeID;

            const engine = KnowledgeHubMetadataEngine.Instance;
            if (this.IsEntitySource) {
                entity.EntityID = this.EntityID || null;
                entity.EntityDocumentID = this.resolveEntityDocID();
                entity.URL = '';
                // NOT NULL columns: default to first available.
                if (!entity.ContentTypeID) {
                    if (engine.ContentTypes.length === 0) {
                        MJNotificationService.Instance.CreateSimpleNotification(
                            'No content types exist. Create one before adding an entity source.', 'warning', 5000
                        );
                        return null;
                    }
                    entity.ContentTypeID = engine.ContentTypes[0].ID;
                }
                if (!entity.ContentFileTypeID && engine.ContentFileTypes.length > 0) {
                    entity.ContentFileTypeID = engine.ContentFileTypes[0].ID;
                }
            } else {
                entity.EntityID = null;
                entity.EntityDocumentID = null;
                entity.ContentTypeID = this.ContentTypeID;
                if (!entity.ContentFileTypeID && engine.ContentFileTypes.length > 0) {
                    entity.ContentFileTypeID = engine.ContentFileTypes[0].ID;
                }
                entity.URL = this.SourceURL || '';
            }

            // Merge the domain-context fields into the typed Configuration JSON.
            const config: IContentSourceClassificationConfiguration = entity.ConfigurationObject ?? {};
            if (this.ClassificationContext.trim()) {
                config.ClassificationContext = this.ClassificationContext;
                config.ClassificationContextMode = this.ClassificationContextMode;
            } else {
                delete config.ClassificationContext;
                delete config.ClassificationContextMode;
            }
            entity.ConfigurationObject = config;

            const saved = await entity.Save();
            if (saved) return entity.ID;
            const detail = entity.LatestResult?.CompleteMessage ?? 'Unknown error';
            MJNotificationService.Instance.CreateSimpleNotification(`Failed to save source: ${detail}`, 'error', 5000);
            return null;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 5000);
            return null;
        }
    }

    /** Resolve the entity document ID to store (explicit choice or the entity's only doc). */
    private resolveEntityDocID(): string | null {
        if (this.EntityDocID) return this.EntityDocID;
        const info = this.selectedEntityInfo;
        if (!info) return null;
        const docs = KnowledgeHubMetadataEngine.Instance.GetActiveEntityDocuments()
            .filter(d => d.Entity === info.Name);
        return docs.length > 0 ? docs[0].ID : null;
    }

    /** Finish the wizard: persist the (final) source and emit Created. */
    public async Finish(): Promise<void> {
        if (this.Saving) return;
        this.Saving = true;
        this.cdr.detectChanges();
        try {
            const id = await this.saveSource();
            if (id) {
                MJNotificationService.Instance.CreateSimpleNotification('Source created', 'success', 2500);
                this.Visible = false;
                this.Created.emit({ SourceID: id });
            }
        } finally {
            this.Saving = false;
            this.cdr.detectChanges();
        }
    }

    // ── Entity-doc options for the review/entity-doc step ──
    public get EntityDocOptions(): { ID: string; Name: string }[] {
        const info = this.selectedEntityInfo;
        if (!info) return [];
        try {
            return KnowledgeHubMetadataEngine.Instance.GetActiveEntityDocuments()
                .filter(d => d.Entity === info.Name)
                .map(d => ({ ID: d.ID, Name: d.Name }));
        } catch {
            return [];
        }
    }

    // ── Review labels ──
    public get SourceTypeName(): string {
        return this.SourceTypeOptions.find(o => UUIDsEqual(o.ID, this.SourceTypeID))?.Name ?? '—';
    }
    public get ContentTypeName(): string {
        return this.ContentTypeOptions.find(o => UUIDsEqual(o.ID, this.ContentTypeID))?.Name ?? '—';
    }
    public get EntityDocName(): string {
        const id = this.resolveEntityDocID();
        if (!id) return '—';
        return this.EntityDocOptions.find(o => UUIDsEqual(o.ID, id))?.Name ?? '—';
    }
}
