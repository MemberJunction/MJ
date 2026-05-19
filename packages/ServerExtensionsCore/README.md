# @memberjunction/server-extensions-core

Plugin architecture for MJServer that enables auto-discovery and lifecycle management of extension modules. Extensions register Express routes, handle their own authentication, and participate in health checks and graceful shutdown — all without modifying MJServer source code.

## Overview

This package provides two main exports:

- **`BaseServerExtension`** — Abstract base class that all extensions implement. Defines the `Initialize`, `Shutdown`, and `HealthCheck` lifecycle methods.
- **`ServerExtensionLoader`** — Discovers registered extension classes via MJ's `ClassFactory`, matches them to config entries, and manages their lifecycle.

Extensions are discovered automatically using MemberJunction's standard `@RegisterClass` + `ClassFactory` pattern. You register your extension class, add an entry to `mj.config.cjs`, and MJServer loads it at startup — zero source code changes to MJServer required per new extension.

## Installation

```bash
npm install @memberjunction/server-extensions-core
```

## Quick Start

### 1. Create an Extension

```typescript
import { Application } from 'express';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseServerExtension,
    ServerExtensionConfig,
    ExtensionInitResult,
    ExtensionHealthResult
} from '@memberjunction/server-extensions-core';

@RegisterClass(BaseServerExtension, 'MyCustomExtension')
export class MyCustomExtension extends BaseServerExtension {
    async Initialize(app: Application, config: ServerExtensionConfig): Promise<ExtensionInitResult> {
        // Register your Express routes
        app.get(config.RootPath + '/hello', (_req, res) => {
            res.json({ message: 'Hello from my extension!' });
        });

        return {
            Success: true,
            Message: 'Custom extension loaded',
            RegisteredRoutes: [`GET ${config.RootPath}/hello`]
        };
    }

    async Shutdown(): Promise<void> {
        // Clean up connections, drain requests, release resources
    }

    async HealthCheck(): Promise<ExtensionHealthResult> {
        return { Healthy: true, Name: 'MyCustomExtension' };
    }
}
```

### 2. Configure in `mj.config.cjs`

```javascript
module.exports = {
    // ... other MJServer config ...
    serverExtensions: [
        {
            Enabled: true,
            DriverClass: 'MyCustomExtension',
            RootPath: '/api/my-extension',
            Settings: {
                apiKey: process.env.MY_EXTENSION_API_KEY,
                // Any extension-specific settings
            }
        }
    ]
};
```

### 3. Import Your Extension Package

Ensure your extension package is imported in your application so the `@RegisterClass` decorator fires at module load time. Add it as a dependency in your MJAPI project.

## API Reference

### `BaseServerExtension`

Abstract base class for all server extensions.

| Method | Description |
|--------|-------------|
| `Initialize(app, config)` | Called once at MJServer startup. Register routes, open connections. |
| `Shutdown()` | Called during graceful shutdown (SIGTERM/SIGINT). Clean up resources. |
| `HealthCheck()` | Called periodically. Return health status quickly (< 100ms). |
| `OnConfigurationChange?(config)` | Optional. Called when config changes at runtime. |

### `ServerExtensionLoader`

Manages the extension lifecycle.

| Method | Description |
|--------|-------------|
| `LoadExtensions(app, configs)` | Discover and initialize all enabled extensions from config. |
| `HealthCheckAll()` | Run health checks on all loaded extensions. |
| `ShutdownAll()` | Shut down all extensions in reverse order (LIFO). |
| `Extensions` | Read-only array of loaded extension instances. |
| `ExtensionCount` | Number of currently loaded extensions. |

### Type Interfaces

#### `ServerExtensionConfig`

```typescript
interface ServerExtensionConfig {
    Enabled: boolean;        // Skip loading if false
    DriverClass: string;     // Must match @RegisterClass key
    RootPath: string;        // URL prefix for extension routes
    Settings: Record<string, unknown>;  // Extension-specific config
}
```

#### `ExtensionInitResult`

```typescript
interface ExtensionInitResult {
    Success: boolean;
    Message: string;
    RegisteredRoutes?: string[];
}
```

#### `ExtensionHealthResult`

```typescript
interface ExtensionHealthResult {
    Healthy: boolean;
    Name: string;
    Details?: Record<string, unknown>;
}
```

## Lifecycle

1. MJServer reads `serverExtensions[]` from `mj.config.cjs`
2. For each enabled entry, `ServerExtensionLoader` uses `ClassFactory.CreateInstance(BaseServerExtension, driverClass)` to find the registered class
3. Creates an instance and calls `Initialize(app, config)`
4. Extension registers its Express routes under `config.RootPath`
5. MJServer exposes `GET /health/extensions` for aggregate health checks
6. On SIGTERM/SIGINT, `ShutdownAll()` calls each extension's `Shutdown()` in reverse order

## Error Handling

- Extensions that fail to initialize are logged and skipped — they don't prevent other extensions from loading
- Health check exceptions are caught and reported as unhealthy
- Shutdown exceptions are logged but don't prevent other extensions from shutting down

## Authentication

Extensions handle their own authentication by default. Common patterns:

- **Platform-specific auth** (Slack HMAC signatures, Teams Bot Framework JWT)
- **MJServer auth middleware** — import from `@memberjunction/server` if you want to reuse MJServer's built-in auth
- **Custom auth** — API keys, OAuth, etc.

This is opt-in — extensions are not forced to use MJServer's auth middleware.

## Testing

```bash
npm run test        # Run all tests
npm run test:watch  # Watch mode
```

## Related Packages

- [`@memberjunction/messaging-adapters`](../MessagingAdapters/) — Slack and Teams adapters built on this framework
- [`@memberjunction/server`](../MJServer/) — MJServer that loads and manages extensions
