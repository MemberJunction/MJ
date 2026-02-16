/**
 * @fileoverview Library dependency resolution utilities
 * Provides dependency graph construction, cycle detection, topological sorting, and version resolution
 * @module @memberjunction/react-runtime/utilities
 */

import { MJComponentLibraryEntity } from '@memberjunction/core-entities';
import {
  DependencyGraph,
  DependencyNode,
  LoadOrderResult,
  ParsedDependency,
  ParsedVersion,
  ResolvedVersion,
  VersionRange,
  VersionRangeType,
  VersionRequirement,
  DependencyResolutionOptions
} from '../types/dependency-types';

/**
 * Resolves library dependencies and determines load order
 */
export class LibraryDependencyResolver {
  private debug: boolean = false;

  constructor(options?: DependencyResolutionOptions) {
    this.debug = options?.debug || false;
  }

  /**
   * Parse dependencies from JSON string
   * @param json - JSON string containing dependencies
   * @returns Map of library name to version specification
   */
  parseDependencies(json: string | null): Map<string, string> {
    const dependencies = new Map<string, string>();
    
    if (!json || json.trim() === '') {
      return dependencies;
    }

    try {
      const parsed = JSON.parse(json);
      if (typeof parsed === 'object' && parsed !== null) {
        for (const [name, version] of Object.entries(parsed)) {
          if (typeof version === 'string') {
            dependencies.set(name, version);
          }
        }
      }
    } catch (error) {
      console.error('Failed to parse dependencies JSON:', error);
    }

    return dependencies;
  }

  /**
   * Build a dependency graph from a collection of libraries
   * @param libraries - All available libraries
   * @returns Dependency graph structure
   */
  buildDependencyGraph(libraries: MJComponentLibraryEntity[]): DependencyGraph {
    const nodes = new Map<string, DependencyNode>();
    const roots = new Set<string>();

    // First pass: create nodes for all libraries
    for (const library of libraries) {
      const dependencies = this.parseDependencies(library.Dependencies);
      nodes.set(library.Name, {
        library,
        dependencies,
        dependents: new Set()
      });
      // Initially assume all are roots
      roots.add(library.Name);
    }

    // Second pass: establish dependency relationships
    for (const [name, node] of nodes) {
      for (const [depName, depVersion] of node.dependencies) {
        const depNode = nodes.get(depName);
        if (depNode) {
          // This library depends on depName, so depName is not a root
          roots.delete(depName);
          // Add this library as a dependent of depName
          depNode.dependents.add(name);
        } else if (this.debug) {
          console.warn(`Dependency '${depName}' not found for library '${name}'`);
        }
      }
    }

    return { nodes, roots };
  }

  /**
   * Detect circular dependencies in the graph
   * @param graph - Dependency graph
   * @returns Array of cycles found
   */
  detectCycles(graph: DependencyGraph): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const detectCyclesUtil = (nodeName: string): void => {
      visited.add(nodeName);
      recursionStack.add(nodeName);
      path.push(nodeName);

      const node = graph.nodes.get(nodeName);
      if (node) {
        for (const [depName] of node.dependencies) {
          if (!visited.has(depName)) {
            detectCyclesUtil(depName);
          } else if (recursionStack.has(depName)) {
            // Found a cycle
            const cycleStartIndex = path.indexOf(depName);
            const cycle = [...path.slice(cycleStartIndex), depName];
            cycles.push(cycle);
          }
        }
      }

      path.pop();
      recursionStack.delete(nodeName);
    };

    // Check all nodes
    for (const nodeName of graph.nodes.keys()) {
      if (!visited.has(nodeName)) {
        detectCyclesUtil(nodeName);
      }
    }

