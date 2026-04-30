/**
 * @module database-designer-dashboard.component
 * @description Root dashboard for the Database Designer feature area.
 *
 * Registered as 'DatabaseDesignerDashboard' via `@RegisterClass(BaseDashboard, ...)`.
 * Registered as a navigation item via metadata (metadata/applications/).
 *
 * Lifecycle:
 *  - `initDashboard()` — sync ?entity= URL param (deep-link support), initialize slide-panel state
 *  - `loadData()` — delegate to DatabaseDesignerEngine singleton; pass result to EntityListComponent
 *
 * The wizard and modify panels open as MjSlidePanel drawers so the entity
 * list remains visible behind them.  The dashboard orchestrates all state
 * transitions; child components communicate only via @Output events.
 */

import {
    Component, ChangeDetectionStrategy, ChangeDetectorRef,
    inject, ViewChild,
} from '@angular/core';
import { BaseDashboard, BaseResourceComponent } from '@memberjunction/ng-shared';
import { RegisterClass } from '@memberjunction/global';
import { ResourceData } from '@memberjunction/core-entities';

import { DatabaseDesignerEngine } from '../services/database-designer.engine.js';
import { DatabaseDesignerService } from '../services/database-designer.service.js';
import { DatabaseModifyComponent } from './modify/database-modify.component.js';
import type { AccessibleEntity } from '../database-designer.types.js';

@Component({
    standalone: false,
    selector: 'mj-database-designer-dashboard',
    templateUrl: './database-designer-dashboard.component.html',
    styleUrls: ['./database-designer-dashboard.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
@RegisterClass(BaseResourceComponent, 'DatabaseDesignerDashboard')
export class DatabaseDesignerDashboardComponent extends BaseDashboard {

    // ─── Injected services ─────────────────────────────────────────────────

    /** Angular DI: write operations (create, modify, validate). */
    protected readonly designerService = inject(DatabaseDesignerService);

    /** Change detection ref for OnPush updates. */
    private readonly cdr = inject(ChangeDetectorRef);

    // ─── ViewChild ─────────────────────────────────────────────────────────

    /** Reference to the active modify component — used for close-guard state. */
    @ViewChild(DatabaseModifyComponent) private modifyRef?: DatabaseModifyComponent;

    // ─── Slide-panel close guard ───────────────────────────────────────────

    /**
     * Passed as `[CanClose]` to the modify slide panel.
     * Prevents the panel from closing while a pipeline is running and prompts the user
     * for confirmation.  Defined as an arrow function so `this` is captured correctly
     * when called by `MjSlidePanelComponent` (no angular binding issues).
     */
    public readonly ModifyPanelCanClose = (): boolean => {
        if (!this.modifyRef?.IsPipelineRunning) return true;
        return window.confirm(
            'A pipeline operation is in progress. Closing will hide the progress panel ' +
            'but the operation will continue running on the server.\n\nAre you sure?'
        );
    };

    // ─── Entity list ───────────────────────────────────────────────────────

    /** Entities displayed in EntityListComponent — set by loadData(). */
    public Entities: AccessibleEntity[] = [];

    public IsLoadingEntities = false;
    public LoadError: string | null = null;

    // ─── Slide panel state ─────────────────────────────────────────────────

    /** Whether the Create Wizard drawer is open. */
    public ShowCreateWizard = false;

    /** ID of the entity currently being modified; null if panel is closed. */
    public ModifyEntityId: string | null = null;

    /** ID to deep-link into on first load (from ?entity= query param). */
    private _deepLinkEntityId: string | null = null;

    // ─── BaseDashboard implementation ──────────────────────────────────────

    async GetResourceDisplayName(_data: ResourceData): Promise<string> {
        return 'Database Designer';
    }

    /** Sync ?entity=<id> URL param; set initial slide-panel state. */
    protected initDashboard(): void {
        const params = this.GetQueryParams();
        if (params['entity']) {
            this._deepLinkEntityId = params['entity'];
        }
    }

    /** Load accessible entities from the engine's cached store. */
    protected async loadData(): Promise<void> {
        this.IsLoadingEntities = true;
        this.LoadError = null;
        this.cdr.markForCheck();

        try {
            this.Entities = await DatabaseDesignerEngine.Instance.loadAccessibleEntities();

            // Honor deep-link: open modify panel if the entity exists in the list.
            if (this._deepLinkEntityId) {
                const target = this.Entities.find(e => e.entityId === this._deepLinkEntityId);
                if (target) {
                    this.openModifyPanel(target);
                }
                this._deepLinkEntityId = null;
            }
        } catch (err) {
            this.LoadError = err instanceof Error ? err.message : String(err);
        } finally {
            this.IsLoadingEntities = false;
            this.cdr.markForCheck();
        }
    }

    // ─── Entity list event handlers ────────────────────────────────────────

    /** Opens the Create Wizard drawer. */
    public OnNewEntity(): void {
        this.ShowCreateWizard = true;
        this.cdr.markForCheck();
    }

    /** Opens the Modify panel for an existing entity. */
    public OnEditEntity(entity: AccessibleEntity): void {
        this.openModifyPanel(entity);
    }

    /** Opens the Modify panel (read-only view) for an existing entity. */
    public OnViewEntity(entity: AccessibleEntity): void {
        this.openModifyPanel(entity);
    }

    // ─── Slide-panel event handlers ────────────────────────────────────────

    /** Called when the Create Wizard drawer closes (cancel or success). */
    public OnWizardClosed(): void {
        this.ShowCreateWizard = false;
        this.cdr.markForCheck();
    }

    /** Called when the wizard successfully creates an entity. */
    public OnEntityCreated(): void {
        this.ShowCreateWizard = false;
        DatabaseDesignerEngine.Instance.invalidateCache();
        this.loadData();
    }

    /** Called when the Modify panel drawer closes. */
    public OnModifyPanelClosed(): void {
        this.ModifyEntityId = null;
        this.UpdateQueryParams({ entity: null });
        this.cdr.markForCheck();
    }

    /** Called when the modify wizard successfully alters an entity. */
    public OnEntityModified(): void {
        this.ModifyEntityId = null;
        DatabaseDesignerEngine.Instance.invalidateCache();
        this.loadData();
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    private openModifyPanel(entity: AccessibleEntity): void {
        this.ModifyEntityId = entity.entityId;
        this.UpdateQueryParams({ entity: entity.entityId });
        this.cdr.markForCheck();
    }
}

/** Tree-shaking prevention — called from module's public-api.ts. */
export function LoadDatabaseDesignerDashboard(): void { /* noop — forces import */ }
