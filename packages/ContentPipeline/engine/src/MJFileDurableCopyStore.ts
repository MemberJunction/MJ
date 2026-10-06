/**
 * @fileoverview The durable copy store, implemented on MemberJunction Files.
 *
 * {@link BaseDurableCopyStore} stays as the seam, because the object-key rules it enforces are
 * genuinely the pipeline's business — a key that cannot be fully resolved must fail rather than
 * write one tenant's bytes to an unnamespaced path. What a store should *not* own is where bytes
 * physically live.
 *
 * MJ already answers that. A `MJ: Files` row plus a `FileStorageAccount` puts the bytes in whichever
 * backend the deployment configured — Azure, S3, SharePoint, Box, Dropbox, Google — and gives the
 * content item a normal MJ file reference that every other part of the system already knows how to
 * read. Nothing is written into this database but the reference.
 *
 * @module @memberjunction/content-pipeline
 */

import { LogError, Metadata, UserInfo } from '@memberjunction/core';
import { MJFileEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { FileStorageEngine } from '@memberjunction/storage';
import {
    BaseDurableCopyStore,
    DurableCopyRequest,
    DurableCopyResult,
} from '@memberjunction/content-pipeline-base';

/** The default store key — what a source gets when it names none. */
export const MJ_FILE_STORE = 'MJFiles';

@RegisterClass(BaseDurableCopyStore, MJ_FILE_STORE)
export class MJFileDurableCopyStore extends BaseDurableCopyStore {
    public readonly Key = MJ_FILE_STORE;

    public async Persist(request: DurableCopyRequest): Promise<DurableCopyResult> {
        const account = await this.resolveAccount(request);
        const driver = await FileStorageEngine.Instance.GetDriver(account.ID, request.ContextUser);

        const stored = await driver.PutObject(
            request.ObjectKey,
            Buffer.from(request.Content),
            request.ContentType,
        );
        if (!stored) {
            throw new Error(`Storage provider refused to write '${request.ObjectKey}'`);
        }

        // The row is written after the bytes, not before: a File row pointing at an object that was
        // never stored is worse than no row, because everything downstream trusts the reference.
        const file = await Metadata.Provider.GetEntityObject<MJFileEntity>('MJ: Files', request.ContextUser);
        file.NewRecord();
        file.Name = request.ObjectKey.split('/').pop() ?? request.ObjectKey;
        file.ProviderID = account.ProviderID;
        file.ProviderKey = request.ObjectKey;
        file.ContentType = request.ContentType ?? 'application/octet-stream';
        file.Status = 'Uploaded';
        if (!(await file.Save())) {
            // The bytes are already stored; losing the row would orphan them silently.
            LogError(
                `MJFileDurableCopyStore: stored '${request.ObjectKey}' but could not save its MJ: Files row: ` +
                    `${file.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
            throw new Error(`Could not record the stored file '${request.ObjectKey}'`);
        }

        return { FileID: file.ID, ObjectKey: request.ObjectKey };
    }

    /**
     * The storage account to write through.
     *
     * A run names one explicitly when it has a reason to; otherwise the deployment's single
     * configured account is used, and having none is a configuration error rather than a reason to
     * quietly skip keeping the bytes.
     */
    private async resolveAccount(request: DurableCopyRequest) {
        const engine = FileStorageEngine.Instance;
        await engine.Config(false, request.ContextUser, request.Provider);
        const accounts = engine.Accounts;
        if (accounts.length === 0) {
            throw new Error(
                'No File Storage Account is configured, so there is nowhere to keep a durable copy.',
            );
        }
        return accounts[0];
    }
}
