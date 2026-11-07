/**
 * @module lib/out-of-order
 *
 * Decides whether `mj migrate` lets Skyway apply versioned migrations older than the
 * database's highest applied version.
 *
 * Release lines make this a normal upgrade case: a fix backported to a patch line ships
 * byte-identical (same timestamp) on both lines, so a database upgraded from that line
 * has applied files that are newer than migrations it has never run. With `outOfOrder`
 * off, Skyway marks those older files IGNORED and refuses the whole run.
 *
 * Policy:
 * - `outOfOrder` set explicitly in the config file: honoured as written.
 * - Not set, and the run targets the core schema: enabled for this run when Skyway
 *   reports pending files older than the highest applied version; each one is logged.
 * - Not set, any other schema (Open Apps): left off, as before.
 *
 * Files at or below a baseline row in history are never affected: Skyway reports them
 * as ABOVE_BASELINE before it considers `outOfOrder`.
 */
import type { MigrationStatus } from '@memberjunction/skyway-core';

/** Inputs to {@link DecideOutOfOrder}. */
export interface OutOfOrderInputs {
  /** The `outOfOrder` value written in the config file, or undefined when it is not set. */
  ExplicitSetting: boolean | undefined;
  /** True when the run targets the core schema (`coreSchema`, normally `__mj`). */
  IsCoreSchema: boolean;
  /** Pending versioned migrations older than the highest applied version (see {@link FindOutOfOrderPending}). */
  OutOfOrderPending: readonly MigrationStatus[];
}

/** Result of {@link DecideOutOfOrder}. */
export interface OutOfOrderDecision {
  /** Value to hand Skyway as `Migrations.OutOfOrder` for this run. */
  OutOfOrder: boolean;
  /** True when the CLI turned `outOfOrder` on for this run (it was not set in config). */
  EnabledAutomatically: boolean;
  /** True when out-of-order files exist but the config explicitly sets `outOfOrder: false`. */
  BlockedByExplicitSetting: boolean;
}

/**
 * Reads `outOfOrder` from the raw (pre-Zod) config. The CLI's built-in defaults do not
 * include the key and the schema default is applied only at parse time, so the key is
 * present in the raw config only when the user's config file sets it.
 */
export function ReadExplicitOutOfOrder(rawConfig: Record<string, unknown> | undefined): boolean | undefined {
  const value = rawConfig?.outOfOrder;
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Pure: picks the versioned migrations Skyway would refuse as out of order. Skyway marks a
 * versioned file IGNORED only when it is unapplied, above any baseline floor, below the
 * highest applied version, and `outOfOrder` is off — exactly the files this run would skip.
 */
export function FindOutOfOrderPending(statusReport: readonly MigrationStatus[]): MigrationStatus[] {
  return statusReport.filter((s) => s.Type === 'versioned' && s.State === 'IGNORED');
}

/** Pure: applies the policy described in the module header. */
export function DecideOutOfOrder(inputs: OutOfOrderInputs): OutOfOrderDecision {
  const hasOutOfOrder = inputs.OutOfOrderPending.length > 0;
  if (inputs.ExplicitSetting !== undefined) {
    return {
      OutOfOrder: inputs.ExplicitSetting,
      EnabledAutomatically: false,
      BlockedByExplicitSetting: !inputs.ExplicitSetting && hasOutOfOrder,
    };
  }
  const enable = inputs.IsCoreSchema && hasOutOfOrder;
  return { OutOfOrder: enable, EnabledAutomatically: enable, BlockedByExplicitSetting: false };
}

/** True when the probe for out-of-order files is worth running (it costs one history read). */
export function ShouldProbeOutOfOrder(explicitSetting: boolean | undefined, isCoreSchema: boolean): boolean {
  // An explicit `true` needs no probe, and a non-core run never auto-enables. An explicit
  // `false` on the core schema is probed only to explain the refusal Skyway will report.
  return explicitSetting !== true && isCoreSchema;
}
