# @memberjunction/ng-auth-services

The `@memberjunction/ng-auth-services` package provides authentication services for MemberJunction Explorer applications. It offers an abstraction layer that supports multiple authentication providers like Auth0 and Microsoft Authentication Library (MSAL).

## Features

- Unified authentication service interface through an abstract base class
- Support for Auth0 authentication provider
- Support for Microsoft Authentication Library (MSAL) authentication provider
- Easy switching between providers via configuration
- Standardized methods for authentication operations (login, logout, token refresh)
- Reactive user and authentication state management

## Installation

```bash
npm install @memberjunction/ng-auth-services
```

## Requirements

- Angular 18+
- @memberjunction/core
- @auth0/auth0-angular (when using Auth0)
- @azure/msal-angular (when using MSAL)

## Usage

### Setup and Configuration

First, set up your authentication environment configuration:

```typescript
// environment.ts
export const environment = {
  // For Auth0
  AUTH_TYPE: 'auth0',
  AUTH0_DOMAIN: 'your-auth0-domain.auth0.com',
  AUTH0_CLIENTID: 'your-auth0-client-id',
  
  // For MSAL (Azure AD)
  // AUTH_TYPE: 'msal',
  // CLIENT_ID: 'your-azure-client-id',
  // CLIENT_AUTHORITY: 'https://login.microsoftonline.com/your-tenant-id',
};
```

Import and configure the AuthServicesModule in your app module:

```typescript
import { AuthServicesModule, RedirectComponent } from '@memberjunction/ng-auth-services';
import { environment } from '../environments/environment';

@NgModule({
  declarations: [
    AppComponent,
    // other components
  ],
  imports: [
    BrowserModule,
    // other imports
    AuthServicesModule.forRoot(environment),
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
```

If using MSAL, add the MsalRedirectComponent to your routes:

```typescript
import { RedirectComponent } from '@memberjunction/ng-auth-services';

const routes: Routes = [
  // Your app routes
  { path: 'auth', component: RedirectComponent }
];
```

### Basic Usage

Inject the `MJAuthBase` service in your components:

```typescript
import { Component, OnInit } from '@angular/core';
import { MJAuthBase } from '@memberjunction/ng-auth-services';

@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
})
export class UserProfileComponent implements OnInit {
  user: any;
  
  constructor(private authService: MJAuthBase) {}
  
  async ngOnInit() {
    // Check if the user is authenticated
    const isAuthenticated = await this.authService.isAuthenticated();
    isAuthenticated.subscribe(authenticated => {
      if (authenticated) {
        this.loadUserProfile();
      }
    });
  }
  
  async loadUserProfile() {
    const userObs = await this.authService.getUser();
    userObs.subscribe(user => {
      this.user = user;
    });
  }
  
  login() {
    this.authService.login();
  }
  
  logout() {
    this.authService.logout();
  }
}
```

### Advanced Usage

#### Token Refresh and Expired Token Handling

```typescript
import { HttpErrorResponse } from '@angular/common/http';
import { MJAuthBase } from '@memberjunction/ng-auth-services';

export class ApiService {
  constructor(private authService: MJAuthBase) {}
  
  handleApiError(error: HttpErrorResponse) {
    // Check if token is expired
    if (error.status === 401 && this.authService.checkExpiredTokenError(error.error)) {
      // Refresh the token
      this.authService.refresh().then(tokenObs => {
        tokenObs.subscribe(() => {
          // Retry the API call
          // ...
        });
      });
    }
  }
}
```

#### Getting User Claims

```typescript
import { MJAuthBase } from '@memberjunction/ng-auth-services';

export class UserService {
  constructor(private authService: MJAuthBase) {}
  
  async getUserEmail() {
    const claimsObs = await this.authService.getUserClaims();
    return claimsObs.pipe(
      map(claims => claims?.email || '')
    );
  }
}
```

## API Reference

### MJAuthBase (Abstract Class)

#### Properties

| Name | Type | Description |
|------|------|-------------|
| `authenticated` | `boolean` | Current authentication state |

#### Methods

| Name | Parameters | Return Type | Description |
|------|------------|-------------|-------------|
| `login` | `options?: any` | `Promise<any>` | Initiates the login process |
| `logout` | None | `Promise<any>` | Logs the user out |
| `refresh` | None | `Promise<Observable<any>>` | Refreshes the authentication token |
| `isAuthenticated` | None | `Promise<any>` | Checks if the user is authenticated |
| `getUser` | None | `Promise<any>` | Gets the current user information |
| `getUserClaims` | None | `Promise<Observable<any>>` | Gets the user claims from the token |
| `checkExpiredTokenError` | `error: string` | `boolean` | Checks if an error is due to an expired token |

### MJAuth0Provider

Auth0-specific implementation of MJAuthBase.

### MJMSALProvider

MSAL-specific implementation of MJAuthBase.

### AuthServicesModule

#### Static Methods

| Name | Parameters | Return Type | Description |
|------|------------|-------------|-------------|
| `forRoot` | `environment: AuthEnvironment` | `ModuleWithProviders<AuthServicesModule>` | Configures the auth services module |

#### AuthEnvironment Type

```typescript
type AuthEnvironment = {
  AUTH_TYPE: string;       // 'auth0' or 'msal'
  CLIENT_ID: string;       // For MSAL
  CLIENT_AUTHORITY: string; // For MSAL
  AUTH0_CLIENTID: string;  // For Auth0
  AUTH0_DOMAIN: string;    // For Auth0
};
```

## Dependencies

- @angular/common
- @angular/core
- @memberjunction/core
- @auth0/auth0-angular (when using Auth0)
- @azure/msal-angular (when using MSAL)