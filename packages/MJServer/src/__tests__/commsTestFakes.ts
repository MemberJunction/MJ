/**
 * Shared test doubles for the Communications V2 unit tests (`Comms*.test.ts`).
 *
 * Every double here has a failure mode that matches how the real system fails:
 *   - `RunView` never throws: it returns `{ Success: false, ErrorMessage }`.
 *   - `Save()` / `Load()` / `Delete()` return a boolean; a refused save leaves the reason in
 *     `LatestResult.CompleteMessage`. They throw only for infrastructure errors.
 *
 * The doubles live in one module-level object, {@link CommsFakes}, so a `vi.mock` factory and the
 * test that drives it reach the same state by importing this file.
 */
// Type-only: a `vi.mock('@memberjunction/core')` factory imports this file, so a runtime import of
// core from here would wait on that same factory and deadlock. Builders that need core at runtime
// live in commsTestUsers.ts.
import type { AuthorizationInfo, AuthorizationRoleInfo, IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';

// ─── Entities ────────────────────────────────────────────────────────────────

/** How a {@link FakeEntity} answers `Save`, `Load` and `Delete`. */
export interface FakeEntityBehaviour {
  /** `Save()` returns this. False also sets `LatestResult.CompleteMessage` to {@link SaveError}. */
  SaveSucceeds: boolean;
  SaveError: string;
  /** When set, `Save()` rejects with it: an infrastructure failure, the only case where Save throws. */
  SaveThrows?: Error;
  /** `Load()` returns this. */
  LoadSucceeds: boolean;
  DeleteSucceeds: boolean;
}

/** The members a {@link FakeEntity} adds to its field values. */
export interface FakeEntityMembers {
  ID: string | null;
  LatestResult: { CompleteMessage: string } | null;
  readonly Behaviour: FakeEntityBehaviour;
  /** How many times `Save()` was called, whatever it returned. */
  SaveCalls: number;
  LoadCalls: string[];
  DeleteCalls: number;
  /** The user the entity was created or loaded for, when it came from a {@link FakeMetadataProvider}. */
  ContextUser?: UserInfo;
  Save(): Promise<boolean>;
  Load(id: string): Promise<boolean>;
  Delete(): Promise<boolean>;
}

export type FakeEntity<T extends object> = T & FakeEntityMembers;

let nextGeneratedID = 1;

/** A fresh ID in UUID form, as a database assigns one on insert. */
export function NewFakeID(): string {
  const suffix = String(nextGeneratedID++).padStart(12, '0');
  return `fa4e0000-0000-4000-8000-${suffix}`;
}

/**
 * A plain object standing in for a `BaseEntity`: the given fields plus `Save`/`Load`/`Delete` that
 * return booleans the way the real ones do.
 *
 * @param fields the entity's field values
 * @param behaviour overrides for the default "everything succeeds" behaviour
 * @param onSaved called after each successful save, e.g. to add the row to an in-memory table
 */
export function MakeFakeEntity<T extends object>(
  fields: T,
  behaviour: Partial<FakeEntityBehaviour> = {},
  onSaved?: (entity: FakeEntity<T>) => void,
): FakeEntity<T> {
  const members: FakeEntityMembers = {
    ID: null,
    LatestResult: null,
    Behaviour: { SaveSucceeds: true, SaveError: 'save refused', LoadSucceeds: true, DeleteSucceeds: true, ...behaviour },
    SaveCalls: 0,
    LoadCalls: [],
    DeleteCalls: 0,
    async Save(): Promise<boolean> {
      entity.SaveCalls++;
      if (entity.Behaviour.SaveThrows) {
        throw entity.Behaviour.SaveThrows;
      }
      if (!entity.Behaviour.SaveSucceeds) {
        entity.LatestResult = { CompleteMessage: entity.Behaviour.SaveError };
        return false;
      }
      if (!entity.ID) {
        entity.ID = NewFakeID();
      }
      entity.LatestResult = { CompleteMessage: '' };
      onSaved?.(entity);
      return true;
    },
    async Load(id: string): Promise<boolean> {
      entity.LoadCalls.push(id);
      return entity.Behaviour.LoadSucceeds;
    },
    async Delete(): Promise<boolean> {
      entity.DeleteCalls++;
      if (!entity.Behaviour.DeleteSucceeds) {
        entity.LatestResult = { CompleteMessage: 'delete refused' };
      }
      return entity.Behaviour.DeleteSucceeds;
    },
  };
  const entity: FakeEntity<T> = Object.assign(members, fields);
  return entity;
}

// ─── RunView ─────────────────────────────────────────────────────────────────

/** What a fake view answers: the shape of a real `RunViewResult`, success or failure. */
export interface FakeViewResult {
  Success: boolean;
  Results: object[];
  RowCount: number;
  TotalRowCount: number;
  ExecutionTime: number;
  ErrorMessage: string;
}

export type FakeViewHandler = (params: RunViewParams) => object[] | FakeViewResult;

/** One recorded `RunView` call. */
export interface FakeViewCall {
  Params: RunViewParams;
  User: UserInfo | undefined;
  /** The provider `RunView.FromMetadataProvider` was given for this call. */
  Provider: object | undefined;
}

function isViewResult(value: object[] | FakeViewResult): value is FakeViewResult {
  return !Array.isArray(value);
}

/**
 * Serves `RunView` / `RunViews` from per-entity handlers and records every call. An entity with no
 * handler answers an empty success, like a view over an empty table.
 */
export class FakeViews {
  public Calls: FakeViewCall[] = [];
  private handlers = new Map<string, FakeViewHandler>();

  /** Serves `rows` (or whatever `handler` returns) for one entity. */
  public Serve(entityName: string, rowsOrHandler: object[] | FakeViewHandler): void {
    this.handlers.set(entityName, typeof rowsOrHandler === 'function' ? rowsOrHandler : () => rowsOrHandler);
  }

  /** Makes one entity's view fail the way a real one does: `Success: false`, no throw. */
  public Fail(entityName: string, errorMessage = 'Simulated RunView failure'): void {
    this.handlers.set(entityName, () => FakeViews.Failure(errorMessage));
  }

  public static Failure(errorMessage: string): FakeViewResult {
    return { Success: false, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: errorMessage };
  }

  public Reset(): void {
    this.Calls = [];
    this.handlers.clear();
  }

  public Run(params: RunViewParams, user: UserInfo | undefined, provider: object | undefined): FakeViewResult {
    this.Calls.push({ Params: params, User: user, Provider: provider });
    const handler = this.handlers.get(params.EntityName ?? '');
    const answer = handler ? handler(params) : [];
    if (isViewResult(answer)) {
      return answer;
    }
    const limited = params.MaxRows && params.MaxRows > 0 ? answer.slice(0, params.MaxRows) : answer;
    return { Success: true, Results: limited, RowCount: limited.length, TotalRowCount: answer.length, ExecutionTime: 0, ErrorMessage: '' };
  }

  /** The recorded calls for one entity. */
  public CallsFor(entityName: string): FakeViewCall[] {
    return this.Calls.filter((call) => call.Params.EntityName === entityName);
  }

  /**
   * The replacement for `RunView` in a `vi.mock('@memberjunction/core', ...)` factory: only the
   * static `FromMetadataProvider` the comms code uses.
   */
  public AsRunViewClass(): {
    FromMetadataProvider(provider?: object): {
      RunView(params: RunViewParams, user?: UserInfo): Promise<FakeViewResult>;
      RunViews(params: RunViewParams[], user?: UserInfo): Promise<FakeViewResult[]>;
    };
  } {
    return {
      FromMetadataProvider: (provider?: object) => ({
        RunView: async (params: RunViewParams, user?: UserInfo) => this.Run(params, user, provider),
        RunViews: async (params: RunViewParams[], user?: UserInfo) => params.map((p) => this.Run(p, user, provider)),
      }),
    };
  }
}

/** A view's `ExtraFilter` as text; the comms code only ever passes a plain string. */
export function FilterText(params: RunViewParams): string {
  return typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
}

/** The literal a filter compares `field` to (`Field='value'`), or undefined when the filter has no such term. */
export function FilterValue(params: RunViewParams, field: string): string | undefined {
  const match = new RegExp(`(?:^|[^A-Za-z])${field}='((?:[^']|'')*)'`).exec(FilterText(params));
  return match ? match[1].replace(/''/g, "'") : undefined;
}

// ─── Metadata provider ───────────────────────────────────────────────────────

/** One recorded `GetEntityObject` call. */
export interface FakeEntityRequest {
  EntityName: string;
  User: UserInfo | undefined;
  Entity: FakeEntity<object>;
}

export type FakeEntityFactory = (user: UserInfo | undefined) => FakeEntity<object>;

/**
 * Stands in for the request's metadata provider: `GetEntityObject` hands out fake entities from
 * per-entity factories, and `Authorizations` / `AuthorizationRoles` hold the authorization tree.
 */
export class FakeMetadataProvider {
  public readonly Name: string;
  public Authorizations: AuthorizationInfo[] = [];
  public AuthorizationRoles: AuthorizationRoleInfo[] = [];
  public Requests: FakeEntityRequest[] = [];
  private factories = new Map<string, FakeEntityFactory>();

  constructor(name = 'fake-provider') {
    this.Name = name;
  }

  /** Sets what `GetEntityObject(entityName)` returns; without one it returns an empty fake entity. */
  public Provide(entityName: string, factory: FakeEntityFactory): void {
    this.factories.set(entityName, factory);
  }

  public async GetEntityObject(entityName: string, user?: UserInfo): Promise<FakeEntity<object>> {
    const factory = this.factories.get(entityName);
    const entity = factory ? factory(user) : MakeFakeEntity({});
    entity.ContextUser = user;
    this.Requests.push({ EntityName: entityName, User: user, Entity: entity });
    return entity;
  }

  /** Every entity handed out for one entity name, in order. */
  public Created(entityName: string): FakeEntity<object>[] {
    return this.Requests.filter((r) => r.EntityName === entityName).map((r) => r.Entity);
  }

  /**
   * This double typed as the interface the code under test declares. The one place a test double
   * is cast: it implements only the members the comms code calls.
   */
  public AsProvider(): IMetadataProvider {
    return this as unknown as IMetadataProvider;
  }
}

/** The shared doubles a `vi.mock` factory and its test both reach. */
export const CommsFakes = {
  Views: new FakeViews(),
};
