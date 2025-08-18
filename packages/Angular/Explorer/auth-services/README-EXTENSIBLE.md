# Extensible Authentication Architecture for Angular

## Overview

The MemberJunction Angular authentication system now supports extensible N-provider authentication, mirroring the backend architecture. This allows developers to easily add new authentication providers without modifying the core auth services module.

## Architecture

The system uses the MJGlobal ClassFactory pattern to dynamically create and manage authentication providers:

1. **MJAuthBase** - Base class providing common authentication functionality
2. **AngularAuthProviderFactory** - Factory for creating providers dynamically using ClassFactory
3. **Provider Implementations** - Concrete classes registered with @RegisterClass decorator
4. **Static Dependency Declaration** - Each provider declares its Angular service dependencies via a static method

## Adding a New Authentication Provider

### Step 1: Create Your Provider Class

```typescript
import { Injectable } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { Observable, of } from 'rxjs';

// Prevent tree-shaking
export function LoadCustomProvider() {
  return CustomAuthProvider;
}

@Injectable({
  providedIn: 'root'
})
@RegisterClass(MJAuthBase, 'custom') // Register with unique type identifier
export class CustomAuthProvider extends MJAuthBase {
  type = 'custom';
  
  /**
   * Static method to declare Angular service dependencies
   * This is called by the factory without instantiating the class
   */
  static getRequiredAngularProviders(environment: any): any[] {
    return [
      // Add any Angular providers your auth needs
      {
        provide: 'customConfig',
        useValue: {
          apiUrl: environment.CUSTOM_API_URL,
          clientId: environment.CUSTOM_CLIENT_ID,
          // ... other config
        }
      },
      // Add any services your provider depends on
      // CustomAuthService,
      // CustomGuard,
    ];
  }
  
  constructor(/* inject your services here */) {
    const config = { type: 'custom' };
    super(config);
    // Initialize your auth client here
  }

  override login(options?: any): Observable<void> {
    // Implement login flow
    return of(void 0);
  }

  async logout(): Promise<void> {
    // Implement logout flow
  }

  async getToken(): Promise<string | null> {
    // Return current access token
    return null;
  }

  async handleCallback(): Promise<void> {
    // Handle OAuth callback after redirect
  }

  validateConfig(config: any): boolean {
    // Validate your configuration
    return true;
  }
}
```

### Step 2: Import Your Provider

Ensure your provider is imported and call the load function to prevent tree-shaking:

```typescript
// In your app module or wherever you configure auth
import { LoadCustomProvider } from './providers/CustomAuthProvider';

// Call the load function to prevent tree-shaking
LoadCustomProvider();
```

### Step 3: Configure Your Environment

Add your provider configuration to the environment file:

```typescript
export const environment = {
  authProvider: {
    type: 'custom',
    clientId: 'your-client-id',
    customField: 'your-custom-value',
    // ... other config fields
  }
};
```

Or use the legacy format:

```typescript
export const environment = {
  AUTH_TYPE: 'custom',
  CUSTOM_CLIENT_ID: 'your-client-id',
  // ... other fields
};
```

### Step 4: Use the Auth Services Module

```typescript
import { AuthServicesModule } from '@memberjunction/ng-auth-services';

@NgModule({
  imports: [
    AuthServicesModule.forRoot(environment)
  ]
})
export class AppModule { }
```

## Configuration Options

### Provider Configuration Structure

```typescript
interface AngularAuthProviderConfig {
  type: string;           // Provider type identifier
  clientId?: string;      // OAuth client ID
  domain?: string;        // Provider domain
  tenantId?: string;      // Tenant ID (for multi-tenant providers)
  authority?: string;     // Authority URL
  redirectUri?: string;   // OAuth redirect URI
  scopes?: string[];      // OAuth scopes
  audience?: string;      // API audience
  [key: string]: any;     // Allow provider-specific config
}
```

### Environment Configuration Examples

#### Auth0
```typescript
authProvider: {
  type: 'auth0',
  domain: 'your-domain.auth0.com',
  clientId: 'your-client-id',
  audience: 'your-api-audience',
  scopes: ['openid', 'profile', 'email']
}
```

#### MSAL (Microsoft)
```typescript
authProvider: {
  type: 'msal',
  clientId: 'your-client-id',
  tenantId: 'your-tenant-id',
  scopes: ['User.Read', 'email', 'profile']
}
```

#### Okta
```typescript
authProvider: {
  type: 'okta',
  domain: 'your-domain.okta.com',
  clientId: 'your-client-id',
  scopes: ['openid', 'profile', 'email']
}
```

## Provider Lifecycle

1. **Registration** - Provider class registers itself via @RegisterClass decorator
2. **Creation** - Factory creates provider instance when module initializes
3. **Configuration** - Provider validates its configuration
4. **Initialization** - Provider sets up auth client and checks existing sessions
5. **Runtime** - Provider handles login/logout/token operations
6. **Cleanup** - Provider cleans up resources on logout

## Best Practices

1. **Validate Configuration** - Always validate required config in your provider
2. **Handle Errors Gracefully** - Provide meaningful error messages
3. **Update Auth State** - Use `updateAuthState()` and `updateUserProfile()` helpers
4. **Clean URLs** - Remove OAuth params from URL after callback
5. **Token Management** - Implement silent token refresh when possible
6. **Storage** - Use localStorage or sessionStorage consistently

## Migration from Legacy System

The new system maintains backward compatibility with the existing MJAuthBase interface. To migrate:

1. Update your auth services import to use the refactored module
2. Optionally update components to use IAngularAuthProvider directly
3. Replace provider-specific code with the generic interface

## Testing

```typescript
// Example test setup
describe('CustomAuthProvider', () => {
  let factory: AngularAuthProviderFactory;
  let provider: IAngularAuthProvider;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AuthServicesModule.forRoot({
        authProvider: {
          type: 'custom',
          clientId: 'test-client'
        }
      })]
    });
    
    factory = TestBed.inject(AngularAuthProviderFactory);
    provider = factory.createProvider({ type: 'custom', clientId: 'test' });
  });

  it('should create provider', () => {
    expect(provider).toBeDefined();
    expect(provider.type).toBe('custom');
  });
});
```

## How Extensibility Works

1. **Provider Registration**: Each provider uses `@RegisterClass(MJAuthBase, 'type')` to register with the ClassFactory
2. **Dependency Declaration**: Static `getRequiredAngularProviders()` method declares Angular service dependencies
3. **Dynamic Discovery**: The factory uses ClassFactory.GetRegistration() to find the registered provider for a given type
4. **Service Injection**: The factory calls the static method to get required services and provides them to Angular's DI
5. **Provider Instantiation**: Angular instantiates the provider with its dependencies injected

## Advantages of the New Architecture

1. **Extensibility** - Add new providers without modifying core code
2. **Self-Contained Dependencies** - Each provider declares its own Angular service requirements
3. **Consistency** - Same pattern as backend authentication using ClassFactory
4. **Type Safety** - Full TypeScript support with proper typing
5. **Modularity** - Providers are self-contained modules
6. **Testability** - Easy to mock and test providers
7. **Tree-Shaking Prevention** - Load functions ensure providers aren't removed during optimization
8. **Backward Compatibility** - Works with existing MJAuthBase interface

## Future Enhancements

- Automatic provider discovery
- Provider plugins via npm packages
- Multi-provider support (login with multiple providers)
- Provider chaining for fallback authentication
- Built-in token refresh scheduling
- Enhanced error recovery mechanisms