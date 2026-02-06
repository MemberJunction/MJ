# @memberjunction/ng-auth-services

The `@memberjunction/ng-auth-services` package provides authentication services for MemberJunction Explorer Angular applications. It offers a unified abstraction layer that supports multiple authentication providers including Auth0 and Microsoft Authentication Library (MSAL) for Azure Active Directory.

## Overview

This package implements a provider pattern that allows seamless switching between different authentication services through configuration. It provides a consistent API regardless of which authentication provider is being used, making it easy to change authentication strategies without modifying application code.

## Features

- **Unified Authentication Interface**: Abstract base class (`MJAuthBase`) provides consistent API across providers
- **Multiple Provider Support**: 
  - Auth0 authentication provider
  - Microsoft Authentication Library (MSAL) for Azure AD
- **Easy Provider Switching**: Change providers via configuration without code changes
- **Reactive State Management**: Observable-based authentication state and user information
- **Token Management**: Built-in token refresh and expiration handling
- **TypeScript Support**: Full TypeScript definitions for type safety
- **Angular 21+ Compatible**: Built for modern Angular applications

## Installation

```bash
npm install @memberjunction/ng-auth-services
```

## Requirements

### Peer Dependencies
- `@angular/common`: ^18.0.2
- `@angular/core`: ^18.0.2
- `@angular/forms`: ^18.0.2
- `@angular/router`: ^18.0.2
- `@auth0/auth0-angular`: ^2.2.1 (required when using Auth0)
- `@azure/msal-angular`: ^3.0.11 (required when using MSAL)

### Dependencies
- `@memberjunction/core`: ^2.43.0
- `tslib`: ^2.3.0

## Configuration

### Environment Setup

Configure your authentication provider in your environment files:

#### Auth0 Configuration
```typescript
// environment.ts
export const environment = {
  AUTH_TYPE: 'auth0',
  AUTH0_DOMAIN: 'your-domain.auth0.com',
  AUTH0_CLIENTID: 'your-auth0-client-id',
  // Other environment variables...
};
```

#### MSAL (Azure AD) Configuration
```typescript
// environment.ts
export const environment = {
  AUTH_TYPE: 'msal',
  CLIENT_ID: 'your-azure-ad-client-id',
  CLIENT_AUTHORITY: 'https://login.microsoftonline.com/your-tenant-id',
  // Other environment variables...
};
```

### Module Setup

Import and configure the `AuthServicesModule` in your app module:

```typescript
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AuthServicesModule } from '@memberjunction/ng-auth-services';
import { environment } from '../environments/environment';
import { AppComponent } from './app.component';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    AuthServicesModule.forRoot(environment), // Configure auth module
    // Other imports...
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
```

### Routing Configuration (MSAL only)

When using MSAL, add the redirect component to your routes:

```typescript
import { Routes } from '@angular/router';
import { RedirectComponent } from '@memberjunction/ng-auth-services';

const routes: Routes = [
  // Your application routes...
  { path: 'auth', component: RedirectComponent } // Required for MSAL
];
```

## Usage Examples

### Basic Authentication Operations

```typescript
import { Component, OnInit } from '@angular/core';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-header',
  template: `
    <div class="header">
      <button *ngIf="!(isAuthenticated$ | async)" (click)="login()">Login</button>
      <button *ngIf="isAuthenticated$ | async" (click)="logout()">Logout</button>
      <span *ngIf="user$ | async as user">Welcome, {{ user.name }}!</span>
    </div>
  `
})
export class HeaderComponent implements OnInit {
  isAuthenticated$!: Observable<boolean>;
  user$!: Observable<any>;

  constructor(private authService: MJAuthBase) {}

  async ngOnInit() {
    this.isAuthenticated$ = await this.authService.isAuthenticated();
    this.user$ = await this.authService.getUser();
  }

  login() {
    this.authService.login();
  }

  logout() {
    this.authService.logout();
  }
}
```

### Getting User Claims

```typescript
import { Component, OnInit } from '@angular/core';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-user-profile',
  template: `
    <div *ngIf="userClaims$ | async as claims">
      <h3>User Profile</h3>
      <p>Email: {{ claims.email }}</p>
      <p>Name: {{ claims.name }}</p>
      <p>Roles: {{ claims.roles?.join(', ') }}</p>
    </div>
  `
})
export class UserProfileComponent implements OnInit {
  userClaims$!: Observable<any>;

  constructor(private authService: MJAuthBase) {}

  async ngOnInit() {
    this.userClaims$ = await this.authService.getUserClaims();
  }
}
```

### Token Refresh and Error Handling

