/**
 * @fileoverview MCP Server Dialog Component
 *
 * Dialog for creating and editing MCP server configurations.
 */

import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CompositeKey } from '@memberjunction/core';
import { MJMCPServerEntity } from '@memberjunction/core-entities';
import { MCPServerData } from '../mcp-dashboard.component';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

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
export class MCPServerDialogComponent extends BaseAngularComponent implements OnInit, OnChanges {

    @Input() Server: MCPServerData | null = null;

    /** @deprecated Use {@link Server}. */
    @Input() set server(value: MCPServerData | null) {
      this.Server = value;
    }
    /** @deprecated Use {@link Server}. */
    get server(): MCPServerData | null {
      return this.Server;
    }
    @Input() Visible = false;

    /** @deprecated Use {@link Visible}. */
    @Input() set visible(value: MCPServerDialogComponent['Visible']) {
      this.Visible = value;
    }
    /** @deprecated Use {@link Visible}. */
    get visible(): MCPServerDialogComponent['Visible'] {
      return this.Visible;
    }
    @Output() close = new EventEmitter<ServerDialogResult>();

    public ServerForm: FormGroup;

    /** @deprecated Use {@link ServerForm}. */
    public get serverForm(): FormGroup {
      return this.ServerForm;
    }
    /** @deprecated Use {@link ServerForm}. */
    public set serverForm(value: FormGroup) {
      this.ServerForm = value;
    }
    public TransportTypes = TRANSPORT_TYPES;

    /** @deprecated Use {@link TransportTypes}. */
    public get transportTypes() {
      return this.TransportTypes;
    }
    /** @deprecated Use {@link TransportTypes}. */
    public set transportTypes(value) {
      this.TransportTypes = value;
    }
    public AuthTypes = AUTH_TYPES;

    /** @deprecated Use {@link AuthTypes}. */
    public get authTypes() {
      return this.AuthTypes;
    }
    /** @deprecated Use {@link AuthTypes}. */
    public set authTypes(value) {
      this.AuthTypes = value;
    }
    public IsSaving = false;
    public ErrorMessage: string | null = null;

    public get IsEditMode(): boolean {
        return !!this.Server?.ID;
    }

    public get DialogTitle(): string {
        return this.IsEditMode ? 'Edit MCP Server' : 'Add MCP Server';
    }

    public get SelectedTransportType(): string {
        return this.ServerForm?.get('TransportType')?.value ?? 'StreamableHTTP';
    }

    public get RequiresURL(): boolean {
        const transport = this.SelectedTransportType;
        return transport === 'StreamableHTTP' || transport === 'SSE' || transport === 'WebSocket';
    }

    public get RequiresCommand(): boolean {
        return this.SelectedTransportType === 'Stdio';
    }

    public get SelectedAuthType(): string {
        return this.ServerForm?.get('DefaultAuthType')?.value ?? 'None';
    }

    public get IsOAuth2(): boolean {
        return this.SelectedAuthType === 'OAuth2';
    }

    constructor(
        private fb: FormBuilder,
        private cdr: ChangeDetectorRef
    ) {
        super();
        this.ServerForm = this.createForm();
    }

    ngOnInit(): void {
        this.initializeForm();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['server'] || changes['visible']) {
            if (this.Visible) {
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
        if (this.Server) {
            this.ServerForm.patchValue({
                Name: this.Server.Name,
                Description: this.Server.Description ?? '',
                TransportType: this.Server.TransportType,
                ServerURL: this.Server.ServerURL ?? '',
                Command: this.Server.Command ?? '',
                CommandArgs: '',  // Would need to load from entity
                DefaultAuthType: this.Server.DefaultAuthType,
                RateLimitPerMinute: this.Server.RateLimitPerMinute,
                RateLimitPerHour: this.Server.RateLimitPerHour,
                RequestTimeoutMs: 60000,
                Status: this.Server.Status,
                // OAuth configuration fields
                OAuthIssuerURL: this.Server.OAuthIssuerURL ?? '',
                OAuthScopes: this.Server.OAuthScopes ?? '',
                OAuthMetadataCacheTTLMinutes: this.Server.OAuthMetadataCacheTTLMinutes ?? 1440,
                OAuthClientID: this.Server.OAuthClientID ?? '',
                OAuthClientSecretEncrypted: this.Server.OAuthClientSecretEncrypted ?? ''
            });
        } else {
            this.ServerForm.reset({
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
        const urlControl = this.ServerForm.get('ServerURL');
        const commandControl = this.ServerForm.get('Command');
        const oauthIssuerControl = this.ServerForm.get('OAuthIssuerURL');

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

    public OnTransportTypeChange(): void {
        this.updateValidators();
    }

    /** @deprecated Use {@link OnTransportTypeChange}. */
    public onTransportTypeChange(): void {
      return this.OnTransportTypeChange();
    }

    public OnAuthTypeChange(): void {
        this.updateValidators();
    }

    /** @deprecated Use {@link OnAuthTypeChange}. */
    public onAuthTypeChange(): void {
      return this.OnAuthTypeChange();
    }

    public async save(): Promise<void> {
        if (this.ServerForm.invalid) {
            this.ServerForm.markAllAsTouched();
            return;
        }

        this.IsSaving = true;
        this.ErrorMessage = null;
        this.cdr.detectChanges();

        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject<MJMCPServerEntity>('MJ: MCP Servers');

            if (this.IsEditMode && this.Server) {
                await entity.InnerLoad(CompositeKey.FromID(this.Server.ID));
            } else {
                entity.NewRecord();
            }

            // Apply form values
            const formValue = this.ServerForm.value;
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

    public HasError(controlName: string, errorType: string): boolean {
        const control = this.ServerForm.get(controlName);
        return control?.hasError(errorType) && control?.touched || false;
    }

    /** @deprecated Use {@link HasError}. */
    public hasError(controlName: string, errorType: string): boolean {
      return this.HasError(controlName, errorType);
    }
}
