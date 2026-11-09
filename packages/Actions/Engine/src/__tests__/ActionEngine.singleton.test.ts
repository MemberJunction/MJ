/**
 * ActionEngineServer is a BaseSingleton: running its constructor again returns the live instance.
 * The host's registrations must survive that. This file uses the real BaseSingleton, which
 * ActionEngine.test.ts replaces with a mock. A registration cannot be undone, so this file holds a
 * single test; Vitest gives each test file its own module graph and so its own singleton.
 */
import { describe, it, expect, vi } from 'vitest';
import { ActionEngineServer, type AdhocSQLAuthorizer, type ReadOnlyProviderFactory } from '../generic/ActionEngine';

describe('ActionEngineServer host registrations', () => {
    it('keeps them when the constructor runs again on the live singleton', async () => {
        const engine = ActionEngineServer.Instance;
        const authorizer: AdhocSQLAuthorizer = { Authorize: () => null, ClampTimeoutSeconds: () => 30 };
        const factory = vi.fn<ReadOnlyProviderFactory>().mockResolvedValue(null);
        engine.SetAdhocSQLAuthorizer(authorizer);
        engine.SetReadOnlyProviderFactory(factory);

        const constructedAgain: unknown = Reflect.construct(ActionEngineServer, []);

        expect(constructedAgain).toBe(engine);
        expect(engine.AdhocSQLAuthorizer).toBe(authorizer);
        await engine.GetReadOnlyProvider();
        expect(factory).toHaveBeenCalledTimes(1);
        expect(() => engine.SetAdhocSQLAuthorizer({ Authorize: () => null, ClampTimeoutSeconds: () => 600 })).toThrow(/already registered/i);
        expect(() => engine.SetReadOnlyProviderFactory(async () => null)).toThrow(/already registered/i);
    });
});
