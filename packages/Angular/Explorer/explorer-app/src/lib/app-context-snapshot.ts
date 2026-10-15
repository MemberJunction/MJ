import type { AppContextSnapshot } from '@memberjunction/ai-core-plus';
import type { BaseResourceComponent } from '@memberjunction/ng-shared';

/**
 * A component that reports agent context through `SetAgentContext`, or whose tab the shell attaches and
 * detaches: a resource component. Only its tab id is read.
 */
export type AgentContextReporter = Pick<BaseResourceComponent, 'getTabId'>;

/** The context a surface reported through `SetAgentContext`, and the component that reported it. */
interface ReportedSurfaceContext {
  Reporter: AgentContextReporter;
  Context: Record<string, unknown>;
}

/**
 * Returns the rebuilt snapshot with the attached surface's context as its `AdditionalContext`, so the
 * context a surface reported through `SetAgentContext` survives an app or nav change while the surface's
 * tab is attached, as its tool manifest does. Every other field comes from the rebuilt snapshot.
 *
 * @param rebuilt The snapshot just built from the current app and nav state.
 * @param surfaceContext The attached surface's context ({@link SurfaceContextTracker.Context}), or
 *   undefined when no attached surface reported one.
 * @returns A new snapshot. The input is not changed.
 */
export function CarryAdditionalContext(rebuilt: AppContextSnapshot, surfaceContext: Record<string, unknown> | undefined): AppContextSnapshot {
  return { ...rebuilt, AdditionalContext: surfaceContext };
}

/**
 * True when `reporter` reported for `component`'s tab: it is the component, or both show in the same tab,
 * as the child dashboard of a resource wrapper does.
 */
function reportsForTab(reporter: AgentContextReporter, component: AgentContextReporter): boolean {
  if (reporter === component) return true;
  const tabId = reporter.getTabId();
  return tabId !== '' && tabId === component.getTabId();
}

/**
 * Keeps the context of the surface whose tab is attached. A surface's report sets it. When the tab of the
 * surface that reported it is detached, the context is cleared and kept for that tab's reattach, which
 * restores it in place of any other tab's context, as NavigationService does with the tab's tools.
 */
export class SurfaceContextTracker {
  private current: ReportedSurfaceContext | null = null;
  /** The last context each component reported. */
  private readonly lastReports = new WeakMap<AgentContextReporter, Record<string, unknown>>();
  /** The context to restore for each detached component, or null when it has none. */
  private readonly detached = new WeakMap<AgentContextReporter, ReportedSurfaceContext | null>();

  /** The context of the attached surface, or undefined when it reported none. */
  public get Context(): Record<string, unknown> | undefined {
    return this.current?.Context;
  }

  /**
   * Records a context a surface reported. A component whose tab is detached keeps it for its reattach,
   * so a late report from a tab the user left does not replace the open surface's context.
   * @returns True when the attached surface's context changed.
   */
  public Report(reporter: AgentContextReporter, context: Record<string, unknown>): boolean {
    this.lastReports.set(reporter, context);
    const reported: ReportedSurfaceContext = { Reporter: reporter, Context: context };
    if (this.detached.has(reporter)) {
      this.detached.set(reporter, reported);
      return false;
    }
    this.current = reported;
    return true;
  }

  /**
   * Handles the detach of `component`'s tab. When the context is the one reported for that tab, it is
   * cleared and kept for the tab's reattach. Otherwise the context stays, and the reattach restores the
   * last context `component` reported itself.
   * @returns True when the attached surface's context changed.
   */
  public Detach(component: AgentContextReporter): boolean {
    const current = this.current;
    if (current && reportsForTab(current.Reporter, component)) {
      this.detached.set(component, current);
      this.current = null;
      return true;
    }
    const lastReport = this.lastReports.get(component);
    this.detached.set(component, lastReport ? { Reporter: component, Context: lastReport } : null);
    return false;
  }

  /**
   * Handles the reattach of `component`'s tab: its context, kept at its detach, replaces the current one.
   * A tab that had no context clears the current one. A component that was not detached changes nothing.
   * @returns True when the attached surface's context changed.
   */
  public Reattach(component: AgentContextReporter): boolean {
    if (!this.detached.has(component)) return false;
    const restored = this.detached.get(component) ?? null;
    this.detached.delete(component);
    const changed = restored !== this.current;
    this.current = restored;
    return changed;
  }
}
