# MJ Explorer UX Prototype

This is a lightweight Angular prototype demonstrating the new MJ Explorer UX concepts:

## Key Features

### 1. Smart Header Navigation
- **App-Aware**: Header adapts based on active app
- **Two Navigation Styles**:
  - **List Mode**: Conversations app shows horizontal nav items (Chat | Collections | Tasks)
  - **Breadcrumb Mode**: Settings app shows hierarchical breadcrumb (Settings › Profile)

### 2. Shell/Plugin Architecture
- Apps are first-class citizens that extend the chrome
- Each app defines its own navigation style
- Apps can request new tabs through the shell service

### 3. Tab Management
- Default: Single tab view for clean interface
- Apps can open new tabs via `RequestNewTab()`
- Tab bar appears when multiple tabs are open
- Persistent across sessions (localStorage)

### 4. Mock ORM Service
- Simple CRUD operations using localStorage
- Simulates real entity/data layer
- Will be replaced with actual MJ entities

## Architecture

```
src/app/
├── core/
│   ├── models/
│   │   └── app.interface.ts          # IApp interface definition
│   └── services/
│       ├── shell.service.ts          # Tab & app coordination
│       └── storage.service.ts        # Mock ORM layer
├── shell/
│   ├── header/                       # Smart header component
│   └── tab-container/                # Tab management component
└── apps/
    ├── conversations/                # List navigation example
    │   ├── conversations.app.ts      # App implementation
    │   ├── chat/
    │   ├── collections/
    │   └── tasks/
    └── settings/                     # Breadcrumb navigation example
        ├── settings.app.ts           # App implementation
        ├── profile/
        ├── notifications/
        └── appearance/
```

## Running the Prototype

```bash
cd explorer-prototype
npm install
npm start
```

Navigate to [http://localhost:4200](http://localhost:4200)

## Key Concepts Demonstrated

### Apps Implement IApp Interface
```typescript
interface IApp {
  Id: string;
  Name: string;
  Icon: string;
  Route: string;

  GetNavigationType(): 'list' | 'breadcrumb';
  GetNavItems(): NavItem[];           // For list mode
  GetBreadcrumbs(): Breadcrumb[];     // For breadcrumb mode

  CanHandleSearch(): boolean;
  OnSearchRequested(query: string): void;

  RequestNewTab(title, route, data?): void;
  HandleRoute(segments: string[]): void;
}
```

### Shell Service Coordinates Everything
- Registers apps
- Manages tab state
- Handles cross-app navigation
- Persists workspace to localStorage

### Header Adapts to Active App
- Shows app name and icon
- Renders either nav items OR breadcrumb
- Right side actions (search, notifications, user menu)

## Try It Out

1. **Conversations App (List Mode)**:
   - Click "Chat", "Collections", or "Tasks" in header
   - Click "Open Thread in New Tab" button in Chat
   - See second tab appear in tab bar

2. **Settings App (Breadcrumb Mode)**:
   - Click user avatar → Settings
   - Navigate through Profile, Notifications, Appearance
   - Watch breadcrumb update in header

3. **Tab Management**:
   - Open multiple tabs
   - Click between tabs
   - Close tabs with X button
   - Refresh page - tabs persist!

## Next Steps

When integrating into real MJ:
- Replace `StorageService` with actual MJ entity system
- Integrate Golden Layout for advanced tab features (split, drag-drop)
- Add more apps (Data Browser, Reports, etc.)
- Implement app-specific search handlers
- Add app-to-app resource requests (e.g., open entity record)

## Notes

- Uses standalone Angular components (no NgModules)
- PascalCase for public methods/properties (per MJ convention)
- camelCase for private/protected
- Font Awesome icons throughout
- Minimal dependencies - just Angular + Font Awesome
