# Field Mapping & Transforms

How the integration engine maps fields from external records to MJ entity fields, including the transform pipeline system.

## Overview

Field mapping happens after fetching and before matching. The `FieldMappingEngine` processes each external record through configured field maps, optionally applying transform pipelines.

```
External Record                    MJ Record
┌─────────────────┐               ┌──────────────────┐
│ firstName: "John"│──→ direct ──→│ FirstName: "John" │
│ email: "j@x.com"│──→ direct ──→│ EmailAddress: ... │
│ fullName: "J D"  │──→ split ──→│ FirstName: "J"    │
│                  │      └──────→│ LastName: "D"     │
│ phone: "555-1234"│──→ regex ──→│ Phone: "5551234"  │
└─────────────────┘               └──────────────────┘
```

## Field Map Configuration

Each `CompanyIntegrationFieldMap` record defines one mapping:

| Field | Description |
|-------|-------------|
| `SourceFieldName` | Name of the field in the external record |
| `DestinationFieldName` | Name of the field in the MJ entity |
| `TransformPipeline` | JSON array of transform steps (optional) |

## Auto-Mapping

The mapping workspace UI provides automatic field mapping based on name matching:

1. Load source fields via `DiscoverFields()`
2. Load destination fields from the MJ entity metadata
3. Match by name (case-insensitive, ignoring underscores and spaces)
4. Present matches with confidence indicators

Examples of auto-matches:
- `firstName` → `FirstName`
- `email_address` → `EmailAddress`
- `last_name` → `LastName`

## Transform Pipeline

When a simple field-to-field mapping isn't sufficient, a transform pipeline can be configured. The pipeline is a JSON array of steps, executed in order:

```json
[
    { "type": "regex", "pattern": "[^0-9]", "replacement": "" },
    { "type": "substring", "start": 0, "length": 10 }
]
```

## Built-in Transform Types

### 1. `direct`

Passes the value through unchanged. This is the default when no pipeline is specified.

```json
{ "type": "direct" }
```

### 2. `regex`

Applies a regular expression find-and-replace.

```json
{ "type": "regex", "pattern": "[^A-Za-z0-9]", "replacement": "" }
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `pattern` | Yes | Regex pattern to match |
| `replacement` | Yes | Replacement string (supports `$1`, `$2` capture groups) |
| `flags` | No | Regex flags (default: `"g"`) |

### 3. `split`

Splits a value by delimiter and takes a specific part.

```json
{ "type": "split", "delimiter": " ", "index": 0 }
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `delimiter` | Yes | String to split on |
| `index` | Yes | 0-based index of the part to keep |

Use case: `"John Doe"` → split by `" "`, index 0 → `"John"`

### 4. `combine`

Combines multiple source fields into one value.

```json
{ "type": "combine", "fields": ["firstName", "lastName"], "separator": " " }
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `fields` | Yes | Array of source field names to combine |
| `separator` | No | String between values (default: `""`) |

Use case: `firstName="John"`, `lastName="Doe"` → `"John Doe"`

### 5. `lookup`

Maps a value through a lookup table.

```json
{
    "type": "lookup",
    "map": {
        "US": "United States",
        "CA": "Canada",
        "UK": "United Kingdom"
    },
    "default": "Unknown"
}
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `map` | Yes | Key-value object for lookups |
| `default` | No | Value if key not found (default: original value) |

### 6. `format`

Applies a format template with the current value.

```json
{ "type": "format", "template": "+1 ({0})" }
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `template` | Yes | Format string where `{0}` is replaced with the value |

Use case: `"5551234"` → `"+1 (5551234)"`

### 7. `coerce`

Converts a value to a specific data type.

```json
{ "type": "coerce", "targetType": "integer" }
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `targetType` | Yes | `"string"`, `"integer"`, `"float"`, `"boolean"`, `"date"` |

### 8. `substring`

Extracts a portion of the string value.

```json
{ "type": "substring", "start": 0, "length": 5 }
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `start` | Yes | 0-based start index |
| `length` | No | Number of characters (default: rest of string) |

### 9. `custom`

Executes a custom JavaScript expression. The current value is available as `value` and all source fields as `fields`.

```json
{ "type": "custom", "expression": "value.toUpperCase().trim()" }
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `expression` | Yes | JavaScript expression string |

**Security note**: Custom expressions run in a sandboxed context. Only simple expressions are supported — no function declarations, imports, or external access.

## Pipeline Chaining

Transforms chain left-to-right. The output of each step becomes the input to the next:

```json
[
    { "type": "split", "delimiter": ",", "index": 0 },
    { "type": "regex", "pattern": "\\s+", "replacement": "" },
    { "type": "coerce", "targetType": "integer" }
]
```

Input: `"42, 17, 99"` → split → `"42"` → regex → `"42"` → coerce → `42`

## Error Handling

- Each step's `OnError` decides what a failure does: `'Null'` (the default) sets the field to `null` and keeps going, so other fields continue mapping; `'Skip'` leaves the field out of the mapped record; `'Fail'` rethrows, which fails mapping for that entity map's batch (other entity maps continue).
- Errors are recorded in the run's `ErrorLog` (the first 100) on `MJ: Company Integration Runs`.
- A `null` or `undefined` input value runs through the pipeline like any other value, and each step decides the result: `direct` returns its `DefaultValue` (when set), `lookup` returns its `Default` (or `null`), and string steps such as `regex` and `split` treat it as an empty string.
- Steps are read as `{ "Type": ..., "Config": { ... } }` (PascalCase). The pipeline JSON is not validated, so a step written with other keys (for example lowercase `type`) fails as an unknown transform type, and under the default `OnError: 'Null'` the field silently maps to `null`.

## API

### FieldMappingEngine

```typescript
import { FieldMappingEngine } from '@memberjunction/integration-engine';

const engine = new FieldMappingEngine();
const mappedRecords = engine.Apply(externalRecords, fieldMaps, 'Contacts');
```

### MappedRecord Output

```typescript
interface MappedRecord {
    ExternalID: string;
    Fields: Record<string, unknown>;  // Mapped field values
    ChangeType?: 'Create' | 'Update' | 'Delete' | 'Skip';  // Set by MatchEngine
    Errors: string[];  // Any mapping errors
}
```
