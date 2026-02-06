/**
 * @fileoverview MCP Connection Dialog Component
 *
 * Dialog for creating and editing MCP server connections.
 */

import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { MCPServerConnectionEntity, CredentialTypeEntity } from '@memberjunction/core-entities';
import { MCPConnectionData, MCPServerData } from '../mcp-dashboard.component';
import { CredentialDialogComponent, CredentialDialogResult } from '@memberjunction/ng-credentials';

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
export class MCPConnectionDialogComponent implements OnInit, OnChanges {

    @ViewChild('credentialDialog') credentialDialog!: CredentialDialogComponent;

    @Input() connection: MCPConnectionData | null = null;
    @Input() servers: MCPServerData[] = [];
    @Input() visible = false;
    @Output() close = new EventEmitter<ConnectionDialogResult>();

    public connectionForm: FormGroup;
    public credentials: Array<{ ID: string; Name: string }> = [];
    public companies: Array<{ ID: string; Name: string }> = [];
    public credentialTypes: CredentialTypeEntity[] = [];
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
        return this.servers.filter(s => s.Status === 'Active');
    }

    constructor(
        private fb: FormBuilder,
        private cdr: ChangeDetectorRef
    ) {
        this.connectionForm = this.createForm();
    }

    ngOnInit(): void {
        this.loadDropdownData();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['connection'] || changes['visible']) {
            if (this.visible) {
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
            this.connectionForm.patchValue({
                MCPServerID: this.connection.MCPServerID,
                Name: this.connection.Name,
                Description: this.connection.Description ?? '',
                CompanyID: this.connection.CompanyID ?? '',
                CredentialID: '',  // Would need to load from entity
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
            this.connectionForm.reset({
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
            const rv = new RunView();
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
                    EntityName: 'Companies',
                    Fields: ['ID', 'Name'],
                    OrderBy: 'Name',
                    ResultType: 'simple'
                }
            ]);

            if (credResult.Success) {
                this.credentials = credResult.Results as Array<{ ID: string; Name: string }> || [];
            }
            if (typeResult.Success) {
                this.credentialTypes = typeResult.Results as CredentialTypeEntity[] || [];
            }
            if (companyResult.Success) {
                this.companies = companyResult.Results as Array<{ ID: string; Name: string }> || [];
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
    public openCredentialDialog(): void {
        this.ShowCredentialDialog = true;
        this.cdr.detectChanges();
    }

    /**
     * Handles the credential dialog close event
     */
    public onCredentialDialogClose(result: CredentialDialogResult): void {
        this.ShowCredentialDialog = false;

        if (result.success && result.credential) {
            // Add the new credential to the list and select it
            this.credentials.push({
                ID: result.credential.ID,
                Name: result.credential.Name
            });
            // Sort credentials by name
            this.credentials.sort((a, b) => a.Name.localeCompare(b.Name));
            // Select the new credential
            this.connectionForm.patchValue({
                CredentialID: result.credential.ID
            });
        }

        this.cdr.detectChanges();
    }

    public onServerChange(): void {
        const serverId = this.connectionForm.get('MCPServerID')?.value;
        const server = this.servers.find(s => s.ID === serverId);
        if (server && !this.connectionForm.get('Name')?.value) {
            // Auto-fill name based on server
            this.connectionForm.patchValue({
                Name: `${server.Name} Connection`
            });
        }
    }

    public async save(): Promise<void> {
        if (this.connectionForm.invalid) {
            this.connectionForm.markAllAsTouched();
            return;
        }

        this.IsSaving = true;
        this.ErrorMessage = null;
        this.cdr.detectChanges();

        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<MCPServerConnectionEntity>('MJ: MCP Server Connections');

            if (this.IsEditMode && this.connection) {
                await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: this.connection.ID }]));
            } else {
                entity.NewRecord();
            }

            // Apply form values
            const formValue = this.connectionForm.value;
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
                const errorMessage = entity.LatestResult?.CompleteMessage || entity.LatestResult?.Message || 'Unknown error';
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

    public hasError(controlName: string, errorType: string): boolean {
        const control = this.connectionForm.get(controlName);
        return control?.hasError(errorType) && control?.touched || false;
    }
}

/**
 * Tree-shaking prevention function
 */
export function LoadMCPConnectionDialog(): void {
    // Ensures the component is not tree-shaken
}
