import { Injectable } from '@angular/core';
import { Metadata, UserInfo } from '@memberjunction/core';
import { MJArtifactUseEntity } from '@memberjunction/core-entities';

/**
 * Service for tracking artifact usage events.
 * Creates audit trail records for security and analytics.
 */
@Injectable({
    providedIn: 'root'
})
export class ArtifactUseTrackingService {
    /**
     * Track that a user viewed an artifact
     */
    async TrackViewed(artifactVersionId: string, currentUser: UserInfo, context?: any): Promise<void> {
        await this.trackUsage(artifactVersionId, currentUser, 'Viewed', context);
    }

    /**
     * Track that a user opened an artifact (full interaction)
     */
    async TrackOpened(artifactVersionId: string, currentUser: UserInfo, context?: any): Promise<void> {
        await this.trackUsage(artifactVersionId, currentUser, 'Opened', context);
    }

    /**
     * Track that a user shared an artifact
     */
    async TrackShared(artifactVersionId: string, currentUser: UserInfo, context?: any): Promise<void> {
        await this.trackUsage(artifactVersionId, currentUser, 'Shared', context);
    }

    /**
     * Track that a user saved/bookmarked an artifact
     */
    async TrackSaved(artifactVersionId: string, currentUser: UserInfo, context?: any): Promise<void> {
        await this.trackUsage(artifactVersionId, currentUser, 'Saved', context);
    }

    /**
     * Track that a user exported an artifact
     */
    async TrackExported(artifactVersionId: string, currentUser: UserInfo, context?: any): Promise<void> {
        await this.trackUsage(artifactVersionId, currentUser, 'Exported', context);
    }

    /**
     * Internal method to create usage record
     */
    private async trackUsage(
        artifactVersionId: string,
        currentUser: UserInfo,
        usageType: 'Viewed' | 'Opened' | 'Shared' | 'Saved' | 'Exported',
        context?: any
    ): Promise<void> {
        try {
            if (!currentUser) {
                console.warn('Cannot track artifact usage: No current user');
                return;
            }

            const md = new Metadata();
            const usage = await md.GetEntityObject<MJArtifactUseEntity>('MJ: Artifact Uses');

            usage.ArtifactVersionID = artifactVersionId;
            usage.UserID = currentUser.ID;
            usage.UsageType = usageType;
            usage.UsageContext = context ? JSON.stringify(context) : null;

            // Save asynchronously - don't block UI
            try {
                await usage.Save();
            } catch (error) {
                console.error('Failed to track artifact usage:', error);
            }

        } catch (error) {
            console.error('Error in trackUsage:', error);
            // Don't throw - usage tracking should never break the UI
        }
    }
}
