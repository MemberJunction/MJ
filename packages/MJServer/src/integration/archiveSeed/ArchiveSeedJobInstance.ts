/**
 * The process's one archive seed job. The boot-time dispatcher and the GraphQL resolver both use
 * it, so the per-instance re-entry guard `Resume` and phase B rely on covers every caller.
 */
import { ArchiveSeedJob } from './ArchiveSeedJob.js';
import { DefaultArchiveSeedDeps } from './ArchiveSeedDeps.js';
import { DefaultArchiveSeedRecords } from './ArchiveSeedRecordsDefault.js';

/** The record collaborator the shared job uses (the dispatcher resolves resume users through it). */
export const ArchiveSeedRecordsInstance = new DefaultArchiveSeedRecords();

/** The shared job instance. Never construct another long-lived `ArchiveSeedJob` in the server. */
export const ArchiveSeedJobInstance = new ArchiveSeedJob({ ...DefaultArchiveSeedDeps(), Records: ArchiveSeedRecordsInstance });
