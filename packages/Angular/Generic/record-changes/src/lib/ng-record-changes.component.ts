import { Component, EventEmitter, Input, OnInit, Output, ChangeDetectorRef, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { BaseEntity, CompositeKey, EntityFieldInfo, EntityFieldTSType, Metadata, RunView } from '@memberjunction/core';
import { RecordChangeEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { diffChars, diffWords, Change } from 'diff';

/** Lightweight shape for displaying a version label associated with this record */
interface RecordLabel {
  ID: string;
  Name: string;
  Description: string | null;
  Scope: string;
  Status: string;
  CreatedAt: Date;
  ItemCount: number;
}

@Component({
  standalone: false,
  selector: 'mj-record-changes',
  templateUrl: './ng-record-changes.component.html',
  styleUrls: ['./ng-record-changes.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class RecordChangesComponent implements OnInit {
  public IsLoading = false;
  public IsVisible = false;
  @Output() dialogClosed = new EventEmitter();
  @Input() record!: BaseEntity;

  viewData: RecordChangeEntity[] = [];
  filteredData: RecordChangeEntity[] = [];
  expandedItems: Set<string> = new Set();

  // Version label state
  RecordLabels: RecordLabel[] = [];
  IsLoadingLabels = false;
  ShowCreateWizard = false;

  // Filter properties
  searchTerm = '';
  selectedType = '';
  selectedSource = '';

  constructor(
    private cdr: ChangeDetectorRef,
    private mjNotificationService: MJNotificationService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    if (this.record) {
      this.IsLoading = true;
      this.IsVisible = true;
      this.cdr.markForCheck();
      this.LoadRecordChanges(this.record.PrimaryKey, '', this.record.EntityInfo.Name);
      this.LoadRecordLabels();
    }
  }

  public OnClose(): void {
    this.IsVisible = false;
    this.cdr.markForCheck();
    // Allow the slide-out animation to complete before emitting
    setTimeout(() => this.dialogClosed.emit(), 300);
  }

  public async LoadRecordChanges(pkey: CompositeKey, appName: string, entityName: string): Promise<void> {
    if (pkey && entityName) {
      const md = new Metadata();
      const changes = await md.GetRecordChanges<RecordChangeEntity>(entityName, pkey);
      if (changes) {
        this.viewData = changes.sort((a, b) => new Date(b.ChangedAt).getTime() - new Date(a.ChangedAt).getTime());
        this.filteredData = [...this.viewData];
        this.IsLoading = false;
      } else {
        this.mjNotificationService.CreateSimpleNotification(`Error loading record changes for ${entityName} with primary key ${pkey.ToString()}.`, 'error');
        this.IsLoading = false;
      }
      this.cdr.markForCheck();
    }
  }

  // Filter and search methods
  onSearchChange(): void {
    this.applyFilters();
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  public ClearFilters(): void {
    this.searchTerm = '';
    this.selectedType = '';
    this.selectedSource = '';
    this.applyFilters();
  }

  // Version label methods
  public async LoadRecordLabels(): Promise<void> {
    if (!this.record) return;

    this.IsLoadingLabels = true;
    this.cdr.markForCheck();

    try {
      const entityId = this.record.EntityInfo.ID;
      const recordId = this.record.PrimaryKey.ToConcatenatedString();

      const rv = new RunView();
      // Find all label items that reference this specific record
      const itemsResult = await rv.RunView<{ VersionLabelID: string }>({
        EntityName: 'MJ: Version Label Items',
        Fields: ['VersionLabelID'],
        ExtraFilter: `EntityID='${entityId}' AND RecordID='${recordId}'`,
        ResultType: 'simple'
      });

      if (!itemsResult.Success || itemsResult.Results.length === 0) {
        this.RecordLabels = [];
        this.IsLoadingLabels = false;
        this.cdr.markForCheck();
        return;
      }

      const labelIds = [...new Set(itemsResult.Results.map(i => i.VersionLabelID))];
      const labelIdFilter = labelIds.map(id => `'${id}'`).join(',');

      const labelsResult = await rv.RunView<{
        ID: string; Name: string; Description: string | null;
        Scope: string; Status: string; ItemCount: number; __mj_CreatedAt: Date;
      }>({
        EntityName: 'MJ: Version Labels',
        Fields: ['ID', 'Name', 'Description', 'Scope', 'Status', 'ItemCount', '__mj_CreatedAt'],
        ExtraFilter: `ID IN (${labelIdFilter})`,
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'simple'
      });

      if (labelsResult.Success) {
        this.RecordLabels = labelsResult.Results.map(l => ({
          ID: l.ID,
          Name: l.Name,
          Description: l.Description,
          Scope: l.Scope,
          Status: l.Status,
          CreatedAt: l.__mj_CreatedAt,
          ItemCount: l.ItemCount
        }));
      }
    } catch (error) {
      console.error('Error loading version labels for record:', error);
      this.RecordLabels = [];
    } finally {
      this.IsLoadingLabels = false;
      this.cdr.markForCheck();
    }
  }

  public OpenCreateWizard(): void {
    this.ShowCreateWizard = true;
    this.cdr.markForCheck();
  }

  public OnLabelCreated(event: { LabelCount: number; ItemCount: number }): void {
    this.ShowCreateWizard = false;
    this.cdr.markForCheck();
    this.LoadRecordLabels();
    this.mjNotificationService.CreateSimpleNotification(
      `Version label created with ${event.ItemCount} snapshot${event.ItemCount !== 1 ? 's' : ''}`,
      'info', 2000
    );
  }

  public OnLabelCreateCancelled(): void {
    this.ShowCreateWizard = false;
    this.cdr.markForCheck();
  }

  public getLabelStatusClass(status: string): string {
    switch (status) {
      case 'Active': return 'label-status-active';
      case 'Archived': return 'label-status-archived';
      case 'Restored': return 'label-status-restored';
      default: return '';
    }
  }

  private applyFilters(): void {
    let filtered = [...this.viewData];

    if (this.searchTerm.trim()) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(change =>
        change.ChangesDescription?.toLowerCase().includes(search) ||
        change.User?.toLowerCase().includes(search) ||
        change.Comments?.toLowerCase().includes(search)
      );
    }

    if (this.selectedType) {
      filtered = filtered.filter(change => change.Type === this.selectedType);
    }

    if (this.selectedSource) {
      filtered = filtered.filter(change => change.Source === this.selectedSource);
    }

    this.filteredData = filtered;
    this.cdr.markForCheck();
  }

  // Timeline interaction methods
  toggleExpansion(changeId: string): void {
    if (this.expandedItems.has(changeId)) {
      this.expandedItems.delete(changeId);
    } else {
      this.expandedItems.add(changeId);
    }
    this.cdr.markForCheck();
  }

  onTimelineItemKeydown(event: KeyboardEvent, changeId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleExpansion(changeId);
    }
  }

  // Utility methods for timeline display
  getChangeTypeClass(type: string): string {
    switch (type) {
      case 'Create': return 'change-create';
      case 'Update': return 'change-update';
      case 'Delete': return 'change-delete';
      default: return 'change-unknown';
    }
  }

  getChangeTypeIcon(type: string): string {
    switch (type) {
      case 'Create': return 'fa-solid fa-plus';
      case 'Update': return 'fa-solid fa-edit';
      case 'Delete': return 'fa-solid fa-trash';
      default: return 'fa-solid fa-question';
    }
  }

  getChangeTypeBadgeClass(type: string): string {
    switch (type) {
      case 'Create': return 'badge-create';
      case 'Update': return 'badge-update';
      case 'Delete': return 'badge-delete';
      default: return 'badge-unknown';
    }
  }

  getSourceClass(source: string): string {
    return source === 'Internal' ? 'source-internal' : 'source-external';
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'Complete': return 'status-complete';
      case 'Pending': return 'status-pending';
      case 'Error': return 'status-error';
      default: return 'status-unknown';
    }
  }

  getTimelineItemLabel(change: RecordChangeEntity): string {
    return `${change.Type} by ${change.User || 'Unknown User'} on ${this.formatFullDateTime(change.ChangedAt)}`;
  }

  formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: diffDays > 365 ? 'numeric' : undefined
    }).format(new Date(date));
  }

  formatFullDateTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
      timeZoneName: 'short'
    }).format(new Date(date));
  }

  getChangeSummary(change: RecordChangeEntity): string {
    if (change.Type === 'Create') {
      return 'Record was created';
    }
    if (change.Type === 'Delete') {
      return 'Record was deleted';
    }

    try {
      const changesJson = JSON.parse(change.ChangesJSON || '{}');
      const fields = Object.keys(changesJson);
      if (fields.length === 0) return 'No field changes detected';

      const fieldNames = fields.map(fieldKey => {
        const changeInfo = changesJson[fieldKey];
        const field = this.record.EntityInfo.Fields.find((f: EntityFieldInfo) =>
          f.Name.trim().toLowerCase() === changeInfo.field?.trim().toLowerCase()
        );
        return field?.DisplayNameOrName || changeInfo.field;
      });

      if (fieldNames.length === 1) {
        return `${fieldNames[0]} changed`;
      }
      if (fieldNames.length === 2) {
        return `${fieldNames[0]} and ${fieldNames[1]} changed`;
      }
      if (fieldNames.length <= 4) {
        const lastField = fieldNames.pop();
        return `${fieldNames.join(', ')}, and ${lastField} changed`;
      }

      return `${fieldNames.slice(0, 3).join(', ')}, and ${fieldNames.length - 3} other field${fieldNames.length - 3 > 1 ? 's' : ''} changed`;
    } catch {
      return change.ChangesDescription || 'Changes made';
    }
  }

  getFieldChanges(change: RecordChangeEntity): Array<{field: string, displayName: string, oldValue: string, newValue: string, isBooleanField: boolean, diffHtml?: SafeHtml}> {
    try {
      const changesJson = JSON.parse(change.ChangesJSON || '{}');
      const fields = Object.keys(changesJson);

      return fields.map(fieldKey => {
        const changeInfo = changesJson[fieldKey];
        const field = this.record.EntityInfo.Fields.find((f: EntityFieldInfo) =>
          f.Name.trim().toLowerCase() === changeInfo.field?.trim().toLowerCase()
        );

        const isBooleanField = field?.TSType === EntityFieldTSType.Boolean;
        let diffHtml: SafeHtml | undefined;

        if (!isBooleanField) {
          const oldStr = String(changeInfo.oldValue ?? '');
          const newStr = String(changeInfo.newValue ?? '');

          if (oldStr !== newStr) {
            diffHtml = this.generateDiffHtml(oldStr, newStr);
          }
        }

        return {
          field: changeInfo.field,
          displayName: field?.DisplayNameOrName || changeInfo.field,
          oldValue: changeInfo.oldValue,
          newValue: changeInfo.newValue,
          isBooleanField,
          diffHtml
        };
      });
    } catch {
      return [];
    }
  }

  getCreatedFields(change: RecordChangeEntity): Array<{name: string, displayName: string, value: string}> {
    try {
      if (!change.FullRecordJSON) return [];

      const record = JSON.parse(change.FullRecordJSON);
      const fields = this.record.EntityInfo.Fields;

      return fields
        .filter((field: EntityFieldInfo) => record[field.Name] != null && record[field.Name] !== '')
        .map((field: EntityFieldInfo) => ({
          name: field.Name,
          displayName: field.DisplayNameOrName,
          value: record[field.Name]
        }));
    } catch {
      return [];
    }
  }

  private generateDiffHtml(oldValue: string, newValue: string): SafeHtml {
    if (!oldValue && !newValue) {
      return this.sanitizer.bypassSecurityTrustHtml('<div class="diff-container"><span class="diff-unchanged">(no change)</span></div>');
    }

    if (!oldValue) {
      return this.sanitizer.bypassSecurityTrustHtml(`<div class="diff-container"><span class="diff-added">${this.escapeHtml(newValue)}</span></div>`);
    }

    if (!newValue) {
      return this.sanitizer.bypassSecurityTrustHtml(`<div class="diff-container"><span class="diff-removed">${this.escapeHtml(oldValue)}</span></div>`);
    }

    const useWordDiff = this.shouldUseWordDiff(oldValue, newValue);
    const diffs = useWordDiff ? diffWords(oldValue, newValue) : diffChars(oldValue, newValue);

    let html = '<div class="diff-container">';

    diffs.forEach((part: Change) => {
      const escapedValue = this.escapeHtml(part.value);
      if (part.added) {
        html += `<span class="diff-added">${escapedValue}</span>`;
      } else if (part.removed) {
        html += `<span class="diff-removed">${escapedValue}</span>`;
      } else {
        html += `<span class="diff-unchanged">${escapedValue}</span>`;
      }
    });

    html += '</div>';

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private shouldUseWordDiff(oldValue: string, newValue: string): boolean {
    const hasMultipleWords = (text: string) => text.includes(' ') && text.split(' ').length > 3;
    const isLongText = (text: string) => text.length > 50;

    return (hasMultipleWords(oldValue) || hasMultipleWords(newValue)) &&
           (isLongText(oldValue) || isLongText(newValue));
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
