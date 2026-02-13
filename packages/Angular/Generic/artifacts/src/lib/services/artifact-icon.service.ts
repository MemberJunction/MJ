import { Injectable } from '@angular/core';
import { ArtifactMetadataEngine } from '@memberjunction/core-entities';
import { MJConversationArtifactEntity, MJArtifactEntity } from '@memberjunction/core-entities';

/**
 * Service for determining which icon to display for artifacts.
 * Implements a three-tier fallback strategy:
 * 1. Plugin-provided icon (from artifact viewer plugin metadata)
 * 2. Database metadata icon (from ArtifactType.Icon field)
 * 3. Hardcoded type-based mapping (legacy fallback)
 */
@Injectable({
    providedIn: 'root'
})
export class ArtifactIconService {
    /**
     * Gets the appropriate Font Awesome icon class for an artifact.
     * @param artifact The artifact to get an icon for (MJConversationArtifactEntity or MJArtifactEntity)
     * @param pluginIcon Optional icon provided by a viewer plugin (highest priority)
     * @returns Font Awesome icon class (e.g., 'fa-file-code', 'fa-chart-line')
     */
    public getArtifactIcon(artifact: MJConversationArtifactEntity | MJArtifactEntity, pluginIcon?: string): string {
        if (!artifact) {
            return 'fa-file';
        }

        // Priority 1: Plugin-provided icon
        if (pluginIcon) {
            return pluginIcon;
        }

        // Priority 2: Database metadata icon
        const metadataIcon = this.getMetadataIcon(artifact);
        if (metadataIcon) {
            return metadataIcon;
        }

        // Priority 3: Hardcoded type-based fallback
        return this.getHardcodedIcon(artifact);
    }

    /**
     * Attempts to retrieve icon from artifact type metadata.
     */
    private getMetadataIcon(artifact: MJConversationArtifactEntity | MJArtifactEntity): string | null {
        try {
            // MJConversationArtifactEntity has ArtifactType field, MJArtifactEntity has Type field
            const typeName = 'ArtifactType' in artifact ? artifact.ArtifactType : artifact.Type;
            const artifactType = ArtifactMetadataEngine.Instance.FindArtifactType(typeName);
            if (artifactType?.Icon) {
                return artifactType.Icon;
            }
        } catch (error) {
            console.warn('Failed to load artifact type metadata for icon:', error);
        }
        return null;
    }

    /**
     * Legacy hardcoded icon mapping based on artifact type and name.
     * This provides backward compatibility for artifacts without metadata icons.
     */
    private getHardcodedIcon(artifact: MJConversationArtifactEntity | MJArtifactEntity): string {
        const name = artifact.Name?.toLowerCase() || '';
        // MJConversationArtifactEntity has ArtifactType field, MJArtifactEntity has Type field
        const typeName = 'ArtifactType' in artifact ? artifact.ArtifactType : artifact.Type;
        const type = typeName?.toLowerCase() || '';

        // Code artifacts
        if (type.includes('code')) {
            return 'fa-file-code';
        }

        // Report artifacts
        if (type.includes('report')) {
            return 'fa-chart-line';
        }

        // Dashboard artifacts
        if (type.includes('dashboard')) {
            return 'fa-chart-bar';
        }

        // Document artifacts
        if (type.includes('document') || name.endsWith('.md')) {
            return 'fa-file-lines';
        }

        // Specific file extensions
        if (name.endsWith('.json')) {
            return 'fa-file-code';
        }

        if (name.endsWith('.html')) {
            return 'fa-file-code';
        }

        // Default fallback
        return 'fa-file';
    }
}
