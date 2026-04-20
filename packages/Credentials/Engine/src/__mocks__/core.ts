/**
 * Mock for @memberjunction/core
 * Used by Credentials/Engine unit tests
 */

import { vi } from 'vitest';

// ---- Configurable state ----
let mockLoadData: Map<string, unknown[]> = new Map();
let mockEntityObjects: Map<string, unknown> = new Map();
let mockEntityInfos: Array<{ ID: string; Name: string }> = [
    { ID: 'cred-entity-id', Name: 'MJ: Credentials' }
];

export function setMockLoadData(entityName: string, data: unknown[]): void {
    mockLoadData.set(entityName, data);
}

export function setMockEntityObject(entityName: string, entity: unknown): void {
    mockEntityObjects.set(entityName, entity);
}

export function setMockEntityInfos(infos: Array<{ ID: string; Name: string }>): void {
    mockEntityInfos = infos;
}

export function clearAllCredentialMocks(): void {
    mockLoadData.clear();
    mockEntityObjects.clear();
    mockEntityInfos = [{ ID: 'cred-entity-id', Name: 'MJ: Credentials' }];
    _instances.clear();
}

// ---- BaseEngine singleton tracking ----
const _instances: Map<string, unknown> = new Map();

export function resetEngineInstances(): void {
    _instances.clear();
}

// ---- BaseEngine ----
export class BaseEngine<_T> {
    protected _isLoaded = false;

    protected async Load(
        params: Array<{ PropertyName: string; EntityName: string; CacheLocal?: boolean }>,
        _provider?: unknown,
        _forceRefresh?: boolean,
        _contextUser?: unknown
    ): Promise<void> {
        for (const param of params) {
            const data = mockLoadData.get(param.EntityName) || [];
            (this as Record<string, unknown>)[param.PropertyName] = data;
        }
        this._isLoaded = true;
    }

    protected TryThrowIfNotLoaded(): void {
        if (!this._isLoaded) {
            throw new Error('Engine has not been initialized. Call Config() first.');
        }
    }

    protected async RefreshItem(_propertyName: string): Promise<void> {
        // No-op in mock
    }

    protected static getInstance<U>(): U {
        const key = this.name || 'default';
        if (!_instances.has(key)) {
            _instances.set(key, new (this as unknown as new () => U)());
        }
        return _instances.get(key) as U;
    }
}

// ---- Metadata ----
export class Metadata {
    async GetEntityObject<T>(entityName: string, _contextUser?: unknown): Promise<T> {
        const entity = mockEntityObjects.get(entityName);
        if (entity) {
            return entity as T;
        }
        return {
            ID: 'mock-entity-id',
            Save: vi.fn().mockResolvedValue(true),
            Load: vi.fn().mockResolvedValue(true),
            GetAll: vi.fn().mockReturnValue({}),
            NewRecord: vi.fn(),
        } as unknown as T;
    }

    EntityByName(name: string): { ID: string; Name: string } | undefined {
        return mockEntityInfos.find(e =>
            e.Name?.trim().toLowerCase() === name.trim().toLowerCase()
        );
    }
}

// ---- UserInfo ----
export class UserInfo {
    ID: string;
    Name: string;
    Email: string;
    IsActive: boolean;

    constructor(_provider?: unknown, data?: Record<string, unknown>) {
        this.ID = (data?.ID as string) || 'mock-user-id';
        this.Name = (data?.Name as string) || 'Mock User';
        this.Email = (data?.Email as string) || 'mock@example.com';
        this.IsActive = (data?.IsActive as boolean) ?? true;
    }
}

// ---- Types ----
export type IMetadataProvider = {
    Entities: Array<{ ID: string; Name: string }>;
};

export type EntityInfo = {
    ID: string;
    Name: string;
};

// ---- Logging ----
export const LogError = vi.fn();
export const LogStatus = vi.fn();
