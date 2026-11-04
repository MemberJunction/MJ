import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import type { BaseEntity, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJFileStorageProviderEntity } from '@memberjunction/core-entities';
import { MJGlobal, UUIDMap, UUIDsEqual } from '@memberjunction/global';
import { FileStorageBase, FileStorageEngine, LocalFileSystemStorage, type GetObjectParams } from '@memberjunction/storage';
import type { IEntityFactory } from '../../training/types';

/**
 * Storage and `MJ: Files` fakes for the Predictive Studio storage tests: an in-memory storage account behind a driver
 * registered under its own `ServerDriverKey`, a provider-row list served through `FileStorageEngine`, and an `MJ: Files`
 * table that is both the entity factory and the metadata provider whose `RunView` reads it. Every storage call and row
 * write is appended to one shared log, so a test can assert the order of operations across the two.
 */

/** One in-memory storage account: the objects it holds and the switches a test flips. */
export class MemoryStorageAccount {
  public readonly Objects = new Map<string, Uint8Array>();
  public Configured = true;
  public Initializations = 0;
  public RefusePut = false;
  public RefuseDelete = false;
  constructor(public readonly Name: string, private readonly log: string[]) {}

  /** Appends an operation to the shared log. */
  public Record(entry: string): void {
    this.log.push(`${this.Name}.${entry}`);
  }

  /** Empties the account and restores the defaults. */
  public Reset(): void {
    this.Objects.clear();
    this.Configured = true;
    this.Initializations = 0;
    this.RefusePut = false;
    this.RefuseDelete = false;
  }
}

/** Registers a driver under `driverKey` whose objects live in `account`. Call once per key per test file. */
export function RegisterMemoryStorage(driverKey: string, account: MemoryStorageAccount): void {
  class MemoryStorage extends LocalFileSystemStorage {
    public override async initialize(): Promise<void> {
      account.Initializations += 1;
    }
    public override get IsConfigured(): boolean {
      return account.Configured;
    }
    public override async PutObject(objectName: string, data: Buffer): Promise<boolean> {
      account.Record(`put ${objectName}`);
      if (account.RefusePut) return false;
      account.Objects.set(objectName, new Uint8Array(data));
      return true;
    }
    public override async GetObject(params: GetObjectParams): Promise<Buffer> {
      const key = params.fullPath || '';
      account.Record(`get ${key}`);
      const bytes = account.Objects.get(key);
      if (!bytes) throw new Error(`${account.Name}: no object ${key}`);
      return Buffer.from(bytes);
    }
    public override async DeleteObject(objectName: string): Promise<boolean> {
      account.Record(`delete ${objectName}`);
      if (account.RefuseDelete) return false;
      account.Objects.delete(objectName);
      return true;
    }
    public override async ObjectExists(objectName: string): Promise<boolean> {
      return account.Objects.has(objectName);
    }
  }
  MJGlobal.Instance.ClassFactory.Register(FileStorageBase, MemoryStorage, driverKey);
}

/** A `MJ: File Storage Providers` row for a fake driver. */
export function ProviderRow(id: string, name: string, serverDriverKey: string, isActive = false): MJFileStorageProviderEntity {
  return { ID: id, Name: name, ServerDriverKey: serverDriverKey, IsActive: isActive } as unknown as MJFileStorageProviderEntity;
}

/** Serves `rows` as `FileStorageEngine`'s providers (the shared vitest config restores the spies after each test). */
export function ServeStorageProviders(rows: MJFileStorageProviderEntity[]): void {
  vi.spyOn(FileStorageEngine.Instance, 'Config').mockResolvedValue();
  vi.spyOn(FileStorageEngine.Instance, 'Providers', 'get').mockReturnValue(rows);
  vi.spyOn(FileStorageEngine.Instance, 'GetProviderById').mockImplementation((id: string) => rows.find((p) => UUIDsEqual(p.ID, id)));
}

/** A stored `MJ: Files` row. */
export interface FakeFileRecord {
  ID: string;
  Name: string;
  ContentType: string | null;
  ProviderID: string;
  ProviderKey: string | null;
  Status: string;
  Description: string | null;
}

/** A `MJ: Files` entity stand-in over a {@link FakeFilesTable}. */
export class FakeFileEntity implements FakeFileRecord {
  public ID = '';
  public Name = '';
  public ContentType: string | null = null;
  public ProviderID = '';
  public ProviderKey: string | null = null;
  public Status = '';
  public Description: string | null = null;
  public LatestResult: { CompleteMessage: string } | null = null;
  constructor(private readonly table: FakeFilesTable) {}

  public async Save(): Promise<boolean> {
    if (this.table.SaveFailure !== null) {
      this.LatestResult = { CompleteMessage: this.table.SaveFailure };
      return false;
    }
    this.ID ||= randomUUID().toUpperCase();
    this.table.Log.push(`row.save ${this.ID}`);
    this.table.Rows.Set(this.ID, { ID: this.ID, Name: this.Name, ContentType: this.ContentType, ProviderID: this.ProviderID, ProviderKey: this.ProviderKey, Status: this.Status, Description: this.Description });
    return true;
  }

  public async Load(id: string): Promise<boolean> {
    const row = this.table.Rows.Get(id);
    if (!row) return false;
    Object.assign(this, row);
    return true;
  }

  public async Delete(): Promise<boolean> {
    this.table.Log.push(`row.delete ${this.ID}`);
    if (this.table.DeleteFailure !== null) {
      this.LatestResult = { CompleteMessage: this.table.DeleteFailure };
      return false;
    }
    this.table.Rows.Delete(this.ID);
    return true;
  }
}

/** An in-memory `MJ: Files` table: the entity factory that writes it and the metadata provider that reads it. */
export class FakeFilesTable implements IEntityFactory {
  public readonly Rows = new UUIDMap<FakeFileRecord>();
  /** When set, every row save fails with this message. */
  public SaveFailure: string | null = null;
  /** When set, every row delete fails with this message. */
  public DeleteFailure: string | null = null;
  constructor(public readonly Log: string[]) {}

  public async getEntityObject<T extends BaseEntity>(entityName: string, _contextUser?: UserInfo): Promise<T> {
    if (entityName !== 'MJ: Files') throw new Error(`unexpected entity ${entityName}`);
    return new FakeFileEntity(this) as unknown as T;
  }

  /** Stores a row directly (a row an earlier writer left). */
  public Insert(row: FakeFileRecord): void {
    this.Rows.Set(row.ID, row);
  }

  /** A metadata provider whose `RunView` answers `MJ: Files` reads by `ID='…'`. */
  public Provider(): IMetadataProvider {
    return {
      RunView: async (params: { ExtraFilter?: string }) => {
        const id = /ID='([^']*)'/.exec(params.ExtraFilter || '')?.[1] || '';
        const row = this.Rows.Get(id);
        return { Success: true, Results: row ? [{ ID: row.ID, ProviderID: row.ProviderID, ProviderKey: row.ProviderKey }] : [] };
      },
    } as unknown as IMetadataProvider;
  }
}

/** A server-side acting user. */
export const TestUser = { ID: 'C1D2E3F4-0000-4000-8000-000000000001', Email: 'ps-storage@example.com' } as unknown as UserInfo;
