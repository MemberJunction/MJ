import { UUIDsEqual } from '@memberjunction/global';
import type { HandoffOfferChange, HandoffOfferInfo, HandoffOfferStatus } from '@memberjunction/graphql-dataprovider';

/**
 * Pure view logic for the conversation-offers list: countdowns, ordering and merging a live change into the list. No Angular, no
 * network: the component feeds it the offers it holds and the current time, so every rule here is testable in isolation.
 *
 * **Time.** `ExpiresAt` comes from the server's clock and `nowMs` from the browser's. A skewed browser clock can show a pending offer
 * as expired a little early (or late); that is only presentation, because the server decides whether an accept is honoured.
 */

/** One offer as the list shows it. */
export interface ConversationOfferRow {
  Offer: HandoffOfferInfo;
  /** Whole seconds until the offer lapses; 0 once it has. */
  SecondsRemaining: number;
  /** True while the person can still accept or decline it (pending, and not yet lapsed). */
  IsActionable: boolean;
  /** `m:ss` while actionable, otherwise empty. */
  CountdownLabel: string;
  /** What to show in place of the buttons once it is no longer actionable ("Accepted", "Expired", ...). */
  StatusLabel: string;
}

/** Offers that resolved this long ago are dropped from the list on the client (the server keeps them a little while longer). */
export const RESOLVED_OFFER_DISPLAY_MS = 5 * 60 * 1000;

/** Whole seconds from `nowMs` until `expiresAt` (ISO-8601), never negative; 0 when the timestamp does not parse. */
export function SecondsRemaining(expiresAt: string, nowMs: number): number {
  const expiresMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresMs)) {
    return 0;
  }
  return Math.max(0, Math.ceil((expiresMs - nowMs) / 1000));
}

/** `m:ss`, for example `0:45` or `1:05`. */
export function FormatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

/** Human label for a status that is no longer actionable. */
export function StatusLabelFor(status: HandoffOfferStatus, lapsed: boolean): string {
  switch (status) {
    case 'Accepted':
      return 'Accepted';
    case 'Declined':
      return 'Declined';
    case 'Cancelled':
      return 'The caller is no longer waiting';
    case 'Expired':
      return 'Expired';
    case 'Pending':
      return lapsed ? 'Expired' : '';
    default:
      return status;
  }
}

/** Builds the row for one offer at `nowMs`. */
export function BuildOfferRow(offer: HandoffOfferInfo, nowMs: number): ConversationOfferRow {
  const seconds = SecondsRemaining(offer.ExpiresAt, nowMs);
  const lapsed = seconds <= 0;
  const isActionable = offer.Status === 'Pending' && !lapsed;
  return {
    Offer: offer,
    SecondsRemaining: seconds,
    IsActionable: isActionable,
    CountdownLabel: isActionable ? FormatCountdown(seconds) : '',
    StatusLabel: isActionable ? '' : StatusLabelFor(offer.Status, lapsed),
  };
}

/**
 * The rows to show: actionable offers first (soonest to lapse first, since that is the one to answer), then everything else newest
 * first. Offers that resolved more than {@link RESOLVED_OFFER_DISPLAY_MS} ago are left out.
 */
export function BuildOfferRows(offers: readonly HandoffOfferInfo[], nowMs: number): ConversationOfferRow[] {
  const rows = offers.map((offer) => BuildOfferRow(offer, nowMs)).filter((row) => row.IsActionable || !isStale(row, nowMs));
  const actionable = rows.filter((row) => row.IsActionable).sort((a, b) => Date.parse(a.Offer.ExpiresAt) - Date.parse(b.Offer.ExpiresAt));
  const resolved = rows.filter((row) => !row.IsActionable).sort((a, b) => Date.parse(b.Offer.CreatedAt) - Date.parse(a.Offer.CreatedAt));
  return [...actionable, ...resolved];
}

function isStale(row: ConversationOfferRow, nowMs: number): boolean {
  const reference = Date.parse(row.Offer.ExpiresAt);
  return !Number.isNaN(reference) && nowMs - reference > RESOLVED_OFFER_DISPLAY_MS;
}

/** True when at least one offer can still be answered at `nowMs`. */
export function HasActionableOffer(offers: readonly HandoffOfferInfo[], nowMs: number): boolean {
  return offers.some((offer) => BuildOfferRow(offer, nowMs).IsActionable);
}

/** Merges a live change into the list: replaces the offer with the same id, or adds it. Returns a new array. */
export function ApplyOfferChange(offers: readonly HandoffOfferInfo[], change: HandoffOfferChange): HandoffOfferInfo[] {
  const index = offers.findIndex((offer) => UUIDsEqual(offer.OfferID, change.Offer.OfferID));
  if (index < 0) {
    return [...offers, change.Offer];
  }
  const next = [...offers];
  next[index] = change.Offer;
  return next;
}

/** Returns the list with one offer's status replaced (used after this console accepted or declined it). */
export function WithOfferStatus(offers: readonly HandoffOfferInfo[], offerID: string, status: HandoffOfferStatus): HandoffOfferInfo[] {
  return offers.map((offer) => (UUIDsEqual(offer.OfferID, offerID) ? { ...offer, Status: status } : offer));
}
