/**
 * When no vendor of a realtime model has a key, `SelectRealtimeVendorForModel` logs the model and,
 * per vendor considered, what it needed — instead of returning null with no trace. The usual cause is
 * a host whose LLM key works but whose realtime driver class (`OpenAIRealtime`) has none.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIEngine } from '@memberjunction/aiengine';
import { MJAIModelEntityExtended } from '@memberjunction/ai-core-plus';
import { MJAIModelVendorEntity, MJAIVendorEntity } from '@memberjunction/core-entities';

const h = vi.hoisted(() => ({ statusLines: [] as string[] }));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogStatus: (message: string) => { h.statusLines.push(message); } };
});

import { SelectRealtimeVendorForModel, RealtimeKeyFixHint, RealtimeEnvKeyName } from '../realtime/realtime-vendor-resolution';

const MODEL_ID = 'model-gpt-realtime';

function vendorRow(driverClass: string, vendorID: string, priority: number): MJAIModelVendorEntity {
    return {
        ID: `mv-${driverClass}`, ModelID: MODEL_ID, DriverClass: driverClass, Priority: priority,
        Status: 'Active', VendorID: vendorID, APIName: 'gpt-realtime',
    } as unknown as MJAIModelVendorEntity;
}

beforeEach(() => {
    h.statusLines.length = 0;
    vi.spyOn(AIEngine.Instance, 'ModelVendors', 'get').mockReturnValue([
        vendorRow('OpenAIRealtime', 'vendor-openai', 9),
        vendorRow('AzureRealtime', 'vendor-azure', 1),
    ]);
    vi.spyOn(AIEngine.Instance, 'ModelsByID', 'get').mockReturnValue(
        new Map([[MODEL_ID, { ID: MODEL_ID, Name: 'GPT Realtime' } as unknown as MJAIModelEntityExtended]]),
    );
    vi.spyOn(AIEngine.Instance, 'VendorsByID', 'get').mockReturnValue(
        new Map([
            ['vendor-openai', { ID: 'vendor-openai', Name: 'OpenAI' } as unknown as MJAIVendorEntity],
            ['vendor-azure', { ID: 'vendor-azure', Name: 'Azure' } as unknown as MJAIVendorEntity],
        ]),
    );
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('SelectRealtimeVendorForModel diagnostics', () => {
    it('logs each vendor considered and every credential tier it could have used', () => {
        expect(SelectRealtimeVendorForModel(MODEL_ID, () => undefined)).toBeNull();

        expect(h.statusLines).toHaveLength(1);
        const line = h.statusLines[0];
        expect(line).toContain("Realtime model 'GPT Realtime' was skipped");
        expect(line).toContain("vendor 'OpenAI' (DriverClass OpenAIRealtime)");
        expect(line).toContain("vendor 'Azure' (DriverClass AzureRealtime)");
        expect(line).toContain('AI Credential Binding');
        expect(line).toContain("apiKeys entry for driver class 'OpenAIRealtime'");
        expect(line).toContain('AI_VENDOR_API_KEY__OPENAIREALTIME');
        expect(line).toContain('AI_VENDOR_API_KEY__AZUREREALTIME');
    });

    it('under RuntimeOnly, names only the run\'s keys', () => {
        SelectRealtimeVendorForModel(MODEL_ID, () => undefined, 'RuntimeOnly');
        const line = h.statusLines[0];
        expect(line).toContain("apiKeys entry for driver class 'OpenAIRealtime'");
        expect(line).not.toContain('AI Credential Binding');
        expect(line).not.toContain('AI_VENDOR_API_KEY__');
    });

    it('logs nothing when a vendor is selected', () => {
        const selection = SelectRealtimeVendorForModel(MODEL_ID, (driverClass) => (driverClass === 'AzureRealtime' ? 'key' : undefined));
        expect(selection?.DriverClass).toBe('AzureRealtime');
        expect(h.statusLines).toEqual([]);
    });

    it('says when the model has no active vendor at all', () => {
        vi.spyOn(AIEngine.Instance, 'ModelVendors', 'get').mockReturnValue([]);
        expect(SelectRealtimeVendorForModel(MODEL_ID, () => 'key')).toBeNull();
        expect(h.statusLines[0]).toContain('no Active AI Model Vendor row');
    });
});

describe('RealtimeKeyFixHint', () => {
    it('names the binding, the default credential and the realtime env var', () => {
        const hint = RealtimeKeyFixHint();
        expect(hint).toContain('AI Credential Binding');
        expect(hint).toContain('default credential');
        expect(hint).toContain(RealtimeEnvKeyName('OpenAIRealtime'));
    });
});
