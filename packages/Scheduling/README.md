# Scheduling

Distributed scheduled-jobs system for MemberJunction with cron-based scheduling, adaptive polling, and plugin-based job execution.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [base-types](./base-types/README.md) | `@memberjunction/scheduling-base-types` | Core type definitions and interfaces for the scheduled jobs system (zero heavy dependencies) |
| [base-engine](./base-engine/README.md) | `@memberjunction/scheduling-engine-base` | Metadata caching layer and adaptive polling interval calculation |
| [engine](./engine/README.md) | `@memberjunction/scheduling-engine` | Server-side execution engine with distributed locking and driver-based job execution |
| [actions](./actions/README.md) | `@memberjunction/scheduling-actions` | MJ Actions for programmatic job management (query, create, update, delete, execute, statistics) |
