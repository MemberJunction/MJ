import { describe, it, expect, vi } from 'vitest';
import {
    BaseEventArgs,
    CancelableEventArgs,
    AfterEventArgs,
} from '../component-events';
import { ComponentCallbacks } from '../runtime-types';
import { ComponentEvent } from '../component-props-events';
import { CompositeKey } from '@memberjunction/core';

describe('BaseEventArgs', () => {
    it('should create with timestamp and sourceComponentName', () => {
        const now = new Date();
        const args: BaseEventArgs = {
            timestamp: now,
            sourceComponentName: 'TestGrid',
        };
        expect(args.timestamp).toBe(now);
        expect(args.sourceComponentName).toBe('TestGrid');
    });

    it('should allow sourceComponentName to be omitted', () => {
        const args: BaseEventArgs = {
            timestamp: new Date(),
        };
        expect(args.sourceComponentName).toBeUndefined();
    });
});

describe('CancelableEventArgs', () => {
    it('should extend BaseEventArgs with cancel flag defaulting to false', () => {
        const args: CancelableEventArgs = {
            timestamp: new Date(),
            cancel: false,
        };
        expect(args.cancel).toBe(false);
        expect(args.cancelReason).toBeUndefined();
        expect(args.timestamp).toBeInstanceOf(Date);
    });

    it('should allow container to set cancel=true with a reason', () => {
        const args: CancelableEventArgs = {
            timestamp: new Date(),
            sourceComponentName: 'EditForm',
            cancel: false,
        };

        // Simulate container cancelling
        args.cancel = true;
        args.cancelReason = 'User does not have permission';

        expect(args.cancel).toBe(true);
        expect(args.cancelReason).toBe('User does not have permission');
    });

    it('should support cancellation round-trip: component fires, container cancels, component reads', async () => {
        const args: CancelableEventArgs = {
            timestamp: new Date(),
            cancel: false,
        };

        // Simulate async container handler that cancels
        const containerHandler = async (eventArgs: CancelableEventArgs): Promise<void> => {
            eventArgs.cancel = true;
            eventArgs.cancelReason = 'Validation failed';
        };

        await containerHandler(args);

        // Component reads the result after await
        expect(args.cancel).toBe(true);
        expect(args.cancelReason).toBe('Validation failed');
    });
});

describe('AfterEventArgs', () => {
    it('should extend BaseEventArgs with success, errorMessage, and durationMs', () => {
        const args: AfterEventArgs = {
            timestamp: new Date(),
            success: true,
            durationMs: 42,
        };
        expect(args.success).toBe(true);
        expect(args.errorMessage).toBeUndefined();
        expect(args.durationMs).toBe(42);
    });

    it('should represent a failed operation with errorMessage', () => {
        const args: AfterEventArgs = {
            timestamp: new Date(),
            sourceComponentName: 'DataGrid',
            success: false,
            errorMessage: 'Network timeout',
            durationMs: 5000,
        };
        expect(args.success).toBe(false);
        expect(args.errorMessage).toBe('Network timeout');
        expect(args.sourceComponentName).toBe('DataGrid');
    });
});

describe('ComponentCallbacks.NotifyEvent', () => {
    it('should fire when called and receive eventName and args', async () => {
        const handler = vi.fn().mockResolvedValue(undefined);

        const callbacks: ComponentCallbacks = {
            OpenEntityRecord: vi.fn(),
            CreateSimpleNotification: vi.fn(),
            RegisterMethod: vi.fn(),
            NotifyEvent: handler,
        };

        const args: BaseEventArgs = {
            timestamp: new Date(),
            sourceComponentName: 'MyChart',
        };

        await callbacks.NotifyEvent('dataLoaded', args);

        expect(handler).toHaveBeenCalledOnce();
        expect(handler).toHaveBeenCalledWith('dataLoaded', args);
    });

    it('should accept CancelableEventArgs as the args parameter', async () => {
        const handler = vi.fn().mockImplementation(async (_eventName: string, eventArgs: BaseEventArgs) => {
            // Container sets cancel on a cancelable event
            if ('cancel' in eventArgs) {
                (eventArgs as CancelableEventArgs).cancel = true;
            }
        });

        const callbacks: ComponentCallbacks = {
            OpenEntityRecord: vi.fn(),
            CreateSimpleNotification: vi.fn(),
            RegisterMethod: vi.fn(),
            NotifyEvent: handler,
        };

        const args: CancelableEventArgs = {
            timestamp: new Date(),
            cancel: false,
        };

        await callbacks.NotifyEvent('beforeSave', args);

        expect(args.cancel).toBe(true);
    });
});

describe('ComponentEvent metadata', () => {
    it('should support cancelable field', () => {
        const event: ComponentEvent = {
            name: 'beforeSave',
            description: 'Fires before a save operation',
            cancelable: true,
        };
        expect(event.cancelable).toBe(true);
    });

    it('should support pairedEvent field', () => {
        const event: ComponentEvent = {
            name: 'beforeSave',
            description: 'Fires before a save operation',
            cancelable: true,
            pairedEvent: 'afterSave',
        };
        expect(event.pairedEvent).toBe('afterSave');
    });

    it('should default cancelable and pairedEvent to undefined when not set', () => {
        const event: ComponentEvent = {
            name: 'click',
            description: 'Simple click event',
        };
        expect(event.cancelable).toBeUndefined();
        expect(event.pairedEvent).toBeUndefined();
    });
});
