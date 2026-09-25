import type { EntityFormMode } from '@memberjunction/ng-base-forms';
import { FORM_MODE_QUERY_PARAM, ReadStandardFormQuery } from '@memberjunction/ng-shared';

/**
 * A record tab's form mode (MJ#4755) lives in its `form` query param, so the
 * URL, back/forward, re-focus and a cached component all see one value.
 * These are the decisions EntityRecordResource makes about it, kept pure so
 * the component stays a thin caller.
 */

/** The form mode a tab's query params ask for: `'standard'` only for `form=standard`. */
export function FormModeFromQueryParams(params: Record<string, string>): EntityFormMode {
  return ReadStandardFormQuery(params) ?? 'default';
}

/** The query-param patch that records `mode` on the tab (`null` removes the param). */
export function FormModeQueryParams(mode: EntityFormMode): Record<string, string | null> {
  return { [FORM_MODE_QUERY_PARAM]: mode === 'standard' ? 'standard' : null };
}

/** Whatever can switch a mounted form (SingleRecordComponent → the form host). */
export interface FormModeSwitcher {
  SwitchFormMode(mode: EntityFormMode): boolean;
}

/** Outcome of following a query-param change. */
export interface FormModeReconciliation {
  /** The mode now in effect. */
  Mode: EntityFormMode;
  /** Params to write back when the switch was refused, so the URL matches the screen; else null. */
  WriteBack: Record<string, string | null> | null;
}

/**
 * Follow the tab's query params. With a mounted form, switches through the
 * host's guarded `SwitchFormMode`; a refusal (unsaved work) keeps the live
 * mode and asks for a write-back. Without one (`switcher` null), the requested
 * mode is simply adopted — the input binding carries it to the host at mount.
 */
export function ReconcileFormMode(
  params: Record<string, string>,
  current: EntityFormMode,
  switcher: FormModeSwitcher | null
): FormModeReconciliation {
  const desired = FormModeFromQueryParams(params);
  if (desired === current) return { Mode: current, WriteBack: null };
  if (!switcher) return { Mode: desired, WriteBack: null };
  return switcher.SwitchFormMode(desired)
    ? { Mode: desired, WriteBack: null }
    : { Mode: current, WriteBack: FormModeQueryParams(current) };
}
