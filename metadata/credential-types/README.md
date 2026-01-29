# Credential Types Metadata

This directory contains credential type definitions for MemberJunction's credential management system. Each credential type specifies the structure and validation rules for credential values using JSON Schema.

## Directory Structure

```
credential-types/
├── .credential-types.json    # Credential type metadata
├── .mj-sync.json             # mj-sync configuration
├── schemas/                   # JSON Schema files for validation
│   ├── api-key.schema.json
│   ├── api-key-with-endpoint.schema.json
│   ├── basic-auth.schema.json
│   ├── box-oauth.schema.json
│   └── ...
└── README.md                  # This file
```

## JSON Schema Validation

All credential types use [JSON Schema Draft 7](https://json-schema.org/draft-07/json-schema-release-notes.html) to define the structure and constraints of credential values. The `FieldSchema` property in each credential type references a schema file in the `schemas/` directory.

### Supported Constraints

The credential system supports all JSON Schema Draft 7 validation keywords:

#### Core Constraints

| Constraint | Purpose | Example |
|-----------|---------|---------|
| `type` | Data type | `"type": "string"`, `"type": "number"` |
| `required` | Mandatory fields | `"required": ["apiKey", "endpoint"]` |
| `properties` | Field definitions | `"properties": { "apiKey": {...} }` |

#### Value Constraints

| Constraint | Purpose | Example |
|-----------|---------|---------|
| `const` | Fixed immutable value | `"const": "https://api.box.com/oauth2/token"` |
| `enum` | Limited set of values | `"enum": ["enterprise", "user"]` |
| `default` | Auto-populated value | `"default": "us-central1"` |

#### String Constraints

| Constraint | Purpose | Example |
|-----------|---------|---------|
| `format` | Format validation | `"format": "uri"`, `"format": "email"` |
| `pattern` | Regex pattern | `"pattern": "^sk-[a-zA-Z0-9]{32}$"` |
| `minLength` | Minimum length | `"minLength": 8` |
| `maxLength` | Maximum length | `"maxLength": 256` |

#### Numeric Constraints

| Constraint | Purpose | Example |
|-----------|---------|---------|
| `minimum` | Minimum value | `"minimum": 1024` |
| `maximum` | Maximum value | `"maximum": 65535` |

### Format Types

The `format` keyword supports these built-in validators (via [ajv-formats](https://ajv.js.org/packages/ajv-formats.html)):

- **uri** / **url** - Valid HTTP/HTTPS URLs
- **email** - Valid email addresses (RFC 5321)
- **date** - ISO 8601 date (YYYY-MM-DD)
- **date-time** - ISO 8601 timestamp with timezone
- **uuid** - RFC 4122 UUID (8-4-4-4-12 format)
- **ipv4** / **ipv6** - IP addresses
- **hostname** - Valid DNS hostname (RFC 1123)

## Schema Best Practices

### 1. Use `const` for Fixed Values

For values that must never change (like OAuth endpoints), use `const`:

```json
{
  "tokenUrl": {
    "type": "string",
    "const": "https://api.box.com/oauth2/token",
    "title": "Token URL",
    "description": "Box.com OAuth2 token endpoint",
    "isSecret": false,
    "order": 2
  }
}
```

**Benefits:**
- Prevents user error or malicious changes
- Auto-populated in UI (users don't need to enter it)
- Displayed as read-only in credential forms
- Validation rejects any attempt to modify

### 2. Use `enum` for Limited Choices

For fields with a fixed set of options, use `enum`:

```json
{
  "region": {
    "type": "string",
    "title": "AWS Region",
    "enum": ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"],
    "description": "AWS region for this credential",
    "isSecret": false,
    "order": 3
  }
}
```

**Benefits:**
- Renders as dropdown in UI
- Prevents invalid values
- Clear documentation of allowed options
- Type-safe in code

### 3. Use `default` for Common Values

Pre-fill fields with sensible defaults:

```json
{
  "location": {
    "type": "string",
    "title": "Location",
    "default": "us-central1",
    "description": "GCP location for resources",
    "isSecret": false,
    "order": 1
  }
}
```

**Benefits:**
- Reduces configuration errors
- Speeds up credential creation
- Users can still override if needed
- Documents recommended values

### 4. Use `format` for Structured Data

Validate URLs, emails, and other formatted values:

```json
{
  "endpoint": {
    "type": "string",
    "title": "API Endpoint",
    "format": "uri",
    "description": "Base URL for API requests",
    "isSecret": false,
    "order": 2
  }
}
```

**Benefits:**
- Prevents malformed values
- Clear error messages
- Catches typos during creation
- Enforces data quality

### 5. Use `pattern` for API Keys

Validate specific formats with regex:

```json
{
  "apiKey": {
    "type": "string",
    "title": "API Key",
    "pattern": "^sk-[a-zA-Z0-9]{48}$",
    "description": "OpenAI API key (starts with sk-)",
    "isSecret": true,
    "order": 1
  }
}
```

**Benefits:**
- Catches invalid keys immediately
- Documents key format requirements
- Prevents accidental use of wrong credential type
- Improves security

### 6. Use Length Constraints for Security

Enforce password/secret strength:

```json
{
  "password": {
    "type": "string",
    "title": "Password",
    "minLength": 12,
    "maxLength": 128,
    "description": "Strong password (12+ characters)",
    "isSecret": true,
    "order": 2
  }
}
```

**Benefits:**
- Enforces security policies
- Prevents weak credentials
- Documents requirements clearly
- Consistent validation

## Custom Properties

In addition to standard JSON Schema properties, MemberJunction supports these custom properties:

### `isSecret`

Marks a field as sensitive (will be masked in UI):

```json
{
  "apiKey": {
    "type": "string",
    "isSecret": true,  // ⭐ Custom property
    "title": "API Key"
  }
}
```

When `isSecret: true`:
- Field renders as password input (masked)
- Show/hide toggle button appears
- Not included in logs or error messages

### `order`

Controls field display order in UI:

```json
{
  "clientId": {
    "type": "string",
    "order": 1  // ⭐ Custom property
  },
  "clientSecret": {
    "type": "string",
    "order": 2
  }
}
```

Fields are sorted by `order` value (lower first). Default is 999.

### `title` and `description`

User-friendly labels and help text:

```json
{
  "apiKey": {
    "type": "string",
    "title": "API Key",           // ⭐ Label shown in UI
    "description": "Your OpenAI API key from platform.openai.com"  // ⭐ Help text
  }
}
```

## Example: Complete Credential Type Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "OpenAI API Key",
  "description": "Credentials for OpenAI API access",
  "properties": {
    "apiKey": {
      "type": "string",
      "title": "API Key",
      "description": "Your OpenAI API key (starts with sk-)",
      "pattern": "^sk-[a-zA-Z0-9]{48}$",
      "isSecret": true,
      "order": 1
    },
    "organization": {
      "type": "string",
      "title": "Organization ID",
      "description": "Optional organization ID",
      "pattern": "^org-[a-zA-Z0-9]+$",
      "isSecret": false,
      "order": 2
    },
    "endpoint": {
      "type": "string",
      "title": "API Endpoint",
      "description": "API base URL",
      "format": "uri",
      "default": "https://api.openai.com/v1",
      "isSecret": false,
      "order": 3
    },
    "model": {
      "type": "string",
      "title": "Default Model",
      "enum": ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
      "default": "gpt-4-turbo",
      "isSecret": false,
      "order": 4
    }
  },
  "required": ["apiKey"]
}
```

This schema enforces:
- ✅ API key is required and matches OpenAI format
- ✅ Organization ID (if provided) matches expected format
- ✅ Endpoint must be valid URI, defaults to OpenAI
- ✅ Model must be one of allowed values, defaults to gpt-4-turbo
- ✅ API key is marked as secret (masked in UI)
- ✅ Fields displayed in specified order

## Validation Error Messages

When validation fails, clear error messages are returned:

| Error Type | Example Message |
|-----------|------------------|
| Required | `Missing required field: apiKey` |
| Const | `Field "tokenUrl" must be "https://api.box.com/oauth2/token"` |
| Enum | `Field "region" must be one of: us-east-1, us-west-2, eu-west-1` |
| Format | `Field "endpoint" must be a valid uri` |
| Pattern | `Field "apiKey" does not match required pattern` |
| Length | `Field "password" must be at least 12 characters` |
| Range | `Field "port" must be at least 1024` |

## Testing Schemas

When creating new credential types, test the schema validation:

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import schema from './schemas/my-new-type.schema.json';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validator = ajv.compile(schema);

// Test valid data
const validData = { apiKey: 'sk-...' };
console.log('Valid:', validator(validData));

// Test invalid data
const invalidData = { apiKey: 'wrong-format' };
console.log('Valid:', validator(invalidData));
console.log('Errors:', validator.errors);
```

## Adding New Credential Types

1. **Create schema file** in `schemas/` directory
2. **Test schema** with sample data
3. **Update `.credential-types.json`** with new type definition
4. **Reference schema** using `@file:schemas/your-schema.schema.json`
5. **Run mj-sync** to push to database:
   ```bash
   npx mj-sync push --dir=./metadata/credential-types
   ```

## UI Rendering

The credential edit panel automatically renders fields based on schema constraints:

| Schema Property | UI Rendering |
|----------------|--------------|
| `const` | Read-only display with lock icon |
| `enum` | Dropdown/select with options |
| `isSecret: true` | Password input with show/hide toggle |
| `format: "uri"` | Text input with URL validation |
| `format: "email"` | Text input with email validation |
| `default` | Pre-filled value in new credentials |
| Regular field | Text or number input |

## Resources

- [JSON Schema Documentation](https://json-schema.org/)
- [Ajv JSON Schema Validator](https://ajv.js.org/)
- [Ajv Formats Package](https://ajv.js.org/packages/ajv-formats.html)
- [JSON Schema Validation Specification](https://json-schema.org/draft/2020-12/json-schema-validation.html)

## Support

For questions or issues with credential type schemas, see the Credentials Engine documentation in `/packages/Credentials/Engine/README.md`.
