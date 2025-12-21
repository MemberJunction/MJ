import { Component, Input, Output, EventEmitter, OnChanges, OnInit, SimpleChanges, ElementRef, AfterViewChecked, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { EntityInfo, EntityFieldInfo, EntityFieldValueListType, RunView } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';
import { CardTemplate, CardDisplayField, CardFieldType, RecordSelectedEvent, RecordOpenedEvent } from '../types';
import { PillColorUtil } from '../pill/pill.component';
import { HighlightUtil } from '../utils/highlight.util';

/**
 * EntityCardsComponent - Card-based view for entity records
 *
 * This component provides an auto-generated card layout for displaying
 * entity records. Cards are automatically structured based on entity metadata.
 *
 * Supports two modes:
 * 1. Parent-managed data: Records are passed in via [records] input
 * 2. Standalone: Component loads its own data with pagination
 *
 * @example
 * ```html
 * <mj-entity-cards
 *   [entity]="selectedEntity"
 *   [records]="filteredRecords"
 *   [selectedRecordId]="selectedId"
 *   (recordSelected)="onRecordSelected($event)"
 *   (recordOpened)="onRecordOpened($event)">
 * </mj-entity-cards>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-entity-cards',
  templateUrl: './entity-cards.component.html',
  styleUrls: ['./entity-cards.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class EntityCardsComponent implements OnChanges, OnInit, AfterViewChecked {
  constructor(
    private elementRef: ElementRef,
    private cdr: ChangeDetectorRef
  ) {}
  /**
   * The entity metadata for the records being displayed
   */
  @Input() entity: EntityInfo | null = null;

  /**
   * The records to display as cards (optional - component can load its own)
   */
  @Input() records: BaseEntity[] | null = null;

  /**
   * The currently selected record's primary key string
   */
  @Input() selectedRecordId: string | null = null;

  /**
   * Custom card template (optional - auto-generated if not provided)
   */
  @Input() cardTemplate: CardTemplate | null = null;

  /**
   * Map of record IDs to hidden field names that matched the filter
   * Used to display an indicator when a match occurred in a non-visible field
   */
  @Input() hiddenFieldMatches: Map<string, string> = new Map();

  /**
   * Current filter text for highlighting matches
   * Supports SQL-style % wildcards
   */
  @Input() filterText: string = '';

  /**
   * Page size for standalone data loading
   * @default 100
   */
  @Input() pageSize: number = 100;

  /**
   * Emitted when a record is selected (single click)
   */
  @Output() recordSelected = new EventEmitter<RecordSelectedEvent>();

  /**
   * Emitted when a record should be opened (double click or open button)
   */
  @Output() recordOpened = new EventEmitter<RecordOpenedEvent>();

  /** Auto-generated card template */
  public autoCardTemplate: CardTemplate | null = null;

  /** Internal records when loading standalone */
  private internalRecords: BaseEntity[] = [];

  /** Track if we're in standalone mode */
  private standaloneMode: boolean = false;

  /** Loading state for standalone mode */
  public isLoading: boolean = false;

  /** Flag to trigger scroll to selected card after view renders */
  private pendingScrollToSelected: boolean = false;

  ngOnInit(): void {
    this.standaloneMode = this.records === null;

    if (this.entity?.Fields && !this.effectiveTemplate) {
      this.autoCardTemplate = this.generateCardTemplate(this.entity);
    }

    if (this.standaloneMode && this.entity) {
      this.loadData();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entity'] && this.entity?.Fields) {
      this.autoCardTemplate = this.generateCardTemplate(this.entity);
    } else if (changes['entity'] && !this.entity) {
      this.autoCardTemplate = null;
    }

    if (changes['entity'] && this.standaloneMode && this.entity) {
      this.loadData();
    }

    if (changes['records']) {
      this.standaloneMode = this.records === null;
      // When records change and we have a selection, scroll to it
      if (this.selectedRecordId) {
        this.pendingScrollToSelected = true;
      }
    }

    // When selectedRecordId changes programmatically, scroll to the selected card
    if (changes['selectedRecordId'] && this.selectedRecordId) {
      this.pendingScrollToSelected = true;
    }
  }

  ngAfterViewChecked(): void {
    if (this.pendingScrollToSelected && this.selectedRecordId) {
      this.pendingScrollToSelected = false;
      // Delay scroll to allow detail panel animation to complete and layout to stabilize
      // This ensures the scroll happens after the viewport width has adjusted
      setTimeout(() => this.scrollToSelectedCard(), 350);
    }
  }

  /**
   * Scroll the selected card into view
   */
  private scrollToSelectedCard(): void {
    if (!this.selectedRecordId) return;

    // Find the selected card element using the CSS class
    const selectedCard = this.elementRef.nativeElement.querySelector('.data-card.selected') as HTMLElement;
    if (selectedCard) {
      selectedCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
  }

  /**
   * Get effective records (external or internal)
   */
  get effectiveRecords(): BaseEntity[] {
    return this.records ?? this.internalRecords;
  }

  /**
   * Load data in standalone mode
   */
  private async loadData(): Promise<void> {
    if (!this.entity) return;

    this.isLoading = true;

    try {
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: this.entity.Name,
        ResultType: 'entity_object',
        MaxRows: this.pageSize
      });

      if (result.Success) {
        this.internalRecords = result.Results;
      }
    } catch (error) {
      console.error('Error loading cards data:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Get the effective card template (custom or auto-generated)
   */
  get effectiveTemplate(): CardTemplate | null {
    return this.cardTemplate || this.autoCardTemplate;
  }

  // ========================================
  // TEMPLATE GENERATION
  // ========================================

  /**
   * Generate card template from entity metadata
   */
  private generateCardTemplate(entity: EntityInfo): CardTemplate | null {
    const fields = entity.Fields;
    if (!fields || fields.length === 0) return null;

    return {
      titleField: this.findTitleField(entity, fields),
      subtitleField: this.findSubtitleField(fields),
      descriptionField: this.findDescriptionField(fields),
      displayFields: this.findDisplayFields(fields),
      thumbnailFields: this.findThumbnailFields(fields),
      badgeField: this.findBadgeField(fields)
    };
  }

  private findTitleField(entity: EntityInfo, fields: EntityFieldInfo[]): string {
    if (entity.NameField) return entity.NameField.Name;

    const nameField = fields.find(f =>
      f.Name.toLowerCase() === 'name' || f.Name.toLowerCase() === 'title'
    );
    if (nameField) return nameField.Name;

    const endsWithName = fields.find(f =>
      f.Name.toLowerCase().endsWith('name') &&
      f.TSType === 'string' &&
      !f.Name.toLowerCase().includes('file') &&
      !f.IsPrimaryKey
    );
    if (endsWithName) return endsWithName.Name;

    const firstString = fields.find(f =>
      f.TSType === 'string' && !f.IsPrimaryKey && !f.Name.toLowerCase().includes('id')
    );
    if (firstString) return firstString.Name;

    const pk = fields.find(f => f.IsPrimaryKey);
    return pk?.Name || 'ID';
  }

  private findSubtitleField(fields: EntityFieldInfo[]): string | null {
    const keywords = ['status', 'type', 'category', 'state', 'stage'];
    for (const keyword of keywords) {
      const field = fields.find(f =>
        f.Name.toLowerCase().includes(keyword) && f.TSType === 'string' && !f.IsPrimaryKey
      );
      if (field) return field.Name;
    }
    return null;
  }

  private findDescriptionField(fields: EntityFieldInfo[]): string | null {
    const keywords = ['description', 'desc', 'summary', 'notes', 'comments'];
    for (const keyword of keywords) {
      const field = fields.find(f => f.Name.toLowerCase().includes(keyword) && f.TSType === 'string');
      if (field) return field.Name;
    }
    return null;
  }

  private findDisplayFields(fields: EntityFieldInfo[]): CardDisplayField[] {
    const displayFields: CardDisplayField[] = [];
    const excludePatterns = ['id', 'name', 'title', 'description', 'desc', 'summary', 'notes',
                            'status', 'type', 'category', 'state', 'stage', 'password', 'secret',
                            '__mj_', 'createdat', 'updatedat', 'createdby', 'updatedby'];

    const defaultInViewFields = fields.filter(f =>
      f.DefaultInView === true && !f.IsPrimaryKey &&
      !excludePatterns.some(p => f.Name.toLowerCase().includes(p))
    );

    for (const field of defaultInViewFields) {
      if (displayFields.length >= 4) break;
      displayFields.push({
        name: field.Name,
        type: this.getFieldType(field),
        label: this.getFieldLabel(field)
      });
    }

    if (displayFields.length >= 2) return displayFields;

    const metricKeywords = ['amount', 'total', 'count', 'value', 'price', 'cost', 'quantity', 'qty', 'balance', 'revenue', 'score'];
    for (const field of fields) {
      if (displayFields.length >= 4) break;
      if (displayFields.some(df => df.name === field.Name)) continue;

      if (metricKeywords.some(kw => field.Name.toLowerCase().includes(kw))) {
        displayFields.push({
          name: field.Name,
          type: this.getFieldType(field),
          label: this.getFieldLabel(field)
        });
      }
    }

    return displayFields;
  }

  /**
   * Find all potential thumbnail fields in priority order
   * Returns an array so we can fall back per-record if one is empty
   */
  private findThumbnailFields(fields: EntityFieldInfo[]): string[] {
    const imageKeywords = ['image', 'photo', 'picture', 'thumbnail', 'avatar', 'logo', 'icon'];
    const foundFields: string[] = [];
    const foundFieldNames = new Set<string>();

    for (const keyword of imageKeywords) {
      const matchingFields = fields.filter(f =>
        f.Name.toLowerCase().includes(keyword) &&
        f.TSType === 'string' &&
        !foundFieldNames.has(f.Name)
      );
      for (const field of matchingFields) {
        foundFields.push(field.Name);
        foundFieldNames.add(field.Name);
      }
    }
    return foundFields;
  }

  private findBadgeField(fields: EntityFieldInfo[]): string | null {
    const keywords = ['priority', 'severity', 'importance', 'rating', 'rank', 'level'];
    for (const keyword of keywords) {
      const field = fields.find(f => f.Name.toLowerCase().includes(keyword));
      if (field) return field.Name;
    }
    return null;
  }

  private getFieldType(field: EntityFieldInfo): CardFieldType {
    if (field.TSType === 'boolean' || field.Type?.toLowerCase() === 'bit') return 'boolean';
    if (field.TSType === 'number') return 'number';
    if (field.TSType === 'Date' || field.Type?.toLowerCase().includes('date')) return 'date';
    return 'text';
  }

  // ========================================
  // VALUE FORMATTING
  // ========================================

  getFieldValue(record: BaseEntity, fieldName: string | null): string {
    if (!fieldName) return '';
    const value = record.Get(fieldName);
    if (value === null || value === undefined) return '';
    return String(value);
  }

  getNumericValue(record: BaseEntity, fieldName: string): string {
    const value = record.Get(fieldName);
    if (value === null || value === undefined) return '-';

    const num = Number(value);
    if (isNaN(num)) return String(value);

    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;

    const fieldNameLower = fieldName.toLowerCase();
    if (['amount', 'price', 'cost', 'value', 'revenue', 'total'].some(k => fieldNameLower.includes(k))) {
      return `$${num.toLocaleString()}`;
    }

    return num.toLocaleString();
  }

  getBooleanValue(record: BaseEntity, fieldName: string): boolean {
    const value = record.Get(fieldName);
    if (value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
    return Boolean(value);
  }

  getTextValue(record: BaseEntity, fieldName: string, maxLength: number = 50): string {
    const value = this.getFieldValue(record, fieldName);
    if (!value) return '-';
    if (value.length <= maxLength) return value;
    return value.substring(0, maxLength) + '...';
  }

  getDateValue(record: BaseEntity, fieldName: string): string {
    const value = record.Get(fieldName);
    if (value === null || value === undefined) return '-';

    try {
      const date = value instanceof Date ? value : new Date(value);
      if (isNaN(date.getTime())) return String(value);
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return String(value);
    }
  }

  /**
   * Get display label for a field using EntityFieldInfo's built-in DisplayNameOrName property
   */
  getFieldLabel(field: EntityFieldInfo): string {
    return field.DisplayNameOrName;
  }

  // ========================================
  // CARD DISPLAY HELPERS
  // ========================================

  getRecordTrackId(record: BaseEntity, index: number): string {
    try {
      const pk = record?.PrimaryKey?.ToString();
      if (pk && pk.trim().length > 0) return pk;
    } catch { /* ignore */ }
    return `record_${index}`;
  }

  isSelected(record: BaseEntity): boolean {
    return record.PrimaryKey.ToConcatenatedString() === this.selectedRecordId;
  }

  onCardClick(record: BaseEntity): void {
    if (!this.entity) return;
    this.recordSelected.emit({
      record,
      entity: this.entity,
      compositeKey: record.PrimaryKey
    });
  }

  onOpenClick(event: Event, record: BaseEntity): void {
    event.stopPropagation();
    if (!this.entity) return;
    this.recordOpened.emit({
      record,
      entity: this.entity,
      compositeKey: record.PrimaryKey
    });
  }

  getInitials(record: BaseEntity): string {
    const template = this.effectiveTemplate;
    if (!template?.titleField) return '?';
    const title = this.getFieldValue(record, template.titleField);
    if (!title) return '?';

    const words = title.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  /**
   * Get the thumbnail type for a record, with per-record fallback through thumbnailFields
   */
  getThumbnailType(record: BaseEntity): 'image' | 'icon' | 'none' {
    const fieldInfo = this.getEffectiveThumbnailField(record);
    if (!fieldInfo) return 'none';

    const { fieldName, value } = fieldInfo;

    // Check if value is an image URL
    if (this.isImageValue(value)) return 'image';

    // Check if value looks like an icon class
    if (this.isIconClass(value)) return 'icon';

    // If field name suggests it's an icon field, treat non-URL values as icon classes
    const fieldNameLower = fieldName.toLowerCase();
    if (fieldNameLower.includes('icon') || fieldNameLower.includes('class')) {
      return 'icon';
    }

    return 'none';
  }

  /**
   * Get the thumbnail URL/value for a record, with per-record fallback
   */
  getThumbnailUrl(record: BaseEntity): string {
    const fieldInfo = this.getEffectiveThumbnailField(record);
    return fieldInfo?.value || '';
  }

  /**
   * Find the first thumbnail field that has a value for this record
   * Returns both the field name and value for type determination
   */
  private getEffectiveThumbnailField(record: BaseEntity): { fieldName: string; value: string } | null {
    const template = this.effectiveTemplate;
    if (!template?.thumbnailFields || template.thumbnailFields.length === 0) return null;

    // Try each field in priority order until we find one with a value
    for (const fieldName of template.thumbnailFields) {
      const value = this.getFieldValue(record, fieldName);
      if (value && value.trim() !== '') {
        return { fieldName, value };
      }
    }

    return null;
  }

  private isImageValue(value: string): boolean {
    if (!value) return false;
    const trimmed = value.trim();
    if (trimmed.startsWith('data:image/')) return true;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return true;
    return false;
  }

  private isIconClass(value: string): boolean {
    if (!value) return false;
    const trimmed = value.trim().toLowerCase();
    if (trimmed.startsWith('fa-') || trimmed.startsWith('fa ') ||
        trimmed.startsWith('fas ') || trimmed.startsWith('far ') ||
        trimmed.startsWith('fal ') || trimmed.startsWith('fab ')) return true;
    if (trimmed.includes('material-icons') || trimmed.startsWith('mat-icon')) return true;
    if (trimmed.startsWith('bi-') || trimmed.startsWith('bi ')) return true;
    return false;
  }

  getRecordColor(record: BaseEntity): string {
    const colors = ['#1976d2', '#388e3c', '#f57c00', '#7b1fa2', '#c2185b', '#0097a7', '#5d4037', '#455a64'];
    const pk = record.PrimaryKey.ToString();
    let hash = 0;
    for (let i = 0; i < pk.length; i++) {
      hash = pk.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  isEnumField(fieldName: string): boolean {
    if (!this.entity) return false;
    const field = this.entity.Fields.find(f => f.Name === fieldName);
    if (!field) return false;
    return field.ValueListTypeEnum !== EntityFieldValueListType.None && field.EntityFieldValues.length > 0;
  }

  get subtitleIsPill(): boolean {
    const template = this.effectiveTemplate;
    if (!template?.subtitleField || !this.entity) return false;
    return this.isEnumField(template.subtitleField);
  }

  getPillColorType(value: string): string {
    return PillColorUtil.getColorType(value);
  }

  /**
   * Check if a record matched on a hidden field
   */
  hasHiddenFieldMatch(record: BaseEntity): boolean {
    return this.hiddenFieldMatches.has(record.PrimaryKey.ToConcatenatedString());
  }

  /**
   * Get the display name of the hidden field that matched
   */
  getHiddenMatchFieldName(record: BaseEntity): string {
    const fieldName = this.hiddenFieldMatches.get(record.PrimaryKey.ToConcatenatedString());
    if (!fieldName || !this.entity) return '';
    // Look up the field in entity metadata and use DisplayNameOrName
    const field = this.entity.Fields.find(f => f.Name === fieldName);
    return field ? field.DisplayNameOrName : fieldName;
  }

  /**
   * Highlight matching text in a string based on the filter text
   * Uses HighlightUtil which only highlights if the text actually matches the pattern
   */
  highlightMatch(text: string): string {
    return HighlightUtil.highlight(text, this.filterText, false);
  }
}
