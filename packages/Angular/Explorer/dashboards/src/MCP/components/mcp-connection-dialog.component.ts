/**
 * @fileoverview MCP Connection Dialog Component
 *
 * Dialog for creating and editing MCP server connections.
 */

import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Metadata, RunView, CompositeKey } from '@memberjunction/core';
import { MCPServerConnectionEntity } from '@memberjunction/core-entities';
import { MCPConnectionData, MCPServerData } from '../mcp-dashboard.component';

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
    selector: 'mj-mcp-connection-dialog',
    templateUrl: './mcp-connection-dialog.component.html',
    styleUrls: ['./mcp-connection-dialog.component.css']
})
export class MCPConnectionDialogComponent implements OnInit, OnChanges {

    @Input() connection: MCPConnectionData | null = null;
    @Input() servers: MCPServerData[] = [];
    @Input() visible = false;
    @Output() close = new EventEmitter<ConnectionDialogResult>();

    public connectionForm: FormGroup;
    public credentials: Array<{ ID: string; Name: string }> = [];
    public IsSaving = false;
    public IsLoadingCredentials = false;
    public ErrorMessage: string | null = null;

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
        this.loadCredentials();
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

    private async loadCredentials(): Promise<void> {
        this.IsLoadingCredentials = true;
        try {
            const rv = new RunView();
            const result = await rv.RunView<{ ID: string; Name: string }>({
                EntityName: 'MJ: Credentials',
                Fields: ['ID', 'Name'],
                OrderBy: 'Name',
                ResultType: 'simple'
            });

            if (result.Success) {
                this.credentials = result.Results || [];
            }
        } catch (error) {
            console.error('Failed to load credentials:', error);
        } finally {
            this.IsLoadingCredentials = false;
            this.cdr.detectChanges();
        }
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
                throw new Error('Failed to save connection');
            }

            this.close.emit({ saved: true });

        } catch (error) {
            this.ErrorMessage = `Failed to save: ${error instanceof Error ? error.message : String(error)}`;
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
