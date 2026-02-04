import { Injectable } from '@angular/core';

/**
 * Mock artifact interface for stories
 */
export interface MockArtifact {
  ID: string;
  Name: string;
  Type: string;
  Description?: string;
}

/**
 * Mock artifact version interface for stories
 */
export interface MockArtifactVersion {
  ID: string;
  VersionNumber: number;
  Name?: string;
  Description?: string;
}

/**
 * Mock ArtifactIconService for Storybook stories.
 * Provides icon resolution without requiring MJ metadata engine.
 */
@Injectable()
export class MockArtifactIconService {
  /**
   * Get the appropriate Font Awesome icon class for an artifact
   */
  getArtifactIcon(artifact: MockArtifact): string {
    if (!artifact) return 'fa-file';

    const name = artifact.Name?.toLowerCase() || '';
    const type = artifact.Type?.toLowerCase() || '';

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

    // Image artifacts
    if (type.includes('image')) {
      return 'fa-image';
    }

    // Component artifacts
    if (type.includes('component')) {
      return 'fa-puzzle-piece';
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

/**
 * Get type badge color based on artifact type
 */
export function getTypeBadgeColor(type: string | undefined): string {
  if (!type) return '#6B7280';

  const lowerType = type.toLowerCase();

  if (lowerType.includes('code')) return '#8B5CF6'; // Purple
  if (lowerType.includes('report')) return '#3B82F6'; // Blue
  if (lowerType.includes('dashboard')) return '#10B981'; // Green
  if (lowerType.includes('document')) return '#F59E0B'; // Orange
  if (lowerType.includes('image')) return '#EC4899'; // Pink
  if (lowerType.includes('component')) return '#6366F1'; // Indigo

  return '#6B7280'; // Gray
}
