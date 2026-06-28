import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { AgentToolResult, validateStringParam } from '../shared/agent-tool-validation';
import { buildApplicationRolesAgentContext } from './application-roles-agent-context';

/**
 * Represents an application's role assignment for display in the grid.
 */
interface ApplicationRoleRow {
  ID: string;
  ApplicationID: string;
  ApplicationName: string;
  RoleID: string;
  RoleName: string;
  CanAccess: boolean;
  CanAdmin: boolean;
  IsDirty: boolean;
  IsNew: boolean;
}

/**
 * Represents an application with its role assignments grouped.
 */
interface ApplicationGroup {
  ApplicationID: string;
  ApplicationName: string;
  Roles: ApplicationRoleRow[];
  Expanded: boolean;
}

/**
 * Admin dashboard for managing Application Role assignments.
 * Shows which roles can access and administer each application.
 */
@RegisterClass(BaseResourceComponent, 'ApplicationRolesResource')
@Component({
  standalone: false,
  selector: 'mj-application-roles-resource',
  templateUrl: './application-roles-resource.component.html',
  styleUrls: ['./application-roles-resource.component.css']
})
export class ApplicationRolesResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy, AfterViewInit {
  ApplicationGroups: ApplicationGroup[] = [];
  AvailableRoles: { ID: string; Name: string }[] = [];
  IsLoading = true;
  IsSaving = false;
  HasUnsavedChanges = false;
  ErrorMessage: string | null = null;
  SuccessMessage: string | null = null;

