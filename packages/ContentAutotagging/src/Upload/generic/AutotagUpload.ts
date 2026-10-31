import { RegisterClass } from '@memberjunction/global';
import { DiscoverRequest, DiscoveredItem } from '@memberjunction/content-pipeline-base';
import { AutotagBase } from '../../Core';

/**
 * Push-only source driver for user-uploaded files (`ContentSourceType = 'Upload'`).
 *
 * Items in an `Upload` source are created on demand via `ContentUploadIngestor` rather than
 * discovered by walking an external listing. `IsPushOnly = true` causes `DiscoverStage` (in both
 * `Discover` and `Sync` modes) to skip the source with a `Skipped` outcome and never mark its
 * items for deletion.
 */
@RegisterClass(AutotagBase, 'AutotagUpload')
export class AutotagUpload extends AutotagBase {
    public override readonly IsPushOnly = true;
    public override readonly SupportsExhaustiveWalk = false;

    public override async *Discover(_request: DiscoverRequest): AsyncIterable<DiscoveredItem> {
        // Push-only source: items are created on upload rather than discovered by walking.
    }
}
