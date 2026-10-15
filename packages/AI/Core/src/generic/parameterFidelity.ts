/**
 * @fileoverview Vendor parameter fidelity: the parameters a caller configured versus the ones a driver
 * would send. A strict call refuses when they differ instead of letting a driver silently replace a value.
 * @module @memberjunction/ai
 */
import type { AIErrorInfo } from './errorTypes';
import type { ChatParams } from './chat.types';

/** The parameters fidelity covers, as configured or as a driver would send them. `null` = not configured / not sent. */
export interface VendorCallParameters {
    /** The vendor API model name the call sends (`ChatParams.model`, e.g. `gemini-2.5-flash`) — not an `MJ: AI Models` ID. */
    VendorModelName: string;
    Temperature: number | null;
    MaxTokens: number | null;
    Seed: number | null;
}

/** Whether a call sends what was configured. */
export type ParameterFidelity =
    | { Status: 'sent-unchanged'; Sent: VendorCallParameters }
    | { Status: 'refused'; Configured: VendorCallParameters; WouldSend: VendorCallParameters };

/** Reading configured parameters and comparing them with what a driver would send. */
export class VendorParameterFidelity {
    /** The parameters a caller configured on a chat request (0 is a configured value). */
    public static ConfiguredParameters(params: ChatParams): VendorCallParameters {
        return { VendorModelName: params.model, Temperature: params.temperature ?? null, MaxTokens: params.maxOutputTokens ?? null, Seed: params.seed ?? null };
    }

    /** `refused` when any configured (non-null) value would be sent differently or not at all. */
    public static CompareParameters(configured: VendorCallParameters, wouldSend: VendorCallParameters): ParameterFidelity {
        const keys: Array<'Temperature' | 'MaxTokens' | 'Seed'> = ['Temperature', 'MaxTokens', 'Seed'];
        const differs = keys.some((k) => configured[k] !== null && configured[k] !== wouldSend[k]);
        return differs ? { Status: 'refused', Configured: configured, WouldSend: wouldSend } : { Status: 'sent-unchanged', Sent: wouldSend };
    }

    /** "temperature 0, maxTokens none, seed 42" — for error messages. */
    public static Describe(p: VendorCallParameters): string {
        const v = (x: number | null): string => (x === null ? 'none' : String(x));
        return `temperature ${v(p.Temperature)}, maxTokens ${v(p.MaxTokens)}, seed ${v(p.Seed)}`;
    }
}

/** Thrown by a strict call the driver would not send as configured. Classified Fatal, so failover and retries stop. */
export class ParameterFidelityError extends Error {
    /** The classification `ErrorAnalyzer` reads from a thrown error; `error` stays unset so it serializes. */
    public readonly errorInfo: AIErrorInfo;  // case-violation-ok-legacy-back-compat: ErrorAnalyzer.carriedErrorInfo reads this exact shipped name (BaseResult.errorInfo)
    constructor(public readonly Fidelity: Extract<ParameterFidelity, { Status: 'refused' }>, driverName: string) {
        super(`${driverName} would not send the configured parameters for model '${Fidelity.Configured.VendorModelName}': ` +
            `configured ${VendorParameterFidelity.Describe(Fidelity.Configured)}; would send ${VendorParameterFidelity.Describe(Fidelity.WouldSend)}.`);
        this.name = 'ParameterFidelityError';
        this.errorInfo = {
            errorType: 'VendorValidationError', severity: 'Fatal', canFailover: false,
            context: { provider: driverName, errorName: 'ParameterFidelityError' },
        };
    }
}
