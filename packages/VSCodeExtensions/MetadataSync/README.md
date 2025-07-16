# MemberJunction MetadataSync IntelliSense

VSCode extension that provides IntelliSense support for MemberJunction MetadataSync JSON files.

## Features

- **Field Name Autocomplete**: Suggests valid field names based on the entity being edited
- **Field Descriptions**: Shows field descriptions and metadata on hover
- **Value Autocomplete**: For constrained fields (enums), shows valid options
- **Reference Support**: IntelliSense for `@lookup:`, `@file:`, `@template:`, and other MJ reference types
- **Hierarchical Entity Support**: Handles related entities defined in `.mj-sync.json`

## Requirements

- A MemberJunction database with proper connection configuration
- `.env` file with database connection details
- Optional: `mj.config.cjs` for additional configuration

## Extension Settings

This extension contributes the following settings:

- `mjMetadataSync.enableIntelliSense`: Enable/disable IntelliSense for MJ metadata JSON files
- `mjMetadataSync.showFieldDescriptions`: Show field descriptions on hover
- `mjMetadataSync.cacheTimeout`: Metadata cache timeout in seconds (default: 300)

## How it Works

1. The extension activates when a workspace contains `.mj-sync.json` files
2. It connects to your MemberJunction database using the connection info from `.env`
3. Provides real-time IntelliSense based on your actual database schema

## Database Configuration

The extension reads database configuration from your workspace:

### `.env` file:
```env
DB_HOST=localhost
DB_DATABASE=MemberJunction
DB_USERNAME=myuser
DB_PASSWORD=mypassword
DB_PORT=1433
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
```

### `mj.config.cjs` (optional):
```javascript
module.exports = {
  databaseSettings: {
    connectionPool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  }
};
```

## Commands

- `MJ MetadataSync: Refresh Metadata Cache` - Manually refresh the metadata cache

## Known Issues

- Initial database connection may take a few seconds
- Large databases may experience slower IntelliSense response times

## Release Notes

### 0.1.0

Initial release with:
- Field name autocomplete
- Field hover information
- Value autocomplete for constrained fields
- Reference type support