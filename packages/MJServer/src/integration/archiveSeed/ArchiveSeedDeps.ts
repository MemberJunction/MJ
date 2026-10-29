/**
 * Injectable collaborators of the archive-seed job. Each one is an interface the job talks to, so
 * the job can be unit-tested with fakes; {@link DefaultArchiveSeedDeps} wires the real
 * implementations (in `ArchiveSeedRecordsDefault.ts` and `ArchiveSeedCollaboratorsDefault.ts`).
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ActionParam, ActionResult } from '@memberjunction/actions-base';
import type { MJExternalDataSourceEntity, MJRSUPendingWorkEntity } from '@memberjunction/core-entities';
import { IntegrationProgressEmitter, type IntegrationRunManifest } from '@memberjunction/integration-progress-artifacts';
import type { ArchiveSeedDiscoveredTable, ArchiveSeedWork } from '@memberjunction/schema-engine';
import { DefaultArchiveSeedRecords } from './ArchiveSeedRecordsDefault.js';
import {
  DefaultArchiveSeedActions,
  DefaultArchiveSeedApply,
  DefaultArchiveSeedDiscovery,
  DefaultArchiveSeedStore,
} from './ArchiveSeedCollaboratorsDefault.js';

export { MapSourceSchemaToTables } from './ArchiveSeedCollaboratorsDefault.js';

/** Values for a new `MJ: External Data Sources` row. */
export interface ArchiveSeedDataSourceValues {
  Name: string;
  TypeID: string;
  DefaultDatabase: string | null;
  ConnectionConfig: string | null;
  Status: MJExternalDataSourceEntity['Status'];
}

/** Values for a new `MJ: Company Integrations` row. */
export interface ArchiveSeedCompanyIntegrationValues {
  CompanyID: string;
  IntegrationID: string;
  Name: string;
  Configuration: string;
}

/** A company integration's identity, as the decision-A refusal names it. */
export interface ArchiveSeedCompanyIntegrationRef {
  ID: string;
  Name: string;
  /** The archive-seed job that created it (`seededFromBackup.jobID` in its configuration), when it was seeded. */
  SeededJobID?: string;
}

/** What the schema apply reports back. */
export interface ArchiveSeedApplyResult {
  Success: boolean;
  Message: string;
  /** The pipeline triggered an API restart. Without one the new entities never load, so phase B never runs. */
  APIRestarted: boolean;
}

/** An entity map of the seeded company integration. */
export interface ArchiveSeedEntityMap {
  ID: string;
  EntityID: string;
  ExternalObjectName: string;
}

/** Record reads and writes the job needs. */
export interface ArchiveSeedRecords {
  /** The SQL Server `MJ: Integrations` row (current or legacy ClassName), or undefined. */
  FindSqlServerIntegrationID(user: UserInfo, provider: IMetadataProvider): Promise<string | undefined>;
  /** Every company integration of this integration (ID, name and seeding job), so a refusal can name the existing one. */
  FindCompanyIntegrations(integrationID: string, user: UserInfo, provider: IMetadataProvider): Promise<ArchiveSeedCompanyIntegrationRef[]>;
  /**
   * Deletes a company integration with everything it owns (runs, entity maps and their field maps,
   * watermarks and record maps, credential); for a seeded one the entity delete also removes its
   * archive-seed job rows and data source. Throws when it does not exist or the delete is refused.
   */
  DeleteCompanyIntegration(id: string, user: UserInfo, provider: IMetadataProvider): Promise<void>;
  /** Throws when no External Data Source Type has that driver class. */
  FindDataSourceTypeID(driverClass: 'SQLServerExternalDriver', user: UserInfo, provider: IMetadataProvider): Promise<string>;
  CreateDataSource(values: ArchiveSeedDataSourceValues, user: UserInfo, provider: IMetadataProvider): Promise<string>;
  /** Sets an existing data source's `DefaultDatabase`; throws when the row does not exist. */
  SetDataSourceDefaultDatabase(id: string, defaultDatabase: string, user: UserInfo, provider: IMetadataProvider): Promise<void>;
  /** A no-op when the row no longer exists. */
  DeleteDataSource(id: string, user: UserInfo, provider: IMetadataProvider): Promise<void>;
  CreateCompanyIntegration(values: ArchiveSeedCompanyIntegrationValues, user: UserInfo, provider: IMetadataProvider): Promise<string>;
  SetCompanyIntegrationConfiguration(id: string, configuration: string, user: UserInfo, provider: IMetadataProvider): Promise<void>;
  EntityMapsFor(companyIntegrationID: string, user: UserInfo, provider: IMetadataProvider): Promise<ArchiveSeedEntityMap[]>;
  /**
   * Turns off record-change tracking and server cache trust, turns on direct SQL insert, then
   * refreshes metadata. Only entities in the schema the apply created for this company integration
   * qualify: throws, before changing anything, when any entity is outside it or is a core (`__mj`)
   * entity, so an entity map pointed at another entity can never open it to a bulk load.
   */
  MarkEntitiesBulkLoadable(companyIntegrationID: string, entityIDs: string[], user: UserInfo, provider: IMetadataProvider): Promise<void>;
  /** The cached user with this ID, or undefined. */
  ResolveUser(userID: string): UserInfo | undefined;
}

