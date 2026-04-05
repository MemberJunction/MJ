/**
 * @fileoverview Pluggable runtime hook system for ReactRootManager.
 * Allows host environments and library integrations to inject behavior
 * at key lifecycle points without coupling the generic runtime to
 * specific libraries or frameworks.
 * @module @memberjunction/react-runtime/runtime
 */

/**
 * Context provided to hook callbacks, giving hooks access to
 * the root and container information they need.
 */
export interface RootHookContext {
  /** The root ID assigned by ReactRootManager */
  rootId: string;
  /** The DOM container element for this root */
  container: HTMLElement;
  /** Optional component ID for resource tracking */
  componentId?: string;
}

/**
 * A runtime hook that can be registered to execute at key lifecycle points
 * in the React root manager. All methods are optional — implement only
 * the lifecycle points you need.
 */
export interface RuntimeHook {
  /** Human-readable name for debugging/logging */
  name: string;

  /**
   * Called once, when the very first React root is created.
   * Use this for one-time global setup (e.g., injecting global styles,
   * creating MutationObservers, etc.).
   */
  OnFirstRootCreated?: (context: RootHookContext) => void;

  /**
   * Called after every root is created (including the first).
   */
  OnRootCreated?: (context: RootHookContext) => void;

  /**
   * Called after a root is unmounted.
   */
  OnRootUnmounted?: (rootId: string) => void;

  /**
   * Called during runtime shutdown (ReactRootManager.cleanup()).
   * Use this to disconnect observers, remove injected DOM elements,
   * clear timers, etc.
   */
  OnCleanup?: () => void;
}
