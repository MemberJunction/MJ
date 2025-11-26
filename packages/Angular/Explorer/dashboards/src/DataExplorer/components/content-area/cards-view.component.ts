import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';
import { AutoCardTemplate } from '../../models/explorer-state.interface';

@Component({
  selector: 'mj-explorer-cards-view',
  templateUrl: './cards-view.component.html',
  styleUrls: ['./cards-view.component.css']
})
export class CardsViewComponent implements OnChanges {
  @Input() entity: EntityInfo | null = null;
  @Input() records: BaseEntity[] = [];
  @Input() selectedRecordId: string | null = null;

  @Output() recordSelected = new EventEmitter<BaseEntity>();
  @Output() recordOpened = new EventEmitter<BaseEntity>();

  public cardTemplate: AutoCardTemplate | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entity'] && this.entity) {
      this.cardTemplate = this.generateCardTemplate(this.entity);
    }
  }

  /**
   * Generate auto card template from entity metadata
   */
  private generateCardTemplate(entity: EntityInfo): AutoCardTemplate {
    const fields = entity.Fields;

    return {
      titleField: this.findTitleField(entity, fields),
      subtitleField: this.findSubtitleField(fields),
      descriptionField: this.findDescriptionField(fields),
      metricFields: this.findMetricFields(fields),
      thumbnailField: this.findThumbnailField(fields),
      badgeField: this.findBadgeField(fields)
    };
  }

  /**
   * Find the best field for card title
   * Priority: Entity.NameField > "Name" > "Title" > First string field
   */
  private findTitleField(entity: EntityInfo, fields: EntityFieldInfo[]): string {
    // 1. Use entity's NameField if defined
    if (entity.NameField) {
      return entity.NameField.Name;
    }

    // 2. Look for field named "Name" or "Title"
    const nameField = fields.find(f =>
      f.Name.toLowerCase() === 'name' || f.Name.toLowerCase() === 'title'
    );
    if (nameField) return nameField.Name;

    // 3. Look for fields ending in "Name" (e.g., "CompanyName", "CustomerName")
    const endsWithName = fields.find(f =>
      f.Name.toLowerCase().endsWith('name') &&
      f.TSType === 'string' &&
      !f.Name.toLowerCase().includes('file') &&
      !f.IsPrimaryKey
    );
    if (endsWithName) return endsWithName.Name;

    // 4. Fall back to first non-ID string field
    const firstString = fields.find(f =>
      f.TSType === 'string' &&
      !f.IsPrimaryKey &&
      !f.Name.toLowerCase().includes('id')
    );
    if (firstString) return firstString.Name;

    // 5. Ultimate fallback to primary key
    const pk = fields.find(f => f.IsPrimaryKey);
    return pk?.Name || 'ID';
  }

  /**
   * Find field for subtitle (Status, Type, Category)
   */
  private findSubtitleField(fields: EntityFieldInfo[]): string | null {
    const subtitleKeywords = ['status', 'type', 'category', 'state', 'stage'];

    for (const keyword of subtitleKeywords) {
      const field = fields.find(f =>
        f.Name.toLowerCase().includes(keyword) &&
        f.TSType === 'string' &&
        !f.IsPrimaryKey
      );
      if (field) return field.Name;
    }

    return null;
  }

  /**
   * Find field for description
   */
  private findDescriptionField(fields: EntityFieldInfo[]): string | null {
    const descKeywords = ['description', 'desc', 'summary', 'notes', 'comments'];

    for (const keyword of descKeywords) {
      const field = fields.find(f =>
        f.Name.toLowerCase().includes(keyword) &&
        f.TSType === 'string'
      );
      if (field) return field.Name;
    }

    return null;
  }

  /**
   * Find numeric fields for metrics (Amount, Total, Count, etc.)
   */
  private findMetricFields(fields: EntityFieldInfo[]): string[] {
    const metricKeywords = ['amount', 'total', 'count', 'value', 'price', 'cost', 'quantity', 'qty', 'balance', 'revenue', 'score'];
    const metrics: string[] = [];

    for (const field of fields) {
      if (metrics.length >= 3) break; // Max 3 metrics

      const isNumeric = field.TSType === 'number';
      const matchesKeyword = metricKeywords.some(kw =>
        field.Name.toLowerCase().includes(kw)
      );

      if (isNumeric && matchesKeyword) {
        metrics.push(field.Name);
      }
    }

    // If no keyword matches, take first numeric fields that aren't IDs
    if (metrics.length === 0) {
      const numericFields = fields.filter(f =>
        f.TSType === 'number' &&
        !f.IsPrimaryKey &&
        !f.Name.toLowerCase().includes('id') &&
        !f.Name.toLowerCase().includes('sequence')
      );

      for (const field of numericFields.slice(0, 2)) {
        metrics.push(field.Name);
      }
    }

    return metrics;
  }

  /**
   * Find thumbnail/image field
   */
  private findThumbnailField(fields: EntityFieldInfo[]): string | null {
    const imageKeywords = ['image', 'photo', 'picture', 'thumbnail', 'avatar', 'logo', 'icon'];

    for (const keyword of imageKeywords) {
      const field = fields.find(f =>
        f.Name.toLowerCase().includes(keyword) &&
        f.TSType === 'string'
      );
      if (field) return field.Name;
    }

    // Also look for URL fields that might be images
    const urlField = fields.find(f =>
      (f.Name.toLowerCase().includes('url') || f.Name.toLowerCase().includes('link')) &&
      f.TSType === 'string'
    );
    if (urlField) return urlField.Name;

    return null;
  }

  /**
   * Find badge field (priority, severity, etc.)
   */
  private findBadgeField(fields: EntityFieldInfo[]): string | null {
    const badgeKeywords = ['priority', 'severity', 'importance', 'rating', 'rank', 'level'];

    for (const keyword of badgeKeywords) {
      const field = fields.find(f =>
        f.Name.toLowerCase().includes(keyword)
      );
      if (field) return field.Name;
    }

    return null;
  }

  /**
   * Get value from record for a field
   */
  getFieldValue(record: BaseEntity, fieldName: string | null): string {
    if (!fieldName) return '';
    const value = record.Get(fieldName);
    if (value === null || value === undefined) return '';
    return String(value);
  }

  /**
   * Get numeric value formatted
   */
  getMetricValue(record: BaseEntity, fieldName: string): string {
    const value = record.Get(fieldName);
    if (value === null || value === undefined) return '-';

    const num = Number(value);
    if (isNaN(num)) return String(value);

    // Format based on size
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }

    // Check if it looks like currency
    const fieldNameLower = fieldName.toLowerCase();
    if (fieldNameLower.includes('amount') ||
        fieldNameLower.includes('price') ||
        fieldNameLower.includes('cost') ||
        fieldNameLower.includes('value') ||
        fieldNameLower.includes('revenue') ||
        fieldNameLower.includes('total')) {
      return `$${num.toLocaleString()}`;
    }

    return num.toLocaleString();
  }

  /**
   * Get friendly label for a field
   */
  getFieldLabel(fieldName: string): string {
    // Convert camelCase/PascalCase to Title Case with spaces
    return fieldName
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Check if record is selected
   */
  isSelected(record: BaseEntity): boolean {
    return record.PrimaryKey.ToString() === this.selectedRecordId;
  }

  /**
   * Handle card click
   */
  onCardClick(record: BaseEntity): void {
    this.recordSelected.emit(record);
  }

  /**
   * Handle open button click
   */
  onOpenClick(event: Event, record: BaseEntity): void {
    event.stopPropagation();
    this.recordOpened.emit(record);
  }

  /**
   * Get initials for avatar when no image
   */
  getInitials(record: BaseEntity): string {
    if (!this.cardTemplate?.titleField) return '?';
    const title = this.getFieldValue(record, this.cardTemplate.titleField);
    if (!title) return '?';

    const words = title.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 1) {
      return words[0].substring(0, 2).toUpperCase();
    }
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  /**
   * Check if record has a valid thumbnail image
   */
  hasThumbnail(record: BaseEntity): boolean {
    if (!this.cardTemplate?.thumbnailField) return false;
    const url = this.getFieldValue(record, this.cardTemplate.thumbnailField);
    return this.isValidImageUrl(url);
  }

  /**
   * Get the thumbnail URL for a record
   */
  getThumbnailUrl(record: BaseEntity): string {
    if (!this.cardTemplate?.thumbnailField) return '';
    return this.getFieldValue(record, this.cardTemplate.thumbnailField);
  }

  /**
   * Check if a URL is likely a valid image URL
   */
  isValidImageUrl(url: string): boolean {
    if (!url || url.trim() === '') return false;

    // Check if it starts with http/https
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:image/')) {
      return false;
    }

    // Check for common image extensions
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
    const urlLower = url.toLowerCase();

    // Check if URL ends with image extension (before query params)
    const urlWithoutParams = urlLower.split('?')[0];
    if (imageExtensions.some(ext => urlWithoutParams.endsWith(ext))) {
      return true;
    }

    // Check if it's a data URL for an image
    if (url.startsWith('data:image/')) {
      return true;
    }

    // Be conservative - if we can't confirm it's an image, don't try to load it
    return false;
  }

  /**
   * Get a consistent color for a record (for avatar background)
   */
  getRecordColor(record: BaseEntity): string {
    const colors = [
      '#1976d2', '#388e3c', '#f57c00', '#7b1fa2',
      '#c2185b', '#0097a7', '#5d4037', '#455a64'
    ];
    const pk = record.PrimaryKey.ToString();
    let hash = 0;
    for (let i = 0; i < pk.length; i++) {
      hash = pk.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }
}
