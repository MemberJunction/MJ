/**
 * @fileoverview Type definitions for library dependency management
 * @module @memberjunction/react-runtime/types
 */

import { MJComponentLibraryEntity } from '@memberjunction/core-entities';

/**
 * Represents a parsed dependency with name and version specification
 */
export interface ParsedDependency {
  name: string;
  versionSpec: string;
}

/**
 * Represents a version requirement for a library
 */
export interface VersionRequirement {
  library: string;
  versionSpec: string;
  requestedBy: string; // Which library requested this dependency
}

/**
 * Represents a resolved version after conflict resolution
 */
export interface ResolvedVersion {
  library: string;
  version: string;
  satisfies: VersionRequirement[];
  warnings?: string[];
}

/**
 * Node in the dependency graph
 */
export interface DependencyNode {
  library: MJComponentLibraryEntity;
  dependencies: Map<string, string>; // dependency name -> version spec
  dependents: Set<string>; // libraries that depend on this one
}

/**
 * Dependency graph structure
 */
export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  roots: Set<string>; // libraries with no dependents
}

/**
 * Result of determining load order
 */
export interface LoadOrderResult {
  success: boolean;
  order?: MJComponentLibraryEntity[];
  cycles?: string[][];
  errors?: string[];
  warnings?: string[];
}

/**
 * Semver version range types
 */
export type VersionRangeType = 'exact' | 'tilde' | 'caret' | 'range' | 'any';

/**
 * Parsed semver version
 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

/**
 * Version range specification
 */
export interface VersionRange {
  type: VersionRangeType;
  operator?: string;
  version?: ParsedVersion;
  raw: string;
}

/**
 * Library load state tracking
 */
export interface LoadedLibraryState {
  name: string;
  version: string;
  globalVariable: string;
  loadedAt: Date;
  requestedBy: string[];
  dependencies: string[];
}

/**
 * Options for dependency resolution
 */
export interface DependencyResolutionOptions {
  allowPrerelease?: boolean;
  preferLatest?: boolean;
  strict?: boolean; // Fail on any version conflict
  maxDepth?: number; // Maximum dependency depth to prevent infinite recursion
  debug?: boolean;
}