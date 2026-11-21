/**
 * @fileoverview Regression test: a failed connect must release the transport it created, otherwise a
 * stdio server's child process (or an SSE/HTTP stream) is orphaned on every failed attempt.
 */

import { describe, it, expect, vi } from 'vitest';
import { MCPClientManager } from '../MCPClientManager.js';

interface Closable {
    close: ReturnType<typeof vi.fn>;
    transport?: Closable;
}

type ReleaseFn = (connectionId: string, client: Closable | undefined, transport: Closable | undefined) => Promise<void>;

function newManager(): { release: ReleaseFn; connections: Map<string, { transport: Closable }> } {
    const manager = new MCPClientManager();
    const internals = manager as unknown as {
        releaseUnregisteredTransport: ReleaseFn;
        connections: Map<string, { transport: Closable }>;
    };
    return { release: internals.releaseUnregisteredTransport.bind(manager), connections: internals.connections };
}

const closable = (): Closable => ({ close: vi.fn().mockResolvedValue(undefined) });

describe('MCPClientManager.releaseUnregisteredTransport', () => {
    it('closes the client (which closes its transport) when the connection never registered', async () => {
        const { release } = newManager();
        const client = closable();
        const transport = closable();

        await release('conn-1', client, transport);

        expect(client.close).toHaveBeenCalledTimes(1);
        expect(transport.close).not.toHaveBeenCalled();
    });

    it('closes the transport directly when the client was never built', async () => {
        const { release } = newManager();
        const transport = closable();

        await release('conn-1', undefined, transport);

        expect(transport.close).toHaveBeenCalledTimes(1);
    });

    it('closes the transport directly when client.transport is undefined (e.g. connect failed before attaching)', async () => {
        const { release } = newManager();
        const client: Closable = { close: vi.fn().mockResolvedValue(undefined), transport: undefined };
        const transport = closable();

        await release('conn-1', client, transport);

        expect(client.close).not.toHaveBeenCalled();
        expect(transport.close).toHaveBeenCalledTimes(1);
    });

    it('leaves a registered connection alone — disconnect() owns it', async () => {
        const { release, connections } = newManager();
        const client = closable();
        const transport = closable();
        connections.set('conn-1', { transport });

        await release('conn-1', client, transport);

        expect(client.close).not.toHaveBeenCalled();
        expect(transport.close).not.toHaveBeenCalled();
    });

    it('does nothing when no transport was created', async () => {
        const { release } = newManager();
        await expect(release('conn-1', undefined, undefined)).resolves.toBeUndefined();
    });

    it('swallows close errors so the original connect failure is the one surfaced', async () => {
        const { release } = newManager();
        const client: Closable = { close: vi.fn().mockRejectedValue(new Error('already closed')) };

        await expect(release('conn-1', client, closable())).resolves.toBeUndefined();
    });
});
