import { Component, Input, Output, EventEmitter, ChangeDetectorRef, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { Metadata, RunView, BaseEntity } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';

export function LoadActivityEditPanel() {
    // Prevents tree-shaking
}

interface ContactOption {
    ID: string;
    Name: string;
    Company: string | null;
}

interface ActivityTypeOption {
    ID: string;
    Name: string;
    Icon: string | null;
}

interface ActivityRecord {
    ID: string;
    ContactID: string;
    ActivityTypeID: string;
    UserID: string;
    Subject: string;
    Description: string | null;
    RawContent: string | null;
    ActivityDate: Date;
    DurationMinutes: number | null;
    Status: string;
    UrgencyLevel: string | null;
    RequiresFollowUp: boolean;
    FollowUpDate: Date | null;
}

@Component({
    selector: 'mj-activity-edit-panel',
    templateUrl: './activity-edit-panel.component.html',
    styleUrls: ['./activity-edit-panel.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActivityEditPanelComponent implements OnInit {
    @Input() isOpen = false;
    @Input() preselectedContactId: string | null = null;

    @Output() close = new EventEmitter<void>();
    @Output() saved = new EventEmitter<ActivityRecord>();

    public isLoading = false;
    public isSaving = false;

    // Lookup data
    public contacts: ContactOption[] = [];
    public activityTypes: ActivityTypeOption[] = [];

    // Form fields
    public selectedContactId = '';
    public selectedActivityTypeId = '';
    public subject = '';
    public description = '';
    public rawContent = '';
    public activityDate: Date = new Date();
    public durationMinutes: number | null = null;
    public status: 'Planned' | 'Completed' | 'Cancelled' = 'Completed';
    public urgencyLevel: string | null = null;
    public requiresFollowUp = false;
    public followUpDate: Date | null = null;

    public statusOptions = [
        { value: 'Planned', label: 'Planned' },
        { value: 'Completed', label: 'Completed' },
        { value: 'Cancelled', label: 'Cancelled' }
    ];

    public urgencyOptions = [
        { value: null, label: 'None' },
        { value: 'Low', label: 'Low' },
        { value: 'Medium', label: 'Medium' },
        { value: 'High', label: 'High' },
        { value: 'Critical', label: 'Critical' }
    ];

    private _metadata = new Metadata();

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnInit(): void {
        this.loadLookupData();
    }

    public get canSave(): boolean {
        return !!(
            this.selectedContactId &&
            this.selectedActivityTypeId &&
            this.subject.trim()
        );
    }

    public get selectedContact(): ContactOption | null {
        return this.contacts.find(c => c.ID === this.selectedContactId) || null;
    }

    public get selectedActivityType(): ActivityTypeOption | null {
        return this.activityTypes.find(t => t.ID === this.selectedActivityTypeId) || null;
    }

    public async open(preselectedContactId?: string): Promise<void> {
        this.isLoading = true;
        this.isOpen = true;
        this.cdr.markForCheck();

        // Reset form
        this.resetForm();

        // Apply preselection
        if (preselectedContactId) {
            this.selectedContactId = preselectedContactId;
        } else if (this.preselectedContactId) {
            this.selectedContactId = this.preselectedContactId;
        }

        // Load lookup data if not already loaded
        if (this.contacts.length === 0 || this.activityTypes.length === 0) {
            await this.loadLookupData();
        }

        this.isLoading = false;
        this.cdr.markForCheck();
    }

    private resetForm(): void {
        this.selectedContactId = '';
        this.selectedActivityTypeId = '';
        this.subject = '';
        this.description = '';
        this.rawContent = '';
        this.activityDate = new Date();
        this.durationMinutes = null;
        this.status = 'Completed';
        this.urgencyLevel = null;
        this.requiresFollowUp = false;
        this.followUpDate = null;
    }

    private async loadLookupData(): Promise<void> {
        try {
            const rv = new RunView();

            const [contactsResult, activityTypesResult] = await rv.RunViews([
                {
                    EntityName: 'Contacts__Demo',
                    ExtraFilter: "Status = 'Active'",
                    OrderBy: 'LastName, FirstName',
                    Fields: ['ID', 'FirstName', 'LastName', 'Company'],
                    ResultType: 'simple'
                },
                {
                    EntityName: 'Activity Types__Demo',
                    ExtraFilter: '',
                    OrderBy: 'Name',
                    Fields: ['ID', 'Name', 'Icon'],
                    ResultType: 'simple'
                }
            ]);

            if (contactsResult.Success) {
                this.contacts = (contactsResult.Results as { ID: string; FirstName: string; LastName: string; Company: string | null }[])
                    .map(c => ({
                        ID: c.ID,
                        Name: `${c.FirstName} ${c.LastName}`,
                        Company: c.Company
                    }));
            }

            if (activityTypesResult.Success) {
                this.activityTypes = activityTypesResult.Results as ActivityTypeOption[];
            }
        } catch (error) {
            console.error('Error loading lookup data:', error);
        }
        this.cdr.markForCheck();
    }

    public async save(): Promise<void> {
        if (!this.canSave) {
            MJNotificationService.Instance.CreateSimpleNotification('Please fill in all required fields', 'warning', 3000);
            return;
        }

        this.isSaving = true;
        this.cdr.markForCheck();

        try {
            // Get current user ID from Metadata
            const currentUser = this._metadata.CurrentUser;
            if (!currentUser) {
                throw new Error('No current user found');
            }

            // Create new activity entity using BaseEntity
            const entity = await this._metadata.GetEntityObject<BaseEntity>('Activities__Demo');

            // Set all fields using Set method
            entity.Set('ContactID', this.selectedContactId);
            entity.Set('ActivityTypeID', this.selectedActivityTypeId);
            entity.Set('UserID', currentUser.ID);
            entity.Set('Subject', this.subject.trim());
            entity.Set('Description', this.description.trim() || null);
            entity.Set('RawContent', this.rawContent.trim() || null);
            entity.Set('ActivityDate', this.activityDate);
            entity.Set('DurationMinutes', this.durationMinutes);
            entity.Set('Status', this.status);
            entity.Set('UrgencyLevel', this.urgencyLevel);
            entity.Set('RequiresFollowUp', this.requiresFollowUp);
            entity.Set('FollowUpDate', this.requiresFollowUp ? this.followUpDate : null);
            entity.Set('ProcessedByAI', false);

            const success = await entity.Save();

            if (success) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Activity "${this.subject}" created successfully`,
                    'success',
                    3000
                );

                // Build the saved record to emit
                const savedRecord: ActivityRecord = {
                    ID: entity.Get('ID') as string,
                    ContactID: this.selectedContactId,
                    ActivityTypeID: this.selectedActivityTypeId,
                    UserID: currentUser.ID,
                    Subject: this.subject.trim(),
                    Description: this.description.trim() || null,
                    RawContent: this.rawContent.trim() || null,
                    ActivityDate: this.activityDate,
                    DurationMinutes: this.durationMinutes,
                    Status: this.status,
                    UrgencyLevel: this.urgencyLevel,
                    RequiresFollowUp: this.requiresFollowUp,
                    FollowUpDate: this.requiresFollowUp ? this.followUpDate : null
                };

                this.saved.emit(savedRecord);
                this.closePanel();
            } else {
                const errorMessage = entity.LatestResult?.Message || 'Unknown error';
                console.error('Save failed:', errorMessage);
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Failed to save activity: ${errorMessage}`,
                    'error',
                    5000
                );
            }
        } catch (error) {
            console.error('Error saving activity:', error);
            MJNotificationService.Instance.CreateSimpleNotification(
                'Error saving activity',
                'error',
                3000
            );
        } finally {
            this.isSaving = false;
            this.cdr.markForCheck();
        }
    }

    public closePanel(): void {
        this.isOpen = false;
        this.resetForm();
        this.close.emit();
        this.cdr.markForCheck();
    }

    public onBackdropClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('panel-backdrop')) {
            this.closePanel();
        }
    }

    public getActivityTypeIcon(type: ActivityTypeOption | null): string {
        if (!type) return 'fa-solid fa-calendar';
        return type.Icon || 'fa-solid fa-calendar';
    }

    public formatDateForInput(date: Date | null): string {
        if (!date) return '';
        const d = new Date(date);
        return d.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:mm
    }

    public formatDateOnlyForInput(date: Date | null): string {
        if (!date) return '';
        const d = new Date(date);
        return d.toISOString().split('T')[0];
    }

    public onActivityDateChange(value: string): void {
        this.activityDate = value ? new Date(value) : new Date();
        this.cdr.markForCheck();
    }

    public onFollowUpDateChange(value: string): void {
        this.followUpDate = value ? new Date(value) : null;
        this.cdr.markForCheck();
    }

    public onRequiresFollowUpChange(): void {
        if (!this.requiresFollowUp) {
            this.followUpDate = null;
        } else if (!this.followUpDate) {
            // Set default follow-up date to tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            this.followUpDate = tomorrow;
        }
        this.cdr.markForCheck();
    }
}
