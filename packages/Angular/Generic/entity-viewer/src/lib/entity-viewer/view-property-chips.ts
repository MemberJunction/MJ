import { PropertyDefault, UserViewProperty, ViewPropertyValue, ViewPropertyValues } from '@memberjunction/core';

/** One read-only chip above the grid: a view property and the value this run gives it. */
export interface ViewPropertyChip {
  Name: string;
  /** What the chip shows as the value: the host's value, the default, "set by server", or "any". */
  Value: string;
  /** True for a property only the server may set. */
  ServerSet: boolean;
  Description: string | null;
}

/**
 * The chips for a view's properties. A property that does not allow override reads "set by
 * server": the browser never sees its value. Any other shows the host's value, else its default,
 * else "any".
 */
export function BuildViewPropertyChips(declared: readonly UserViewProperty[] | null | undefined, values: ViewPropertyValues | null | undefined): ViewPropertyChip[] {
  return (declared ?? []).map(property => ({
    Name: property.Name,
    Value: chipValue(property, values),
    ServerSet: property.AllowOverride === false,
    Description: property.Description ?? null,
  }));
}

function chipValue(property: UserViewProperty, values: ViewPropertyValues | null | undefined): string {
  if (property.AllowOverride === false) {
    return 'set by server';
  }
  if (values && Object.prototype.hasOwnProperty.call(values, property.Name) && values[property.Name] !== undefined) {
    return formatValue(values[property.Name]);
  }
  return property.Default ? `${describeDefault(property.Default)} (default)` : 'any';
}

function formatValue(value: ViewPropertyValue): string {
  if (value === null) {
    return 'none';
  }
  return Array.isArray(value) ? value.map(v => String(v)).join(', ') : String(value);
}

/** `Today -30 days`, `Start of month -1 month`, or the fixed value. */
function describeDefault(def: PropertyDefault): string {
  if (!def.Token) {
    return formatValue(def.Value ?? null);
  }
  const token = def.Token.replace('Context.', '').replace(/([a-z])([A-Z])/g, '$1 $2');
  const label = token.charAt(0) + token.slice(1).toLowerCase();
  if (!def.Offset) {
    return label;
  }
  const { Amount, Unit } = def.Offset;
  return `${label} ${Amount > 0 ? '+' : ''}${Amount} ${Unit}${Math.abs(Amount) === 1 ? '' : 's'}`;
}
