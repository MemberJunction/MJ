/**
 * @fileoverview Agent Request Panel Component
 *
 * Slide-in panel for viewing and responding to AI agent feedback requests.
 * Displays request details, renders ResponseSchema as a dynamic form,
 * and submits ResponseData back to the request entity.
 */

import {
    Component, Input, Output, EventEmitter, ChangeDetectorRef,
    ChangeDetectionStrategy, OnInit, OnDestroy, HostListener
} from '@angular/core';
import { MJAIAgentRequestEntity, MJAIAgentRequestTypeEntity } from '@memberjunction/core-entities';
import { Metadata, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJNotificationService } from '@memberjunction/ng-notifications';

/**
 * Result returned when the panel closes after an action
 */
export interface AgentRequestPanelResult {
    /** Whether an action was taken (responded, approved, rejected) */
    Success: boolean;
    /** The updated request entity */
    Request?: MJAIAgentRequestEntity;
    /** The action that was taken */
    Action: 'responded' | 'approved' | 'rejected' | 'cancelled';
}

/**
 * A single field definition parsed from ResponseSchema
 */
interface ResponseFormField {
    Name: string;
    Label: string;
    Type: string;
    Required: boolean;
    Options?: string[];
    MinValue?: number;
    MaxValue?: number;
    DefaultValue?: string | number | boolean;
    Placeholder?: string;
}

