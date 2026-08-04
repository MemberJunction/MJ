import { Type } from '@angular/core';
import { EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseViewTypeDescriptor } from '@memberjunction/ng-entity-viewer';
import { ClusterViewRendererComponent } from './cluster-view-renderer.component';
import { ClusterViewPropSheetComponent } from './cluster-view-prop-sheet.component';
import { EntityDocumentAvailabilityEngine } from './entity-document-availability.engine';

/**
 * ClusterViewType
 * ---------------
 * The Cluster **view-type plug-in** descriptor. This is the proof that a feature package
 * (ng-clustering) can contribute a brand-new entity-viewer view type by depending only on the
 * host's contracts (`@memberjunction/ng-entity-viewer`) — the host needs zero changes.
 *
 * - **RendererComponent** → {@link ClusterViewRendererComponent} (wraps `mj-cluster-scatter`).
 * - **PropSheetComponent** → {@link ClusterViewPropSheetComponent} (algorithm/K/2D-3D/etc.).
 * - **IsAvailableFor** → true only for entities that have an active Entity Document (vectors),
 *   read synchronously from {@link EntityDocumentAvailabilityEngine}.
 * - **EnsureAvailabilityData** → preloads that engine so the sync predicate has data.
 *
 * Registered with the ClassFactory under `'ClusterViewType'`, matching the `DriverClass` of the
 * seeded `MJ: View Types` "Cluster" row.
 */
@RegisterClass(BaseViewTypeDescriptor, 'ClusterViewType')
export class ClusterViewType extends BaseViewTypeDescriptor {
  readonly Name = 'ClusterViewType';
  readonly DisplayName = 'Cluster';
  readonly Icon = 'fa-solid fa-diagram-project';
  readonly RendererComponent: Type<unknown> = ClusterViewRendererComponent;
  override readonly PropSheetComponent: Type<unknown> = ClusterViewPropSheetComponent;

  override IsAvailableFor(entity: EntityInfo, _provider?: IMetadataProvider): boolean {
    return EntityDocumentAvailabilityEngine.Instance.HasVectorsForEntity(entity);
  }

  override async EnsureAvailabilityData(provider?: IMetadataProvider): Promise<void> {
    await EntityDocumentAvailabilityEngine.Instance.Config(false, provider?.CurrentUser, provider ?? undefined);
  }
}

/**
 * Tree-shaking guard. ng-clustering sets `"sideEffects": false`, so without an explicit
 * reference the bundler can drop this module's `@RegisterClass` side effect. Call this once
 * from app bootstrap (or import the ClusteringModule) to guarantee the descriptor registers.
 */
export function LoadClusterViewType(): void {
  // no-op; presence prevents tree-shaking of the @RegisterClass side effect above.
}
