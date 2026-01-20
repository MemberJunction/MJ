# @memberjunction/ng-bootstrap

MemberJunction 3.0 Angular Bootstrap - Encapsulates all Angular authentication and initialization logic into a reusable module.

## Overview

In MemberJunction 3.0, Angular applications (MJExplorer) become **minimal configuration files** (~15-20 lines) that import all functionality from NPM packages. This package provides the `MJBootstrapModule` and `MJBootstrapComponent` that handle all authentication, GraphQL setup, and application initialization.

## Installation

```bash
npm install @memberjunction/ng-bootstrap
```

## Usage

### Basic Usage (Minimal MJExplorer 3.0)

Create your `packages/explorer/src/app/app.module.ts`:

```typescript
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { MJBootstrapModule, MJBootstrapComponent } from '@memberjunction/ng-bootstrap';
import { MJExplorerModule } from '@memberjunction/ng-explorer-core';
import { CoreGeneratedFormsModule } from '@memberjunction/ng-core-entity-forms';
import { GeneratedFormsModule } from '@mycompany/generated-forms';

import { environment } from '../environments/environment';

@NgModule({
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    MJBootstrapModule.forRoot(environment),
    MJExplorerModule,
    CoreGeneratedFormsModule,
    GeneratedFormsModule
  ],
  bootstrap: [MJBootstrapComponent]  // Use MJBootstrapComponent as the bootstrap component
})
export class AppModule {}
```

**That's it!** Your entire MJExplorer application module in ~15 lines.

### Environment Configuration

Create your `packages/explorer/src/environments/environment.ts`:

```typescript
import { MJEnvironmentConfig } from '@memberjunction/ng-bootstrap';

export const environment: MJEnvironmentConfig = {
  production: false,
  GRAPHQL_URI: 'http://localhost:4000/graphql',
  GRAPHQL_WS_URI: 'ws://localhost:4000/graphql',
  AUTH_TYPE: 'msal',
  MJ_CORE_SCHEMA_NAME: '__mj',

  // MSAL configuration
  CLIENT_ID: 'your-client-id',
  TENANT_ID: 'your-tenant-id'

  // OR Auth0 configuration
  // AUTH0_DOMAIN: 'yourapp.us.auth0.com',
  // AUTH0_CLIENTID: 'your-auth0-client-id'
};
```

## What It Does

The `MJBootstrapModule` and `MJBootstrapComponent` handle:

1. **Authentication Flow** - MSAL or Auth0 login/logout with proper token management
2. **GraphQL Client Setup** - Configures GraphQL client with WebSocket support
3. **Token Refresh** - Automatic token refresh before expiration
4. **Metadata Loading** - Loads MemberJunction metadata and entity definitions
5. **User Validation** - Checks user access and permissions
6. **Error Handling** - Displays appropriate error messages for auth failures
7. **Startup Validation** - Runs system validation checks on initialization
8. **Navigation** - Handles initial navigation after successful login

## Component Structure

The bootstrap component provides a clean template structure:

```html
<mj-bootstrap>
  <!-- Authenticated: Shows the main shell -->
  <mj-shell *ngIf="authenticated"></mj-shell>

  <!-- Not authenticated: Shows login screen -->
  <mj-login *ngIf="!authenticated"></mj-login>

  <!-- Error state: Shows error message -->
  <mj-error *ngIf="hasError"></mj-error>

  <!-- Validation issues: Shows validation banner -->
  <mj-validation-banner *ngIf="showValidation"></mj-validation-banner>
</mj-bootstrap>
```

## API Reference

### `MJBootstrapModule.forRoot(environment: MJEnvironmentConfig)`

Configures the bootstrap module with environment settings.

#### Parameters

- `environment` - MJEnvironmentConfig object with application settings

#### Returns

ModuleWithProviders with environment configuration injected

### `MJEnvironmentConfig` Interface

```typescript
interface MJEnvironmentConfig {
  production: boolean;
  GRAPHQL_URI: string;
  GRAPHQL_WS_URI: string;
  AUTH_TYPE: 'msal' | 'auth0';
  MJ_CORE_SCHEMA_NAME: string;

  // MSAL-specific (optional)
  CLIENT_ID?: string;
  TENANT_ID?: string;

  // Auth0-specific (optional)
  AUTH0_DOMAIN?: string;
  AUTH0_CLIENTID?: string;

  // Additional custom properties
  [key: string]: any;
}
```

## Migration from 2.x

In MemberJunction 2.x, your MJExplorer had:
- `app.component.ts` with ~245 lines of authentication logic
- `app.module.ts` with ~107 lines of module imports and configuration

**Before (2.x):**
```typescript
// app.component.ts - 245 lines of auth/initialization code
@Component({...})
export class AppComponent implements OnInit {
  // Complex authentication logic
  // GraphQL setup
  // Error handling
  // Navigation logic
  // ...
}

// app.module.ts - 107 lines of imports and configuration
@NgModule({
  declarations: [AppComponent, ...],
  imports: [BrowserModule, ...many modules...],
  providers: [...many providers...],
  bootstrap: [AppComponent]
})
export class AppModule {}
```

**After (3.0):**
```typescript
// app.module.ts - ~15 lines total
@NgModule({
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    MJBootstrapModule.forRoot(environment),
    MJExplorerModule,
    GeneratedFormsModule
  ],
  bootstrap: [MJBootstrapComponent]
})
export class AppModule {}
```

All the complexity is now encapsulated in this package and updated via NPM.

## Advanced Usage

### Custom Error Handling

You can extend the bootstrap component to add custom error handling:

```typescript
import { MJBootstrapComponent } from '@memberjunction/ng-bootstrap';

@Component({
  selector: 'app-custom-bootstrap',
  template: `
    <mj-bootstrap></mj-bootstrap>
    <app-custom-error *ngIf="hasCustomError"></app-custom-error>
  `
})
export class CustomBootstrapComponent extends MJBootstrapComponent {
  // Add custom logic
}
```

### Multiple Auth Providers

Configure your environment to support both MSAL and Auth0:

```typescript
export const environment: MJEnvironmentConfig = {
  production: false,
  AUTH_TYPE: 'msal', // Default

  // MSAL config
  CLIENT_ID: 'msal-client-id',
  TENANT_ID: 'tenant-id',

  // Auth0 config (fallback)
  AUTH0_DOMAIN: 'yourapp.us.auth0.com',
  AUTH0_CLIENTID: 'auth0-client-id'
};
```

## Benefits

- **Zero-copy updates** - `npm update` brings all improvements automatically
- **No stale code** - Authentication logic stays up-to-date with MJ releases
- **Minimal surface area** - Fewer lines of code means fewer places for bugs
- **Standard patterns** - Everyone uses the same authentication flow
- **Type safety** - Full TypeScript support with proper interfaces
- **Tested** - Core authentication logic is tested across all MJ applications

## License

MIT
