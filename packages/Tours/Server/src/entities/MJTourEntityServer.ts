/**
 * @fileoverview Server subclass for `MJ: Tours` that runs canonical hash-checked
 * `TourVersion` snapshotting whenever an `Active` tour is saved.
 * @module @memberjunction/tours-server
 */

import {
    BaseEntity,
    LogError,
    type EntitySaveOptions,
    type UserInfo,
} from '@memberjunction/core';
import { MJTourEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { IsTourMetadataProvider, TourPublisherService } from '../services/tour-publisher.service.js';

@RegisterClass(BaseEntity, 'MJ: Tours')
export class MJTourEntityServer extends MJTourEntity {
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const saved = await super.Save(options);
        if (!saved) {
            return false;
        }

        if (
            this.Status === 'Active' &&
            !options?.ReplayOnly &&
            !TourPublisherService.Instance.IsSnapshottingTour(this.ID)
        ) {
            const provider = IsTourMetadataProvider(this.ProviderToUse) ? this.ProviderToUse : undefined;
            const contextUser = this.ContextCurrentUser as UserInfo | undefined;
            if (provider && contextUser) {
                const snapResult = await TourPublisherService.Instance.SnapshotIfChanged(
                    this,
                    contextUser,
                    provider,
                );
                if (!snapResult.Success) {
                    LogError(
                        `[MJTourEntityServer] Failed snapshotting active tour '${this.TourKey}': ${snapResult.ErrorMessage ?? 'unknown error'}`,
                    );
                }
            }
        }

        return true;
    }
}
