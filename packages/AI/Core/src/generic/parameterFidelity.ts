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
    /**
     * The parameters a caller configured on a chat request. `??` on purpose: 0 is a configured value (the bug
     * this guards against was a driver's `||` turning a configured 0 into its default).
     */
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

/**
 * Thrown by a strict call the driver would not send as configured. Classified Fatal, so `AIPromptRunner`'s failover
 * stops at the first refusal (a Fatal error ends the candidate loop) and the prompt fails with this message.
 */
export class ParameterFidelityError extends Error {
    /**
     * The classification ErrorAnalyzer reads from a thrown error (`carriedErrorInfo`, shipped on `next`), so the runner
     * classifies the refusal by this object rather than by its message. Keeps the shipped `errorInfo` name that contract reads (a shipped shape keeps its casing). It leaves
     * `error` unset: this object is the error, and a reference back to it makes the classification circular, so the
     * runner's error log (`JSON.stringify` of its metadata) would throw a TypeError in place of the refusal.
     */
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
