import { Component, Input, Output, EventEmitter, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { EntityInfo, EntityFieldInfo, EntityFieldValueListType } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core';
import { AutoCardTemplate, CardDisplayField, CardFieldType } from '../../models/explorer-state.interface';
import { PillColorUtil } from '../shared/status-pill.component';

@Component({
  selector: 'mj-explorer-cards-view',
  templateUrl: './cards-view.component.html',
  styleUrls: ['./cards-view.component.css']
})
export class CardsViewComponent implements OnChanges, OnInit {
  @Input() entity: EntityInfo | null = null;
  @Input() records: BaseEntity[] = [];
  @Input() selectedRecordId: string | null = null;
  @Input() filterText: string = '';

  @Output() recordSelected = new EventEmitter<BaseEntity>();
  @Output() recordOpened = new EventEmitter<BaseEntity>();
  @Output() filteredCountChanged = new EventEmitter<number>();

  public cardTemplate: AutoCardTemplate | null = null;

  // Cached filtered records - only recomputed when inputs change
  private _filteredRecords: BaseEntity[] = [];

  // Track which records matched on hidden (non-visible) fields
  // Key is record primary key, value is the field name that matched
  private _hiddenFieldMatches = new Map<string, string>();

  ngOnInit(): void {
    // Generate card template if entity is available (and not already set by ngOnChanges)
    if (this.entity?.Fields && !this.cardTemplate) {
      this.cardTemplate = this.generateCardTemplate(this.entity);
    }

    // Always apply filter on init - critical for when component is created
    // with both records and filterText already set
    this.updateFilteredRecords();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // IMPORTANT: Generate card template BEFORE filtering so visible fields are known
    if (changes['entity'] && this.entity && this.entity.Fields) {
      this.cardTemplate = this.generateCardTemplate(this.entity);
    } else if (changes['entity'] && !this.entity) {
      this.cardTemplate = null;
    }

    // Recompute filtered records when records, filterText, or entity change
    // Entity change matters because it affects the cardTemplate and visible fields
    if (changes['records'] || changes['filterText'] || changes['entity']) {
      this.updateFilteredRecords();
    }
  }

  /**
   * Update the cached filtered records
   * Also tracks which records matched on hidden (non-visible) fields
   */
  private updateFilteredRecords(): void {
    // Clear hidden field matches
    this._hiddenFieldMatches.clear();

    if (!this.filterText || this.filterText.trim() === '') {
      this._filteredRecords = this.records;
      this.filteredCountChanged.emit(this.records.length);
      return;
    }

    const searchTerm = this.filterText.toLowerCase().trim();
    const visibleFields = this.getVisibleFieldNames();

    this._filteredRecords = this.records.filter(record => {
      if (!this.entity) return true;

      let matchedField: string | null = null;
      let matchedInVisibleField = false;

      for (const field of this.entity.Fields) {
        // Skip date/time fields - searching on stringified dates produces weird matches
        // (e.g., "Standard" in "Central Standard Time" matching "da")
        // Skip UUID fields - users rarely search for UUID fragments
        if (this.isDateTimeField(field) || this.isUUIDField(field)) {
          continue;
        }

        const value = record.Get(field.Name);
        if (value !== null && value !== undefined) {
          const strValue = String(value);
          if (this.matchesSearchTerm(strValue, searchTerm)) {
            matchedField = field.Name;
            if (visibleFields.has(field.Name)) {
              matchedInVisibleField = true;
              break; // Found visible match, no need to continue
            }
            // Keep searching for a visible match, but remember this hidden match
          }
        }
      }

      if (matchedField) {
        // Track if match was only in hidden fields
        // Use the record's stable key (primary key string) for tracking
        if (!matchedInVisibleField) {
          const recordKey = this.getStableRecordKey(record);
          this._hiddenFieldMatches.set(recordKey, matchedField);
        }
        return true;
      }
      return false;
    });

    this.filteredCountChanged.emit(this._filteredRecords.length);
  }

  /**
   * Check if a field is a date/time type (should be excluded from text search)
   */
  private isDateTimeField(field: EntityFieldInfo): boolean {
    return field.TSType === 'Date';
  }

  /**
   * Check if a field is a UUID/GUID type (should be excluded from text search)
   */
  private isUUIDField(field: EntityFieldInfo): boolean {
    return field.SQLFullType?.trim().toLowerCase() === 'uniqueidentifier';
  }

  /**
   * Check if a value matches the search term, supporting SQL-style % wildcards
   * This provides consistent behavior with server-side SQL LIKE queries
   * Examples:
   *   "test" matches "this is a test string" (implicit %term%)
   *   "hub%updat%comp" matches "hubspot update company" (fragments in order)
   *   "%comp" matches "my company"
   */
  private matchesSearchTerm(value: string, searchTerm: string): boolean {
    const lowerValue = value.toLowerCase();
    const lowerTerm = searchTerm.toLowerCase();

    if (!lowerTerm.includes('%')) {
      // No wildcards - use simple substring match (equivalent to %term%)
      return lowerValue.includes(lowerTerm);
    }

    // Split by % to get fragments that must appear in order
    const fragments = lowerTerm.split('%').filter(s => s.length > 0);

    if (fragments.length === 0) {
      // Just wildcards, matches everything
      return true;
    }

    // Each fragment must appear in the value, in order
    // Search for each fragment starting from where the previous one ended
    let searchStartIndex = 0;
    for (const fragment of fragments) {
      const foundIndex = lowerValue.indexOf(fragment, searchStartIndex);
      if (foundIndex === -1) {
        return false; // Fragment not found
      }
      // Next search starts after this fragment
      searchStartIndex = foundIndex + fragment.length;
    }

    return true;
  }

  /**
   * Get a stable key for a record that doesn't depend on array index
   * Used for tracking hidden field matches across filter updates
   */
  private getStableRecordKey(record: BaseEntity): string {
    try {
      const pk = record?.PrimaryKey?.ToString();
      if (pk && pk.trim().length > 0) {
        return pk;
      }
    } catch {
      // PrimaryKey access failed
    }
    // Fallback: use stringified field values as a pseudo-key
    // This is less ideal but handles edge cases
    try {
      const nameField = this.cardTemplate?.titleField;
      if (nameField) {
        const name = record.Get(nameField);
        if (name) return `name_${String(name)}`;
      }
    } catch {
      // Ignore
    }
    return `unknown_${Date.now()}_${Math.random()}`;
  }

  /**
   * Get set of field names that are visible on the card
   */
  private getVisibleFieldNames(): Set<string> {
    const visible = new Set<string>();
    if (!this.cardTemplate) return visible;

    if (this.cardTemplate.titleField) visible.add(this.cardTemplate.titleField);
    if (this.cardTemplate.subtitleField) visible.add(this.cardTemplate.subtitleField);
    if (this.cardTemplate.descriptionField) visible.add(this.cardTemplate.descriptionField);
    if (this.cardTemplate.badgeField) visible.add(this.cardTemplate.badgeField);
    this.cardTemplate.displayFields.forEach(df => visible.add(df.name));

    return visible;
  }

  /**
   * Check if a record matched on a hidden (non-visible) field
   */
  hasHiddenFieldMatch(record: BaseEntity): boolean {
    if (!this.filterText) return false;
    const recordKey = this.getStableRecordKey(record);
    return this._hiddenFieldMatches.has(recordKey);
  }

  /**
   * Get the name of the hidden field that matched for a record
   */
  getHiddenMatchFieldName(record: BaseEntity): string {
    const recordKey = this.getStableRecordKey(record);
    const fieldName = this._hiddenFieldMatches.get(recordKey);
    return fieldName ? this.getFieldLabel(fieldName) : '';
  }

  /**
   * Generate auto card template from entity metadata
   */
  private generateCardTemplate(entity: EntityInfo): AutoCardTemplate | null {
    const fields = entity.Fields;

    // Guard against invalid entity without Fields
    if (!fields || fields.length === 0) {
      console.warn(`Entity ${entity.Name} has no fields defined`);
      return null;
    }

    return {
      titleField: this.findTitleField(entity, fields),
      subtitleField: this.findSubtitleField(fields),
      descriptionField: this.findDescriptionField(fields),
      displayFields: this.findDisplayFields(fields),
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
   * Find fields for display in cards using DefaultInView metadata
   * Returns fields with type information for smart rendering
   */
  private findDisplayFields(fields: EntityFieldInfo[]): CardDisplayField[] {
    const displayFields: CardDisplayField[] = [];

    // Exclude title/subtitle/description candidates and non-displayable fields
    const excludePatterns = ['id', 'name', 'title', 'description', 'desc', 'summary', 'notes',
                            'status', 'type', 'category', 'state', 'stage', 'password', 'secret',
                            '__mj_', 'createdat', 'updatedat', 'createdby', 'updatedby'];

    // First priority: Use fields marked as DefaultInView (set by LLM in CodeGen)
    const defaultInViewFields = fields.filter(f =>
      f.DefaultInView === true &&
      !f.IsPrimaryKey &&
      !excludePatterns.some(p => f.Name.toLowerCase().includes(p))
    );

    // Take up to 4 DefaultInView fields
    for (const field of defaultInViewFields) {
      if (displayFields.length >= 4) break;
      displayFields.push({
        name: field.Name,
        type: this.getFieldType(field),
        label: this.getFieldLabel(field.Name)
      });
    }

    // If we have enough from DefaultInView, return
    if (displayFields.length >= 2) {
      return displayFields;
    }

    // Fallback: Look for fields with metric-like names
    const metricKeywords = ['amount', 'total', 'count', 'value', 'price', 'cost', 'quantity', 'qty', 'balance', 'revenue', 'score'];

    for (const field of fields) {
      if (displayFields.length >= 4) break;
      if (displayFields.some(df => df.name === field.Name)) continue; // Already added

      const matchesKeyword = metricKeywords.some(kw =>
        field.Name.toLowerCase().includes(kw)
      );

      if (matchesKeyword) {
        displayFields.push({
          name: field.Name,
          type: this.getFieldType(field),
          label: this.getFieldLabel(field.Name)
        });
      }
    }

    return displayFields;
  }

  /**
   * Determine the display type for a field
   */
  private getFieldType(field: EntityFieldInfo): CardFieldType {
    // Check for boolean (BIT in SQL)
    if (field.TSType === 'boolean' || field.Type?.toLowerCase() === 'bit') {
      return 'boolean';
    }

    // Check for numeric types
    if (field.TSType === 'number') {
      return 'number';
    }

    // Check for date types
    if (field.TSType === 'Date' || field.Type?.toLowerCase().includes('date') ||
        field.Type?.toLowerCase().includes('time')) {
      return 'date';
    }

    // Default to text
    return 'text';
  }

  /**
   * Find thumbnail/image field
   * Priority:
   * 1. Fields with image-related names (most explicit)
   * 2. Fields with ExtendedType='URL' that have image-related names
   * NOTE: We deliberately exclude generic URL fields (like 'Website') as they typically
   * contain website URLs, not image URLs
   */
  private findThumbnailField(fields: EntityFieldInfo[]): string | null {
    // Priority 1: Fields with explicit image-related names
    const imageKeywords = ['image', 'photo', 'picture', 'thumbnail', 'avatar', 'logo', 'icon'];
    for (const keyword of imageKeywords) {
      const field = fields.find(f =>
        f.Name.toLowerCase().includes(keyword) &&
        f.TSType === 'string'
      );
      if (field) return field.Name;
    }

    // Priority 2: URL-typed fields with image-related names
    const urlImageField = fields.find(f =>
      f.ExtendedType === 'URL' &&
      f.TSType === 'string' &&
      imageKeywords.some(kw => f.Name.toLowerCase().includes(kw))
    );
    if (urlImageField) return urlImageField.Name;

    // Priority 3: Fields with URL/link in name that suggest images (fallback for fields without ExtendedType set)
    // Exclude generic website/profile URLs as they're typically not images
    const excludeUrlPatterns = ['website', 'site', 'profile', 'linkedin', 'twitter', 'facebook', 'email'];
    const urlNamedField = fields.find(f =>
      (f.Name.toLowerCase().includes('url') || f.Name.toLowerCase().includes('link')) &&
      f.TSType === 'string' &&
      !excludeUrlPatterns.some(p => f.Name.toLowerCase().includes(p)) &&
      // Only include if it looks image-related
      imageKeywords.some(kw => f.Name.toLowerCase().includes(kw))
    );
    if (urlNamedField) return urlNamedField.Name;

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
  getNumericValue(record: BaseEntity, fieldName: string): string {
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
   * Get boolean value for display (true/false, 1/0 -> boolean)
   */
  getBooleanValue(record: BaseEntity, fieldName: string): boolean {
    const value = record.Get(fieldName);
    if (value === null || value === undefined) return false;
    // Handle various boolean representations
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1';
    }
    return Boolean(value);
  }

  /**
   * Get text value truncated for display
   */
  getTextValue(record: BaseEntity, fieldName: string, maxLength: number = 50): string {
    const value = this.getFieldValue(record, fieldName);
    if (!value) return '-';
    if (value.length <= maxLength) return value;
    return value.substring(0, maxLength) + '...';
  }

  /**
   * Get date value formatted for display
   */
  getDateValue(record: BaseEntity, fieldName: string): string {
    const value = record.Get(fieldName);
    if (value === null || value === undefined) return '-';

    try {
      const date = value instanceof Date ? value : new Date(value);
      if (isNaN(date.getTime())) return String(value);

      // Format as short date
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return String(value);
    }
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
   * Get a unique track ID for a record (for Angular @for loop)
   * Falls back to index if primary key is empty or unavailable
   */
  getRecordTrackId(record: BaseEntity, index: number): string {
    try {
      const pk = record?.PrimaryKey?.ToString();
      if (pk && pk.trim().length > 0) {
        return pk;
      }
      else {
        return `record_${index}`;
      }
    } catch {
      // PrimaryKey access failed
    }
    // Always return a unique fallback based on index
    return `record_${index}`;
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
   * Determine the type of thumbnail content for a record
   * Returns 'image' for URLs/base64 images, 'icon' for CSS icon classes, 'none' otherwise
   */
  getThumbnailType(record: BaseEntity): 'image' | 'icon' | 'none' {
    if (!this.cardTemplate?.thumbnailField) return 'none';
    const value = this.getFieldValue(record, this.cardTemplate.thumbnailField);
    if (!value || value.trim() === '') return 'none';

    // Check for image URL or base64
    if (this.isImageValue(value)) {
      return 'image';
    }

    // Check for CSS icon class (Font Awesome, Material Icons, etc.)
    if (this.isIconClass(value)) {
      return 'icon';
    }

    return 'none';
  }

  /**
   * Get the thumbnail value for a record (URL, base64, or icon class)
   */
  getThumbnailUrl(record: BaseEntity): string {
    if (!this.cardTemplate?.thumbnailField) return '';
    return this.getFieldValue(record, this.cardTemplate.thumbnailField);
  }

  /**
   * Check if a value is an image (URL or base64)
   */
  private isImageValue(value: string): boolean {
    if (!value || value.trim() === '') return false;

    const trimmed = value.trim();

    // Check for data URL (base64 encoded image)
    if (trimmed.startsWith('data:image/')) {
      return true;
    }

    // Check for HTTP/HTTPS URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      // Check for common image extensions
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
      const urlWithoutParams = trimmed.toLowerCase().split('?')[0];
      if (imageExtensions.some(ext => urlWithoutParams.endsWith(ext))) {
        return true;
      }
      // Could be a dynamic image URL without extension - be permissive for URLs
      return true;
    }

    return false;
  }

  /**
   * Check if a value is a CSS icon class
   * Supports Font Awesome (fa-), Material Icons (mat-icon, material-icons),
   * Bootstrap Icons (bi-), and other common icon libraries
   */
  private isIconClass(value: string): boolean {
    if (!value || value.trim() === '') return false;

    const trimmed = value.trim().toLowerCase();

    // Font Awesome patterns: "fa-solid fa-user", "fa fa-user", "fas fa-user", etc.
    if (trimmed.startsWith('fa-') || trimmed.startsWith('fa ') ||
        trimmed.startsWith('fas ') || trimmed.startsWith('far ') ||
        trimmed.startsWith('fal ') || trimmed.startsWith('fab ')) {
      return true;
    }

    // Material Icons
    if (trimmed.includes('material-icons') || trimmed.startsWith('mat-icon')) {
      return true;
    }

    // Bootstrap Icons
    if (trimmed.startsWith('bi-') || trimmed.startsWith('bi ')) {
      return true;
    }

    // Glyphicons
    if (trimmed.startsWith('glyphicon')) {
      return true;
    }

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

  /**
   * Get filtered records (returns cached results computed in ngOnChanges)
   */
  get filteredRecords(): BaseEntity[] {
    return this._filteredRecords;
  }

  /**
   * Highlight matching text with a mark tag
   * Supports SQL-style % wildcards for consistent behavior with server-side search
   */
  highlightMatch(text: string): string {
    if (!this.filterText || this.filterText.trim() === '' || !text) {
      return text;
    }

    const searchTerm = this.filterText.trim();

    if (!searchTerm.includes('%')) {
      // No wildcards - simple highlight
      const regex = new RegExp(`(${this.escapeRegex(searchTerm)})`, 'gi');
      return text.replace(regex, '<mark class="highlight-match">$1</mark>');
    }

    // With wildcards - highlight each non-wildcard segment that matches
    // Split by % and highlight each segment separately
    const segments = searchTerm.split('%').filter(s => s.length > 0);
    if (segments.length === 0) {
      return text;
    }

    let result = text;
    for (const segment of segments) {
      const regex = new RegExp(`(${this.escapeRegex(segment)})`, 'gi');
      result = result.replace(regex, '<mark class="highlight-match">$1</mark>');
    }
    return result;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Check if a field has enumerated values (value list)
   */
  isEnumField(fieldName: string): boolean {
    if (!this.entity) return false;
    const field = this.entity.Fields.find(f => f.Name === fieldName);
    if (!field) return false;

    return field.ValueListTypeEnum !== EntityFieldValueListType.None &&
           field.EntityFieldValues.length > 0;
  }

  /**
   * Check if the subtitle field should be shown as a pill
   */
  get subtitleIsPill(): boolean {
    if (!this.cardTemplate?.subtitleField || !this.entity) return false;
    return this.isEnumField(this.cardTemplate.subtitleField);
  }

  /**
   * Get the pill color type for a value
   */
  getPillColorType(value: string): string {
    return PillColorUtil.getColorType(value);
  }
}
