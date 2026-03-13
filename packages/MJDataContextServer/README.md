# @memberjunction/data-context-server

Server-side implementation of the MemberJunction Data Context system. Provides SQL-based data loading for `DataContextItem` objects using direct database connections.

## Overview

The `@memberjunction/data-context-server` package extends the base `DataContextItem` class from `@memberjunction/data-context` with a server-side implementation that executes SQL queries directly against SQL Server using `mssql` connection pools. This is the server counterpart to the client-side GraphQL-based data context loading.

```mermaid
graph TD
    A["DataContextItemServer"] -->|extends| B["DataContextItem<br/>(data-context package)"]
    A -->|uses| C["mssql ConnectionPool"]
    C --> D["SQL Server"]

    E["Server-Side Code<br/>(MJAPI, Actions, etc.)"] --> A
    F["Client-Side Code<br/>(Angular, React)"] --> G["DataContextItemClient<br/>(GraphQL-based)"]

    style A fill:#2d6a9f,stroke:#1a4971,color:#fff
    style B fill:#7c5295,stroke:#563a6b,color:#fff
    style C fill:#2d8659,stroke:#1a5c3a,color:#fff
    style D fill:#2d8659,stroke:#1a5c3a,color:#fff
    style E fill:#b8762f,stroke:#8a5722,color:#fff
    style G fill:#b8762f,stroke:#8a5722,color:#fff
```

## Installation

```bash
npm install @memberjunction/data-context-server
```

## How It Works

The package registers `DataContextItemServer` as a subclass of `DataContextItem` using MemberJunction's `@RegisterClass` decorator. When server-side code creates a `DataContextItem`, the class factory automatically returns the server implementation that uses direct SQL execution rather than GraphQL.

```typescript
import '@memberjunction/data-context-server';
// DataContextItem instances now use direct SQL execution on the server
```

The `LoadFromSQL` method:
1. Receives a SQL Server `ConnectionPool` as the data source
2. Creates a new `Request` from the pool
3. Executes the `DataContextItem.SQL` query directly
4. Stores the resulting recordset in `DataContextItem.Data`
5. Returns success/failure with error details on `DataLoadingError`

## Dependencies

| Package | Purpose |
|---------|---------|
| `@memberjunction/core` | UserInfo, LogError utilities |
| `@memberjunction/global` | RegisterClass decorator |
| `@memberjunction/data-context` | Base DataContextItem class |
| `mssql` | SQL Server connectivity |

## License

ISC
