import { describe, it, expect } from 'vitest';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { BaseEntity } from '../generic/baseEntity';
import { UserInfo } from '../generic/securityInfo';
import { IMetadataProvider, RunViewResult } from '../generic/interfaces';

/**
 * Test subclass that exposes protected methods for testing.
 */
class TestEngine extends BaseEngine<TestEngine> {
    public _items: BaseEntity[] = [];

    public async Config(_forceRefresh?: boolean, _contextUser?: UserInfo, _provider?: IMetadataProvider): Promise<void> {
        // no-op for tests — we set arrays directly
    }

    /**
     * Exposes protected HandleSingleViewResult for direct testing.
     */
    public HandleSingleViewResultForTest(config: BaseEnginePropertyConfig, result: RunViewResult): void {
        this.HandleSingleViewResult(config, result);
    }
}

function makeSuccessResult(data: unknown[]): RunViewResult {
    return {
        Success: true,
        Results: data,
        RowCount: data.length,
        TotalRowCount: data.length,
        ExecutionTime: 10,
        ErrorMessage: '',
    };
}

function makeFailureResult(errorMessage: string): RunViewResult {
    return {
        Success: false,
        Results: [],
        RowCount: 0,
        TotalRowCount: 0,
        ExecutionTime: 5,
        ErrorMessage: errorMessage,
    };
}

describe('BaseEngine — Per-Property Error Tracking', () => {
    describe('HandleSingleViewResult', () => {
        it('should track successful loads in _dataMap with loadedSuccessfully=true', () => {
            const engine = new TestEngine();
            const config = new BaseEnginePropertyConfig({ PropertyName: '_items', EntityName: 'Items' });
            const mockData = [{ ID: '1', Name: 'Test' }];
            const result = makeSuccessResult(mockData);

            engine.HandleSingleViewResultForTest(config, result);

            expect(engine.PropertyLoadedSuccessfully('_items')).toBe(true);
        });

        it('should set the property value on the engine when load succeeds', () => {
            const engine = new TestEngine();
            const config = new BaseEnginePropertyConfig({ PropertyName: '_items', EntityName: 'Items' });
            const mockData = [{ ID: '1' }] as unknown as BaseEntity[];
            const result = makeSuccessResult(mockData);

            engine.HandleSingleViewResultForTest(config, result);

            expect(engine._items).toEqual(mockData);
        });

        it('should track failed loads in _dataMap with loadedSuccessfully=false', () => {
            const engine = new TestEngine();
            const config = new BaseEnginePropertyConfig({ PropertyName: '_items', EntityName: 'Items' });
            const result = makeFailureResult('RangeError: Invalid time value');

            engine.HandleSingleViewResultForTest(config, result);

            expect(engine.PropertyLoadedSuccessfully('_items')).toBe(false);
        });

        it('should NOT set the property value on the engine when load fails', () => {
            const engine = new TestEngine();
            engine._items = [{ ID: 'existing' } as unknown as BaseEntity];
            const config = new BaseEnginePropertyConfig({ PropertyName: '_items', EntityName: 'Items' });
            const result = makeFailureResult('Server error');

            engine.HandleSingleViewResultForTest(config, result);

            // Property should retain its original value (not overwritten with empty)
            expect(engine._items).toEqual([{ ID: 'existing' }]);
        });
    });

    describe('PropertyLoadedSuccessfully', () => {
        it('should return false for a property that was never loaded', () => {
            const engine = new TestEngine();
            expect(engine.PropertyLoadedSuccessfully('_nonExistent')).toBe(false);
        });

        it('should return true after a successful load', () => {
            const engine = new TestEngine();
            const config = new BaseEnginePropertyConfig({ PropertyName: '_items', EntityName: 'Items' });
            engine.HandleSingleViewResultForTest(config, makeSuccessResult([{ ID: '1' }]));

            expect(engine.PropertyLoadedSuccessfully('_items')).toBe(true);
        });

        it('should return false after a failed load', () => {
            const engine = new TestEngine();
            const config = new BaseEnginePropertyConfig({ PropertyName: '_items', EntityName: 'Items' });
            engine.HandleSingleViewResultForTest(config, makeFailureResult('Timeout'));

            expect(engine.PropertyLoadedSuccessfully('_items')).toBe(false);
        });

        it('should reflect the latest load status when re-loaded', () => {
            const engine = new TestEngine();
            const config = new BaseEnginePropertyConfig({ PropertyName: '_items', EntityName: 'Items' });

            // First load fails
            engine.HandleSingleViewResultForTest(config, makeFailureResult('Error'));
            expect(engine.PropertyLoadedSuccessfully('_items')).toBe(false);

            // Retry succeeds
            engine.HandleSingleViewResultForTest(config, makeSuccessResult([{ ID: '1' }]));
            expect(engine.PropertyLoadedSuccessfully('_items')).toBe(true);
        });
    });

    describe('AllPropertiesLoadedSuccessfully', () => {
        it('should return false when no properties have been loaded', () => {
            const engine = new TestEngine();
            expect(engine.AllPropertiesLoadedSuccessfully).toBe(false);
        });

        it('should return true when all loaded properties succeeded', () => {
            const engine = new TestEngine();
            const config1 = new BaseEnginePropertyConfig({ PropertyName: '_items', EntityName: 'Items' });
            const config2 = new BaseEnginePropertyConfig({ PropertyName: '_other', EntityName: 'Other' });

            engine.HandleSingleViewResultForTest(config1, makeSuccessResult([{ ID: '1' }]));
            engine.HandleSingleViewResultForTest(config2, makeSuccessResult([{ ID: '2' }]));

            expect(engine.AllPropertiesLoadedSuccessfully).toBe(true);
        });

        it('should return false when any loaded property failed', () => {
            const engine = new TestEngine();
            const config1 = new BaseEnginePropertyConfig({ PropertyName: '_items', EntityName: 'Items' });
            const config2 = new BaseEnginePropertyConfig({ PropertyName: '_other', EntityName: 'Other' });

            engine.HandleSingleViewResultForTest(config1, makeSuccessResult([{ ID: '1' }]));
            engine.HandleSingleViewResultForTest(config2, makeFailureResult('Cache timestamp error'));

            expect(engine.AllPropertiesLoadedSuccessfully).toBe(false);
        });
    });
});
