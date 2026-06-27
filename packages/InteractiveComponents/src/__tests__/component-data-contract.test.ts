import { describe, it, expect } from 'vitest';
import { DataSnapshot } from '@memberjunction/core';
import { ComponentObject } from '../runtime-types';

describe('ComponentObject data contract', () => {
    describe('getCurrentDataState', () => {
        it('should return a DataSnapshot when the component has data', () => {
            const snapshot: DataSnapshot = {
                Timestamp: new Date().toISOString(),
                Data: { rows: [{ id: 1, name: 'Test' }], totalCount: 1 },
                Description: 'Test data snapshot',
                Version: 1,
            };

            const obj: ComponentObject = {
                component: () => null,
                getCurrentDataState: () => snapshot,
            };

            const result = obj.getCurrentDataState!();
            expect(result).toBeDefined();
            expect(result!.Timestamp).toBe(snapshot.Timestamp);
            expect(result!.Data).toEqual({ rows: [{ id: 1, name: 'Test' }], totalCount: 1 });
            expect(result!.Description).toBe('Test data snapshot');
            expect(result!.Version).toBe(1);
        });
    });

    describe('setDataState', () => {
        it('should accept a DataSnapshot and return boolean', () => {
            let capturedSnapshot: DataSnapshot | undefined;

            const obj: ComponentObject = {
                component: () => null,
                setDataState: (snapshot: DataSnapshot) => {
                    capturedSnapshot = snapshot;
                    return true;
                },
            };

            const snapshot: DataSnapshot = {
                Timestamp: new Date().toISOString(),
                Data: { filter: 'active', page: 2 },
            };

            const result = obj.setDataState!(snapshot);
            expect(result).toBe(true);
            expect(capturedSnapshot).toBeDefined();
            expect(capturedSnapshot!.Data).toEqual({ filter: 'active', page: 2 });
        });
    });

    describe('getCurrentDataState returning undefined', () => {
        it('should return undefined when the component has no data', () => {
            const obj: ComponentObject = {
                component: () => null,
                getCurrentDataState: () => undefined,
            };

            const result = obj.getCurrentDataState!();
            expect(result).toBeUndefined();
        });
    });

    describe('optional methods', () => {
        it('should allow ComponentObject without getCurrentDataState or setDataState', () => {
            const obj: ComponentObject = {
                component: () => null,
            };

            expect(obj.getCurrentDataState).toBeUndefined();
            expect(obj.setDataState).toBeUndefined();
        });
    });
});
