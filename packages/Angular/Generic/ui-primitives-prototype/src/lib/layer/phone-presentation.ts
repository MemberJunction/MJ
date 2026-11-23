/**
 * Phone presentation for `mj-layer` (plans/ui-foundation/WAVE_0_SPEC.md Section 6.2.1).
 *
 * On phones, anything people choose from or fill in opens as a bottom sheet. Anything read at a
 * glance, or tied to a field being typed into, stays anchored.
 */

/** How a layer presents on a phone viewport. `anchored` means "as on desktop". */
export type MJPhonePresentation = 'sheet' | 'full-screen' | 'anchored';

/** A phone held upright: the narrow screen. */
export const MJ_NARROW_PHONE_QUERY = '(max-width: 640px)';

/**
 * A phone held sideways: a short touch screen. The touch pointer keeps a short desktop browser
 * window, used with a mouse, out of phone mode.
 */
export const MJ_SHORT_PHONE_QUERY = '(max-height: 480px) and (pointer: coarse)';

/**
 * The phone breakpoint: narrow, or short and touch. `MJLayerService` checks it when a layer opens
 * and marks the overlay pane; the stylesheet styles that mark, so CSS and behavior never disagree.
 */
export const MJ_PHONE_VIEWPORT_QUERY = `${MJ_NARROW_PHONE_QUERY}, ${MJ_SHORT_PHONE_QUERY}`;

const KIND_DEFAULTS: Readonly<Record<string, MJPhonePresentation>> = {
  dialog: 'sheet',
  menu: 'sheet',
  popover: 'sheet',
  tooltip: 'anchored',
  toast: 'anchored',
};

/** True when the value is one of the three phone presentations (attribute input can be any string). */
export function IsPhonePresentation(value: string | null | undefined): value is MJPhonePresentation {
  return value === 'sheet' || value === 'full-screen' || value === 'anchored';
}

/**
 * Returns the explicit presentation when it is a known value, otherwise the default for the kind.
 * A `sheet` kind depends on its placement: a bottom sheet already is one, and a side sheet fills
 * the screen, since on a phone it would leave a strip of page beside it. Kinds the library does
 * not ship (the open `Kind` axis) default to `anchored`, i.e. unchanged.
 */
export function ResolvePhonePresentation(
  kind: string,
  requested: string | null | undefined,
  placement?: string
): MJPhonePresentation {
  if (IsPhonePresentation(requested)) {
    return requested;
  }
  if (kind === 'sheet') {
    return placement === 'bottom' ? 'sheet' : 'full-screen';
  }
  return KIND_DEFAULTS[kind] ?? 'anchored';
}
