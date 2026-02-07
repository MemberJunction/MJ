import { RegisterClass } from '@memberjunction/global';
import { BaseEntity, EntityDeleteOptions, EntitySaveOptions } from '@memberjunction/core';
import { EntityPermissionEntity } from '@memberjunction/core-entities';
import axios from 'axios';
import { ___codeGenAPIPort, ___codeGenAPISubmissionDelay, ___codeGenAPIURL } from '../config.js';

/**
 * Server-side only class that extends the entity permissions object to watch for changes to entity permissions, build a queue of entities that have been changed, and then from time to time, submit
 * them to an API server that will execute the underlying permission changes at the database level.
 * 
 * This class is within the memberjunction/server package because it is closely coupled to other aspects of what
 * happens in the server. That's why it is not in the core-entities-server package.
 */
@RegisterClass(BaseEntity, 'Entity Permissions')
export class EntityPermissionsEntity_Server extends EntityPermissionEntity {
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

  override Save(options?: EntitySaveOptions): Promise<boolean> {
    // simply queue up the entity ID
    if (this.Dirty || options?.IgnoreDirtyState) EntityPermissionsEntity_Server.AddToQueue(this.EntityID);

    return super.Save(options);
  }

  override async Delete(options: EntityDeleteOptions): Promise<boolean> {
    const success = await super.Delete(options);

    // simply queue up the entity ID if the delete worked
    if (success) EntityPermissionsEntity_Server.AddToQueue(this.EntityID);

    return success;
  }
}