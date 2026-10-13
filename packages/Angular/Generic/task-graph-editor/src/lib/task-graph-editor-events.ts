/**
 * @fileoverview The component's upward contract.
 *
 * Follows MJ's `Before*` / `After*` cancelable pattern (see `guides/UI_LAYERING_GUIDE.md` §6),
 * already used by `ng-base-forms`, `ng-trees`, `ng-entity-viewer` and `ng-conversations`.
 *
 * **Why the args are classes and not payload interfaces.** `Cancel` has to travel *back*. Angular's
 * `EventEmitter` is synchronous for synchronous listeners, so the emitting component reads the
 * mutated object after `.emit()` returns — that is the entire veto mechanism. A frozen payload
 * cannot carry a veto, and a class additionally gives one place for defaults and future fields.
 *
 * **A `Before*` handler must not be `async`.** An `await` inside it returns control to the emitter
 * before the handler sets `Cancel`, so the veto silently does nothing. Where a host genuinely needs
 * to await — a confirmation dialog — the component exposes the action as a public method the host
 * calls *after* its own await, rather than pretending the veto is asynchronous.
 *
 * @module @memberjunction/ng-task-graph-editor
 */
import type { TaskGraphSpec, TaskGraphSpecNode, TaskGraphValidationError } from '@memberjunction/ai-core-plus';

/**
 * Base for every cancelable graph event.
 *
 * A listener flips `Cancel = true` to halt the default behavior; the matching `After*` event will
 * then **not** fire. That is a contract hosts rely on, not a suggestion.
 */
export class CancellableTaskGraphEventArgs {
    public Cancel: boolean = false;
    public CancelReason?: string;
}

// ── Node lifecycle ───────────────────────────────────────────────────────────

/** Fired BEFORE a task is added. Cancel to block it (e.g. the host caps graph size). */
export class BeforeTaskAddedEventArgs extends CancellableTaskGraphEventArgs {
    constructor(public readonly Task: TaskGraphSpecNode) { super(); }
}

/** Fired AFTER a task was added. NOT fired when the Before was canceled. */
export class AfterTaskAddedEventArgs {
    constructor(
        public readonly Task: TaskGraphSpecNode,
        public readonly Spec: TaskGraphSpec,
    ) {}
}

/**
 * Fired BEFORE a task is removed. Cancel to block it.
 *
 * `DependentTempIds` is supplied because removing a node also severs every edge into it, and a host
 * deciding whether to veto needs to know the blast radius — not just which node was clicked.
 */
export class BeforeTaskRemovedEventArgs extends CancellableTaskGraphEventArgs {
    constructor(
        public readonly Task: TaskGraphSpecNode,
        public readonly DependentTempIds: readonly string[],
    ) { super(); }
}

/** Fired AFTER a task was removed. NOT fired when the Before was canceled. */
export class AfterTaskRemovedEventArgs {
    constructor(
        public readonly Task: TaskGraphSpecNode,
        public readonly Spec: TaskGraphSpec,
    ) {}
}

/** Fired BEFORE a task's properties change. Cancel to block the edit. */
export class BeforeTaskUpdatedEventArgs extends CancellableTaskGraphEventArgs {
    constructor(
        public readonly Previous: TaskGraphSpecNode,
        public readonly Next: TaskGraphSpecNode,
    ) { super(); }
}

/** Fired AFTER a task's properties changed. NOT fired when the Before was canceled. */
export class AfterTaskUpdatedEventArgs {
    constructor(
        public readonly Task: TaskGraphSpecNode,
        public readonly Spec: TaskGraphSpec,
    ) {}
}

// ── Edge lifecycle ───────────────────────────────────────────────────────────

/**
 * Fired BEFORE a dependency edge is created. Cancel to block it.
 *
 * `WouldCreateCycle` is computed before emitting so a host can veto on that alone without
 * re-deriving it. The component refuses a cycle regardless — the flag exists so the host can
 * explain *why* rather than watch an edge silently fail to appear.
 */
export class BeforeDependencyAddedEventArgs extends CancellableTaskGraphEventArgs {
    constructor(
        public readonly FromTempId: string,
        public readonly ToTempId: string,
        public readonly WouldCreateCycle: boolean,
    ) { super(); }
}

/** Fired AFTER a dependency edge was created. NOT fired when the Before was canceled. */
export class AfterDependencyAddedEventArgs {
    constructor(
        public readonly FromTempId: string,
        public readonly ToTempId: string,
        public readonly Spec: TaskGraphSpec,
    ) {}
}

/** Fired BEFORE a dependency edge is removed. Cancel to block it. */
export class BeforeDependencyRemovedEventArgs extends CancellableTaskGraphEventArgs {
    constructor(
        public readonly FromTempId: string,
        public readonly ToTempId: string,
    ) { super(); }
}

/** Fired AFTER a dependency edge was removed. NOT fired when the Before was canceled. */
export class AfterDependencyRemovedEventArgs {
    constructor(
        public readonly FromTempId: string,
        public readonly ToTempId: string,
        public readonly Spec: TaskGraphSpec,
    ) {}
}

// ── Informational ────────────────────────────────────────────────────────────
//
// Single emitters, no Before pair. Per the layering guide: don't invent a veto for something that
// cannot be vetoed. A selection that already happened and a validation that already ran are facts,
// not requests.

/** The spec changed for any reason. Hosts persist from here. */
export class TaskGraphSpecChangedEventArgs {
    constructor(
        public readonly Spec: TaskGraphSpec,
        public readonly Reason: 'TaskAdded' | 'TaskRemoved' | 'TaskUpdated' | 'DependencyAdded' | 'DependencyRemoved' | 'LayoutApplied',
    ) {}
}

/** Selection changed. `Task` is null when the selection was cleared. */
export class TaskGraphSelectionChangedEventArgs {
    constructor(public readonly Task: TaskGraphSpecNode | null) {}
}

/**
 * Validation ran.
 *
 * Errors come from the engine's own `ValidateTaskGraphSpec`, not from a second implementation here —
 * so a graph that looks valid on the canvas cannot fail a different check at submission.
 */
export class TaskGraphValidationChangedEventArgs {
    constructor(
        public readonly Valid: boolean,
        public readonly Errors: readonly TaskGraphValidationError[],
    ) {}
}

// ── Intent-only (navigation the HOST performs) ───────────────────────────────
//
// A widget at this layer must not navigate: it has no Router, and it cannot know whether it is
// inside Explorer, a downstream app, or an embedded panel. It reports the intent; the host decides.

/** The user asked to open the agent behind a task. The host navigates. */
export class AgentOpenRequestedEventArgs {
    constructor(
        public readonly AgentName: string,
        public readonly Task: TaskGraphSpecNode,
    ) {}
}

/** The user asked to open a record referenced by the graph. The host navigates. */
export class RecordOpenRequestedEventArgs {
    constructor(
        public readonly EntityName: string,
        public readonly RecordID: string,
    ) {}
}
