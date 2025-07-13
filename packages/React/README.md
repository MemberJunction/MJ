# MemberJunction React Packages

This directory contains React-related packages for the MemberJunction platform. These packages provide infrastructure for rendering and testing React components within the MJ ecosystem.

## Package Overview

### @memberjunction/react-runtime
**Location**: `./runtime`

Core React component runtime that works in any JavaScript environment (browser, Node.js, etc.). This package provides:
- Component compilation using Babel
- Component registry and resolution
- Error boundary handling
- Platform-agnostic interfaces

### @memberjunction/react-test-harness (Future)
**Location**: `./test-harness`

Server-side testing framework for validating React components using Playwright. This package will provide:
- Headless browser testing
- Component validation suites
- Automated quality checks
- Performance testing

## Architecture

The React packages follow a layered architecture:

```
┌─────────────────────────────────────┐
│         Angular Components          │
│    (@memberjunction/ng-react)       │
├─────────────────────────────────────┤
│        React Runtime Core           │
│  (@memberjunction/react-runtime)    │
├─────────────────────────────────────┤
│     JavaScript Environment          │
│   (Browser, Node.js, etc.)         │
└─────────────────────────────────────┘
```

## Key Design Principles

1. **Platform Agnostic**: The runtime core has no dependencies on specific environments
2. **Type Safety**: Full TypeScript support with strict typing
3. **Error Handling**: Comprehensive error boundaries and logging
4. **Performance**: Efficient component compilation and caching
5. **Testability**: Designed for automated testing from the ground up

## Usage

### In Angular Applications
```typescript
import { MJReactComponent } from '@memberjunction/ng-react';

// Use in Angular templates
<mj-react-component [component]="componentSpec" [data]="data"></mj-react-component>
```

### In Node.js Testing
```typescript
import { ComponentCompiler, ComponentRegistry } from '@memberjunction/react-runtime';

// Compile and register components for testing
const compiler = new ComponentCompiler();
const compiled = await compiler.compile(code);
```

## Development

Each package has its own build process:

```bash
# Build all React packages
cd packages/React
npm run build

# Build specific package
cd packages/React/runtime
npm run build

# Watch mode for development
npm run watch
```

## Contributing

When adding new React-related functionality:
1. Determine if it belongs in the core runtime or a specific adapter
2. Maintain platform independence in the runtime
3. Add comprehensive tests
4. Update documentation

## License

See the main MemberJunction LICENSE file in the repository root.