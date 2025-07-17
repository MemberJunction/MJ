# Testing the MJ MetadataSync IntelliSense Extension

## Quick Test Instructions

### 1. Open Extension in VSCode
```bash
cd /Users/amith/Dropbox/develop/Mac/MJ
code packages/VSCodeExtensions/MetadataSync
```

### 2. Launch Debug Instance
- Press **F5** or
- Go to Run > Start Debugging
- A new VSCode window will open with the extension loaded

### 3. Test in the New Window
Open the MJ Metadata folder:
```bash
code /Users/amith/Dropbox/develop/Mac/MJ/Metadata
```

### 4. Test Features

#### Test Field Autocomplete:
1. Open any `.json` file in the `/Metadata/actions` folder
2. Start typing a new field by typing `"`
3. You should see field suggestions based on the "Actions" entity

#### Test Hover Information:
1. Hover over any existing field name like "Name" or "Description"
2. You should see a tooltip with field type, description, and constraints

#### Test Value Autocomplete:
1. For boolean fields, type the value and see `true`/`false` suggestions
2. For fields with constraints, see the allowed values

#### Test Reference Autocomplete:
1. Type `"@` to see reference types (@lookup, @file, @template, etc.)
2. Select one to see the format snippet

### 5. Check Extension Output
- Go to View > Output
- Select "MemberJunction MetadataSync" from dropdown
- Check for connection messages or errors

### Troubleshooting

If the extension doesn't activate:
1. Ensure you have a `.env` file with database connection info in the workspace root
2. Check that the folder contains `.mj-sync.json` files
3. Look at the Developer Console (Help > Toggle Developer Tools) for errors

If IntelliSense doesn't work:
1. Check Output panel for connection errors
2. Verify database credentials in `.env`
3. Try the manual refresh command: Cmd+Shift+P > "MJ MetadataSync: Refresh Metadata Cache"