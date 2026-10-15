/**
 * Whether an action can run in this process: the class key it resolves to, and whether a class is registered under
 * that key in the real class factory.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { BaseAction } from '../generic/BaseAction';
import { ActionEngineServer } from '../generic/ActionEngine';
import type { MJActionEntity } from '@memberjunction/core-entities';

/** An action class registered under a key no real action uses. */
@RegisterClass(BaseAction, 'ClassLoadedTest.Registered')
class RegisteredTestAction extends BaseAction {
    protected async InternalRunAction(): Promise<{ Success: boolean; ResultCode: string }> {
        return { Success: true, ResultCode: 'SUCCESS' };
    }
}

type ActionFields = Pick<MJActionEntity, 'Type' | 'DriverClass' | 'Name'>;

function action(fields: Partial<ActionFields> & Pick<ActionFields, 'Name'>): ActionFields {
    return { Type: 'Custom', DriverClass: null, ...fields };
}

describe('ActionEngineServer class availability', () => {
    const engine = ActionEngineServer.Instance;

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keys the class by DriverClass, falling back to the action name', () => {
        expect(engine.ActionClassKey(action({ Name: 'Sync Activities', DriverClass: 'Common.SyncActivities' }))).toBe('Common.SyncActivities');
        expect(engine.ActionClassKey(action({ Name: 'Create Entity' }))).toBe('Create Entity');
    });

    it('is false for a class-based action whose class is not registered', () => {
        expect(engine.IsActionClassLoaded(action({ Name: 'Sync Activities', DriverClass: 'ClassLoadedTest.Missing' }))).toBe(false);
    });

    it('is true for a class-based action whose class is registered', () => {
        expect(engine.IsActionClassLoaded(action({ Name: 'Sync Activities', DriverClass: 'ClassLoadedTest.Registered' }))).toBe(true);
    });

    it('is true for a Runtime action without looking up a class', () => {
        const lookup = vi.spyOn(MJGlobal.Instance.ClassFactory, 'GetRegistration');
        expect(engine.IsActionClassLoaded(action({ Name: 'Score Lead', Type: 'Runtime', DriverClass: 'ClassLoadedTest.Missing' }))).toBe(true);
        expect(lookup).not.toHaveBeenCalled();
    });

    it('reports a bare class key as registered only when the class factory has it', () => {
        expect(engine.IsActionClassRegistered('ClassLoadedTest.Missing')).toBe(false);
        expect(engine.IsActionClassRegistered('ClassLoadedTest.Registered')).toBe(true);
    });
});
