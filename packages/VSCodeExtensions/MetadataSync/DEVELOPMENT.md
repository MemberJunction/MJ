# Development Guide

## Setup

1. Install dependencies:
   ```bash
   cd packages/VSCodeExtensions/MetadataSync
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

## Testing Locally

### Method 1: Debug in VSCode
1. Open this folder in VSCode
2. Press F5 to launch a new VSCode window with the extension loaded
3. Open a folder containing `.mj-sync.json` files
4. The extension will activate automatically

### Method 2: Install VSIX locally
1. Package the extension:
   ```bash
   npm run package
   ```
   This creates a `.vsix` file

2. Install in VSCode:
   - Open Command Palette (Cmd+Shift+P)
   - Run "Extensions: Install from VSIX..."
   - Select the generated `.vsix` file

## Publishing

1. Create a publisher account at https://marketplace.visualstudio.com/

2. Get a Personal Access Token from Azure DevOps

3. Login with vsce:
   ```bash
   vsce login <publisher-name>
   ```

4. Publish:
   ```bash
   npm run publish
   ```

## Debugging Tips

- Check the Output panel in VSCode (View > Output) and select "MemberJunction MetadataSync"
- Use Developer Tools (Help > Toggle Developer Tools) to see console logs
- The extension only activates in workspaces with `.mj-sync.json` files

## Architecture Notes

- The extension uses the MemberJunction SQLServerDataProvider to connect directly to the database
- Metadata is cached for performance (default 5 minutes)
- The extension respects the same `.env` and `mj.config.cjs` files as other MJ tools
- Entity context is determined by finding the nearest `.mj-sync.json` file