# Custom Authentication Provider Guide

This guide demonstrates how to create custom authentication providers for MemberJunction by extending the base authentication classes on both frontend and backend.

## Overview

The MemberJunction authentication system supports extensible N-provider authentication, allowing developers to easily add new authentication providers without modifying the core auth services module. The system uses the MJGlobal ClassFactory pattern to dynamically create and manage authentication providers.

## Architecture

The system consists of:

1. **MJAuthBase** - Base class providing common authentication functionality
2. **AngularAuthProviderFactory** - Factory for creating providers dynamically using ClassFactory
3. **Provider Implementations** - Concrete classes registered with @RegisterClass decorator
4. **Static Dependency Declaration** - Each provider declares its Angular service dependencies via a static method
5. **BaseAuthProvider** (Backend) - Base class for server-side JWT validation

## Example Implementation

We've created a complete example of a custom authentication provider that demonstrates the extensibility of MemberJunction's authentication system.

### Frontend Implementation

**Location**: `/packages/MJExplorer/src/app/auth/custom-auth-provider.service.ts`

This example shows:
- Extending `MJAuthBase` from `@memberjunction/ng-auth-services`
- Using `@RegisterClass` decorator to register with the ClassFactory
- Implementing all required authentication methods
- Providing Angular dependencies via static method
- Preventing tree-shaking with a Load function

### Backend Implementation

**Location**: `/packages/MJServer/src/auth/CustomAuthProvider.ts`

This example shows:
- Extending `BaseAuthProvider` from MJServer
- Using `@RegisterClass` decorator for backend registration
- Implementing JWT validation logic
- Extracting user information from tokens
- Custom token validation methods

## How to Test the Custom Provider

### 1. Enable Custom Auth in Frontend

Edit `/packages/MJExplorer/src/environments/environment.ts`:
```typescript
export const environment = {
  AUTH_TYPE: 'custom',  // Switch to custom provider
  CUSTOM_AUTH_API_URL: 'https://custom-auth.example.com',
  CUSTOM_CLIENT_ID: 'custom-demo-client',
  // ... other config
};
```

Or use the custom environment file:
```bash
ng serve --configuration=custom
```

### 2. Enable Custom Auth in Backend

Add to your `.env` file:
```bash
CUSTOM_AUTH_ENABLED=true
CUSTOM_ISSUER=https://custom-auth.example.com
CUSTOM_AUDIENCE=custom-demo-api
CUSTOM_CLIENT_ID=custom-demo-client
```

Or uncomment the custom provider in `mj.config.cjs`:
```javascript
authProviders: [
  // ... other providers
  process.env.CUSTOM_AUTH_ENABLED === 'true' ? {
    name: 'custom',
    type: 'custom',
    issuer: process.env.CUSTOM_ISSUER || 'https://custom-auth.example.com',
    audience: process.env.CUSTOM_AUDIENCE || 'custom-demo-api',
    jwksUri: process.env.CUSTOM_JWKS_URI || 'https://custom-auth.example.com/.well-known/jwks.json',
    clientId: process.env.CUSTOM_CLIENT_ID || 'custom-demo-client'
  } : null
].filter(Boolean)
```

### 3. Run the Application

```bash
# Terminal 1 - Start MJAPI
cd packages/MJAPI
npm start

# Terminal 2 - Start MJExplorer with custom auth
cd packages/MJExplorer
npm start
```

### 4. Test Authentication Flow

1. Open browser to http://localhost:4200
2. Click "Log in" button
3. The custom provider will mock a successful login (see console logs)
4. User will be authenticated with mock token
5. The backend will accept the mock token (for demo purposes)

## How Extensibility Works

1. **Provider Registration**: Each provider uses `@RegisterClass(MJAuthBase, 'type')` to register with the ClassFactory
2. **Dependency Declaration**: Static `getRequiredAngularProviders()` method declares Angular service dependencies
3. **Dynamic Discovery**: The factory uses ClassFactory.GetRegistration() to find the registered provider for a given type
4. **Service Injection**: The factory calls the static method to get required services and provides them to Angular's DI
5. **Provider Instantiation**: Angular instantiates the provider with its dependencies injected
6. **Tree-Shaking Prevention**: Load functions ensure providers aren't removed during optimization

## Creating Your Own Provider

### Frontend Steps

1. **Create Provider Class**
   ```typescript
   @Injectable({ providedIn: 'root' })
   @RegisterClass(MJAuthBase, 'yourprovider')
   export class YourAuthProvider extends MJAuthBase {
     type = 'yourprovider';
     
     /**
      * Factory function to provide Angular dependencies
      * This cleaner pattern uses a static property instead of a method
      */
     static angularProviderFactory = (environment: any) => [
       // Your Angular providers here
       {
         provide: 'YOUR_CONFIG',
         useValue: {
           apiUrl: environment.YOUR_API_URL,
           clientId: environment.YOUR_CLIENT_ID
         }
       },
       // Any services your provider needs
       YourAuthService,
       YourAuthGuard
     ];
     
     // ... rest of implementation
   }
   ```

