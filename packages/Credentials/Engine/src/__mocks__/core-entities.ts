/**
 * Mock for @memberjunction/core-entities
 * Used by Credentials/Engine unit tests
 */

import { vi } from 'vitest';

class MockBaseEntity {
    protected _data: Record<string, unknown> = {};

    constructor(data?: Record<string, unknown>) {
        if (data) {
            Object.assign(this._data, data);
        }
    }

    get ID(): string { return this._data.ID as string || ''; }
    set ID(value: string) { this._data.ID = value; }

    Save = vi.fn().mockResolvedValue(true);
    NewRecord = vi.fn();
    Load = vi.fn().mockResolvedValue(true);
    GetAll(): Record<string, unknown> { return { ...this._data }; }
}

export class MJCredentialEntity extends MockBaseEntity {
    get Name(): string { return this._data.Name as string || ''; }
    set Name(value: string) { this._data.Name = value; }

    get CredentialTypeID(): string { return this._data.CredentialTypeID as string || ''; }
    set CredentialTypeID(value: string) { this._data.CredentialTypeID = value; }

    get Values(): string { return this._data.Values as string || ''; }
    set Values(value: string) { this._data.Values = value; }

    get IsActive(): boolean { return this._data.IsActive as boolean ?? true; }
    set IsActive(value: boolean) { this._data.IsActive = value; }

    get IsDefault(): boolean { return this._data.IsDefault as boolean ?? false; }
    set IsDefault(value: boolean) { this._data.IsDefault = value; }

    get ExpiresAt(): Date | null { return this._data.ExpiresAt as Date | null ?? null; }
    set ExpiresAt(value: Date | null) { this._data.ExpiresAt = value; }

    get LastUsedAt(): Date | null { return this._data.LastUsedAt as Date | null ?? null; }
    set LastUsedAt(value: Date | null) { this._data.LastUsedAt = value; }

    get LastValidatedAt(): Date | null { return this._data.LastValidatedAt as Date | null ?? null; }
    set LastValidatedAt(value: Date | null) { this._data.LastValidatedAt = value; }

    get CategoryID(): string | null { return this._data.CategoryID as string | null ?? null; }
    set CategoryID(value: string | null) { this._data.CategoryID = value; }

    get IconClass(): string | null { return this._data.IconClass as string | null ?? null; }
    set IconClass(value: string | null) { this._data.IconClass = value; }

    get Description(): string | null { return this._data.Description as string | null ?? null; }
    set Description(value: string | null) { this._data.Description = value; }
}

export class MJCredentialTypeEntity extends MockBaseEntity {
    get Name(): string { return this._data.Name as string || ''; }
    set Name(value: string) { this._data.Name = value; }

    get FieldSchema(): string { return this._data.FieldSchema as string || ''; }
    set FieldSchema(value: string) { this._data.FieldSchema = value; }

    get ValidationEndpoint(): string | null { return this._data.ValidationEndpoint as string | null ?? null; }
    set ValidationEndpoint(value: string | null) { this._data.ValidationEndpoint = value; }
}

export class MJCredentialCategoryEntity extends MockBaseEntity {
    get Name(): string { return this._data.Name as string || ''; }
    set Name(value: string) { this._data.Name = value; }
}

export class MJAuditLogEntity extends MockBaseEntity {
    get UserID(): string { return this._data.UserID as string || ''; }
    set UserID(value: string) { this._data.UserID = value; }

    get AuditLogTypeID(): string { return this._data.AuditLogTypeID as string || ''; }
    set AuditLogTypeID(value: string) { this._data.AuditLogTypeID = value; }

    get Status(): string { return this._data.Status as string || ''; }
    set Status(value: string) { this._data.Status = value; }

    get Description(): string { return this._data.Description as string || ''; }
    set Description(value: string) { this._data.Description = value; }

    get Details(): string { return this._data.Details as string || ''; }
    set Details(value: string) { this._data.Details = value; }

    get EntityID(): string | null { return this._data.EntityID as string | null ?? null; }
    set EntityID(value: string | null) { this._data.EntityID = value; }

    get RecordID(): string | null { return this._data.RecordID as string | null ?? null; }
    set RecordID(value: string | null) { this._data.RecordID = value; }
}
