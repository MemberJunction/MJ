# React Debug Configuration

## Overview
The React Debug Configuration controls whether React development or production builds are loaded in your Angular application. This affects the quality of error messages you receive.

- **Development builds**: Detailed error messages with component stack traces
- **Production builds**: Minified error codes (like Error #130)

## Setting Debug Mode

You have several options for configuring debug mode:

### Option 1: In your main.ts (Recommended)
```typescript
// main.ts
import { ReactDebugConfig } from '@memberjunction/ng-react';
import { environment } from './environments/environment';

// Set based on Angular environment
ReactDebugConfig.setDebugMode(!environment.production);

// Then bootstrap your Angular app
platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));
```

### Option 2: Using Window Global
```typescript
// In your index.html or early in app initialization
(window as any).__MJ_REACT_DEBUG_MODE__ = true; // for development
```

### Option 3: In AppModule
```typescript
// app.module.ts
import { ReactDebugConfig } from '@memberjunction/ng-react';

// Set it before any components load
ReactDebugConfig.setDebugMode(true);

@NgModule({
  // ... your module configuration
})
export class AppModule { }
```

## Important Notes

1. **Must be set before React loads**: The debug mode must be configured before any React components are initialized. Setting it after React loads will have no effect.

2. **Automatic Angular DevMode detection**: If you don't explicitly set debug mode, the system will automatically use development builds when Angular is in development mode.

3. **Performance considerations**: Development builds are larger and slower than production builds. Always use production builds (`debug: false`) in production environments.

## Verification

You can verify which mode is active by checking the browser console. You should see one of these messages:
- `React ecosystem pre-loaded successfully with DEVELOPMENT builds (detailed error messages)`
- `React ecosystem pre-loaded successfully with PRODUCTION builds (minified)`