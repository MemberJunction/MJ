/**
 * The process's one archive seed job. The boot-time dispatcher and the GraphQL resolver both use
 * it, so the per-instance re-entry guard `Resume` and phase B rely on covers every caller. Held by
 * a `BaseSingleton`, so a module loaded twice (bundler code splitting) still shares one job.
 */
import { BaseSingleton } from '@memberjunction/global';
import { ArchiveSeedJob } from './ArchiveSeedJob.js';
import { DefaultArchiveSeedDeps } from './ArchiveSeedDeps.js';
import { DefaultArchiveSeedRecords } from './ArchiveSeedRecordsDefault.js';

/** Owns the shared job and the record collaborator it was built with. */
export class ArchiveSeedJobHost extends BaseSingleton<ArchiveSeedJobHost> {
  /** The record collaborator the shared job uses (the dispatcher resolves resume users through it). */
  public readonly Records = new DefaultArchiveSeedRecords();
  /** The shared job. Never construct another long-lived `ArchiveSeedJob` in the server. */
  public readonly Job = new ArchiveSeedJob({ ...DefaultArchiveSeedDeps(), Records: this.Records });

  /** Use {@link ArchiveSeedJobHost.Instance}. */
  protected constructor() {
    super();
  }

  public static get Instance(): ArchiveSeedJobHost {
    return super.getInstance<ArchiveSeedJobHost>();
  }
}

/** The record collaborator the shared job uses (the dispatcher resolves resume users through it). */
export const ArchiveSeedRecordsInstance = ArchiveSeedJobHost.Instance.Records;

/** The shared job instance. Never construct another long-lived `ArchiveSeedJob` in the server. */
export const ArchiveSeedJobInstance = ArchiveSeedJobHost.Instance.Job;
