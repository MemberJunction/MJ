# MemberJunction Server Extensions Guide

MemberJunction Server Extensions (`@memberjunction/server-extensions-core`) provide a modular, decoupled mechanism to mount custom HTTP routes, background workers, WebSocket connections, and external platform integrations into `MJServer` (the MemberJunction API server) without modifying core server source code.

This guide explains the architecture, security model, lifecycle phases, shared service registry, and step-by-step authoring patterns for server extensions.

---

## 1. When to Use What: Extension vs. Resolver vs. Action vs. Remote Operation

Before writing a server extension, choose the right abstraction for your capability:

| Mechanism | Purpose | Transport / Calling Pattern | Auth Model |
| :--- | :--- | :--- | :--- |
| **Server Extension** | Custom HTTP webhooks, external provider endpoints, WebSocket servers, streaming protocols, or non-GraphQL protocols | Raw Express endpoints (HTTP / WebSockets / long-lived connections) | Configurable: **Pre-Auth** (provider-verified signature / bearer) or **Post-Auth** (MJ JWT) |
| **TypeGraphQL Resolver** | Custom business logic query/mutation exposed to browser UI or internal clients | GraphQL `/graphql` endpoint | Standard MJ JWT (`UserPayload`, RBAC, Field-Level Security) |
| **Action** | Reusable unit of work runnable by workflows, AI agents, triggers, or UI buttons | In-process execution via `ActionEngine` | Caller context (User, transaction context) |
| **Remote Operation** | Polymorphic execution runnable both locally on the server or remotely from the browser | In-process or auto-marshalled over GraphQL | MJ API Key or User session |

### Use a Server Extension when:
- You need a dedicated HTTP path for an external webhook provider (e.g., Slack Event API, Microsoft Teams Bot Framework, Twilio Voice webhooks).
- You are implementing custom protocol brokers (e.g., WebRTC SDP exchange, Realtime proxies, binary file streaming).
- You need persistent background workers or outbound connection clients (e.g., Slack Socket Mode, external event polling).
- You are packaging a third-party vendor integration or OpenApp that supplies server-side middleware and route handlers.

---

## 2. Extension Architecture & Lifecycle Phases

Server extensions are mounted during MJServer bootstrap. They are separated into two distinct lifecycle phases to maintain strict security boundaries:

```
                  ┌────────────────────────────────────────────┐
                  │           MJServer Bootstrap               │
                  └─────────────────────┬──────────────────────┘
                                        │
                                        ▼
                  ┌────────────────────────────────────────────┐
                  │ 1. Core Services Setup                     │
                  │    - ClassFactory, DB connections, Redis   │
                  │    - Telephony & Broker services registered│
                  └─────────────────────┬──────────────────────┘
                                        │
                                        ▼
                  ┌────────────────────────────────────────────┐
                  │ 2. Pre-Auth Phase Extensions               │
                  │    - Mounted BEFORE MJ auth middleware     │
                  │    - Webhooks with external signatures     │
                  │    - Public callbacks, WebRTC SDP brokers  │
                  └─────────────────────┬──────────────────────┘
                                        │
                                        ▼
                  ┌────────────────────────────────────────────┐
                  │ 3. Core Authentication Middleware          │
                  │    - JWT token verification                │
                  │    - UserPayload context resolution        │
                  │    - Rate limiting & security headers      │
                  └─────────────────────┬──────────────────────┘
                                        │
                                        ▼
                  ┌────────────────────────────────────────────┐
                  │ 4. Post-Auth Phase Extensions              │
                  │    - Mounted AFTER MJ auth middleware      │
                  │    - Guaranteed valid req.user context     │
                  │    - Authenticated REST APIs & utilities   │
                  └─────────────────────┬──────────────────────┘
                                        │
                                        ▼
                  ┌────────────────────────────────────────────┐
                  │ 5. OnAllExtensionsMounted Hook             │
                  │    - Awaited across all loaded extensions  │
                  │    - Cross-extension & service wiring      │
                  └─────────────────────┬──────────────────────┘
                                        │
                                        ▼
                  ┌────────────────────────────────────────────┐
                  │ 6. Server Listening & Health Checks        │
                  │    - Periodic HealthCheck() monitoring     │
                  │    - Shutdown() on SIGTERM/SIGINT          │
                  └────────────────────────────────────────────┘
```