    return cycles;
  }

  /**
   * Perform topological sort to determine load order
   * @param graph - Dependency graph
   * @returns Sorted array of libraries to load in order
   */
  topologicalSort(graph: DependencyGraph): MJComponentLibraryEntity[] {
    const result: MJComponentLibraryEntity[] = [];
    const visited = new Set<string>();
    const tempMarked = new Set<string>();

    const visit = (nodeName: string): boolean => {
      if (tempMarked.has(nodeName)) {
        // Cycle detected
        return false;
      }
      if (visited.has(nodeName)) {
        return true;
      }

      tempMarked.add(nodeName);
      const node = graph.nodes.get(nodeName);
      
      if (node) {
        // Visit dependencies first
        for (const [depName] of node.dependencies) {
          if (graph.nodes.has(depName)) {
            if (!visit(depName)) {
              return false;
            }
          }
        }
        result.push(node.library);
      }

      tempMarked.delete(nodeName);
      visited.add(nodeName);
      return true;
    };

    // Start with all nodes
    for (const nodeName of graph.nodes.keys()) {
      if (!visited.has(nodeName)) {
        if (!visit(nodeName)) {
          console.error(`Cycle detected involving library: ${nodeName}`);
        }
      }
    }

    return result;
  }

  /**
   * Parse a semver version string
   * @param version - Version string (e.g., "1.2.3")
   * @returns Parsed version object
   */
  private parseVersion(version: string): ParsedVersion | null {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+(.+))?$/);
    if (!match) {
      return null;
    }

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      prerelease: match[4],
      build: match[5]
    };
  }

  /**
   * Parse a version specification into a range
   * @param spec - Version specification (e.g., "^1.2.3", "~1.2.0", "1.2.3")
   * @returns Parsed version range
   */
  private parseVersionRange(spec: string): VersionRange {
    if (spec === '*' || spec === '' || spec === 'latest') {
      return { type: 'any', raw: spec };
    }

    // Tilde range (~1.2.3)
    if (spec.startsWith('~')) {
      const version = this.parseVersion(spec.substring(1));
      return {
        type: 'tilde',
        version: version || undefined,
        raw: spec
      };
    }

    // Caret range (^1.2.3)
    if (spec.startsWith('^')) {
      const version = this.parseVersion(spec.substring(1));
      return {
        type: 'caret',
        version: version || undefined,
        raw: spec
      };
    }

    // Exact version
    const version = this.parseVersion(spec);
    if (version) {
      return {
        type: 'exact',
        version,
        raw: spec
      };
    }

    // Default to any if we can't parse
    return { type: 'any', raw: spec };
  }

  /**
   * Check if a version satisfies a version range
   * @param version - Version to check
   * @param range - Version range specification
   * @returns True if version satisfies range
   */
  private versionSatisfiesRange(version: ParsedVersion, range: VersionRange): boolean {
    if (range.type === 'any') {
      return true;
    }

    if (!range.version) {
      return false;
    }

    const rangeVer = range.version;

    switch (range.type) {
      case 'exact':
        return version.major === rangeVer.major &&
               version.minor === rangeVer.minor &&
               version.patch === rangeVer.patch;

      case 'tilde': // ~1.2.3 means >=1.2.3 <1.3.0
        if (version.major !== rangeVer.major) return false;
        if (version.minor !== rangeVer.minor) return false;
        return version.patch >= rangeVer.patch;

      case 'caret': // ^1.2.3 means >=1.2.3 <2.0.0 (for 1.x.x)
        if (rangeVer.major === 0) {
          // ^0.x.y behaves like ~0.x.y
          if (version.major !== 0) return false;
          if (rangeVer.minor === 0) {
            // ^0.0.x means exactly 0.0.x
            return version.minor === 0 && version.patch === rangeVer.patch;
          }
          // ^0.x.y means >=0.x.y <0.(x+1).0
          if (version.minor !== rangeVer.minor) return false;
          return version.patch >= rangeVer.patch;
        }
        // Normal caret for major > 0
        if (version.major !== rangeVer.major) return false;
        if (version.minor < rangeVer.minor) return false;
        if (version.minor === rangeVer.minor) {
          return version.patch >= rangeVer.patch;
        }
        return true;

      default:
        return false;
    }
  }

  /**
   * Compare two versions for sorting
   * @returns -1 if a < b, 0 if a === b, 1 if a > b
   */
  private compareVersions(a: ParsedVersion, b: ParsedVersion): number {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    if (a.patch !== b.patch) return a.patch - b.patch;
    
    // Handle prerelease versions
    if (!a.prerelease && b.prerelease) return 1; // a is newer
    if (a.prerelease && !b.prerelease) return -1; // b is newer
    if (a.prerelease && b.prerelease) {
      return a.prerelease.localeCompare(b.prerelease);
    }
    
    return 0;
  }

  /**
   * Resolve version conflicts using NPM-style resolution
   * @param requirements - Array of version requirements
   * @param availableLibraries - All available libraries to choose from
   * @returns Resolved version information
   */
  resolveVersionConflicts(
    requirements: VersionRequirement[],
    availableLibraries: MJComponentLibraryEntity[]
  ): ResolvedVersion {
    if (requirements.length === 0) {
      throw new Error('No version requirements provided');
    }

    const libraryName = requirements[0].library;
    const warnings: string[] = [];

    // Find all available versions for this library
    const availableVersions = availableLibraries
      .filter(lib => lib.Name === libraryName && lib.Version)
      .map(lib => ({
        library: lib,
        version: this.parseVersion(lib.Version!)
      }))
      .filter(item => item.version !== null)
      .sort((a, b) => this.compareVersions(b.version!, a.version!)); // Sort descending

    if (availableVersions.length === 0) {
      throw new Error(`No versions available for library '${libraryName}'`);
    }

    // Parse all requirements
    const ranges = requirements.map(req => ({
      ...req,
      range: this.parseVersionRange(req.versionSpec)
    }));

    // Find the highest version that satisfies all requirements
    for (const { library, version } of availableVersions) {
      let satisfiesAll = true;
      const satisfiedRequirements: VersionRequirement[] = [];

      for (const req of ranges) {
        if (this.versionSatisfiesRange(version!, req.range)) {
          satisfiedRequirements.push(req);
        } else {
          satisfiesAll = false;
          warnings.push(
            `Version ${library.Version} does not satisfy '${req.versionSpec}' required by ${req.requestedBy}`
          );
          break;
        }
      }

      if (satisfiesAll) {
        return {
          library: libraryName,
          version: library.Version!,
          satisfies: requirements,
          warnings: warnings.length > 0 ? warnings : undefined
        };
      }
    }

    // No version satisfies all requirements
    // Return the latest version with warnings
    const latest = availableVersions[0];
    warnings.push(
      `Could not find a version that satisfies all requirements. Using ${latest.library.Version}`
    );

    return {
      library: libraryName,
      version: latest.library.Version!,
      satisfies: [],
      warnings
    };
  }

  /**
   * Get the load order for a set of requested libraries
   * @param requestedLibs - Library names requested
   * @param allLibs - All available libraries
   * @param options - Resolution options
   * @returns Load order result
   */
  getLoadOrder(
    requestedLibs: string[],
    allLibs: MJComponentLibraryEntity[],
    options?: DependencyResolutionOptions
  ): LoadOrderResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Filter out null, undefined, and non-string values from requestedLibs
    const validRequestedLibs = requestedLibs.filter(lib => {
      if (!lib || typeof lib !== 'string') {
        const warning = `Invalid library name: ${lib} (type: ${typeof lib})`;
        warnings.push(warning);
        if (this.debug || options?.debug) {
          console.warn(`⚠️ ${warning}`);
        }
        return false;
      }
      return true;
    });

    if (this.debug || options?.debug) {
      console.log('🔍 Getting load order for requested libraries:');
      console.log('  📝 Requested (raw):', requestedLibs);
      console.log('  📝 Requested (valid):', validRequestedLibs);
      console.log('  📚 Total available libraries:', allLibs.length);
    }

    // Build a map for quick lookup (case-insensitive)
    const libMap = new Map<string, MJComponentLibraryEntity[]>();
    for (const lib of allLibs) {
      if (!lib?.Name) {
        warnings.push(`Library with missing name found in available libraries`);
        continue;
      }
      const key = lib.Name.toLowerCase();
      if (!libMap.has(key)) {
        libMap.set(key, []);
      }
      libMap.get(key)!.push(lib);
    }

    // Collect all libraries needed (requested + their dependencies)
    const needed = new Set<string>();
    const toProcess = [...validRequestedLibs];
    const processed = new Set<string>();
    const versionRequirements = new Map<string, VersionRequirement[]>();
    let depth = 0;
    const maxDepth = options?.maxDepth || 10;

    while (toProcess.length > 0 && depth < maxDepth) {
      const current = toProcess.shift()!;
      
      // Extra safety check for null/undefined
      if (!current || typeof current !== 'string') {
        const warning = `Unexpected invalid library name during processing: ${current}`;
        warnings.push(warning);
        if (this.debug || options?.debug) {
          console.warn(`⚠️ ${warning}`);
        }
        continue;
      }
      
      if (processed.has(current)) continue;

      processed.add(current);
      needed.add(current);

      // Find the library (case-insensitive lookup)
      const libVersions = libMap.get(current.toLowerCase());
      if (!libVersions || libVersions.length === 0) {
        if (this.debug || options?.debug) {
          console.log(`    ❌ Library '${current}' not found in available libraries`);
        }
        errors.push(`Library '${current}' not found`);
        continue;
      }

      // For now, use the first version found (should be resolved properly)
      const lib = libVersions[0];
      const deps = this.parseDependencies(lib.Dependencies);
      
      if ((this.debug || options?.debug) && deps.size > 0) {
        console.log(`    📌 ${current} requires:`, Array.from(deps.entries()));
      }

      // Process dependencies
      for (const [depName, depVersion] of deps) {
        needed.add(depName);
        
        // Track version requirements
        if (!versionRequirements.has(depName)) {
          versionRequirements.set(depName, []);
        }
        versionRequirements.get(depName)!.push({
          library: depName,
          versionSpec: depVersion,
          requestedBy: current
        });

        if (!processed.has(depName)) {
          toProcess.push(depName);
        }
      }

      depth++;
    }

    if (depth >= maxDepth) {
      warnings.push(`Maximum dependency depth (${maxDepth}) reached`);
    }

    // Resolve version conflicts for each library
    const resolvedLibraries: MJComponentLibraryEntity[] = [];
    for (const libName of needed) {
      const requirements = versionRequirements.get(libName) || [];
      const versions = libMap.get(libName.toLowerCase()) || [];
      
      if (versions.length === 0) {
        errors.push(`Library '${libName}' not found`);
        continue;
      }

      if (requirements.length > 0) {
        try {
          const resolved = this.resolveVersionConflicts(requirements, versions);
          const selectedLib = versions.find(lib => lib.Version === resolved.version);
          if (selectedLib) {
            resolvedLibraries.push(selectedLib);
            if (resolved.warnings) {
              warnings.push(...resolved.warnings);
            }
          }
        } catch (error: any) {
          errors.push(error.message);
          // Use first available version as fallback
          resolvedLibraries.push(versions[0]);
        }
      } else {
        // No specific requirements, use the first (default) version
        resolvedLibraries.push(versions[0]);
      }
    }

    // Build dependency graph with resolved libraries
    const graph = this.buildDependencyGraph(resolvedLibraries);

    // Check for cycles
    const cycles = this.detectCycles(graph);
    if (cycles.length > 0) {
      errors.push(`Circular dependencies detected: ${cycles.map(c => c.join(' -> ')).join(', ')}`);
      return {
        success: false,
        cycles,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    }

    // Perform topological sort
    const sorted = this.topologicalSort(graph);

    if (this.debug || options?.debug) {
      console.log('✅ Load order determined:', sorted.map(lib => `${lib.Name}@${lib.Version}`));
    }

    return {
      success: errors.length === 0,
      order: sorted,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Get direct dependencies of a library
   * @param library - Library to get dependencies for
   * @returns Map of dependency names to version specs
   */
  getDirectDependencies(library: MJComponentLibraryEntity): Map<string, string> {
    return this.parseDependencies(library.Dependencies);
  }

  /**
   * Get all transitive dependencies of a library
   * @param libraryName - Library name to analyze
   * @param allLibs - All available libraries
   * @param maxDepth - Maximum depth to traverse
   * @returns Set of all dependency names (including transitive)
   */
  getTransitiveDependencies(
    libraryName: string,
    allLibs: MJComponentLibraryEntity[],
    maxDepth: number = 10
  ): Set<string> {
    const dependencies = new Set<string>();
    const toProcess = [libraryName];
    const processed = new Set<string>();
    let depth = 0;

    // Build lookup map (case-insensitive)
    const libMap = new Map<string, MJComponentLibraryEntity>();
    for (const lib of allLibs) {
      libMap.set(lib.Name.toLowerCase(), lib);
    }

    while (toProcess.length > 0 && depth < maxDepth) {
      const current = toProcess.shift()!;
      if (processed.has(current)) continue;

      processed.add(current);
      const lib = libMap.get(current.toLowerCase());
      if (!lib) continue;

      const deps = this.parseDependencies(lib.Dependencies);
      for (const [depName] of deps) {
        dependencies.add(depName);
        if (!processed.has(depName)) {
          toProcess.push(depName);
        }
      }

      depth++;
    }

    return dependencies;
  }
}