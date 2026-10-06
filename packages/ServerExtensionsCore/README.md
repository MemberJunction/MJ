# @memberjunction/server-extensions-core

Plugin architecture for MJServer that enables auto-discovery and lifecycle management of server extension modules. Extensions register Express routes, background workers, or WebSocket services, handle their own or MJ-managed authentication, publish and consume typed services, and participate in health checks and graceful shutdown — all without modifying MJServer source code.

For complete architectural patterns and guidelines, see the **[Server Extensions Guide](../../guides/SERVER_EXTENSIONS_GUIDE.md)**.

## Overview

This package provides the core contracts and loader for server extensions:

- **`BaseServerExtension`** — Abstract base class that all extensions implement. Defines `DefaultPhase`, `Initialize`, `OnAllExtensionsMounted`, `Shutdown`, and `HealthCheck` lifecycle methods.
- **`ServerExtensionLoader`** — Discovers registered extension classes via MJ's `ClassFactory`, matches them to config entries, enforces phased mounting (`pre-auth` vs. `post-auth`), maintains the shared `ServerExtensionServiceRegistry`, and manages extension lifecycle.
- **`ServerExtensionServiceRegistry`** — Typed registry facilitating decoupled cross-extension service discovery and telemetry sharing.
- **`ServerExtensionInitContext`** — Unified context passed to extension `Initialize` and `OnAllExtensionsMounted` methods.

Extensions are discovered automatically using MemberJunction's standard `@RegisterClass` + `ClassFactory` pattern.

### Open App & Dynamic Package Discovery
**Open App packages** listed in the host `mj.config.cjs` `dynamicPackages.server[]` declare the extensions they need:
1. Named export `MJ_SERVER_EXTENSIONS` on the server package (preferred; read after the package is imported).
2. Fallback: `package.json` → `memberjunction.serverExtensions`.

`@memberjunction/server-bootstrap` collects those declarations and `serve()` merges them with the host `serverExtensions[]`. Host `DriverClass` wins (`Enabled`, `RootPath`, per-key `Settings`, `Phase`). A host entry with `Enabled: false` disables a discovered extension.

### Lifecycle Phases (G1)
Extensions declare their execution phase or inherit their class default:
- **`'pre-auth'`** (Default): Mounted **before** MJServer authentication middleware. Used for external webhooks that carry provider signatures (Slack HMAC, Teams Bot Framework JWT, Twilio signatures, WebRTC SDP brokers).
- **`'post-auth'`**: Mounted **after** MJServer authentication middleware (`createUnifiedAuthMiddleware`). Guaranteed to have authenticated `req.user` context.

### Reserved Root Path Safety (G2)
Core system paths cannot be claimed by server extensions: `/`, `/graphql`, `/auth`, `/oauth`, `/health`, `/magic-link`, `/schema`, `/media`, `/mcp`. Configured roots matching these reserved paths fail closed and are dropped with an error.

## Installation

```bash
npm install @memberjunction/server-extensions-core
```

## Quick Start

### 1. Create an Extension

```typescript
import { Router } from 'express';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseServerExtension,
    ServerExtensionInitContext,
    ServerExtensionPhase,
    ExtensionInitResult,
    ExtensionHealthResult
} from '@memberjunction/server-extensions-core';

@RegisterClass(BaseServerExtension, 'MyCustomExtension')
export class MyCustomExtension extends BaseServerExtension {
    /** Declare lifecycle phase */
    public override get DefaultPhase(): ServerExtensionPhase {
        return 'pre-auth';
    }

    async Initialize(context: ServerExtensionInitContext): Promise<ExtensionInitResult> {
        const { app, config, services } = context;

        const router = Router();
        router.get('/hello', (_req, res) => {
            res.json({ message: 'Hello from my extension!' });
        });

        app.use(config.RootPath, router);

        return {
            Success: true,
            Message: 'Custom extension loaded',
            RegisteredRoutes: [`GET ${config.RootPath}/hello`],
            Service: { ping: () => 'pong' } // Auto-registered into ServerExtensionServiceRegistry
        };
    }

    async OnAllExtensionsMounted(context: ServerExtensionInitContext): Promise<void> {
        // Cross-extension service wiring
        const telephony = context.services.GetService('TwilioTelephonyService');
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
    serverExtensions: [
        {
            Name: 'MyExtension',
            Enabled: true,
            DriverClass: 'MyCustomExtension',
            RootPath: '/api/my-extension',
            Phase: 'pre-auth',
            Settings: {
                apiKey: process.env.MY_EXTENSION_API_KEY,
            }
        }
    ]
};
```

## API Reference

### `BaseServerExtension`

| Member | Description |
|---|---|
| `DefaultPhase` | Getter returning default lifecycle phase (`'pre-auth'` or `'post-auth'`). Default is `'pre-auth'`. |
| `Initialize(context)` | Called once at MJServer startup. Receives `ServerExtensionInitContext`. |
| `OnAllExtensionsMounted?(context)` | Optional hook called after all extensions across both phases have mounted. Ideal for service wiring. |
| `Shutdown()` | Called during graceful shutdown (SIGTERM/SIGINT). |
| `HealthCheck()` | Called periodically. Return health status quickly (< 100ms). |
| `OnConfigurationChange?(config)` | Optional. Called when configuration changes at runtime. |

### `ServerExtensionLoader`

| Member | Description |
|---|---|
| `Services` | Access the unified `ServerExtensionServiceRegistry`. |
| `LoadExtensions(app, configs, options?)` | Discover and initialize extensions filtered by phase (`pre-auth` or `post-auth`). |
| `NotifyAllExtensionsMounted(options?)` | Invoke `OnAllExtensionsMounted` on all loaded extensions. |
| `HealthCheckAll()` | Run health checks across all loaded extensions. |
| `ShutdownAll()` | Shut down all extensions in reverse order (LIFO). |
| `Extensions` | Read-only array of loaded extension instances. |

### Type Interfaces

```typescript
export type ServerExtensionPhase = 'pre-auth' | 'post-auth';

export interface ServerExtensionConfig {
    Name?: string;
    DriverClass: string;
    RootPath: string;
    Enabled: boolean;
    Phase?: ServerExtensionPhase;
    Settings?: Record<string, unknown>;
    PackagePath?: string;
}

export interface ServerExtensionInitContext {
    app: Application;
    httpServer?: Server;
    config: ServerExtensionConfig;
    publicUrl?: string;
    services: ServerExtensionServiceRegistry;
    phase: ServerExtensionPhase;
}

export interface ExtensionInitResult {
    Success: boolean;
    Message: string;
    RegisteredRoutes?: string[];
    Service?: object;
    Skipped?: boolean;
}
```

## Related Packages

- [`@memberjunction/messaging-adapters`](../MessagingAdapters/) — Slack and Teams adapters built on this framework
- [`@memberjunction/server`](../MJServer/) — Core server hosting the extension lifecycle
- [`guides/SERVER_EXTENSIONS_GUIDE.md`](../../guides/SERVER_EXTENSIONS_GUIDE.md) — Comprehensive developer guide
