/**
 * Base for the `Before*` half of MJ's Before/After cancelable event pattern.
 *
 * The contract, specified in `guides/UI_LAYERING_GUIDE.md` section 6: an action a host might want
 * to veto ships as a `Before<Verb>` / `After<Verb>` pair. The `Before*` event carries args
 * extending this class; a listener flips `Cancel = true`, the component checks
 * `if (args.Cancel) return;` and does NOT emit the matching `After*`. Hosts rely on that, so it is
 * a contract rather than a convention.
 *
 * Lives in `@memberjunction/global` because the pattern is framework-agnostic and every package
 * can reach it. Before this, at least five packages (`ng-trees`, `ng-conversations`,
 * `ng-task-graph-editor`, `ng-whiteboard`, `LiveKitRoomCore`) had each declared their own identical
 * `Cancel` + `CancelReason` base, so a sixth was the wrong answer. Those can migrate to this one;
 * doing so is deliberately NOT part of the PR that introduced it, since each is a public type its
 * own consumers extend.
 *
 * Note for listeners: `Before*` handlers must be SYNCHRONOUS. Angular's `EventEmitter` dispatches
 * synchronously, which is the entire mechanism by which `Cancel` travels back to the component. An
 * `await` inside a handler returns control before the flag is set, and the veto is silently lost.
 */
export class CancelableEventArgs {
    /** Flip to true to veto the pending action. The matching `After*` event will not fire. */
    public Cancel: boolean = false;
    /** Free-form reason, for telemetry or for a host that wants to explain itself in the UI. */
    public CancelReason?: string;
}
