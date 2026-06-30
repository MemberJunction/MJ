/**
 * @module actions/base-predictive-studio.action
 *
 * Shared base for the four **Predictive Studio Actions** (plan §12 — the Action
 * boundary). Per CLAUDE.md "Actions are boundaries, not internal APIs", each
 * concrete action stays THIN: it extracts + validates its params, delegates to an
 * already-built engine service class (`TrainingEngine` / `MLModelInferenceProcessor`
 * / `ExperimentOrchestrator`), and maps the result back onto the action's
 * input/output params. No ML business logic lives in the actions.
 *
 * This base provides only the cross-cutting plumbing every Predictive Studio
 * action needs:
 *   - typed param extraction (string / boolean / number / JSON),
 *   - output-param emission,
 *   - a uniform `fail()` → {@link ActionResultSimple} mapping.
 *
 * The engine + its injected dependency bundle are NOT created here — each concrete
 * action exposes its own protected, overridable factory seam so unit tests can
 * substitute a mocked engine and in-memory deps with no live DB and no sidecar.
 */

import type { ActionResultSimple, RunActionParams, ActionParam } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/** A plain JSON object map parsed from a JSON-string or object-valued param. */
export type JsonObject = Record<string, unknown>;

/**
 * Abstract base carrying the param-extraction + result-mapping helpers shared by
 * every Predictive Studio action. Concrete actions implement `InternalRunAction`
 * and their own engine/deps factory seams.
 */
export abstract class BasePredictiveStudioAction extends BaseAction {
  // ----- parameter helpers ---------------------------------------------------

  /**
   * Read a string param (trimmed). Returns `undefined` when missing/empty so the
   * caller can branch on required-ness.
   */
  protected getStringParam(params: RunActionParams, name: string): string | undefined {
    const param = this.findParam(params, name);
    if (!param || param.Value === undefined || param.Value === null) {
      return undefined;
    }
    const value = String(param.Value).trim();
    return value.length > 0 ? value : undefined;
  }

  /**
   * Read a boolean param. Accepts native booleans and the usual truthy/falsey
   * string forms (`true/1/yes`, `false/0/no`); falls back to `defaultValue`.
   */
  protected getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
    const param = this.findParam(params, name);
    if (!param || param.Value === undefined || param.Value === null) {
      return defaultValue;
    }
    if (typeof param.Value === 'boolean') {
      return param.Value;
    }
    const value = String(param.Value).trim().toLowerCase();
    if (value === 'true' || value === '1' || value === 'yes') return true;
    if (value === 'false' || value === '0' || value === 'no') return false;
    return defaultValue;
  }

  /**
   * Read a numeric param. Returns `undefined` when missing or non-numeric so the
   * caller can apply its own default / required check.
   */
  protected getNumericParam(params: RunActionParams, name: string): number | undefined {
    const param = this.findParam(params, name);
    if (!param || param.Value === undefined || param.Value === null) {
      return undefined;
    }
    const parsed = Number(param.Value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  /**
   * Read a JSON-object param. Accepts either an object value or a JSON string that
   * parses to an object. Returns `undefined` when missing or not an object.
   */
  protected getJsonObjectParam(params: RunActionParams, name: string): JsonObject | undefined {
    const param = this.findParam(params, name);
    if (!param || param.Value === undefined || param.Value === null) {
      return undefined;
    }
    return this.coerceToObject(param.Value);
  }

  /** Locate a param by case-insensitive, whitespace-tolerant name. */
  protected findParam(params: RunActionParams, name: string): ActionParam | undefined {
    const target = name.trim().toLowerCase();
    return params.Params.find((p) => p.Name.trim().toLowerCase() === target);
  }

  /** Append (or overwrite) an output param on the run params. */
  protected addOutputParam(params: RunActionParams, name: string, value: unknown): void {
    const existing = this.findParam(params, name);
    if (existing) {
      existing.Value = value;
      existing.Type = existing.Type === 'Input' ? 'Both' : 'Output';
      return;
    }
    params.Params.push({ Name: name, Type: 'Output', Value: value });
  }

  // ----- result mapping ------------------------------------------------------

  /** Build a failure {@link ActionResultSimple}. */
  protected fail(resultCode: string, message: string): ActionResultSimple {
    return { Success: false, ResultCode: resultCode, Message: message };
  }

  /** Build a success {@link ActionResultSimple}, carrying the (mutated) params back. */
  protected ok(params: RunActionParams, message: string): ActionResultSimple {
    return { Success: true, ResultCode: 'SUCCESS', Message: message, Params: params.Params };
  }

  // ----- json helpers --------------------------------------------------------

  /** Coerce a param value (object or JSON string) into a plain object, or undefined. */
  private coerceToObject(value: unknown): JsonObject | undefined {
    if (typeof value === 'string') {
      try {
        const parsed: unknown = JSON.parse(value);
        return this.isPlainObject(parsed) ? parsed : undefined;
      } catch {
        return undefined;
      }
    }
    return this.isPlainObject(value) ? value : undefined;
  }

  private isPlainObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