@Component({
    standalone: false,
    selector: 'mj-agent-request-panel',
    templateUrl: './agent-request-panel.component.html',
    styleUrls: ['./agent-request-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AgentRequestPanelComponent implements OnInit, OnDestroy {
    @Input() Request: MJAIAgentRequestEntity | null = null;
    @Input() RequestTypes: MJAIAgentRequestTypeEntity[] = [];
    @Input() IsOpen = false;

    @Output() Close = new EventEmitter<AgentRequestPanelResult>();

    public IsLoading = false;
    public IsSaving = false;
    public ResponseText = '';
    public FormValues: Record<string, string | number | boolean> = {};
    public FormFields: ResponseFormField[] = [];

    // Reassign state
    public ShowReassignDialog = false;
    public ReassignSearchTerm = '';
    public ReassignNote = '';
    public ReassignUsers: Array<{ ID: string; Name: string; Email: string }> = [];
    public SelectedReassignUser: { ID: string; Name: string; Email: string } | null = null;
    public IsSearchingUsers = false;
    public IsReassigning = false;

    private _metadata = new Metadata();
    private reassignSearchTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private cdr: ChangeDetectorRef,
        private notificationService: MJNotificationService
    ) {}

    ngOnInit(): void {
        if (this.Request) {
            this.initializeForm();
        }
    }

    ngOnDestroy(): void {
        // Cleanup
    }

    @HostListener('document:keydown.escape')
    public OnEscapeKey(): void {
        if (this.IsOpen) {
            this.OnCancel();
        }
    }

    /** The request type entity for the current request */
    public get RequestType(): MJAIAgentRequestTypeEntity | null {
        if (!this.Request?.RequestTypeID) return null;
        return this.RequestTypes.find(t => UUIDsEqual(t.ID, this.Request!.RequestTypeID!)) ?? null;
    }

    /** Whether this request is still actionable (status = Requested) */
    public get IsActionable(): boolean {
        return this.Request?.Status === 'Requested';
    }

    /** Whether this is an approval-type request (show approve/reject buttons) */
    public get IsApprovalType(): boolean {
        const typeName = this.RequestType?.Name;
        return typeName === 'Approval';
    }

    /** Whether the request has a structured response form */
    public get HasResponseForm(): boolean {
        return this.FormFields.length > 0;
    }

    /** Priority display label */
    public get PriorityLabel(): string {
        if (!this.Request) return '';
        const p = this.Request.Priority;
        if (p <= 25) return 'Low';
        if (p <= 50) return 'Normal';
        if (p <= 75) return 'High';
        return 'Critical';
    }

    /** Priority CSS class */
    public get PriorityClass(): string {
        if (!this.Request) return '';
        const p = this.Request.Priority;
        if (p <= 25) return 'priority-low';
        if (p <= 50) return 'priority-normal';
        if (p <= 75) return 'priority-high';
        return 'priority-critical';
    }

    /** Whether the request is expired */
    public get IsExpired(): boolean {
        if (!this.Request?.ExpiresAt) return false;
        return new Date(this.Request.ExpiresAt) < new Date();
    }

    /**
     * Opens the panel with a specific request
     */
    public Open(request: MJAIAgentRequestEntity): void {
        this.Request = request;
        this.IsOpen = true;
        this.ResponseText = '';
        this.FormValues = {};
        this.initializeForm();
        this.cdr.markForCheck();
    }

    /**
     * Approve the request
     */
    public async OnApprove(): Promise<void> {
        await this.submitResponse('Approved', 'approved');
    }

    /**
     * Reject the request
     */
    public async OnReject(): Promise<void> {
        await this.submitResponse('Rejected', 'rejected');
    }

    /**
     * Submit a response (for non-approval types)
     */
    public async OnRespond(): Promise<void> {
        await this.submitResponse('Responded', 'responded');
    }

    /**
     * Cancel / close the panel without action
     */
    public OnCancel(): void {
        this.IsOpen = false;
        this.Close.emit({ Success: false, Action: 'cancelled' });
        this.cdr.markForCheck();
    }

    public OnBackdropClick(): void {
        this.OnCancel();
    }

    /** Open the reassign dialog */
    public OnReassignClick(): void {
        this.ShowReassignDialog = true;
        this.ReassignSearchTerm = '';
        this.ReassignNote = '';
        this.ReassignUsers = [];
        this.SelectedReassignUser = null;
        this.cdr.markForCheck();
    }

    /** Close the reassign dialog */
    public OnReassignCancel(): void {
        this.ShowReassignDialog = false;
        this.cdr.markForCheck();
    }

    /** Search users by name/email for reassignment */
    public OnReassignSearchChange(term: string): void {
        this.ReassignSearchTerm = term;
        if (this.reassignSearchTimeout) {
            clearTimeout(this.reassignSearchTimeout);
        }
        if (term.length < 2) {
            this.ReassignUsers = [];
            this.cdr.markForCheck();
            return;
        }
        this.reassignSearchTimeout = setTimeout(() => this.searchUsers(term), 300);
    }

    /** Select a user from the search results */
    public OnSelectReassignUser(user: { ID: string; Name: string; Email: string }): void {
        this.SelectedReassignUser = user;
        this.cdr.markForCheck();
    }

    /** Submit the reassignment */
    public async OnReassignSubmit(): Promise<void> {
        if (!this.Request || !this.SelectedReassignUser || this.IsReassigning) return;

        this.IsReassigning = true;
        this.cdr.markForCheck();

        try {
            this.Request.RequestForUserID = this.SelectedReassignUser.ID;

            // Append reassignment note to Comments
            const timestamp = new Date().toISOString();
            const reassignEntry = `[${timestamp}] Reassigned to ${this.SelectedReassignUser.Name || this.SelectedReassignUser.Email}${this.ReassignNote ? ` — "${this.ReassignNote}"` : ''}`;
            this.Request.Comments = this.Request.Comments
                ? `${this.Request.Comments}\n${reassignEntry}`
                : reassignEntry;

            const saved = await this.Request.Save();
            if (saved) {
                this.notificationService.CreateSimpleNotification(
                    `Request reassigned to ${this.SelectedReassignUser.Name || this.SelectedReassignUser.Email}`, 'success', 3000
                );
                this.ShowReassignDialog = false;
                this.IsOpen = false;
                this.Close.emit({ Success: true, Request: this.Request, Action: 'cancelled' });
            } else {
                this.notificationService.CreateSimpleNotification(
                    'Failed to reassign request. Please try again.', 'error', 5000
                );
            }
        } catch (error) {
            console.error('Error reassigning request:', error);
            this.notificationService.CreateSimpleNotification(
                'An unexpected error occurred.', 'error', 5000
            );
        } finally {
            this.IsReassigning = false;
            this.cdr.markForCheck();
        }
    }

    private async searchUsers(term: string): Promise<void> {
        this.IsSearchingUsers = true;
        this.cdr.markForCheck();

        try {
            const rv = new RunView();
            const result = await rv.RunView<{ ID: string; Name: string; Email: string }>({
                EntityName: 'Users',
                ExtraFilter: `(Name LIKE '%${term.replace(/'/g, "''")}%' OR Email LIKE '%${term.replace(/'/g, "''")}%')`,
                OrderBy: 'Name',
                MaxRows: 10,
                Fields: ['ID', 'Name', 'Email'],
                ResultType: 'simple'
            });
            this.ReassignUsers = result.Success ? result.Results : [];
        } catch {
            this.ReassignUsers = [];
        } finally {
            this.IsSearchingUsers = false;
            this.cdr.markForCheck();
        }
    }

    /**
     * Parse the ResponseSchema JSON and set up form fields.
     * Supports the AgentResponseForm format (questions array with nested type objects)
     * as well as a simple Fields array format.
     */
    private initializeForm(): void {
        this.FormFields = [];
        this.FormValues = {};

        if (!this.Request?.ResponseSchema) return;

        try {
            const schema = JSON.parse(this.Request.ResponseSchema);

            // AgentResponseForm format: { title, description, questions: [...] }
            if (schema?.questions && Array.isArray(schema.questions)) {
                this.FormFields = schema.questions.map((q: Record<string, unknown>) => this.parseAgentResponseFormQuestion(q));
            }
            // Simple Fields array format: { Fields: [...] }
            else if (schema?.Fields && Array.isArray(schema.Fields)) {
                this.FormFields = schema.Fields.map((f: Record<string, unknown>) => this.parseSimpleFormField(f));
            }

            // Set default values
            for (const field of this.FormFields) {
                if (field.DefaultValue != null) {
                    this.FormValues[field.Name] = field.DefaultValue;
                }
            }
        } catch {
            // If schema is invalid JSON, ignore — user can still provide free-text response
        }
    }

    /**
     * Parse an AgentResponseForm question into a ResponseFormField.
     * AgentResponseForm questions have: { id, label, type: { type, options?, min?, max? }, required, helpText }
     */
    private parseAgentResponseFormQuestion(q: Record<string, unknown>): ResponseFormField {
        const typeObj = q['type'] as Record<string, unknown> | string | undefined;
        let fieldType = 'text';
        let options: string[] | undefined;
        let minValue: number | undefined;
        let maxValue: number | undefined;

        if (typeof typeObj === 'string') {
            fieldType = this.mapAgentFormType(typeObj);
        } else if (typeObj && typeof typeObj === 'object') {
            fieldType = this.mapAgentFormType((typeObj['type'] as string) ?? 'text');
            if (Array.isArray(typeObj['options'])) {
                options = (typeObj['options'] as Array<Record<string, unknown>>).map(
                    o => typeof o === 'string' ? o : (o['label'] as string) ?? (o['value'] as string) ?? ''
                );
            }
            if (typeObj['min'] != null) minValue = typeObj['min'] as number;
            if (typeObj['max'] != null) maxValue = typeObj['max'] as number;
        }

        return {
            Name: (q['id'] as string) ?? '',
            Label: (q['label'] as string) ?? (q['id'] as string) ?? '',
            Type: fieldType,
            Required: (q['required'] as boolean) ?? false,
            Options: options,
            MinValue: minValue,
            MaxValue: maxValue,
            DefaultValue: q['defaultValue'] as string | number | boolean | undefined,
            Placeholder: (q['helpText'] as string) ?? (q['placeholder'] as string) ?? undefined
        };
    }

    /**
     * Map AgentResponseForm type strings to the simple field types used by the template.
     */
    private mapAgentFormType(agentType: string): string {
        switch (agentType) {
            case 'textarea':
            case 'text':
                return agentType;
            case 'number':
                return 'number';
            case 'checkbox':
            case 'boolean':
                return 'checkbox';
            case 'dropdown':
            case 'select':
                return 'dropdown';
            case 'radio':
            case 'buttongroup':
                return 'dropdown'; // render as dropdown in panel context
            case 'daterange':
            case 'date':
                return 'text'; // render as text input (date picker not yet available)
            default:
                return 'text';
        }
    }

    /**
     * Parse a simple { Name, Label, Type, ... } field definition.
     */
    private parseSimpleFormField(raw: Record<string, unknown>): ResponseFormField {
        return {
            Name: (raw['Name'] as string) ?? '',
            Label: (raw['Label'] as string) ?? (raw['Name'] as string) ?? '',
            Type: (raw['Type'] as string) ?? 'text',
            Required: (raw['Required'] as boolean) ?? false,
            Options: raw['Options'] as string[] | undefined,
            MinValue: raw['MinValue'] as number | undefined,
            MaxValue: raw['MaxValue'] as number | undefined,
            DefaultValue: raw['DefaultValue'] as string | number | boolean | undefined,
            Placeholder: raw['Placeholder'] as string | undefined
        };
    }

    /**
     * Shared logic for submitting any response type
     */
    private async submitResponse(
        status: 'Approved' | 'Rejected' | 'Responded',
        action: 'approved' | 'rejected' | 'responded'
    ): Promise<void> {
        if (!this.Request || this.IsSaving) return;

        this.IsSaving = true;
        this.cdr.markForCheck();

        try {
            this.Request.Status = status;
            this.Request.Response = this.ResponseText || null;
            this.Request.RespondedAt = new Date();

            if (this.HasResponseForm && Object.keys(this.FormValues).length > 0) {
                this.Request.ResponseData = JSON.stringify(this.FormValues);
            }

            const saved = await this.Request.Save();
            if (saved) {
                this.notificationService.CreateSimpleNotification(
                    `Agent request has been ${action} successfully.`, 'success', 3000
                );
                this.IsOpen = false;
                this.Close.emit({ Success: true, Request: this.Request, Action: action });
            } else {
                this.notificationService.CreateSimpleNotification(
                    'Failed to save response. Please try again.', 'error', 5000
                );
            }
        } catch (error) {
            console.error('Error submitting response:', error);
            this.notificationService.CreateSimpleNotification(
                'An unexpected error occurred while saving the response.', 'error', 5000
            );
        } finally {
            this.IsSaving = false;
            this.cdr.markForCheck();
        }
    }
}
