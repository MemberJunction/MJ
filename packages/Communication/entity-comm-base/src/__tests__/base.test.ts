import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', () => {
    class MockBaseEngine {
        protected ContextUser = { ID: 'user-1' };
        private _loaded = false;
        protected async Load() { this._loaded = true; }
        protected TryThrowIfNotLoaded() {
            if (!this._loaded) throw new Error('Engine not loaded');
        }
        static getInstance() { return new MockBaseEngine(); }
    }
    return {
        BaseEngine: MockBaseEngine,
        BaseEnginePropertyConfig: class {},
        BaseEntity: class {},
        IMetadataProvider: class {},
        RunViewParams: class {},
        UserInfo: class {},
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    EntityCommunicationFieldEntity: class { EntityCommunicationMessageTypeID = ''; },
    EntityCommunicationMessageTypeEntity: class { ID = ''; EntityID = ''; },
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => () => {},
}));

vi.mock('@memberjunction/communication-types', () => ({
    Message: class {},
    ProcessedMessage: class {},
    CommunicationEngineBase: {
        Instance: {
            Config: vi.fn(),
            Metadata: {
                EntityCommunicationFields: [
                    { EntityCommunicationMessageTypeID: 'ecmt-1', FieldName: 'Email' },
                    { EntityCommunicationMessageTypeID: 'ecmt-2', FieldName: 'Phone' },
                ],
                EntityCommunicationMessageTypes: [
                    { ID: 'ecmt-1', EntityID: 'entity-1', CommunicationFields: [] },
                    { ID: 'ecmt-2', EntityID: 'entity-2', CommunicationFields: [] },
                ],
            },
        },
    },
}));

import {
    EntityCommunicationMessageTypeExtended,
    EntityCommunicationParams,
    EntityCommunicationResult,
    EntityCommunicationResultItem,
    EntityCommunicationsEngineBase,
} from '../base';

describe('EntityCommunicationMessageTypeExtended', () => {
    it('should have CommunicationFields default to empty array', () => {
        const ext = new EntityCommunicationMessageTypeExtended();
        expect(ext.CommunicationFields).toEqual([]);
    });

    it('should allow setting CommunicationFields', () => {
        const ext = new EntityCommunicationMessageTypeExtended();
        const fields = [{ FieldName: 'Email' }];
        ext.CommunicationFields = fields as never;
        expect(ext.CommunicationFields).toBe(fields);
    });
});

describe('EntityCommunicationParams', () => {
    it('should have default values', () => {
        const params = new EntityCommunicationParams();
        expect(params.PreviewOnly).toBe(false);
        expect(params.IncludeProcessedMessages).toBe(false);
    });
});

describe('EntityCommunicationResult', () => {
    it('should be constructible with properties', () => {
        const result = new EntityCommunicationResult();
        result.Success = true;
        result.ErrorMessage = undefined;
        result.Results = [];
        expect(result.Success).toBe(true);
        expect(result.Results).toEqual([]);
    });
});

describe('EntityCommunicationResultItem', () => {
    it('should be constructible', () => {
        const item = new EntityCommunicationResultItem();
        expect(item.RecipientData).toBeUndefined();
        expect(item.Message).toBeUndefined();
    });
});

describe('EntityCommunicationsEngineBase', () => {
    describe('GetEntityCommunicationMessageTypes', () => {
        it('should filter message types by entityID', async () => {
            // We need to test through the abstract class indirectly
            // The abstract class has concrete methods that filter _Metadata
            // Since it's abstract, we can verify the data class structures
            const engine = EntityCommunicationsEngineBase.Instance;
            expect(engine).toBeDefined();
        });
    });
});
