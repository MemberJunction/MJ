# MemberJunction Explorer

MJExplorer is the primary user interface application for the MemberJunction framework. It provides a comprehensive, extensible web-based interface for managing entities, running reports, creating dashboards, and interacting with all aspects of a MemberJunction environment.

## Overview

MJExplorer is built with Angular 18 and integrates seamlessly with the MemberJunction ecosystem to provide:

- **Entity Management**: Browse, view, create, update, and delete records across all entities
- **Custom Forms**: Extensible form system with both generated and custom form components
- **Dashboards**: Interactive dashboard system with customizable widgets and layouts
- **Reports**: Comprehensive reporting capabilities with export functionality
- **User Views**: Create and manage custom views with filtering, sorting, and grouping
- **Authentication**: Integrated authentication supporting both Microsoft Entra ID (MSAL) and Auth0
- **Real-time Updates**: WebSocket support for real-time data synchronization
- **File Management**: Integrated file storage and management capabilities
- **Search**: Full-text search across entities and records

## Installation

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- MemberJunction API server running (default: http://localhost:4000)
- Valid authentication configuration (MSAL or Auth0)

### Setup

1. Clone the MemberJunction repository
2. Navigate to the MJExplorer package:
   ```bash
   cd packages/MJExplorer
   ```

3. Install dependencies from the repository root:
   ```bash
   cd ../.. # Navigate to repository root
   npm install
   ```

4. Configure your environment by copying and updating the environment file:
   ```bash
   cd packages/MJExplorer/src/environments
   cp environment.ts environment.development.ts
   # Edit environment.development.ts with your settings
   ```

## Configuration

MJExplorer uses environment-specific configuration files located in `src/environments/`. Key configuration options include:

```typescript
export const environment = {
  // GraphQL API endpoints
  GRAPHQL_URI: 'http://localhost:4000/',
  GRAPHQL_WS_URI: 'ws://localhost:4000/',
  
  // Application URL
  REDIRECT_URI: 'http://localhost:4200/',
  
  // Authentication settings (MSAL example)
  CLIENT_ID: 'your-client-id',
  TENANT_ID: 'your-tenant-id',
  CLIENT_AUTHORITY: 'https://login.microsoftonline.com/your-tenant-id',
  AUTH_TYPE: 'msal', // or 'auth0'
  
  // MemberJunction settings
  MJ_CORE_SCHEMA_NAME: 'admin',
  
  // Performance settings
  AUTOSAVE_DEBOUNCE_MS: 1200,
  SEARCH_DEBOUNCE_MS: 800,
  MIN_SEARCH_LENGTH: 3,
  
  // Application metadata
  APPLICATION_NAME: 'Your App Name',
  APPLICATION_INSTANCE: 'DEV',
  production: false
};
```

### Authentication Configuration

#### Microsoft Entra ID (MSAL)

For MSAL authentication, ensure your Azure AD application is configured with:
- Redirect URI matching your `REDIRECT_URI` setting
- Implicit grant flow enabled (if required)
- Appropriate API permissions

#### Auth0

For Auth0 authentication, configure:
- `AUTH0_DOMAIN`: Your Auth0 domain
- `AUTH0_CLIENTID`: Your Auth0 application client ID
- Callback URL in Auth0 matching your `REDIRECT_URI`

## Usage

### Development Server

Run the development server:

```bash
npm run start
```

The application will be available at `http://localhost:4200/` by default.

### Building

Build the application:

```bash
# Development build
npm run build

# Production build
npm run build -- --configuration production

# Staging build
npm run build:stage
```

### Running Tests

```bash
npm test
```

## Architecture

### Core Components

#### App Component (`app.component.ts`)

The root component that:
- Initializes authentication
- Sets up GraphQL client
- Manages global error handling
- Coordinates navigation

#### Navigation System

The application uses a drawer-based navigation system provided by `@memberjunction/ng-explorer-core`:
- Dynamic menu items based on user permissions
- Support for nested navigation
- Responsive design for mobile devices

#### Form System

MJExplorer includes a sophisticated form generation system:
- **Generated Forms**: Automatically created from entity metadata
- **Custom Forms**: Hand-coded forms for complex business logic
- **Form Sections**: Modular form components for reusability

### Module Structure

```
MJExplorer/
├── src/
│   ├── app/
│   │   ├── generated/          # Auto-generated entity forms
│   │   ├── demo/              # Demo components (like HelloDashboard)
│   │   ├── app.component.*    # Root application component
│   │   └── app.module.ts      # Main application module
│   ├── assets/                # Static assets (images, fonts)
│   ├── environments/          # Environment configurations
│   └── styles/               # Global styles and themes
├── angular.json              # Angular CLI configuration
└── package.json             # Package dependencies
```

### Key Dependencies

#### Angular Packages
- `@angular/core`: ^18.0.2
- `@angular/router`: ^18.0.2
- `@angular/forms`: ^18.0.2

#### MemberJunction Packages
- `@memberjunction/core`: Core functionality and metadata
- `@memberjunction/ng-explorer-core`: Navigation and layout components
- `@memberjunction/ng-core-entity-forms`: Form generation system
- `@memberjunction/ng-dashboards`: Dashboard framework
- `@memberjunction/ng-user-view-grid`: Data grid components
- `@memberjunction/graphql-dataprovider`: GraphQL data access

#### UI Framework
- `@progress/kendo-angular-*`: Comprehensive UI component library
- `@progress/kendo-theme-default`: Default theme styling

## Custom Development

### Creating Custom Forms

For detailed guidance on custom form development, see the [Core Entity Forms documentation](../Angular/Explorer/core-entity-forms/README.md#custom-form-development-guide).

### Adding Custom Dashboards

The HelloDashboard component (`src/app/demo/hello-dashboard/`) provides a comprehensive example of creating custom dashboards. Key concepts:

1. Extend `BaseDashboard` from `@memberjunction/ng-dashboards`
2. Use `@RegisterClass` decorator for automatic registration
3. Implement lifecycle methods: `initDashboard()`, `loadData()`, `Refresh()`
4. Emit events for container communication
5. Persist user state for preferences

### Extending Navigation

Add custom navigation items by creating components that integrate with the navigation system. See `demo/navigation-item.component.ts` for an example.

## Integration with MemberJunction

### Entity Management

MJExplorer automatically generates forms for all entities defined in your MemberJunction metadata:

```typescript
// Entities are loaded via the generated entities library
import { LoadGeneratedEntities } from 'mj_generatedentities';
LoadGeneratedEntities();
```

### Data Access

The application uses GraphQL for all data operations:

```typescript
// GraphQL client setup in app.component.ts
const config = new GraphQLProviderConfigData(
  token,
  environment.GRAPHQL_URI,
  environment.GRAPHQL_WS_URI,
  tokenRefreshFunction,
  environment.MJ_CORE_SCHEMA_NAME
);
await setupGraphQLClient(config);
```

### Metadata System

Access entity metadata and system information:

```typescript
import { Metadata } from '@memberjunction/core';

const md = new Metadata();
const entities = md.Entities;
const currentUser = md.CurrentUser;
```

## Deployment

### Production Build

1. Update environment configuration for production
2. Build the application:
   ```bash
   npm run build -- --configuration production
   ```
3. Deploy the contents of `dist/MJExplorer/` to your web server

### Azure Static Web Apps

The project includes `staticwebapp.config.json` for Azure Static Web Apps deployment. Configure:
- Authentication providers
- Routing rules
- API proxying

## Performance Optimization

### Build Optimization

- Tree shaking is carefully managed to prevent removal of dynamically loaded components
- Lazy loading for feature modules
- Production builds use optimization flags

### Runtime Performance

- Debounced autosave (configurable via `AUTOSAVE_DEBOUNCE_MS`)
- Debounced search (configurable via `SEARCH_DEBOUNCE_MS`)
- Virtual scrolling for large data sets
- WebSocket connections for real-time updates

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify CLIENT_ID and TENANT_ID/AUTH0_DOMAIN settings
   - Check redirect URI configuration
   - Ensure tokens are not expired

2. **GraphQL Connection Issues**
   - Verify API server is running
   - Check GRAPHQL_URI and GRAPHQL_WS_URI settings
   - Review browser console for network errors

3. **Missing Forms**
   - Ensure entity metadata is properly configured
   - Run code generation if forms are missing
   - Check for TypeScript compilation errors

### Debug Mode

Enable detailed logging:

```typescript
import { SetProductionStatus, LogStatus } from '@memberjunction/core';
SetProductionStatus(false); // Enable debug logging
```

## Contributing

When contributing to MJExplorer:

1. Follow the existing code style and patterns
2. Update tests for new functionality
3. Document new features and configuration options
4. Ensure builds pass without errors
5. Test across different authentication providers

## License

MJExplorer is part of the MemberJunction framework. See the main project LICENSE file for details.

## Support

For support and documentation:
- [MemberJunction Documentation](https://docs.memberjunction.org)
- [GitHub Issues](https://github.com/MemberJunction/MJ/issues)
- [Community Forum](https://community.memberjunction.org)