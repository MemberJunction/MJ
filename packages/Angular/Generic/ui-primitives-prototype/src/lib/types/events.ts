/** Cancelable before-transition event payload for Wave 0 primitives. */
export interface MJBeforeEvent<TReason extends string = string> {
  Cancel: boolean;
  Reason?: TReason;
}

/** Post-transition event payload for Wave 0 primitives. */
export interface MJAfterEvent<TReason extends string = string> {
  Reason?: TReason;
}

/** Dispatches a bubbling, composed CustomEvent for Angular Elements / non-Angular hosts. */
export function dispatchMJElementEvent<TDetail>(
  host: HTMLElement,
  name: string,
  detail: TDetail
): void {
  host.dispatchEvent(
    new CustomEvent<TDetail>(name, {
      bubbles: true,
      composed: true,
      detail,
    })
  );
}