2. **Add Load Function**
   ```typescript
   export function LoadYourAuthProvider() {
     return YourAuthProvider;
   }
   ```

3. **Register in App Module**
   ```typescript
   providers: [{
     provide: APP_INITIALIZER,
     useFactory: () => () => LoadYourAuthProvider(),
     multi: true
   }]
   ```

4. **Configure Environment**
   ```typescript
   AUTH_TYPE: 'yourprovider'
   ```

### Configuration Options

#### Provider Configuration Structure

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

#### Environment Configuration Examples

**Auth0:**
```typescript
authProvider: {
  type: 'auth0',
  domain: 'your-domain.auth0.com',
  clientId: 'your-client-id',
  audience: 'your-api-audience',
  scopes: ['openid', 'profile', 'email']
}
```

**MSAL (Microsoft):**
```typescript
authProvider: {
  type: 'msal',
  clientId: 'your-client-id',
  tenantId: 'your-tenant-id',
  scopes: ['User.Read', 'email', 'profile']
}
```

**Okta:**
```typescript
authProvider: {
  type: 'okta',
  domain: 'your-domain.okta.com',
  clientId: 'your-client-id',
  scopes: ['openid', 'profile', 'email']
}
```

### Backend Steps

1. **Create Provider Class**
   ```typescript
   @RegisterClass(BaseAuthProvider, 'yourprovider')
   export class YourAuthProvider extends BaseAuthProvider {
     extractUserInfo(payload: JwtPayload) { /* ... */ }
   }
   ```

2. **Import in initializeProviders.ts**
   ```typescript
   import './YourAuthProvider.js';
   ```

3. **Configure in mj.config.cjs**
   ```javascript
   authProviders: [{
     name: 'yourprovider',
     type: 'yourprovider',
     issuer: '...',
     audience: '...',
     jwksUri: '...'
   }]
   ```

## Production Considerations

The example custom provider is for demonstration only. In production:

1. **Frontend**:
   - Implement real OAuth/SAML flow
   - Handle token refresh properly
   - Secure token storage
   - Implement proper error handling

2. **Backend**:
   - Validate real JWT signatures
   - Verify token expiration
   - Check issuer and audience claims
   - Implement proper JWKS key rotation

3. **Security**:
   - Never accept mock tokens
   - Always validate signatures
   - Implement rate limiting
   - Use secure communication (HTTPS)

## Best Practices

1. **Validate Configuration** - Always validate required config in your provider
2. **Handle Errors Gracefully** - Provide meaningful error messages
3. **Update Auth State** - Use `updateAuthState()` and `updateUserProfile()` helpers
4. **Clean URLs** - Remove OAuth params from URL after callback
5. **Token Management** - Implement silent token refresh when possible
6. **Storage** - Use localStorage or sessionStorage consistently

## Provider Lifecycle

1. **Registration** - Provider class registers itself via @RegisterClass decorator
2. **Creation** - Factory creates provider instance when module initializes
3. **Configuration** - Provider validates its configuration
4. **Initialization** - Provider sets up auth client and checks existing sessions
5. **Runtime** - Provider handles login/logout/token operations
6. **Cleanup** - Provider cleans up resources on logout

## Architecture Benefits

This extensible architecture provides:

- **Flexibility**: Add any authentication provider without modifying core code
- **Type Safety**: Full TypeScript support throughout
- **Consistency**: Same patterns on frontend and backend
- **Maintainability**: Providers are self-contained modules
- **Extensibility**: Add new providers without modifying core code
- **Self-Contained Dependencies**: Each provider declares its own Angular service requirements
- **Modularity**: Providers are self-contained modules
- **Testability**: Easy to mock and test providers
- **Tree-Shaking Prevention**: Load functions ensure providers aren't removed during optimization
- **Backward Compatibility**: Works with existing MJAuthBase interface

## Troubleshooting

If your custom provider isn't working:

1. **Frontend**: Check browser console for registration logs
2. **Backend**: Check server logs for provider initialization
3. **Verify**: AUTH_TYPE matches your provider's registered type
4. **Network**: Check browser network tab for auth requests
5. **Configuration**: Ensure all required environment variables are set

## Migration from Legacy System

The new system maintains backward compatibility with the existing MJAuthBase interface. To migrate:

1. Update your auth services import to use the refactored module
2. Optionally update components to use IAngularAuthProvider directly
3. Replace provider-specific code with the generic interface

## Testing Your Provider

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

## Summary

The custom provider example demonstrates how MemberJunction's authentication system can be extended to support any authentication mechanism while maintaining consistency and type safety across the full stack. The ClassFactory pattern ensures providers are dynamically discoverable and self-contained, making the system truly extensible without core modifications.