/** Introspects the restored archive through the company integration's connector. */
export interface ArchiveSeedDiscovery {
  IntrospectArchive(companyIntegrationID: string, user: UserInfo, provider: IMetadataProvider): Promise<ArchiveSeedDiscoveredTable[]>;
}

/** Applies schema (entities + maps) for the selected archive tables. */
export interface ArchiveSeedApply {
  ApplyTables(
    companyIntegrationID: string,
    tableNames: string[],
    user: UserInfo,
    provider: IMetadataProvider,
  ): Promise<ArchiveSeedApplyResult>;
}

/** Runs a registered action by name. */
export interface ArchiveSeedActions {
  Run(actionName: string, params: ActionParam[], user: UserInfo, provider?: IMetadataProvider): Promise<ActionResult>;
}

/** A persisted archive-seed job, as read back from the store. */
export interface ArchiveSeedStoredJob {
  ID: string;
  Work: ArchiveSeedWork;
  Status: MJRSUPendingWorkEntity['Status'];
  /** The company integration the job seeds (carried on the pending-work row, not in the work). */
  CompanyIntegrationID: string;
}

/** Status of the newest `apply-objects` pending-work row for a company integration. */
export interface ArchiveSeedApplyWorkStatus {
  Status: MJRSUPendingWorkEntity['Status'];
  ErrorMessage: string | null;
}

/** Durable job state, kept as an `archive-seed` RSU pending-work row. */
export interface ArchiveSeedStore {
  Create(work: ArchiveSeedWork, companyIntegrationID: string, user: UserInfo, provider: IMetadataProvider): Promise<string>;
  Read(jobID: string, user: UserInfo, provider: IMetadataProvider): Promise<ArchiveSeedStoredJob | undefined>;
  Update(jobID: string, work: ArchiveSeedWork, user: UserInfo, provider: IMetadataProvider): Promise<void>;
  Complete(jobID: string, user: UserInfo, provider: IMetadataProvider): Promise<void>;
  Fail(jobID: string, message: string, user: UserInfo, provider: IMetadataProvider): Promise<void>;
  ApplyWorkStatus(companyIntegrationID: string, user: UserInfo, provider: IMetadataProvider): Promise<ArchiveSeedApplyWorkStatus | undefined>;
}

/** Everything the archive-seed job depends on. */
export interface ArchiveSeedDeps {
  Records: ArchiveSeedRecords;
  Discovery: ArchiveSeedDiscovery;
  Apply: ArchiveSeedApply;
  Actions: ArchiveSeedActions;
  Store: ArchiveSeedStore;
  CreateEmitter(manifest: IntegrationRunManifest): IntegrationProgressEmitter;
  Now(): Date;
}

/** The production collaborators. */
export function DefaultArchiveSeedDeps(): ArchiveSeedDeps {
  return {
    Records: new DefaultArchiveSeedRecords(),
    Discovery: new DefaultArchiveSeedDiscovery(),
    Apply: new DefaultArchiveSeedApply(),
    Actions: new DefaultArchiveSeedActions(),
    Store: new DefaultArchiveSeedStore(),
    CreateEmitter: manifest => new IntegrationProgressEmitter(manifest),
    Now: () => new Date(),
  };
}
