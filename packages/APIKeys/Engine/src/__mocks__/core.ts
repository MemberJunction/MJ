/**
 * Mock for @memberjunction/core
 * Used in unit tests to avoid database dependencies
 *
 * Note: These mocks are simplified versions. Use type assertions (as UserInfo)
 * when passing to functions that expect the real UserInfo type.
 */

import { vi } from 'vitest';

// Use 'any' base to allow type compatibility with the real UserInfo
export class UserInfo {
    ID: string;
    Name: string;
    Email: string;
    IsActive: boolean;
    // Add common properties that real UserInfo has
    Type: string;
    Roles: string[];
    UserRoles: unknown[];
    ApplicationID: string | null;
    EmployeeID: string | null;

    constructor(data?: Record<string, unknown>) {
        this.ID = (data?.ID as string) || 'mock-user-id';
        this.Name = (data?.Name as string) || 'Mock User';
        this.Email = (data?.Email as string) || 'mock@example.com';
        this.IsActive = (data?.IsActive as boolean) ?? true;
        this.Type = (data?.Type as string) || 'User';
        this.Roles = (data?.Roles as string[]) || [];
        this.UserRoles = (data?.UserRoles as unknown[]) || [];
        this.ApplicationID = (data?.ApplicationID as string) || null;
        this.EmployeeID = (data?.EmployeeID as string) || null;
    }

    // Add common methods that real UserInfo has
    get UserRolesList(): string[] {
        return this.Roles;
    }
}

// Mock RunView results storage - tests can configure this
let mockRunViewResults: Map<string, { Success: boolean; Results: unknown[]; ErrorMessage?: string }> = new Map();

export function setMockRunViewResult(entityName: string, result: { Success: boolean; Results: unknown[]; ErrorMessage?: string }) {
    mockRunViewResults.set(entityName, result);
}

export function clearMockRunViewResults() {
    mockRunViewResults.clear();
}

export class RunView {
    async RunView<T>(params: {
        EntityName: string;
        ExtraFilter?: string;
        OrderBy?: string;
        ResultType?: string;
        Fields?: string[];
    }, _contextUser?: UserInfo): Promise<{ Success: boolean; Results: T[]; ErrorMessage?: string }> {
        const result = mockRunViewResults.get(params.EntityName);
        if (result) {
            return result as { Success: boolean; Results: T[]; ErrorMessage?: string };
        }
        // Default: return empty results
        return { Success: true, Results: [] };
    }

    async RunViews(params: Array<{
        EntityName: string;
        ExtraFilter?: string;
        OrderBy?: string;
        ResultType?: string;
    }>, _contextUser?: UserInfo): Promise<Array<{ Success: boolean; Results: unknown[] }>> {
        return params.map(p => {
            const result = mockRunViewResults.get(p.EntityName);
            return result || { Success: true, Results: [] };
        });
    }
}

// Mock entity storage - tests can configure created entities
let mockEntities: Map<string, unknown> = new Map();

export function setMockEntity(entityName: string, entity: unknown) {
    mockEntities.set(entityName, entity);
}

export function clearMockEntities() {
    mockEntities.clear();
}

export class Metadata {
    async GetEntityObject<T>(entityName: string, _contextUser?: UserInfo): Promise<T> {
        const entity = mockEntities.get(entityName);
        if (entity) {
            return entity as T;
        }
        // Return a basic mock entity with all commonly used methods
        const mockData: Record<string, unknown> = { ID: 'mock-entity-id' };
        return {
            ID: 'mock-entity-id',
            Save: vi.fn().mockResolvedValue(true),
            Load: vi.fn().mockResolvedValue(true),
            GetAll: vi.fn().mockReturnValue(mockData),
            NewRecord: vi.fn(),
            // Support setting any property
            set(key: string, value: unknown) { mockData[key] = value; }
        } as unknown as T;
    }
}

// Re-export for convenience
export { mockRunViewResults, mockEntities };