```typescript
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { catchError, switchMap } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  constructor(
    private http: HttpClient,
    private authService: MJAuthBase
  ) {}

  getData() {
    return this.http.get('/api/data').pipe(
      catchError((error: HttpErrorResponse) => this.handleError(error))
    );
  }

  private async handleError(error: HttpErrorResponse) {
    if (error.status === 401 && this.authService.checkExpiredTokenError(error.message)) {
      // Token expired, try to refresh
      const tokenObs = await this.authService.refresh();
      return tokenObs.pipe(
        switchMap(() => this.http.get('/api/data')) // Retry the request
      );
    }
    return throwError(() => error);
  }
}
```

### Protected Routes with Guards

```typescript
import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { map, tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: MJAuthBase,
    private router: Router
  ) {}

  async canActivate() {
    const isAuthenticated$ = await this.authService.isAuthenticated();
    return isAuthenticated$.pipe(
      tap(authenticated => {
        if (!authenticated) {
          this.authService.login();
        }
      })
    );
  }
}
```

## API Reference

### MJAuthBase (Abstract Class)

The base authentication service that all providers implement.

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `authenticated` | `boolean` | Current authentication state |

#### Methods

| Method | Parameters | Return Type | Description |
|--------|------------|-------------|-------------|
| `login` | `options?: any` | `Promise<any>` | Initiates the login flow. Options vary by provider. |
| `logout` | None | `Promise<any>` | Logs the user out and clears authentication state |
| `refresh` | None | `Promise<Observable<any>>` | Refreshes the authentication token |
| `isAuthenticated` | None | `Promise<any>` | Returns an Observable of the authentication state |
| `getUser` | None | `Promise<any>` | Returns user information (format varies by provider) |
| `getUserClaims` | None | `Promise<Observable<any>>` | Returns the user's token claims |
| `checkExpiredTokenError` | `error: string` | `boolean` | Checks if an error indicates an expired token |

### MJAuth0Provider

Auth0-specific implementation of `MJAuthBase`. Internally uses `@auth0/auth0-angular`.

#### Provider-Specific Behavior
- Uses Auth0's redirect flow for authentication
- Returns Auth0 `User` object from `getUser()`
- Token expiration check looks for "jwt expired" in error messages

### MJMSALProvider

MSAL-specific implementation of `MJAuthBase`. Internally uses `@azure/msal-angular`.

#### Provider-Specific Behavior
- Implements initialization handling to ensure MSAL is ready
- Uses redirect flow with automatic account selection
- Returns MSAL `AccountInfo` from `getUser()`
- Includes refresh token policy in token operations
- Token expiration check looks for authorization errors

### AuthServicesModule

The main module for configuring authentication services.

#### Static Methods

| Method | Parameters | Return Type | Description |
|--------|------------|-------------|-------------|
| `forRoot` | `environment: AuthEnvironment` | `ModuleWithProviders<AuthServicesModule>` | Configures the authentication module with environment settings |

#### AuthEnvironment Type

```typescript
type AuthEnvironment = {
  AUTH_TYPE: string;           // 'auth0' or 'msal'
  CLIENT_ID: string;           // MSAL client ID
  CLIENT_AUTHORITY: string;    // MSAL authority URL
  AUTH0_CLIENTID: string;      // Auth0 client ID
  AUTH0_DOMAIN: string;        // Auth0 domain
};
```

### RedirectComponent

Re-exported from `@azure/msal-angular`. Required for MSAL redirect flow handling.

## Integration with Other MemberJunction Packages

This package integrates with:
- **@memberjunction/core**: Uses core logging utilities (`LogError`)
- **MemberJunction Explorer**: Provides authentication for all Explorer UI components
- **MemberJunction API**: Token management for API authentication

## Build and Development

### Building the Package
```bash
# From the package directory
npm run build

# From the repository root
npm run build -- --filter="@memberjunction/ng-auth-services"
```

### Development Notes
- The package uses Angular Package Format (APF)
- Compiled with Angular Compiler (`ngc`)
- No side effects - tree-shakeable
- Distributed files are in the `/dist` directory

## Migration Guide

### Switching Between Providers

To switch authentication providers:

1. Update your environment configuration:
   ```typescript
   // From Auth0 to MSAL
   AUTH_TYPE: 'msal', // was 'auth0'
   CLIENT_ID: 'your-azure-client-id',
   CLIENT_AUTHORITY: 'https://login.microsoftonline.com/your-tenant',
   ```

2. Add redirect route (if switching to MSAL):
   ```typescript
   { path: 'auth', component: RedirectComponent }
   ```

3. No other code changes required - the `MJAuthBase` interface remains the same

## Troubleshooting

### Common Issues

1. **MSAL Initialization Errors**: Ensure the MSAL redirect component is properly configured in routes
2. **Token Refresh Failures**: Check that refresh token is enabled in your auth provider configuration
3. **CORS Issues**: Verify redirect URIs are properly configured in your auth provider dashboard

### Debug Tips

- Check browser console for authentication errors
- Verify localStorage contains auth tokens
- Use browser dev tools to inspect network requests for auth headers
- Enable verbose logging in your auth provider configuration

## License

ISC