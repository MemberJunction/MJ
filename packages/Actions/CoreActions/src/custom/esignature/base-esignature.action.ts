import { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { SignatureEngine } from '@memberjunction/esignature/server';

/**
 * Shared base for the thin eSignature Actions. Each concrete Action extracts its params, ensures the
 * {@link SignatureEngine} is configured, and delegates to it — Actions are the boundary, the engine
 * is the substance (per CLAUDE.md Actions philosophy).
 */
export abstract class BaseSignatureAction extends BaseAction {
    /** Lazy-config the engine with the action's context user. */
    protected async ensureEngine(params: RunActionParams): Promise<SignatureEngine> {
        await SignatureEngine.Instance.Config(false, params.ContextUser);
        return SignatureEngine.Instance;
    }

    /** Case-insensitive string param lookup; returns undefined when absent/blank. */
    protected getStringParam(params: RunActionParams, name: string): string | undefined {
        const param = params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value == null) {
            return undefined;
        }
        const value = String(param.Value).trim();
        return value.length > 0 ? value : undefined;
    }

    /** Case-insensitive boolean param with default. */
    protected getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const param = params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value == null) {
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
     * Case-insensitive param that may already be an object/array or a JSON string. Returns undefined
     * when absent or unparseable.
     */
    protected getObjectParam<T>(params: RunActionParams, name: string): T | undefined {
        const param = params.Params.find((p) => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value == null) {
            return undefined;
        }
        if (typeof param.Value === 'string') {
            try {
                return JSON.parse(param.Value) as T;
            } catch {
                return undefined;
            }
        }
        return param.Value as T;
    }

    /** Push an output param onto the action's param list. */
    protected addOutput(params: RunActionParams, name: string, value: unknown): void {
        const out = new ActionParam();
        out.Name = name;
        out.Type = 'Output';
        out.Value = value;
        params.Params.push(out);
    }
}
