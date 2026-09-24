/**
 * @fileoverview MCP Connection Dialog Component
 *
 * Dialog for creating and editing MCP server connections.
 */

import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RunView, CompositeKey } from '@memberjunction/core';
import { MJMCPServerConnectionEntity, MJCredentialTypeEntity } from '@memberjunction/core-entities';
import { MCPConnectionData, MCPServerData } from '../mcp-dashboard.component';
import { CredentialDialogComponent, CredentialDialogResult } from '@memberjunction/ng-credentials';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

/**
 * Dialog result interface
 */
export interface ConnectionDialogResult {
    saved: boolean;
    connection?: MCPConnectionData;
}

/**
 * MCP Connection Dialog Component
 */
@Component({
  standalone: false,
    selector: 'mj-mcp-connection-dialog',
    templateUrl: './mcp-connection-dialog.component.html',
    styleUrls: ['./mcp-connection-dialog.component.css']
})
export class MCPConnectionDialogComponent extends BaseAngularComponent implements OnInit, OnChanges {

    @ViewChild('credentialDialog') CredentialDialog!: CredentialDialogComponent;

    /** @deprecated Use {@link CredentialDialog}. */
    get credentialDialog(): CredentialDialogComponent {
      return this.CredentialDialog;
    }
    /** @deprecated Use {@link CredentialDialog}. */
    set credentialDialog(value: CredentialDialogComponent) {
      this.CredentialDialog = value;
    }

    @Input() connection: MCPConnectionData | null = null;
    @Input() Servers: MCPServerData[] = [];

    /** @deprecated Use {@link Servers}. */
    @Input() set servers(value: MCPServerData[]) {
      this.Servers = value;
    }
    /** @deprecated Use {@link Servers}. */
    get servers(): MCPServerData[] {
      return this.Servers;
    }
    @Input() Visible = false;

    /** @deprecated Use {@link Visible}. */
    @Input() set visible(value: MCPConnectionDialogComponent['Visible']) {
      this.Visible = value;
    }
    /** @deprecated Use {@link Visible}. */
    get visible(): MCPConnectionDialogComponent['Visible'] {
      return this.Visible;
    }
    @Output() close = new EventEmitter<ConnectionDialogResult>();

    public ConnectionForm: FormGroup;

    /** @deprecated Use {@link ConnectionForm}. */
    public get connectionForm(): FormGroup {
      return this.ConnectionForm;
    }
    /** @deprecated Use {@link ConnectionForm}. */
    public set connectionForm(value: FormGroup) {
      this.ConnectionForm = value;
    }
    public Credentials: Array<{ ID: string; Name: string }> = [];

    /** @deprecated Use {@link Credentials}. */
    public get credentials(): Array<{ ID: string; Name: string }> {
      return this.Credentials;
    }
    /** @deprecated Use {@link Credentials}. */
    public set credentials(value: Array<{ ID: string; Name: string }>) {
      this.Credentials = value;
    }
    public Companies: Array<{ ID: string; Name: string }> = [];

    /** @deprecated Use {@link Companies}. */
    public get companies(): Array<{ ID: string; Name: string }> {
      return this.Companies;
    }
    /** @deprecated Use {@link Companies}. */
    public set companies(value: Array<{ ID: string; Name: string }>) {
      this.Companies = value;
    }
    public CredentialTypes: MJCredentialTypeEntity[] = [];

    /** @deprecated Use {@link CredentialTypes}. */
    public get credentialTypes(): MJCredentialTypeEntity[] {
      return this.CredentialTypes;
    }
    /** @deprecated Use {@link CredentialTypes}. */
    public set credentialTypes(value: MJCredentialTypeEntity[]) {
      this.CredentialTypes = value;
    }
    public IsSaving = false;
    public IsLoadingDropdowns = false;
    public ErrorMessage: string | null = null;
    public ShowCredentialDialog = false;

    public get IsEditMode(): boolean {
        return !!this.connection?.ID;
    }

    public get DialogTitle(): string {
        return this.IsEditMode ? 'Edit Connection' : 'Add Connection';
    }

    public get ActiveServers(): MCPServerData[] {
        return this.Servers.filter(s => s.Status === 'Active');
    }

    constructor(
        private fb: FormBuilder,
        private cdr: ChangeDetectorRef
    ) {
        super();
        this.ConnectionForm = this.createForm();
    }

