/**
 * @fileoverview MCP Server Dialog Component
 *
 * Dialog for creating and editing MCP server configurations.
 */

import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { MJMCPServerEntity } from '@memberjunction/core-entities';
import { MCPServerData } from '../mcp-dashboard.component';

/**
 * Transport type options
 */
export const TRANSPORT_TYPES = [
    { value: 'StreamableHTTP', label: 'Streamable HTTP', description: 'HTTP-based transport with streaming support' },
    { value: 'SSE', label: 'Server-Sent Events', description: 'SSE-based transport for real-time updates' },
    { value: 'Stdio', label: 'Standard I/O', description: 'For local subprocess communication' },
    { value: 'WebSocket', label: 'WebSocket', description: 'Full-duplex WebSocket connection' }
];

/**
 * Auth type options
 */
export const AUTH_TYPES = [
    { value: 'None', label: 'None', description: 'No authentication required' },
    { value: 'Bearer', label: 'Bearer Token', description: 'Authorization header with Bearer token' },
    { value: 'APIKey', label: 'API Key', description: 'API key in custom header' },
    { value: 'OAuth2', label: 'OAuth 2.0', description: 'OAuth 2.0 authentication flow' },
    { value: 'Basic', label: 'Basic Auth', description: 'Username and password authentication' },
    { value: 'Custom', label: 'Custom', description: 'Custom authentication scheme' }
];

/**
 * Dialog result interface
 */
export interface ServerDialogResult {
    saved: boolean;
    server?: MCPServerData;
}

/**
 * MCP Server Dialog Component
 */
@Component({
  standalone: false,
    selector: 'mj-mcp-server-dialog',
    templateUrl: './mcp-server-dialog.component.html',
    styleUrls: ['./mcp-server-dialog.component.css']
})
export class MCPServerDialogComponent implements OnInit, OnChanges {

    @Input() server: MCPServerData | null = null;
    @Input() visible = false;
    @Output() close = new EventEmitter<ServerDialogResult>();

    public serverForm: FormGroup;
    public transportTypes = TRANSPORT_TYPES;
    public authTypes = AUTH_TYPES;
    public IsSaving = false;
    public ErrorMessage: string | null = null;

    public get IsEditMode(): boolean {
        return !!this.server?.ID;
    }

    public get DialogTitle(): string {
        return this.IsEditMode ? 'Edit MCP Server' : 'Add MCP Server';
    }

    public get SelectedTransportType(): string {
        return this.serverForm?.get('TransportType')?.value ?? 'StreamableHTTP';
    }

    public get RequiresURL(): boolean {
        const transport = this.SelectedTransportType;
        return transport === 'StreamableHTTP' || transport === 'SSE' || transport === 'WebSocket';
    }

    public get RequiresCommand(): boolean {
        return this.SelectedTransportType === 'Stdio';
    }

    public get SelectedAuthType(): string {
        return this.serverForm?.get('DefaultAuthType')?.value ?? 'None';
    }

    public get IsOAuth2(): boolean {
        return this.SelectedAuthType === 'OAuth2';
    }

    constructor(
        private fb: FormBuilder,
        private cdr: ChangeDetectorRef
    ) {
        this.serverForm = this.createForm();
    }

