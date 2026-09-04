/**
 * When streaming fails, `DiscoverFieldsViaFetch` degrades to single-sample `DiscoverFields` — the
 * catalog's own description, which carries NO observed widths. From the outside that is
 * indistinguishable from a successful sample: the method returns fields and the pipeline records a
 * discovery that succeeded. So an object silently keeps whatever width its catalog guessed, and
 * every longer value it later receives is dropped at sync time as a string overflow.
 *
 * These tests pin that the degradation is announced, and that announcing it can never make a
 * degraded discovery into a failed one.
 */
import { describe, it, expect, vi } from 'vitest';
import { BaseIntegrationConnector } from '../BaseIntegrationConnector.js';
import type { ExternalFieldSchema } from '../BaseIntegrationConnector.js';

const catalogField = (Name: string): ExternalFieldSchema => ({
    Name, Label: Name, DataType: 'string', IsRequired: false, AllowsNull: true,
    MaxLength: undefined, IsPrimaryKey: false, IsUniqueKey: false, IsReadOnly: false, IsForeignKey: false,
} as unknown as ExternalFieldSchema);

type Host = Pick<BaseIntegrationConnector, 'DiscoverFieldsViaFetch'>;

/** A connector whose stream throws, so every call takes the fallback path. */
function makeConnector(): { host: Host; discoverFields: ReturnType<typeof vi.fn> } {
    const discoverFields = vi.fn(async () => [catalogField('id'), catalogField('note')]);
    const host = Object.create(BaseIntegrationConnector.prototype) as Host;
    Object.assign(host, {
        DiscoverFields: discoverFields,
        DiscoverySampleRecordStream: async function* () { throw new Error('stream unavailable'); },
    });
    return { host, discoverFields };
}

const companyIntegration = { ID: 'CI-1', Configuration: null } as never;
const contextUser = { ID: 'U-1' } as never;

describe('DiscoverFieldsViaFetch — the fallback announces itself', () => {
    it('calls OnFallback with the underlying error when streaming fails', async () => {
        const { host, discoverFields } = makeConnector();
        const onFallback = vi.fn();

        const fields = await host.DiscoverFieldsViaFetch(companyIntegration, 'Invoice', contextUser, { OnFallback: onFallback });

        expect(onFallback).toHaveBeenCalledTimes(1);
        expect(String((onFallback.mock.calls[0] as unknown[])[0])).toContain('stream unavailable');
        // The fallback still happened — this is a notification, not a behaviour change.
        expect(discoverFields).toHaveBeenCalledTimes(1);
        expect(fields.map((f) => f.Name)).toEqual(['id', 'note']);
    });

    it('behaves exactly as before when no notifier is supplied', async () => {
        const { host, discoverFields } = makeConnector();

        const fields = await host.DiscoverFieldsViaFetch(companyIntegration, 'Invoice', contextUser);

        expect(discoverFields).toHaveBeenCalledTimes(1);
        expect(fields.map((f) => f.Name)).toEqual(['id', 'note']);
    });

    it('a throwing notifier cannot turn a degraded discovery into a failed one', async () => {
        const { host, discoverFields } = makeConnector();
        const onFallback = vi.fn(() => { throw new Error('emitter is closed'); });

        const fields = await host.DiscoverFieldsViaFetch(companyIntegration, 'Invoice', contextUser, { OnFallback: onFallback });

        expect(fields.map((f) => f.Name)).toEqual(['id', 'note']);
        expect(discoverFields).toHaveBeenCalledTimes(1);
    });

    it('does not fire when streaming succeeds', async () => {
        const onFallback = vi.fn();
        const host = Object.create(BaseIntegrationConnector.prototype) as Host;
        Object.assign(host, {
            DiscoverFields: vi.fn(async () => [catalogField('id')]),
            DiscoverySampleRecordStream: async function* () { yield { id: '1', note: 'x'.repeat(900) }; },
        });

        await host.DiscoverFieldsViaFetch(companyIntegration, 'Invoice', contextUser, { OnFallback: onFallback });

        expect(onFallback).not.toHaveBeenCalled();
    });
});
