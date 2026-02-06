import { Component, Input, Output, EventEmitter, ViewChild, AfterViewInit, Renderer2 } from '@angular/core';
import { BaseEntity, EntityField, EntityFieldInfo, EntityFieldTSType } from '@memberjunction/core';
import { IsEncryptedSentinel, IsValueEncrypted } from '@memberjunction/global';
import { BaseRecordComponent } from './base-record-component';
import { BaseFormContext } from './base-form-context';
import { MarkdownComponent } from '@memberjunction/ng-markdown';
import { languages } from '@codemirror/language-data';
import { EncryptionEngineBase } from '@memberjunction/core-entities';

/**
 * This component is used to automatically generate a UI for any field in a given BaseEntity object. The CodeGen tool will generate forms and form sections that
 * use this component. This component automatically determines the type of the field and generates the appropriate UI element for it. It is possible to use other
 * elements to render a field as desired in a custom form, think of this component as a nice "base" component you can use for many cases, and you can create custom
 * components for field rendering/editing when needed.
 */
@Component({
  standalone: false,
  selector: 'mj-form-field',
  styleUrl: './base-field-component.css',
  templateUrl: './base-field-component.html',
})
export class MJFormField extends BaseRecordComponent implements AfterViewInit {
  /**
   * The record object that contains the field to be rendered. This object should be an instance of BaseEntity or a derived class.
   */
  @Input() record!: BaseEntity;
  /**
   * EditMode must be bound to the containing form's edit mode/state. When the form is in edit mode, the field will be rendered as an editable control (if not a read only field), otherwise the field will be rendered read-only.
   */
  @Input() EditMode: boolean = false;
  /**
   * The name of the field in the entity to be rendered.
   */
  @Input() FieldName: string = '';
  /**
   * The type of control to be rendered for the field. The default is 'textbox'. Other possible values are 'textarea', 'numerictextbox', 'datepicker', 'checkbox', 'dropdownlist', 'combobox', 'code'.
   */
  @Input() Type: 'textbox' | 'textarea' | 'numerictextbox' | 'datepicker' | 'checkbox' | 'dropdownlist' | 'combobox' | 'code' = 'textbox';
  /**
   * Optional, the type of link field that should be shown. Email and URL fields will be rendered as hyperlinks, Record fields will be rendered as links to the record. The default is 'None'. Record Fields are only
   * valid when the FieldName field is a foreign key field to another entity.
   */
  @Input() LinkType: 'Email' | 'URL' | 'Record' | 'None' = 'None';

  /**
   * Optional, when the field type is a linked field, you can specify if a search box is shown or a dropdown component is shown. The default is 'search'.
   */
  @Input() LinkComponentType: 'Search' | 'Dropdown' = 'Dropdown';

  /**
   * If set to false, the label for the field will not be shown. The default is true.
   */
  @Input() ShowLabel: boolean = true;

  /**
   * Form context containing all form-level state (filter, showEmptyFields, etc.)
   */
  @Input() formContext?: BaseFormContext;

  /**
   * When true (default), the field will be hidden when it has no value and is in read-only mode.
   * This helps reduce visual clutter by hiding empty fields.
   */
  @Input() hideWhenEmptyInReadOnlyMode: boolean = true;

  languages = languages;

  private _displayName: string | null = null;
  /**
   * Display Name to show on the the control. By default, this is derived from the DisplayName in the entity field metadata, and can be overridden if desired by setting this property manually. Leave it empty to use the default.
   */
  @Input()
  public get DisplayName(): string {
    if (!this._displayName) {
      const ef = this.record.Fields.find((f) => f.CodeName == this.FieldName)?.EntityFieldInfo;
      if (ef) this._displayName = ef.DisplayNameOrName;
      else this._displayName = this.FieldName;
    }
    return this._displayName;
  }
  // use the custom value
  public set DisplayName(newValue: string) {
    this._displayName = newValue;
  }

