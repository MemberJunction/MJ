import { Component, Input, Output, EventEmitter, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { EntityInfo, EntityFieldInfo, EntityFieldValueListType } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';
import { CardTemplate, CardDisplayField, CardFieldType, RecordSelectedEvent, RecordOpenedEvent } from '../types';
import { PillColorUtil } from '../pill/pill.component';

/**
 * EntityCardsComponent - Card-based view for entity records
 *
 * This component provides an auto-generated card layout for displaying
 * entity records. Cards are automatically structured based on entity metadata.
 * Filtering should be done at the parent level - this component displays
 * whatever records are passed in.
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
  selector: 'mj-entity-cards',
  templateUrl: './entity-cards.component.html',
  styleUrls: ['./entity-cards.component.css']
})
export class EntityCardsComponent implements OnChanges, OnInit {
  /**
   * The entity metadata for the records being displayed
   */
  @Input() entity: EntityInfo | null = null;

  /**
   * The records to display as cards
   */
  @Input() records: BaseEntity[] = [];

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
   * Emitted when a record is selected (single click)
   */
  @Output() recordSelected = new EventEmitter<RecordSelectedEvent>();

  /**
   * Emitted when a record should be opened (double click or open button)
   */
  @Output() recordOpened = new EventEmitter<RecordOpenedEvent>();

  /** Auto-generated card template */
  public autoCardTemplate: CardTemplate | null = null;

  ngOnInit(): void {
    if (this.entity?.Fields && !this.effectiveTemplate) {
      this.autoCardTemplate = this.generateCardTemplate(this.entity);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entity'] && this.entity?.Fields) {
      this.autoCardTemplate = this.generateCardTemplate(this.entity);
    } else if (changes['entity'] && !this.entity) {
      this.autoCardTemplate = null;
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
      thumbnailField: this.findThumbnailField(fields),
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
        label: this.getFieldLabel(field.Name)
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
          label: this.getFieldLabel(field.Name)
        });
      }
    }

    return displayFields;
  }

  private findThumbnailField(fields: EntityFieldInfo[]): string | null {
    const imageKeywords = ['image', 'photo', 'picture', 'thumbnail', 'avatar', 'logo', 'icon'];
    for (const keyword of imageKeywords) {
      const field = fields.find(f => f.Name.toLowerCase().includes(keyword) && f.TSType === 'string');
      if (field) return field.Name;
    }
    return null;
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

  getFieldLabel(fieldName: string): string {
    return fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
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
    return record.PrimaryKey.ToString() === this.selectedRecordId;
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

  getThumbnailType(record: BaseEntity): 'image' | 'icon' | 'none' {
    const template = this.effectiveTemplate;
    if (!template?.thumbnailField) return 'none';
    const value = this.getFieldValue(record, template.thumbnailField);
    if (!value || value.trim() === '') return 'none';

    if (this.isImageValue(value)) return 'image';
    if (this.isIconClass(value)) return 'icon';
    return 'none';
  }

  getThumbnailUrl(record: BaseEntity): string {
    const template = this.effectiveTemplate;
    if (!template?.thumbnailField) return '';
    return this.getFieldValue(record, template.thumbnailField);
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
    return this.hiddenFieldMatches.has(record.PrimaryKey.ToString());
  }

  /**
   * Get the display name of the hidden field that matched
   */
  getHiddenMatchFieldName(record: BaseEntity): string {
    const fieldName = this.hiddenFieldMatches.get(record.PrimaryKey.ToString());
    if (!fieldName) return '';
    // Convert camelCase to readable label
    return fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
  }

  /**
   * Highlight matching text in a string based on the filter text
   * Supports SQL-style % wildcards
   */
  highlightMatch(text: string): string {
    if (!this.filterText || this.filterText.trim() === '' || !text) return text;

    const searchTerm = this.filterText.trim();

    if (!searchTerm.includes('%')) {
      // Simple case: no wildcards, highlight the exact match
      const regex = new RegExp(`(${this.escapeRegex(searchTerm)})`, 'gi');
      return text.replace(regex, '<span class="highlight-match">$1</span>');
    }

    // Wildcard case: collect all match ranges first, then apply highlights in one pass
    // This prevents corrupting previously added <mark> tags
    const segments = searchTerm.split('%').filter(s => s.length > 0);
    if (segments.length === 0) return text;

    // Find all match positions for all segments
    interface MatchRange { start: number; end: number; }
    const matches: MatchRange[] = [];
    const lowerText = text.toLowerCase();

    for (const segment of segments) {
      const lowerSegment = segment.toLowerCase();
      let searchStart = 0;
      while (searchStart < lowerText.length) {
        const idx = lowerText.indexOf(lowerSegment, searchStart);
        if (idx === -1) break;
        matches.push({ start: idx, end: idx + segment.length });
        searchStart = idx + 1; // Find overlapping matches too
      }
    }

    if (matches.length === 0) return text;

    // Sort by start position and merge overlapping ranges
    matches.sort((a, b) => a.start - b.start);
    const merged: MatchRange[] = [];
    for (const match of matches) {
      if (merged.length === 0 || merged[merged.length - 1].end < match.start) {
        merged.push({ ...match });
      } else {
        // Extend the previous range if overlapping
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, match.end);
      }
    }

    // Build result string with highlights
    let result = '';
    let lastEnd = 0;
    for (const range of merged) {
      result += text.substring(lastEnd, range.start);
      result += '<span class="highlight-match">';
      result += text.substring(range.start, range.end);
      result += '</span>';
      lastEnd = range.end;
    }
    result += text.substring(lastEnd);

    return result;
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