  // For the "Add Role" dropdown per application
  SelectedRoleIdToAdd: Map<string, string> = new Map();

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  override async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'App Roles';
  }

  override async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-user-shield';
  }

  override async ngOnInit(): Promise<void> {
    super.ngOnInit();
    await this.loadData();
    this.NotifyLoadComplete();
  }

  /**
   * After the view initializes, publish the initial agent context and register the read-only client
   * tools the AI agent can invoke against this surface. The ongoing context re-emit happens in
   * {@link loadData} and the UI handlers below, on every meaningful state change.
   */
  ngAfterViewInit(): void {
    this.publishAgentContext();
    this.registerAgentClientTools();
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  /**
   * Load all application role data and available roles.
   */
  async loadData(): Promise<void> {
    this.IsLoading = true;
    this.ErrorMessage = null;
    this.cdr.detectChanges();

    try {
      const md = this.ProviderToUse;
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);

      // Load available roles from metadata
      this.AvailableRoles = md.Roles.map(r => ({ ID: r.ID, Name: r.Name }))
        .sort((a, b) => a.Name.localeCompare(b.Name));

      // Load existing ApplicationRole records
      const result = await rv.RunView<{ ID: string; ApplicationID: string; Application: string; RoleID: string; Role: string; CanAccess: boolean; CanAdmin: boolean }>({
        EntityName: 'MJ: Application Roles',
        ResultType: 'simple',
      });

      if (!result.Success) {
        this.ErrorMessage = result.ErrorMessage || 'Failed to load application roles.';
        this.IsLoading = false;
        this.cdr.detectChanges();
        return;
      }

      // Build grouped structure
      const appMap = new Map<string, ApplicationGroup>();

      // Seed all applications so we can show apps without any role records
      for (const app of md.Applications) {
        appMap.set(app.ID, {
          ApplicationID: app.ID,
          ApplicationName: app.Name,
          Roles: [],
          Expanded: false,
        });
      }

      // Populate role assignments
      for (const record of result.Results) {
        const group = appMap.get(record.ApplicationID);
        if (group) {
          group.Roles.push({
            ID: record.ID,
            ApplicationID: record.ApplicationID,
            ApplicationName: group.ApplicationName,
            RoleID: record.RoleID,
            RoleName: record.Role || '',
            CanAccess: record.CanAccess,
            CanAdmin: record.CanAdmin,
            IsDirty: false,
            IsNew: false,
          });
        }
      }

      // Sort roles within each group
      for (const group of appMap.values()) {
        group.Roles.sort((a, b) => a.RoleName.localeCompare(b.RoleName));
      }

      this.ApplicationGroups = Array.from(appMap.values())
        .sort((a, b) => a.ApplicationName.localeCompare(b.ApplicationName));
    } catch (e) {
      this.ErrorMessage = `Error loading data: ${e instanceof Error ? e.message : String(e)}`;
    }

    this.IsLoading = false;
    this.HasUnsavedChanges = false;
    this.cdr.detectChanges();
    this.publishAgentContext();
  }

  /**
   * Toggle the expanded/collapsed state of an application group.
   */
  ToggleGroup(group: ApplicationGroup): void {
    group.Expanded = !group.Expanded;
    this.cdr.detectChanges();
    this.publishAgentContext();
  }

  /**
   * Toggle CanAccess for a specific role assignment.
   */
  ToggleCanAccess(row: ApplicationRoleRow): void {
    row.CanAccess = !row.CanAccess;
    row.IsDirty = true;
    this.HasUnsavedChanges = true;
    this.cdr.detectChanges();
  }

  /**
   * Toggle CanAdmin for a specific role assignment.
   */
  ToggleCanAdmin(row: ApplicationRoleRow): void {
    row.CanAdmin = !row.CanAdmin;
    row.IsDirty = true;
    this.HasUnsavedChanges = true;
    this.cdr.detectChanges();
  }

  /**
   * Get roles not yet assigned to a specific application (for the "Add Role" dropdown).
   */
  GetUnassignedRoles(group: ApplicationGroup): { ID: string; Name: string }[] {
    const assignedRoleIds = new Set(group.Roles.map(r => r.RoleID.toLowerCase()));
    return this.AvailableRoles.filter(r => !assignedRoleIds.has(r.ID.toLowerCase()));
  }

  /**
   * Add a new role assignment to an application group.
   */
  AddRole(group: ApplicationGroup): void {
    const roleId = this.SelectedRoleIdToAdd.get(group.ApplicationID);
    if (!roleId) return;

    const role = this.AvailableRoles.find(r => UUIDsEqual(r.ID, roleId));
    if (!role) return;

    group.Roles.push({
      ID: '',
      ApplicationID: group.ApplicationID,
      ApplicationName: group.ApplicationName,
      RoleID: role.ID,
      RoleName: role.Name,
      CanAccess: true,
      CanAdmin: false,
      IsDirty: true,
      IsNew: true,
    });

    group.Roles.sort((a, b) => a.RoleName.localeCompare(b.RoleName));
    this.SelectedRoleIdToAdd.delete(group.ApplicationID);
    this.HasUnsavedChanges = true;
    this.cdr.detectChanges();
  }

  /**
   * Remove a role assignment (marks for deletion on save; removes immediately if new).
   */
  RemoveRole(group: ApplicationGroup, row: ApplicationRoleRow): void {
    const idx = group.Roles.indexOf(row);
    if (idx >= 0) {
      group.Roles.splice(idx, 1);
    }
    // If not new, we need to delete it on save — track via dirty state
    if (!row.IsNew) {
      this._pendingDeletes.push(row.ID);
    }
    this.HasUnsavedChanges = true;
    this.cdr.detectChanges();
  }

  private _pendingDeletes: string[] = [];

  /**
   * Save all unsaved changes (new records, modified records, deleted records).
   */
  async SaveChanges(): Promise<void> {
    this.IsSaving = true;
    this.ErrorMessage = null;
    this.SuccessMessage = null;
    this.cdr.detectChanges();

    try {
      const md = this.ProviderToUse;

      // Process deletes
      for (const deleteId of this._pendingDeletes) {
        const entity = await md.GetEntityObject('MJ: Application Roles');
        await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: deleteId }]));
        const deleteResult = await entity.Delete();
        if (!deleteResult) {
          this.ErrorMessage = `Failed to delete role assignment: ${entity.LatestResult?.Message || 'Unknown error'}`;
          this.IsSaving = false;
          this.cdr.detectChanges();
          return;
        }
      }

      // Process new and modified records
      for (const group of this.ApplicationGroups) {
        for (const row of group.Roles) {
          if (!row.IsDirty) continue;

          if (row.IsNew) {
            const entity = await md.GetEntityObject('MJ: Application Roles');
            entity.NewRecord();
            entity.Set('ApplicationID', row.ApplicationID);
            entity.Set('RoleID', row.RoleID);
            entity.Set('CanAccess', row.CanAccess);
            entity.Set('CanAdmin', row.CanAdmin);
            const saveResult = await entity.Save();
            if (!saveResult) {
              this.ErrorMessage = `Failed to save new role assignment for ${row.RoleName}: ${entity.LatestResult?.Message || 'Unknown error'}`;
              this.IsSaving = false;
              this.cdr.detectChanges();
              return;
            }
            row.ID = entity.Get('ID');
          } else {
            const entity = await md.GetEntityObject('MJ: Application Roles');
            await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: row.ID }]));
            entity.Set('CanAccess', row.CanAccess);
            entity.Set('CanAdmin', row.CanAdmin);
            const saveResult = await entity.Save();
            if (!saveResult) {
              this.ErrorMessage = `Failed to update role assignment for ${row.RoleName}: ${entity.LatestResult?.Message || 'Unknown error'}`;
              this.IsSaving = false;
              this.cdr.detectChanges();
              return;
            }
          }

          row.IsDirty = false;
          row.IsNew = false;
        }
      }

      this._pendingDeletes = [];
      this.HasUnsavedChanges = false;
      this.SuccessMessage = 'All changes saved successfully.';
    } catch (e) {
      this.ErrorMessage = `Error saving: ${e instanceof Error ? e.message : String(e)}`;
    }

    this.IsSaving = false;
    this.cdr.detectChanges();
  }

  /**
   * Discard all unsaved changes and reload data.
   */
  async DiscardChanges(): Promise<void> {
    this._pendingDeletes = [];
    await this.loadData();
  }

  /**
   * Track by function for application groups.
   */
  TrackByAppId(_index: number, group: ApplicationGroup): string {
    return group.ApplicationID;
  }

  /**
   * Track by function for role rows.
   */
  TrackByRoleRow(_index: number, row: ApplicationRoleRow): string {
    return row.IsNew ? `new-${row.RoleID}` : row.ID;
  }

  /**
   * Get the role count label for an application.
   */
  GetRoleCountLabel(group: ApplicationGroup): string {
    if (group.Roles.length === 0) return 'Open Access (no role restrictions)';
    return `${group.Roles.length} role${group.Roles.length === 1 ? '' : 's'} assigned`;
  }

  /**
   * Handle dropdown selection for adding roles.
   */
  OnAddRoleSelect(group: ApplicationGroup, roleId: string): void {
    this.SelectedRoleIdToAdd.set(group.ApplicationID, roleId);
  }

  // ========================================
  // AI AGENT CONTEXT & CLIENT TOOLS
  //
  // 🔒 SAFETY BOUNDARY — Application Roles is a PERMISSION-MUTATING surface. The agent integration is
  // strictly READ-ONLY plus benign UI navigation. The following are DELIBERATELY NOT exposed to the
  // agent, because each writes/grants/revokes access:
  //   - ToggleCanAccess / ToggleCanAdmin (flip a role's access/admin permission)
  //   - AddRole / RemoveRole            (grant / revoke a role assignment)
  //   - SaveChanges / DiscardChanges    (persist or discard permission mutations)
  // Only filter / read / navigate / refresh capabilities are wired below. Do NOT add a mutating tool
  // here — permission changes must originate from an explicit human action in the UI.
  // ========================================

  /**
   * Publish the current Application Roles state to the AI agent via NavigationService. The shaping
   * lives in the pure {@link buildApplicationRolesAgentContext} helper so it stays unit-testable.
   * Called on init and on every meaningful state change (load, expand/collapse).
   */
  private publishAgentContext(): void {
    const context = buildApplicationRolesAgentContext({
      ApplicationGroupCount: this.ApplicationGroups.length,
      TotalRoleAssignmentCount: this.ApplicationGroups.reduce((sum, g) => sum + g.Roles.length, 0),
      HasUnsavedChanges: this.HasUnsavedChanges,
      IsLoading: this.IsLoading,
      ExpandedApplicationIds: this.ApplicationGroups.filter(g => g.Expanded).map(g => g.ApplicationID),
    });
    this.navigationService.SetAgentContext(this, context);
  }

  /**
   * Register the READ-ONLY client tools the AI agent can invoke against the Application Roles
   * surface. Each handler delegates to a read/navigation method a user interaction would call, and
   * returns `{ Success: true, Data? }` on success or `{ Success: false, ErrorMessage }` on failure.
   * Handlers are tolerant — they never throw. NO mutating tool is registered here (see the SAFETY
   * BOUNDARY comment above).
   */
  private registerAgentClientTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'ToggleApplicationGroup',
        Description: 'Expand or collapse the role assignments for one application by its application ID. This only changes the UI expand/collapse state — it does not modify any permissions.',
        ParameterSchema: { type: 'object', properties: { applicationId: { type: 'string' } }, required: ['applicationId'] },
        Handler: async (params: Record<string, unknown>) => this.toolToggleApplicationGroup(params),
      },
      {
        Name: 'GetRoleCountForApplication',
        Description: 'Read-only: return the number of roles assigned to one application by its application ID.',
        ParameterSchema: { type: 'object', properties: { applicationId: { type: 'string' } }, required: ['applicationId'] },
        Handler: async (params: Record<string, unknown>) => this.toolGetRoleCountForApplication(params),
      },
      {
        Name: 'RefreshApplicationRoleData',
        Description: 'Reload the application role assignment data from the server. Discards any unsaved edits in the grid.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          await this.loadData();
          return { Success: true };
        },
      },
    ]);
  }

  /** Resolve an application group by id and toggle its expand/collapse state (UI only). */
  private toolToggleApplicationGroup(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
    const validated = validateStringParam(params['applicationId'], 'applicationId');
    if (!validated.ok) {
      return validated.result;
    }
    const group = this.ApplicationGroups.find(g => UUIDsEqual(g.ApplicationID, validated.value));
    if (!group) {
      return { Success: false, ErrorMessage: `No application with ID "${validated.value}" is shown in this matrix.` };
    }
    this.ToggleGroup(group);
    return { Success: true, Data: { ApplicationName: group.ApplicationName, Expanded: group.Expanded } };
  }

  /** Read-only: resolve an application group by id and return its assigned-role count. */
  private toolGetRoleCountForApplication(params: Record<string, unknown>): AgentToolResult & { Data?: Record<string, unknown> } {
    const validated = validateStringParam(params['applicationId'], 'applicationId');
    if (!validated.ok) {
      return validated.result;
    }
    const group = this.ApplicationGroups.find(g => UUIDsEqual(g.ApplicationID, validated.value));
    if (!group) {
      return { Success: false, ErrorMessage: `No application with ID "${validated.value}" is shown in this matrix.` };
    }
    return { Success: true, Data: { ApplicationName: group.ApplicationName, RoleCount: group.Roles.length } };
  }
}

/** Tree-shaking prevention */
export function LoadApplicationRolesResource(): void {
  // Prevents tree-shaking
}
