/**
 * @fileoverview The `Template.Run` Remote Operation — client-safe contract + types shared by both sides.
 * A browser caller can `new TemplateRunOperation().Execute(input)` (routed over the generic
 * `ExecuteRemoteOperation` transport) WITHOUT importing the server template engine. The server
 * implementation lives in `@memberjunction/templates` and extends this with the actual `InternalExecute`.
 * @module @memberjunction/templates-base-types
 */
import { BaseRemotableOperation } from '@memberjunction/core';

/** Input for `Template.Run`. */
export interface TemplateRunInput {
    /** The `MJ: Templates` ID to render. */
    templateID: string;
    /** Data the template may reference during render (the render context). Omit for none. */
    data?: Record<string, unknown>;
}

/** Output of `Template.Run`. */
export interface TemplateRunOutput {
    /** The rendered template output. */
    output: string;
    /** Wall-clock render time in milliseconds. */
    executionTimeMs?: number;
}

/**
 * Client-safe, typed entry point for rendering a template on the server. Instantiate and call `.Execute()`
 * from anywhere — the call routes through the active provider (marshalled over GraphQL on the client,
 * in-process on the server). The server body is supplied by the registered subclass in
 * `@memberjunction/templates`; this base has no `InternalExecute` of its own (so it is never the
 * registered server implementation).
 */
export class TemplateRunOperation extends BaseRemotableOperation<TemplateRunInput, TemplateRunOutput> {
    public readonly OperationKey = 'Template.Run';
    public readonly RequiredScope = 'template:execute';
    public readonly ExecutionMode = 'Sync' as const;
}
