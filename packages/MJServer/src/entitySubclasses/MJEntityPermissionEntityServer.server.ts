import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { BaseEntity, EntityDeleteOptions, EntitySaveOptions, IMetadataProvider } from '@memberjunction/core';
import { MJEntityPermissionEntity } from '@memberjunction/core-entities';
import { ReconcileFieldPermissionsQuietly } from '@memberjunction/core-entities-server';
import axios from 'axios';
import { ___codeGenAPIPort, ___codeGenAPISubmissionDelay, ___codeGenAPIURL } from '../config.js';

/**
 * Server-side only class that extends the entity permissions object to watch for changes to entity permissions, build a queue of entities that have been changed, and then from time to time, submit
 * them to an API server that will execute the underlying permission changes at the database level.
 *
 * It is also the field-level-security lifecycle adapter for entity-permission changes. Snapshot
 * initialization creates field-permission rows for the roles holding entity access AT THE TIME
 * the flag is flipped; a role granted access afterwards has none, and on an enabled entity a
 * field with no rows is denied — so that role would pass the entity gate and then see zero
 * fields, which reads as a broken screen rather than a permissions gap. The reverse matters
 * too: a role that loses entity access leaves rows that can no longer affect any decision.
 *
 * Both responsibilities live here because `ClassFactory` resolves ONE class per entity name.
 * A second `@RegisterClass(BaseEntity, 'MJ: Entity Permissions')` in another package would not
 * compose with this one — priority auto-increments by load order, so whichever loaded last
 * would silently displace the other.
 *
 * This class is within the memberjunction/server package because it is closely coupled to other aspects of what
 * happens in the server. That's why it is not in the core-entities-server package.
 */
@RegisterClass(BaseEntity, 'MJ: Entity Permissions')
export class MJEntityPermissionEntityServer extends MJEntityPermissionEntity {
  protected static _entityIDQueue: string[] = [];
  protected static _lastModifiedTime: Date | null = null;
  protected static _submissionTimer: NodeJS.Timeout | null = null;
  protected static _submissionDelay: number = ___codeGenAPISubmissionDelay;
  protected static _baseURL: string = ___codeGenAPIURL;
  protected static _port: number = ___codeGenAPIPort;
  protected static _apiEndpoint: string = '/api/entity-permissions';

  // Method to construct the full URL dynamically
  protected static getSubmissionURL(): string {
    return `${this._baseURL}:${this._port}${this._apiEndpoint}`;
  }

  public static get EntityIDQueue(): string[] {
    return this._entityIDQueue;
  }

  public static ClearQueue(): void {
    this._entityIDQueue = [];
    this._submissionTimer = null;
  }
  public static AddToQueue(entityID: string): void {
    if (this._entityIDQueue.indexOf(entityID) === -1) this._entityIDQueue.push(entityID);
    this._lastModifiedTime = new Date();
    this.CheckStartSubmissionTimer();
  }

  protected static CheckStartSubmissionTimer(): void {
    if (this._submissionTimer === null) {
      this.StartSubmissionTimer();
    } else {
      // we need to cancel the existing timer and start a new one
      clearTimeout(this._submissionTimer);
      this.StartSubmissionTimer();
    }
  }

  protected static StartSubmissionTimer(): void {
    this._submissionTimer = setTimeout(() => {
      this.SubmitQueue();
    }, this._submissionDelay);
  }

  protected static async SubmitQueue(): Promise<void> {
    this._lastModifiedTime = null;

    // now, use Axios to submit the queue to the API server
    // Check if there's anything to submit
    if (this._entityIDQueue.length > 0) {
      try {
        // Use Axios to submit the queue to the API server
        const response = await axios.post(this.getSubmissionURL(), {
          entityIDArray: this._entityIDQueue,
        });

        // Check the Axios response code implicitly and API response explicitly
        if (response.status === 200 && response.data.status === 'ok') {
          console.log('Queue submitted successfully.');
          // now, clear the queue and timer
          this.ClearQueue();
        } else {
          // Handle API indicating a failure
          console.error('Failed to submit queue:', response.data.errorMessage || 'Unknown error');
        }
      } catch (error) {
        // Handle errors here
        console.error('Failed to submit queue:', error);
        // Consider re-trying or logging the error based on your requirements
      }
    } else {
      console.log('No entities to submit.');
    }
  }

  override async Save(options?: EntitySaveOptions): Promise<boolean> {
    // simply queue up the entity ID
    if (this.Dirty || options?.IgnoreDirtyState) MJEntityPermissionEntityServer.AddToQueue(this.EntityID);

    // Capture before the save — afterwards nothing is dirty and the dirty check reads false.
    const affectsFieldSecurity = this.affectsFieldPermissionRows();

    if (!(await super.Save(options))) return false;

    if (affectsFieldSecurity) await this.reconcileFieldPermissions(this.EntityID);
    return true;
  }

  override async Delete(options: EntityDeleteOptions): Promise<boolean> {
    // Capture before the delete — afterwards this record's EntityID is gone.
    const targetEntityID = this.EntityID;

    const success = await super.Delete(options);

    // simply queue up the entity ID if the delete worked
    if (success) {
      MJEntityPermissionEntityServer.AddToQueue(targetEntityID);
      await this.reconcileFieldPermissions(targetEntityID);
    }

    return success;
  }

  /**
   * Whether this save can change which field-permission rows should exist.
   *
   * Only the access flags and the role matter — the field-permission delta keys off a role's
   * effective entity-level access, so an edit to an RLS filter changes nothing here. A new
   * record always counts, since it may be the grant that brings a role into scope.
   */
  protected affectsFieldPermissionRows(): boolean {
    if (!this.IsSaved) return true;

    return ['Type', 'CanRead', 'CanUpdate', 'CanCreate', 'RoleID'].some(
      (fieldName) => this.GetFieldByName(fieldName)?.Dirty === true
    );
  }

  /**
   * Reconciles the target entity's field-permission rows, when that entity has field security
   * switched on. The flag check keeps this free for the overwhelming majority of permission
   * edits, which are on entities that never opted in.
   *
   * Runs AFTER the permission write commits, and failures are logged rather than thrown: the
   * save that triggered it has already succeeded, so reporting it as failed would be wrong.
   * Missing rows fail closed until the next reconciliation.
   */
  protected async reconcileFieldPermissions(entityID: string): Promise<void> {
    if (!entityID) return;

    const provider = this.ProviderToUse as unknown as IMetadataProvider;
    const entityInfo = provider?.Entities?.find((e) => UUIDsEqual(e.ID, entityID));
    if (!entityInfo?.EnableFieldLevelSecurity) return;

    await ReconcileFieldPermissionsQuietly(entityInfo, provider, this.ContextCurrentUser);
  }
}