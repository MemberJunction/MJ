import { Component, EventEmitter, Input, OnInit, Output, ChangeDetectorRef, ChangeDetectionStrategy, ViewEncapsulation, NgZone } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { BaseEntity, CompositeKey, EntityFieldInfo, EntityFieldTSType, Metadata, RunView } from '@memberjunction/core';
import { MJRecordChangeEntity } from '@memberjunction/core-entities';
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

/** A single field change with type-aware rendering info */
export interface FieldChangeInfo {
  field: string;
  displayName: string;
  oldValue: string;
  newValue: string;
  fieldType: 'boolean' | 'date' | 'number' | 'text';
  diffHtml?: SafeHtml;
}

/** A group of changes that share the same date */
export interface DateGroup {
  label: string;
  changes: MJRecordChangeEntity[];
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

  viewData: MJRecordChangeEntity[] = [];
  filteredData: MJRecordChangeEntity[] = [];
  dateGroups: DateGroup[] = [];
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
    private ngZone: NgZone,
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
      const changes = await md.GetRecordChanges<MJRecordChangeEntity>(entityName, pkey);
      this.ngZone.run(() => {
        if (changes) {
          this.viewData = changes.sort((a, b) => new Date(b.ChangedAt).getTime() - new Date(a.ChangedAt).getTime());
          this.filteredData = [...this.viewData];
          this.dateGroups = this.buildDateGroups(this.filteredData);
          this.IsLoading = false;
        } else {
          this.mjNotificationService.CreateSimpleNotification(`Error loading record changes for ${entityName} with primary key ${pkey.ToString()}.`, 'error');
          this.IsLoading = false;
        }
        this.cdr.markForCheck();
      });
    }
  }

  // ─── Filter & Search ────────────────────────────────────────────

  onSearchChange(): void {
    this.applyFilters();
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  SetTypeFilter(type: string): void {
    this.selectedType = this.selectedType === type ? '' : type;
    this.applyFilters();
  }

  public ClearFilters(): void {
    this.searchTerm = '';
    this.selectedType = '';
    this.selectedSource = '';
    this.applyFilters();
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
    this.dateGroups = this.buildDateGroups(this.filteredData);
    this.cdr.markForCheck();
  }

  // ─── Version Labels ─────────────────────────────────────────────

  public async LoadRecordLabels(): Promise<void> {
    if (!this.record) return;

    this.IsLoadingLabels = true;
    this.cdr.markForCheck();

    try {
      const entityId = this.record.EntityInfo.ID;
      const recordId = this.record.PrimaryKey.ToConcatenatedString();

      const rv = new RunView();
      const itemsResult = await rv.RunView<{ VersionLabelID: string }>({
        EntityName: 'MJ: Version Label Items',
        Fields: ['VersionLabelID'],
        ExtraFilter: `EntityID='${entityId}' AND RecordID='${recordId}'`,
        ResultType: 'simple'
      });

      if (!itemsResult.Success || itemsResult.Results.length === 0) {
        this.ngZone.run(() => {
          this.RecordLabels = [];
          this.IsLoadingLabels = false;
          this.cdr.markForCheck();
        });
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
      this.ngZone.run(() => {
        this.IsLoadingLabels = false;
        this.cdr.markForCheck();
      });
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

  // ─── Timeline Interaction ───────────────────────────────────────

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

  // ─── Date Grouping ─────────────────────────────────────────────

  private buildDateGroups(changes: MJRecordChangeEntity[]): DateGroup[] {
    const groups = new Map<string, MJRecordChangeEntity[]>();

    for (const change of changes) {
      const label = this.formatDateGroupLabel(new Date(change.ChangedAt));
      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label)!.push(change);
    }

    return Array.from(groups.entries()).map(([label, items]) => ({ label, changes: items }));
  }

  private formatDateGroupLabel(date: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000);

    const formatted = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);

    if (diffDays === 0) return `Today \u2014 ${formatted}`;
    if (diffDays === 1) return `Yesterday \u2014 ${formatted}`;
    return formatted;
  }

  // ─── Display Helpers ────────────────────────────────────────────

  getChangeTypeCardClass(type: string): string {
    switch (type) {
      case 'Create': return 'type-create';
      case 'Update': return 'type-update';
      case 'Delete': return 'type-delete';
      default: return 'type-update';
    }
  }

  getChangeTypeBadgeText(type: string): string {
    switch (type) {
      case 'Create': return 'Created';
      case 'Delete': return 'Deleted';
      default: return type;
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

  getTimelineItemLabel(change: MJRecordChangeEntity): string {
    return `${change.Type} by ${change.User || 'Unknown User'} on ${this.formatFullDateTime(change.ChangedAt)}`;
  }

  getUserInitials(user: string | null): string {
    if (!user) return '?';
    // Handle email addresses: take first char of local part + first char of domain
    if (user.includes('@')) {
      const local = user.split('@')[0];
      return local.substring(0, 2).toUpperCase();
    }
    // Handle names: first char of each word
    const parts = user.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return user.substring(0, 2).toUpperCase();
  }

  getUserDisplayName(user: string | null): string {
    if (!user) return 'Unknown';
    if (user.includes('@')) return user.split('@')[0];
    return user;
  }

  getUniqueContributorCount(): number {
    const users = new Set(this.viewData.map(c => c.User).filter(Boolean));
    return users.size;
  }

  formatTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(new Date(date));
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

  // ─── Change Summary ─────────────────────────────────────────────

  getChangeSummary(change: MJRecordChangeEntity): string {
    if (change.Type === 'Create') return 'Record created';
    if (change.Type === 'Delete') return 'Record deleted';

    try {
      const changesJson = JSON.parse(change.ChangesJSON || '{}');
      const fieldNames = this.extractFieldDisplayNames(changesJson);
      if (fieldNames.length === 0) return 'No field changes detected';

      return this.buildFieldListSummary(fieldNames);
    } catch {
      return change.ChangesDescription || 'Changes made';
    }
  }

  getCreatedFieldCount(change: MJRecordChangeEntity): number {
    try {
      if (!change.FullRecordJSON) return 0;
      const record = JSON.parse(change.FullRecordJSON);
      return this.record.EntityInfo.Fields
        .filter((f: EntityFieldInfo) => record[f.Name] != null && record[f.Name] !== '')
        .length;
    } catch {
      return 0;
    }
  }

  private extractFieldDisplayNames(changesJson: Record<string, { field?: string }>): string[] {
    return Object.keys(changesJson).map(fieldKey => {
      const changeInfo = changesJson[fieldKey];
      const field = this.record.EntityInfo.Fields.find((f: EntityFieldInfo) =>
        f.Name.trim().toLowerCase() === changeInfo.field?.trim().toLowerCase()
      );
      return field?.DisplayNameOrName || changeInfo.field || fieldKey;
    });
  }

  private buildFieldListSummary(fieldNames: string[]): string {
    if (fieldNames.length === 1) return `${fieldNames[0]} changed`;
    if (fieldNames.length === 2) return `${fieldNames[0]} and ${fieldNames[1]} changed`;
    if (fieldNames.length <= 4) {
      const last = fieldNames[fieldNames.length - 1];
      return `${fieldNames.slice(0, -1).join(', ')}, and ${last} changed`;
    }
    const remaining = fieldNames.length - 3;
    return `${fieldNames.slice(0, 3).join(', ')}, and ${remaining} other field${remaining > 1 ? 's' : ''} changed`;
  }

  // ─── Field Changes (type-aware) ────────────────────────────────

  getFieldChanges(change: MJRecordChangeEntity): FieldChangeInfo[] {
    try {
      const changesJson = JSON.parse(change.ChangesJSON || '{}');
      return Object.keys(changesJson).map(fieldKey => this.buildFieldChangeInfo(changesJson[fieldKey]));
    } catch {
      return [];
    }
  }

  private buildFieldChangeInfo(changeInfo: { field?: string; oldValue?: unknown; newValue?: unknown }): FieldChangeInfo {
    const field = this.record.EntityInfo.Fields.find((f: EntityFieldInfo) =>
      f.Name.trim().toLowerCase() === changeInfo.field?.trim().toLowerCase()
    );

    const fieldType = this.classifyFieldType(field);
    const isDateField = fieldType === 'date';
    const formattedOld = this.formatChangeValue(changeInfo.oldValue, isDateField);
    const formattedNew = this.formatChangeValue(changeInfo.newValue, isDateField);

    let diffHtml: SafeHtml | undefined;
    if (fieldType === 'text' && formattedOld !== formattedNew) {
      diffHtml = this.generateDiffHtml(formattedOld, formattedNew);
    }

    return {
      field: changeInfo.field || '',
      displayName: field?.DisplayNameOrName || changeInfo.field || '',
      oldValue: formattedOld,
      newValue: formattedNew,
      fieldType,
      diffHtml
    };
  }

  private classifyFieldType(field: EntityFieldInfo | undefined): 'boolean' | 'date' | 'number' | 'text' {
    if (!field) return 'text';
    if (field.TSType === EntityFieldTSType.Boolean) return 'boolean';
    if (field.TSType === EntityFieldTSType.Date) return 'date';
    if (field.TSType === EntityFieldTSType.Number) return 'number';
    return 'text';
  }

  getCreatedFields(change: MJRecordChangeEntity): Array<{name: string, displayName: string, value: string}> {
    try {
      if (!change.FullRecordJSON) return [];

      const record = JSON.parse(change.FullRecordJSON);
      const fields = this.record.EntityInfo.Fields;

      return fields
        .filter((field: EntityFieldInfo) => record[field.Name] != null && record[field.Name] !== '')
        .map((field: EntityFieldInfo) => ({
          name: field.Name,
          displayName: field.DisplayNameOrName,
          value: this.formatChangeValue(record[field.Name], field.TSType === EntityFieldTSType.Date)
        }));
    } catch {
      return [];
    }
  }

  // ─── Value Formatting ───────────────────────────────────────────

  /**
   * Formats a change value for display. Handles corrupted date values (stored as empty objects)
   * and formats ISO date strings into a human-readable format.
   */
  private formatChangeValue(value: unknown, isDateField: boolean): string {
    if (value == null) return '';

    if (typeof value === 'object') {
      const keys = Object.keys(value as Record<string, unknown>);
      if (keys.length === 0) return '';
      return JSON.stringify(value);
    }

    if (isDateField && typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }).format(date);
      }
    }

    return String(value);
  }

  // ─── Diff Generation (text fields only) ─────────────────────────

  private generateDiffHtml(oldValue: string, newValue: string): SafeHtml {
    if (!oldValue && !newValue) {
      return this.sanitizer.bypassSecurityTrustHtml('<span class="rc-diff-unchanged">(no change)</span>');
    }

    if (!oldValue) {
      return this.sanitizer.bypassSecurityTrustHtml(`<span class="rc-diff-added">${this.escapeHtml(newValue)}</span>`);
    }

    if (!newValue) {
      return this.sanitizer.bypassSecurityTrustHtml(`<span class="rc-diff-removed">${this.escapeHtml(oldValue)}</span>`);
    }

    const useWordDiff = this.shouldUseWordDiff(oldValue, newValue);
    const diffs = useWordDiff ? diffWords(oldValue, newValue) : diffChars(oldValue, newValue);

    const html = diffs.map((part: Change) => {
      const escaped = this.escapeHtml(part.value);
      if (part.added) return `<span class="rc-diff-added">${escaped}</span>`;
      if (part.removed) return `<span class="rc-diff-removed">${escaped}</span>`;
      return `<span class="rc-diff-unchanged">${escaped}</span>`;
    }).join('');

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