    ngOnInit(): void {
        this.loadDropdownData();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['connection'] || changes['visible']) {
            if (this.Visible) {
                this.initializeForm();
            }
        }
    }

    private createForm(): FormGroup {
        return this.fb.group({
            MCPServerID: ['', Validators.required],
            Name: ['', [Validators.required, Validators.maxLength(200)]],
            Description: ['', Validators.maxLength(2000)],
            CompanyID: [''],
            CredentialID: [''],
            AutoSyncTools: [true],
            LogToolCalls: [true],
            LogInputParameters: [true],
            LogOutputContent: [true],
            MaxOutputLogSize: [102400, [Validators.min(0), Validators.max(10485760)]],
            CustomHeaderName: [''],
            EnvironmentVars: [''],
            Status: ['Active']
        });
    }

    private initializeForm(): void {
        if (this.connection) {
            this.ConnectionForm.patchValue({
                MCPServerID: this.connection.MCPServerID,
                Name: this.connection.Name,
                Description: this.connection.Description ?? '',
                CompanyID: this.connection.CompanyID ?? '',
                CredentialID: this.connection.CredentialID ?? '',
                AutoSyncTools: this.connection.AutoSyncTools,
                LogToolCalls: this.connection.LogToolCalls,
                LogInputParameters: true,
                LogOutputContent: true,
                MaxOutputLogSize: 102400,
                CustomHeaderName: '',
                EnvironmentVars: '',
                Status: this.connection.Status
            });
        } else {
            this.ConnectionForm.reset({
                MCPServerID: '',
                Name: '',
                Description: '',
                CompanyID: '',
                CredentialID: '',
                AutoSyncTools: true,
                LogToolCalls: true,
                LogInputParameters: true,
                LogOutputContent: true,
                MaxOutputLogSize: 102400,
                CustomHeaderName: '',
                EnvironmentVars: '',
                Status: 'Active'
            });
        }
        this.ErrorMessage = null;
        this.cdr.detectChanges();
    }

    private async loadDropdownData(): Promise<void> {
        this.IsLoadingDropdowns = true;
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            // Load credentials, credential types, and companies in parallel
            const [credResult, typeResult, companyResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Credentials',
                    Fields: ['ID', 'Name'],
                    OrderBy: 'Name',
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: Credential Types',
                    OrderBy: 'Category, Name',
                    ResultType: 'entity_object'
                },
                {
                    EntityName: 'MJ: Companies',
                    Fields: ['ID', 'Name'],
                    OrderBy: 'Name',
                    ResultType: 'simple'
                }
            ]);

            if (credResult.Success) {
                this.Credentials = credResult.Results as Array<{ ID: string; Name: string }> || [];
            }
            if (typeResult.Success) {
                this.CredentialTypes = typeResult.Results as MJCredentialTypeEntity[] || [];
            }
            if (companyResult.Success) {
                this.Companies = companyResult.Results as Array<{ ID: string; Name: string }> || [];
            }
        } catch (error) {
            console.error('Failed to load dropdown data:', error);
        } finally {
            this.IsLoadingDropdowns = false;
            this.cdr.detectChanges();
        }
    }

    /**
     * Opens the credential creation dialog
     */
    public OpenCredentialDialog(): void {
        this.ShowCredentialDialog = true;
        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OpenCredentialDialog}. */
    public openCredentialDialog(): void {
      return this.OpenCredentialDialog();
    }

    /**
     * Handles the credential dialog close event
     */
    public OnCredentialDialogClose(result: CredentialDialogResult): void {
        this.ShowCredentialDialog = false;

        if (result.success && result.credential) {
            // Add the new credential to the list and select it
            this.Credentials.push({
                ID: result.credential.ID,
                Name: result.credential.Name
            });
            // Sort credentials by name
            this.Credentials.sort((a, b) => a.Name.localeCompare(b.Name));
            // Select the new credential
            this.ConnectionForm.patchValue({
                CredentialID: result.credential.ID
            });
        }

        this.cdr.detectChanges();
    }

    /** @deprecated Use {@link OnCredentialDialogClose}. */
    public onCredentialDialogClose(result: CredentialDialogResult): void {
      return this.OnCredentialDialogClose(result);
    }

    public OnServerChange(): void {
        const serverId = this.ConnectionForm.get('MCPServerID')?.value;
        const server = this.Servers.find(s => UUIDsEqual(s.ID, serverId));
        if (server && !this.ConnectionForm.get('Name')?.value) {
            // Auto-fill name based on server
            this.ConnectionForm.patchValue({
                Name: `${server.Name} Connection`
            });
        }
    }

    /** @deprecated Use {@link OnServerChange}. */
    public onServerChange(): void {
      return this.OnServerChange();
    }

    public async save(): Promise<void> {
        if (this.ConnectionForm.invalid) {
            this.ConnectionForm.markAllAsTouched();
            return;
        }

        this.IsSaving = true;
        this.ErrorMessage = null;
        this.cdr.detectChanges();

        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<MJMCPServerConnectionEntity>('MJ: MCP Server Connections');

            if (this.IsEditMode && this.connection) {
                await entity.InnerLoad(CompositeKey.FromID(this.connection.ID));
            } else {
                entity.NewRecord();
            }

            // Apply form values
            const formValue = this.ConnectionForm.value;
            entity.MCPServerID = formValue.MCPServerID;
            entity.Name = formValue.Name;
            entity.Description = formValue.Description || null;
            entity.CompanyID = formValue.CompanyID || null;
            entity.CredentialID = formValue.CredentialID || null;
            entity.AutoSyncTools = formValue.AutoSyncTools;
            entity.LogToolCalls = formValue.LogToolCalls;
            entity.LogInputParameters = formValue.LogInputParameters;
            entity.LogOutputContent = formValue.LogOutputContent;
            entity.MaxOutputLogSize = formValue.MaxOutputLogSize || 102400;
            entity.CustomHeaderName = formValue.CustomHeaderName || null;
            entity.EnvironmentVars = formValue.EnvironmentVars || null;
            entity.Status = formValue.Status;

            const saved = await entity.Save();
            if (!saved) {
                // Use CompleteMessage for full error details, fall back to Message
                const errorMessage = entity.LatestResult?.CompleteMessage || 'Unknown error';
                console.error('MCP Connection save failed:', errorMessage, entity.LatestResult);
                throw new Error(errorMessage);
            }

            this.close.emit({ saved: true });

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.ErrorMessage = `Failed to save: ${errorMsg}`;
            console.error('MCP Connection save error:', errorMsg);
            this.cdr.detectChanges();
        } finally {
            this.IsSaving = false;
            this.cdr.detectChanges();
        }
    }

    public cancel(): void {
        this.close.emit({ saved: false });
    }

    public HasError(controlName: string, errorType: string): boolean {
        const control = this.ConnectionForm.get(controlName);
        return control?.hasError(errorType) && control?.touched || false;
    }

    /** @deprecated Use {@link HasError}. */
    public hasError(controlName: string, errorType: string): boolean {
      return this.HasError(controlName, errorType);
    }
}
