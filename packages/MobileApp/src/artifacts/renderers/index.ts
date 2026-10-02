import type { ComponentType } from 'react';
import { RegisterClass } from '@memberjunction/global';
import { BaseMobileArtifactRenderer, type MobileArtifactRendererProps } from '../BaseMobileArtifactRenderer';
import { DataArtifactView } from './DataArtifactView';
import { IsDataArtifact } from './data-artifact-match';

/**
 * @fileoverview The artifact renderers this build ships, and their registrations.
 *
 * `@RegisterClass` is a module side effect, so a bundler that sees no import of this file removes
 * every registration in it — the same failure the hosted-application manifest exists to prevent.
 * {@link LoadMobileArtifactRenderers} is that import, called once from the root layout.
 *
 * **What is here:** `Data` — the query builder's output, and the type the artifact work started
 * from.
 *
 * **What is deliberately NOT here:** `Component`. An interactive component is executable code the
 * agent authored, and rendering it is a separate problem with its own safety surface (the app has
 * `InteractiveComponentRenderer` and `AssessSpec` for exactly that). It stays on the existing path
 * until it is addressed on its own terms.
 *
 * Everything else still falls through to the content-sniffing classifier in
 * `src/data/services/artifacts.ts`. That is a fallback, not a contract: it cannot be extended by an
 * artifact type added to MJ metadata, which is the whole reason this registry exists. Moving the
 * remaining kinds onto it is mechanical and separate.
 */

/**
 * The `Data` artifact — what the query builder produces.
 *
 * Matches on the type name and on the MJ data content types, so an artifact written with the
 * content type but an unexpected type name still renders.
 */
@RegisterClass(BaseMobileArtifactRenderer, 'Data')
export class DataArtifactRenderer extends BaseMobileArtifactRenderer {
    /** @inheritdoc */
    public static override CanHandle(typeName: string, contentType?: string): boolean {
        return IsDataArtifact(typeName, contentType);
    }

    /** @inheritdoc */
    public get Component(): ComponentType<MobileArtifactRendererProps> {
        return DataArtifactView;
    }
}

/**
 * Registers every artifact renderer this build ships.
 *
 * Called once from the root layout, before any artifact can be resolved, so a resolution cannot
 * race registration.
 */
export function LoadMobileArtifactRenderers(): void {
    // Referencing the class is what keeps the decorator's side effect in the bundle.
    void DataArtifactRenderer;
}
