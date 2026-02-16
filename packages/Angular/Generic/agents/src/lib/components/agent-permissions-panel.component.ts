import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { trigger, transition, style, animate } from '@angular/animations';
import { AIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { RoleInfo } from '@memberjunction/core';
import { MJUserEntity } from '@memberjunction/core-entities';
import { AgentPermissionsService, PermissionRow } from '../services/agent-permissions.service';

/** Simple name/ID pair for the grantee search-select */
interface GranteeOption {
    ID: string;
    Name: string;
}

@Component({
  standalone: false,
    selector: 'mj-agent-permissions-panel',
    templateUrl: './agent-permissions-panel.component.html',
    styleUrls: ['./agent-permissions-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    animations: [
        trigger('slideDown', [
            transition(':enter', [
                style({ opacity: 0, transform: 'translateY(-8px)' }),
                animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
            ]),
            transition(':leave', [
                animate('150ms ease-in', style({ opacity: 0, transform: 'translateY(-8px)' }))
            ])
        ])
    ],
    providers: [AgentPermissionsService]
})
export class AgentPermissionsPanelComponent implements OnInit {
    /** The agent whose permissions are being managed */
    private _agent: AIAgentEntityExtended | null = null;

    @Input()
    set Agent(value: AIAgentEntityExtended | null) {
        const prev = this._agent;
        this._agent = value;
        if (value && value !== prev) {
            this.loadData();
        }
    }
    get Agent(): AIAgentEntityExtended | null {
        return this._agent;
    }

    /** Emitted after a permission is saved or deleted */
    @Output() PermissionsChanged = new EventEmitter<void>();

    // --- View state ---
    public IsLoading = true;
    public IsSaving = false;
    public Rows: PermissionRow[] = [];
    public OwnerName: string | null = null;

    // --- Form state ---
    public IsFormOpen = false;
    public EditingRowId: string | null = null;
    public FormGrantType: 'user' | 'role' = 'user';
    public FormGranteeId: string | null = null;
    public FormCanView = false;
    public FormCanRun = false;
    public FormCanEdit = false;
    public FormCanDelete = false;
    public FormComments = '';
    public SearchQuery = '';
    public FilteredGrantees: GranteeOption[] = [];

    constructor(
        private permsSvc: AgentPermissionsService,
        private cdr: ChangeDetectorRef
    ) {}

    ngOnInit(): void {
        if (this._agent) {
            this.loadData();
        }
    }

    // =========================================================================
    // Data loading
    // =========================================================================

    private async loadData(): Promise<void> {
        if (!this._agent) return;
        this.IsLoading = true;
        this.cdr.markForCheck();

        try {
            this.Rows = await this.permsSvc.LoadAll(this._agent.ID);
            this.OwnerName = await this.permsSvc.ResolveOwnerName(this._agent.OwnerUserID || null);
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    // =========================================================================
    // List interactions
    // =========================================================================

    public trackById(_index: number, row: PermissionRow): string {
        return row.ID;
    }

    public OnAddNew(): void {
        this.resetForm();
        this.IsFormOpen = true;
        this.updateFilteredGrantees();
        this.cdr.markForCheck();
    }

    public OnEditRow(row: PermissionRow): void {
        this.EditingRowId = row.ID;
        this.FormGrantType = row.GrantType;
        this.FormGranteeId = row.GrantType === 'user' ? row.UserID : row.RoleID;
        this.FormCanView = row.CanView;
        this.FormCanRun = row.CanRun;
        this.FormCanEdit = row.CanEdit;
        this.FormCanDelete = row.CanDelete;
        this.FormComments = row.Comments || '';
        this.IsFormOpen = true;

        // Set search query to the grantee name
        this.SearchQuery = row.GrantedToName;
        this.updateFilteredGrantees();
        this.cdr.markForCheck();
    }

    public async OnDeleteRow(row: PermissionRow): Promise<void> {
        if (!this._agent) return;
        const deleted = await this.permsSvc.DeletePermission(row.Entity);
        if (deleted) {
            this.Rows = await this.permsSvc.RefreshPermissions(this._agent.ID);
            this.PermissionsChanged.emit();
            this.cdr.markForCheck();
        }
    }

    // =========================================================================
    // Form interactions
    // =========================================================================

    public OnCancelForm(): void {
        this.resetForm();
        this.cdr.markForCheck();
    }

    public OnSearchChanged(): void {
        this.updateFilteredGrantees();
        this.cdr.markForCheck();
    }

    public OnPermToggle(level: 'run' | 'edit' | 'delete'): void {
        if (level === 'delete' && this.FormCanDelete) {
            this.FormCanEdit = true;
            this.FormCanRun = true;
            this.FormCanView = true;
        } else if (level === 'edit' && this.FormCanEdit) {
            this.FormCanRun = true;
            this.FormCanView = true;
        } else if (level === 'run' && this.FormCanRun) {
            this.FormCanView = true;
        }
    }

    public get CanSave(): boolean {
        if (!this.FormGranteeId) return false;
        return this.FormCanView || this.FormCanRun || this.FormCanEdit || this.FormCanDelete;
    }

    public async OnSave(): Promise<void> {
        if (!this._agent || !this.FormGranteeId || this.IsSaving) return;

        this.IsSaving = true;
        this.cdr.markForCheck();

        try {
            const existingEntity = this.EditingRowId
                ? this.Rows.find(r => r.ID === this.EditingRowId)?.Entity
                : undefined;

            const saved = await this.permsSvc.SavePermission(
                this._agent,
                this.FormGrantType,
                this.FormGranteeId,
                this.FormCanView,
                this.FormCanRun,
                this.FormCanEdit,
                this.FormCanDelete,
                this.FormComments || null,
                existingEntity
            );

            if (saved) {
                this.Rows = await this.permsSvc.RefreshPermissions(this._agent.ID);
                this.resetForm();
                this.PermissionsChanged.emit();
            }
        } finally {
            this.IsSaving = false;
            this.cdr.markForCheck();
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private resetForm(): void {
        this.IsFormOpen = false;
        this.EditingRowId = null;
        this.FormGrantType = 'user';
        this.FormGranteeId = null;
        this.FormCanView = false;
        this.FormCanRun = false;
        this.FormCanEdit = false;
        this.FormCanDelete = false;
        this.FormComments = '';
        this.SearchQuery = '';
        this.FilteredGrantees = [];
    }

    private updateFilteredGrantees(): void {
        const query = this.SearchQuery.toLowerCase().trim();
        const source: GranteeOption[] = this.FormGrantType === 'user'
            ? this.permsSvc.Users.map((u: MJUserEntity) => ({ ID: u.ID, Name: u.Name }))
            : this.permsSvc.Roles.map((r: RoleInfo) => ({ ID: r.ID, Name: r.Name }));

        this.FilteredGrantees = query
            ? source.filter(g => g.Name.toLowerCase().includes(query))
            : source;

        // Limit displayed results to prevent overwhelming the UI
        if (this.FilteredGrantees.length > 20) {
            this.FilteredGrantees = this.FilteredGrantees.slice(0, 20);
        }
    }
}
