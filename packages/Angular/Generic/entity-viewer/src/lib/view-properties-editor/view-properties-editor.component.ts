import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  CONTEXT_TOKENS,
  ContextToken,
  EntityFieldInfo,
  EntityInfo,
  PROPERTY_OFFSET_UNITS,
  PROPERTY_VALUE_TYPES,
  PropertyDefault,
  PropertyOffsetUnit,
  PropertyValueType,
  USER_VIEW_PROPERTY_OPERATORS_BY_TYPE,
  UserViewProperty,
  UserViewPropertyOperator,
  ValidateUserViewProperties,
} from '@memberjunction/core';

/** How a property's default is given in the editor. */
export type ViewPropertyDefaultMode = 'none' | 'value' | 'token';

const USER_TOKENS: readonly ContextToken[] = ['Context.UserID', 'Context.UserEmail', 'Context.UserName'];

/**
 * The Properties panel of the view designer: add, edit and remove a view's declared properties
 * (name, type, description, default as a fixed value or a token with an offset, required, allow
 * override, target field and operator). Edits are immutable: every change emits a new list
 * through `PropertiesChange`, so `[(Properties)]` works.
 */
@Component({
  standalone: false,
  selector: 'mj-view-properties-editor',
  templateUrl: './view-properties-editor.component.html',
  styleUrls: ['./view-properties-editor.component.css'],
})
export class ViewPropertiesEditorComponent {
  /** The view's entity: its fields are the targets a property can filter. */
  @Input() Entity: EntityInfo | null = null;
  /** The properties being edited. */
  @Input() Properties: UserViewProperty[] = [];
  /** True when the user cannot edit the view. */
  @Input() Disabled = false;
  @Output() PropertiesChange = new EventEmitter<UserViewProperty[]>();

  public readonly Types = PROPERTY_VALUE_TYPES;
  public readonly Tokens = CONTEXT_TOKENS;
  public readonly OffsetUnits = PROPERTY_OFFSET_UNITS;

  /** Fields a property can target: every non-binary field, in display order. */
  public get FieldOptions(): EntityFieldInfo[] {
    return (this.Entity?.Fields ?? []).filter(f => !f.IsBinaryFieldType);
  }

  /** What is wrong with the properties now, each naming the property; saving is blocked while any remain. */
  public get Problems(): string[] {
    return ValidateUserViewProperties(this.Properties, this.FieldOptions.map(f => f.Name));
  }

  public OperatorsFor(type: PropertyValueType): readonly UserViewPropertyOperator[] {
    return USER_VIEW_PROPERTY_OPERATORS_BY_TYPE[type] ?? [];
  }

  public DefaultMode(property: UserViewProperty): ViewPropertyDefaultMode {
    if (!property.Default) return 'none';
    return property.Default.Token !== undefined ? 'token' : 'value';
  }

  /** True when the property's default is a date token, which can take an offset. */
  public TakesOffset(property: UserViewProperty): boolean {
    return !!property.Default?.Token && !USER_TOKENS.includes(property.Default.Token);
  }

  /** The fixed default as the text an input shows. */
  public DefaultText(property: UserViewProperty): string {
    const value = property.Default?.Value;
    return value === null || value === undefined ? '' : String(value);
  }

  public AddProperty(): void {
    const field = this.FieldOptions[0]?.Name ?? '';
    this.emit([...this.Properties, { Name: this.nextName(), Type: 'string', AllowOverride: true, Target: { Field: field, Operator: '=' } }]);
  }

  public RemoveProperty(index: number): void {
    this.emit(this.Properties.filter((_, i) => i !== index));
  }

  public Update(index: number, patch: Partial<UserViewProperty>): void {
    this.emit(this.Properties.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  public SetField(index: number, field: string): void {
    this.Update(index, { Target: { ...this.Properties[index].Target, Field: field } });
  }

  public SetOperator(index: number, operator: UserViewPropertyOperator): void {
    this.Update(index, { Target: { ...this.Properties[index].Target, Operator: operator } });
  }

  /** A new type keeps the operator only if the type allows it, and drops a fixed default. */
  public SetType(index: number, type: PropertyValueType): void {
    const property = this.Properties[index];
    const operators = this.OperatorsFor(type);
    const operator = operators.includes(property.Target.Operator) ? property.Target.Operator : operators[0];
    const keepDefault = this.DefaultMode(property) === 'token';
    this.Update(index, { Type: type, Target: { ...property.Target, Operator: operator }, Default: keepDefault ? property.Default : undefined });
  }

  public SetDefaultMode(index: number, mode: ViewPropertyDefaultMode): void {
    const defaults: Record<ViewPropertyDefaultMode, PropertyDefault | undefined> = {
      none: undefined,
      value: { Value: null },
      token: { Token: this.Properties[index].Type === 'uuid' ? 'Context.UserID' : 'Context.Today' },
    };
    this.Update(index, { Default: defaults[mode] });
  }

  /** A fixed default from what the user typed: a number for a number property, true/false for a boolean, blank for none. */
  public SetDefaultValue(index: number, text: string): void {
    const type = this.Properties[index].Type;
    const trimmed = text.trim();
    let value: string | number | boolean | null = trimmed.length === 0 ? null : text;
    if (value !== null && type === 'number') value = Number(trimmed);
    if (value !== null && type === 'boolean') value = trimmed === 'true';
    this.Update(index, { Default: { Value: value } });
  }

  /** A user token takes no offset, so choosing one drops it. */
  public SetToken(index: number, token: ContextToken): void {
    const offset = USER_TOKENS.includes(token) ? undefined : this.Properties[index].Default?.Offset;
    this.Update(index, { Default: { Token: token, Offset: offset } });
  }

  /** An offset of 0 (or blank) removes it. */
  public SetOffset(index: number, amount: number | null, unit: PropertyOffsetUnit): void {
    const current = this.Properties[index].Default;
    const offset = amount ? { Amount: Math.trunc(amount), Unit: unit } : undefined;
    this.Update(index, { Default: { Token: current?.Token, Offset: offset } });
  }

  private emit(properties: UserViewProperty[]): void {
    this.Properties = properties;
    this.PropertiesChange.emit(properties);
  }

  private nextName(): string {
    const taken = new Set(this.Properties.map(p => p.Name.toLowerCase()));
    let n = this.Properties.length + 1;
    while (taken.has(`property${n}`)) n++;
    return `Property${n}`;
  }
}