### Pre-Auth Phase (`'pre-auth'`)
- **Execution Timing**: Mounted directly onto the Express application **before** MJ's unified authentication middleware (`createUnifiedAuthMiddleware`).
- **Use Cases**:
  - Webhooks from external providers that sign payloads using their own shared secrets (e.g., Slack HMAC signatures, Teams Bot Framework JWTs, Twilio request signatures).
  - Single-use ticket exchange routes (e.g., WebRTC SDP broker).
  - Public status or challenge endpoints.
- **Security Responsibility**: The extension **must** validate incoming requests itself (e.g., via HMAC verification or token validation). Unverified requests have not been checked by MJ auth.

### Post-Auth Phase (`'post-auth'`)
- **Execution Timing**: Mounted **after** MJ's authentication and post-auth context middleware (`mwPostAuth`).
- **Use Cases**:
  - REST endpoints consumed by authenticated frontend users or internal services.
  - File upload/download endpoints operating under active user sessions.
  - Endpoints requiring `req.user` and permissions context.
- **Security Guarantee**: Any request hitting a post-auth extension has already been authenticated as a valid MJ user; unauthorized requests are rejected with `401 Unauthorized` before reaching the extension.

---

## 3. Reserved Roots & Route Safety (G2)

To prevent extensions from colliding with or shadowing core server routes, `MJServer` enforces a **Reserved Roots Registry** (`serverExtensionReservedRoots.ts`).

### Reserved System Roots
The following root prefixes cannot be claimed by server extensions:
- `/graphql` (Core GraphQL API)
- `/health` (Server health check)
- `/auth` (Authentication routes)
- `/media` (Media storage & streaming routes)
- `/schema` (Schema introspection endpoints)
- `/mcp` (Model Context Protocol endpoints)

During extension configuration loading, `ServerExtensionLoader` validates all configured `RootPath` values. If an extension attempts to claim a reserved root, initialization fails immediately with a descriptive error.

---

## 4. Shared Service Registry & Context (G3)

Extensions often need to communicate with one another or interact with server services (such as telephony providers or media brokers) without circular npm dependencies.

`ServerExtensionInitContext` provides access to a unified `ServerExtensionServiceRegistry`:

```typescript
export interface ServerExtensionServiceRegistry {
    RegisterService<T extends object>(key: string, service: T): void;
    GetService<T extends object>(key: string): T | undefined;
    HasService(key: string): boolean;
    GetAllServices(): ReadonlyMap<string, object>;
}
```

### Auto-Registration via `ExtensionInitResult.Service`
If an extension returns a `Service` object in its `ExtensionInitResult`, `ServerExtensionLoader` automatically registers that instance into the registry under:
1. `config.Name` (if specified in `mj.config.cjs`)
2. The concrete extension class name
3. The configured `DriverClass` name

### The `OnAllExtensionsMounted` Hook
Some extensions depend on services registered by other extensions (or core services registered during bootstrap). Because pre-auth and post-auth extensions load sequentially, extensions should perform cross-service wiring inside the **`OnAllExtensionsMounted`** lifecycle hook:

```typescript
export abstract class BaseServerExtension {
    // ...
    OnAllExtensionsMounted?(context: ServerExtensionInitContext): Promise<void>;
}
```

This method is guaranteed to run after all extensions across both phases are loaded and their services are registered.

---

## 5. Authoring a Server Extension: Step-by-Step Recipe

### Step 1: Create the Extension Class
Extend `BaseServerExtension` and decorate it with `@RegisterClass`:

```typescript
import { Router, Request, Response } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import {
    BaseServerExtension,
    ServerExtensionInitContext,
    ExtensionInitResult,
    ExtensionHealthResult,
    ServerExtensionPhase
} from '@memberjunction/server-extensions-core';

export interface MyWebhookService {
    ProcessEvent(payload: Record<string, unknown>): Promise<void>;
}

@RegisterClass(BaseServerExtension, 'MyCustomWebhookExtension')
export class MyCustomWebhookExtension extends BaseServerExtension {
    /** Declare default lifecycle phase */
    public override get DefaultPhase(): ServerExtensionPhase {
        return 'pre-auth';
    }

    private _service: MyWebhookService | null = null;

    /**
     * Called once during MJServer startup.
     */
    async Initialize(context: ServerExtensionInitContext): Promise<ExtensionInitResult> {
        const { app, config, services } = context;
        const rootPath = config.RootPath || '/webhook/custom';

        // 1. Initialize internal services
        this._service = {
            async ProcessEvent(payload: Record<string, unknown>) {
                LogStatus(`Processing event: ${JSON.stringify(payload)}`);
            }
        };

        // 2. Mount routes
        const router = Router();
        router.post('/', async (req: Request, res: Response) => {
            try {
                // Verify custom signature...
                await this._service?.ProcessEvent(req.body);
                res.status(200).json({ status: 'ok' });
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                LogError(`Error in webhook: ${message}`);
                res.status(500).json({ error: message });
            }
        });

        app.use(rootPath, router);

        return {
            Success: true,
            Message: `Custom webhook mounted at ${rootPath}`,
            RegisteredRoutes: [`POST ${rootPath}`],
            Service: this._service // Automatically registered into ServerExtensionServiceRegistry
        };
    }

    /**
     * Cross-extension dependency resolution hook.
     */
    async OnAllExtensionsMounted(context: ServerExtensionInitContext): Promise<void> {
        // Look up optional telephony or messaging services
        const twilio = context.services.GetService('TwilioTelephonyService');
        if (twilio) {
            LogStatus('MyCustomWebhookExtension: discovered active Twilio service');
        }
    }

    /**
     * Regular health status reporting.
     */
    async HealthCheck(): Promise<ExtensionHealthResult> {
        return {
            Healthy: this._service !== null,
            Name: 'MyCustomWebhookExtension',
            Details: {
                active: true
            }
        };
    }

    /**
     * Graceful shutdown cleanup.
     */
    async Shutdown(): Promise<void> {
        this._service = null;
    }
}
```

---

## 6. Configuring Extensions in `mj.config.cjs`

Extensions are configured in the host's `mj.config.cjs` file under the `serverExtensions` array:

```javascript
module.exports = {
    // ...
    serverExtensions: [
        {
            Name: 'SlackIntegration',
            DriverClass: 'SlackMessagingExtension',
            PackagePath: '@memberjunction/messaging-adapters',
            RootPath: '/webhook/slack',
            Phase: 'pre-auth',       // 'pre-auth' (default) or 'post-auth'
            Enabled: true,
            Settings: {
                DefaultAgentName: 'Sage',
                ContextUserEmail: 'bot@company.com',
                BotToken: process.env.SLACK_BOT_TOKEN,
                SigningSecret: process.env.SLACK_SIGNING_SECRET,
                ConnectionMode: 'http'
            }
        },
        {
            Name: 'AuthenticatedReporting',
            DriverClass: 'ReportingApiExtension',
            PackagePath: '@my-org/reporting-extension',
            RootPath: '/api/reporting',
            Phase: 'post-auth',      // Protected by MJ user auth
            Enabled: true,
            Settings: {
                MaxExportRows: 50000
            }
        }
    ]
};
```

### Disabling Extensions
To temporarily disable an extension without removing its configuration, set:
```javascript
Enabled: false
```
The loader will skip initialization and log a clean bypass message.

---

## 7. Telephony & Core Integration Architecture

Core server integrations (such as Twilio, Vonage, RingCentral, and Microsoft Teams meetings) register their management services directly into `ServerExtensionServiceRegistry` during bootstrap:

- `'TwilioTelephonyService'`
- `'VonageTelephonyService'`
- `'RingCentralTelephonyService'`
- `'TeamsMeetingsService'`

This enables custom server extensions to access telephony runtime features (e.g., initiating outbound calls, checking call status, or streaming media) without requiring direct coupling to `MJServer` internal modules.

---

## 8. Best Practices & Guidelines

1. **Explicit Phase Declaration**: Always define `DefaultPhase` on your extension class, even though it defaults to `'pre-auth'`. Make your security assumptions explicit.
2. **Never Bypass Authentication in Post-Auth**: Post-auth extensions rely on the ambient `req.user`. Do not implement conflicting authentication middleware on post-auth routes.
3. **Graceful Shutdown**: Implement `Shutdown()` to close persistent WebSocket connections, flush message queues, and release database pools.
4. **Resilient Health Checks**: Ensure `HealthCheck()` returns within milliseconds; do not perform blocking network calls inside health checks.
5. **Avoid String Magic for Services**: When consuming services from `context.services`, verify availability with `HasService()` or check if `GetService()` returns `undefined`.