  /**
   * Returns the display name with search highlighting applied if formContext.sectionFilter is set
   */
  public get HighlightedDisplayName(): string {
    const displayName = this.DisplayName;
    const filter = this.formContext?.sectionFilter;
    if (!filter || !filter.trim()) {
      return displayName;
    }

    const searchTerm = filter.toLowerCase().trim();
    if (!displayName.toLowerCase().includes(searchTerm)) {
      return displayName;
    }

    // Escape special regex characters
    const escapedTerm = this.escapeRegex(searchTerm);
    const regex = new RegExp(escapedTerm, 'gi');
    return displayName.replace(regex, '<mark class="search-highlight">$&</mark>');
  }

  private escapeRegex(term: string): string {
    return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  public get ExtendedType(): string {
    const entityField: EntityField | null = this.record.GetFieldByName(this.FieldName);
    if (!entityField){
      return '';
    }

    return entityField.EntityFieldInfo.ExtendedType;
  }

  private _possibleValues: string[] | null = null;
  /**
   * The possible values for the field. This is only used when the field is a dropdownlist or combobox. The possible values are derived from the EntityFieldValues in the entity field metadata.
   * If the field is not a dropdownlist or combobox, this property is ignored. If you would like to specify a custom list of values, you can set this property manually.
   */
  @Input() get PossibleValues(): string[] {
    if (!this._possibleValues) {
      const ef = this.record.Fields.find((f) => f.CodeName == this.FieldName)?.EntityFieldInfo;
      if (ef && ef.ValueListType !== 'None') this._possibleValues = ef.EntityFieldValues.map((v) => v.Value);
      else this._possibleValues = [];
    }
    return this._possibleValues;
  }
  // use the custom value if provided
  set PossibleValues(newValue: string[]) {
    this._possibleValues = newValue;
  }

  @Input()
  public get Value(): any {
    const v = this.record.Get(this.FieldName);
    const f = this.record.Fields.find((f) => f.CodeName == this.FieldName);
    if (v === null || v === undefined) {
      // check to see if this is a text type of field
      if (f?.EntityFieldInfo.TSType === EntityFieldTSType.String) return '';
    }

    // get here, return the value as it is
    return v;
  }
  public set Value(newValue: any) {
    if (!this.IsFieldReadOnly) {
      this.record.Set(this.FieldName, newValue);
      this.ValueChange.emit(newValue);
    }
    // ignore this if it is read only
  }
  @Output() ValueChange = new EventEmitter<any>();

  /**
   * Returns true if the field is read only. This is determined by the ReadOnly property in the entity field metadata.
   */
  public get IsFieldReadOnly(): boolean {
    const f = this.record.Fields.find((f) => f.CodeName == this.FieldName);
    if (f) return f.ReadOnly;
    else throw new Error(`Field ${this.FieldName} not found in record ${this.record.EntityInfo.Name}`);
  }

  public get FieldInfo(): EntityFieldInfo {
    const f = this.record.Fields.find((f) => f.Name == this.FieldName);
    if (f) return f.EntityFieldInfo;
    else throw new Error(`Field ${this.FieldName} not found in record ${this.record.EntityInfo.Name}`);
  }

  /**
   * Returns true if the field should be hidden (empty value in read-only mode with hideWhenEmptyInReadOnlyMode enabled)
   */
  public get shouldHideField(): boolean {
    // If form-level "Show Empty Fields" is enabled, never hide
    if (this.formContext?.showEmptyFields) {
      return false;
    }

    // Don't hide if the feature is disabled or we're in edit mode
    if (!this.hideWhenEmptyInReadOnlyMode || this.EditMode) {
      return false;
    }

    // Check if the field has a value
    const value = this.record.Get(this.FieldName);
    return value === null || value === undefined || value === '';
  }

  /**
   * Returns true if the field is configured for encryption in the entity metadata
   */
  public get IsEncryptedField(): boolean {
    return this.FieldInfo?.Encrypt === true;
  }

  /**
   * Returns true if the field allows decrypted values to be shown in the API
   */
  public get AllowDecryptInAPI(): boolean {
    return this.FieldInfo?.AllowDecryptInAPI === true;
  }

  /**
   * Returns true if the field's current value is the encrypted sentinel value,
   * indicating that the actual value is protected and cannot be shown.
   */
  public get IsValueEncryptedSentinel(): boolean {
    const value = this.record.Get(this.FieldName);
    return IsEncryptedSentinel(value);
  }

  /**
   * Returns true if the field's current value should be treated as protected for display purposes.
   * For encrypted fields where AllowDecryptInAPI=false, any non-empty value should be hidden.
   */
  public get IsValueProtected(): boolean {
    const f = this.record.GetFieldByName(this.FieldName);
    if (f?.EntityFieldInfo?.Encrypt && f?.EntityFieldInfo.EncryptionKeyID) {
      const value = this.record.Get(this.FieldName);

      // If value is sentinel or encrypted ciphertext, it's protected
      const key = EncryptionEngineBase.Instance.GetKeyByID(f.EntityFieldInfo.EncryptionKeyID)
      if (IsValueEncrypted(value, key?.Marker)) {
        return true;
      }

      // For encrypted fields where AllowDecryptInAPI=false, treat any non-null value as protected
      const fieldInfo = this.FieldInfo;
      if (fieldInfo?.Encrypt && !fieldInfo.AllowDecryptInAPI) {
        return value !== null && value !== undefined && value !== '';
      }
    }
    return false;
  }

  /**
   * Returns true if the encrypted field has a value that can be revealed (AllowDecryptInAPI=true)
   */
  public get CanRevealEncryptedValue(): boolean {
    if (!this.IsEncryptedField) return false;
    if (!this.AllowDecryptInAPI) return false;
    const value = this.record.Get(this.FieldName);
    return value !== null && value !== undefined && value !== '';
  }

  /**
   * Controls whether the encrypted value is currently visible (for AllowDecryptInAPI=true fields)
   */
  public isEncryptedValueRevealed = false;

  /**
   * Controls whether the new value being typed is visible (for blind edit mode)
   */
  public isNewValueRevealed = false;

  /**
   * Toggles the visibility of the encrypted value
   */
  public toggleEncryptedValueVisibility(): void {
    this.isEncryptedValueRevealed = !this.isEncryptedValueRevealed;
  }

  /**
   * Toggles the visibility of the new value being typed (for blind edit mode)
   */
  public toggleNewValueVisibility(): void {
    this.isNewValueRevealed = !this.isNewValueRevealed;
  }

  /**
   * For encrypted fields in edit mode where AllowDecryptInAPI=false,
   * we need a separate edit value that starts empty (user can't see existing value)
   */
  private _encryptedEditValue: string = '';

  /**
   * Gets the value for editing encrypted fields.
   * For AllowDecryptInAPI=false fields, returns empty string initially (user can't see existing value)
   * For AllowDecryptInAPI=true fields, returns the actual value
   */
  public get EncryptedEditValue(): string {
    if (this.AllowDecryptInAPI) {
      return this.Value ?? '';
    }
    return this._encryptedEditValue;
  }

  /**
   * Sets the encrypted edit value and updates the record
   */
  public set EncryptedEditValue(newValue: string) {
    this._encryptedEditValue = newValue;
    if (newValue && newValue.length > 0) {
      // Only update the record if user has entered something
      this.record.Set(this.FieldName, newValue);
      this.ValueChange.emit(newValue);
    }
  }

  /**
   * Returns true if editing an encrypted field that doesn't allow viewing existing value
   */
  public get IsBlindEncryptedEdit(): boolean {
    return this.IsEncryptedField && !this.AllowDecryptInAPI && this.IsValueProtected;
  }

  /**
   * The masked display text for encrypted values (shows dots instead of actual value)
   */
  public readonly EncryptedDisplayMask = '••••••••';

  @ViewChild('markdown', { static: false}) markdown: MarkdownComponent | undefined;

  constructor(
    private renderer: Renderer2,
  ) {
    super();
  }

  ngAfterViewInit(): void {
    if (this.markdown) {
      // Create a MutationObserver to watch for changes in the markdown component
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Get the first child element inside the markdown component
            const el = this.markdown?.element.nativeElement.firstChild as HTMLElement;
            if (el) {
              // Apply styles using Renderer2
              this.renderer.setStyle(el, 'margin-top', '0');
              this.renderer.setStyle(el, 'margin-bottom', '0');
              // only apply font size if the element is a paragraph
              if (el.tagName === 'P') this.renderer.setStyle(el, 'font-size', '14px');
            }
          }
        });
      });

      // Start observing the markdown component for child node additions
      observer.observe(this.markdown.element.nativeElement, { childList: true });
    }
  }
}