    ngOnInit(): void {
        this.initializeForm();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['server'] || changes['visible']) {
            if (this.visible) {
                this.initializeForm();
            }
        }
    }

    private createForm(): FormGroup {
        return this.fb.group({
            Name: ['', [Validators.required, Validators.maxLength(200)]],
            Description: ['', Validators.maxLength(2000)],
            TransportType: ['StreamableHTTP', Validators.required],
            ServerURL: [''],
            Command: [''],
            CommandArgs: [''],
            DefaultAuthType: ['None', Validators.required],
            RateLimitPerMinute: [null, [Validators.min(0)]],
            RateLimitPerHour: [null, [Validators.min(0)]],
            RequestTimeoutMs: [60000, [Validators.min(1000), Validators.max(600000)]],
            Status: ['Active'],
            // OAuth configuration fields
            OAuthIssuerURL: [''],
            OAuthScopes: [''],
            OAuthMetadataCacheTTLMinutes: [1440, [Validators.min(5)]],
            OAuthClientID: [''],
            OAuthClientSecretEncrypted: ['']
        });
    }

    private initializeForm(): void {
        if (this.server) {
            this.serverForm.patchValue({
                Name: this.server.Name,
                Description: this.server.Description ?? '',
                TransportType: this.server.TransportType,
                ServerURL: this.server.ServerURL ?? '',
                Command: this.server.Command ?? '',
                CommandArgs: '',  // Would need to load from entity
                DefaultAuthType: this.server.DefaultAuthType,
                RateLimitPerMinute: this.server.RateLimitPerMinute,
                RateLimitPerHour: this.server.RateLimitPerHour,
                RequestTimeoutMs: 60000,
                Status: this.server.Status,
                // OAuth configuration fields
                OAuthIssuerURL: this.server.OAuthIssuerURL ?? '',
                OAuthScopes: this.server.OAuthScopes ?? '',
                OAuthMetadataCacheTTLMinutes: this.server.OAuthMetadataCacheTTLMinutes ?? 1440,
                OAuthClientID: this.server.OAuthClientID ?? '',
                OAuthClientSecretEncrypted: this.server.OAuthClientSecretEncrypted ?? ''
            });
        } else {
            this.serverForm.reset({
                Name: '',
                Description: '',
                TransportType: 'StreamableHTTP',
                ServerURL: '',
                Command: '',
                CommandArgs: '',
                DefaultAuthType: 'None',
                RateLimitPerMinute: null,
                RateLimitPerHour: null,
                RequestTimeoutMs: 60000,
                Status: 'Active',
                // OAuth configuration fields
                OAuthIssuerURL: '',
                OAuthScopes: '',
                OAuthMetadataCacheTTLMinutes: 1440,
                OAuthClientID: '',
                OAuthClientSecretEncrypted: ''
            });
        }
        this.ErrorMessage = null;
        this.updateValidators();
        this.cdr.detectChanges();
    }

    private updateValidators(): void {
        const urlControl = this.serverForm.get('ServerURL');
        const commandControl = this.serverForm.get('Command');
        const oauthIssuerControl = this.serverForm.get('OAuthIssuerURL');

        if (this.RequiresURL) {
            urlControl?.setValidators([Validators.required]);
            commandControl?.clearValidators();
        } else if (this.RequiresCommand) {
            commandControl?.setValidators([Validators.required]);
            urlControl?.clearValidators();
        } else {
            urlControl?.clearValidators();
            commandControl?.clearValidators();
        }

        // OAuth2 requires an issuer URL
        if (this.IsOAuth2) {
            oauthIssuerControl?.setValidators([Validators.required]);
        } else {
            oauthIssuerControl?.clearValidators();
        }

        urlControl?.updateValueAndValidity();
        commandControl?.updateValueAndValidity();
        oauthIssuerControl?.updateValueAndValidity();
    }

    public onTransportTypeChange(): void {
        this.updateValidators();
    }

    public onAuthTypeChange(): void {
        this.updateValidators();
    }

    public async save(): Promise<void> {
        if (this.serverForm.invalid) {
            this.serverForm.markAllAsTouched();
            return;
        }

        this.IsSaving = true;
        this.ErrorMessage = null;
        this.cdr.detectChanges();

        try {
            const md = new Metadata();
            const entity = await md.GetEntityObject<MJMCPServerEntity>('MJ: MCP Servers');

            if (this.IsEditMode && this.server) {
                await entity.InnerLoad(new CompositeKey([{ FieldName: 'ID', Value: this.server.ID }]));
            } else {
                entity.NewRecord();
            }

            // Apply form values
            const formValue = this.serverForm.value;
            entity.Name = formValue.Name;
            entity.Description = formValue.Description || null;
            entity.TransportType = formValue.TransportType;
            entity.ServerURL = formValue.ServerURL || null;
            entity.Command = formValue.Command || null;
            entity.CommandArgs = formValue.CommandArgs || null;
            entity.DefaultAuthType = formValue.DefaultAuthType;
            entity.RateLimitPerMinute = formValue.RateLimitPerMinute || null;
            entity.RateLimitPerHour = formValue.RateLimitPerHour || null;
            entity.RequestTimeoutMs = formValue.RequestTimeoutMs || 60000;
            entity.Status = formValue.Status;

            // OAuth configuration fields (only set if OAuth2 is selected)
            if (formValue.DefaultAuthType === 'OAuth2') {
                entity.OAuthIssuerURL = formValue.OAuthIssuerURL || null;
                entity.OAuthScopes = formValue.OAuthScopes || null;
                entity.OAuthMetadataCacheTTLMinutes = formValue.OAuthMetadataCacheTTLMinutes || 1440;
                entity.OAuthClientID = formValue.OAuthClientID || null;
                entity.OAuthClientSecretEncrypted = formValue.OAuthClientSecretEncrypted || null;
            } else {
                // Clear OAuth fields when not using OAuth2
                entity.OAuthIssuerURL = null;
                entity.OAuthScopes = null;
                entity.OAuthMetadataCacheTTLMinutes = null;
                entity.OAuthClientID = null;
                entity.OAuthClientSecretEncrypted = null;
            }

            const saved = await entity.Save();
            if (!saved) {
                throw new Error('Failed to save server');
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
        const control = this.serverForm.get(controlName);
        return control?.hasError(errorType) && control?.touched || false;
    }
}
