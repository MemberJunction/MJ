/**
 * @fileoverview Library registry for approved third-party libraries
 * Maintains a secure registry of libraries that components can use
 * @module @memberjunction/react-runtime/utilities
 */

import { UserInfo } from "@memberjunction/core";
import { MJComponentLibraryEntity, ComponentMetadataEngine } from "@memberjunction/core-entities";

/**
 * Library definition in the registry
 */
export interface LibraryDefinition {
  /** Library name (e.g., "Chart.js", "lodash") */
  name: string;
  /** Global variable name when loaded (e.g., "Chart", "_") */
  globalVariable: string;
  /** Category path for organization (e.g., "charting/advanced", "utility/date") */
  category: string;
  /** Available versions with their CDN URLs */
  versions: {
    [version: string]: {
      cdnUrl: string;
      /** Optional CSS URLs for UI libraries */
      cssUrls?: string[];
    };
  };
  /** Default version to use if not specified */
  defaultVersion: string;
}

/**
 * Registry of approved libraries that components can use
 * This is the security boundary - only libraries defined here can be loaded
 */
export class LibraryRegistry {
  private static libraries: Map<string, LibraryDefinition> = new Map();
  private static _configured: boolean = false;
  public static async Config(forceRefresh: boolean = false, componentLibraries: MJComponentLibraryEntity[]) {
    if (!this._configured || forceRefresh) {
      // next up, we need to map the component metadata to the library definitions 
      // with two steps - first step is that we need to group the libraries in the engine
      // by name and then we'll have all the versions for that particular library we can break
      // into versions in our structure
      const libraryGroups = new Map<string, MJComponentLibraryEntity[]>();
      for (const lib of componentLibraries) {
        if (!libraryGroups.has(lib.Name.toLowerCase())) {
          libraryGroups.set(lib.Name.toLowerCase(), []);
        }
        libraryGroups.get(lib.Name.toLowerCase())!.push(lib);
      }

      // now we have grouped libraries using the MJComponentLibraryEntity type, and next up
      // we can map this to our internal structure of LibraryDefinition
      for (const [name, versions] of libraryGroups) {
        const libDef: LibraryDefinition = {
          name,
          globalVariable: versions[0].GlobalVariable || "",
          category: versions[0].Category || "",
          versions: {},
          defaultVersion: versions[0].Version || ""
        };
        for (const version of versions) {
          libDef.versions[version.Version!] = {
            cdnUrl: version.CDNUrl || "",
            cssUrls: version.CDNCssUrl?.split(",") || []
          };
        }
        this.libraries.set(name, libDef);
      }

      // at this point, our library registry is fully populated
      this._configured = true;
    }
  }

  /**
   * Get library definition by name
   */
  static getLibrary(name: string): LibraryDefinition | undefined {
    if (!this._configured)
      throw new Error("LibraryRegistry is not configured, call LibraryRegistry.Config() before using!");

    return this.libraries.get(name?.trim().toLowerCase());
  }

  /**
   * Get CDN URL for a library
   * @param name Library name
   * @param version Optional version (uses default if not specified)
   * @returns CDN URL or undefined if library/version not found
   */
  static getCdnUrl(name: string, version?: string): string | undefined {
    if (!this._configured)
      throw new Error("LibraryRegistry is not configured, call LibraryRegistry.Config() before using!");

    const library = this.libraries.get(name?.trim().toLowerCase());
    if (!library) return undefined;

    const targetVersion = version || library.defaultVersion;
    return library.versions[targetVersion]?.cdnUrl;
  }

  /**
   * Check if a library is approved
   */
  static isApproved(name: string): boolean {
    if (!this._configured)
      throw new Error("LibraryRegistry is not configured, call LibraryRegistry.Config() before using!");

    return this.libraries.has(name?.trim().toLowerCase());
  }

  /**
   * Resolve library version based on semver-like pattern
   * For now, just returns exact match or default
   * TODO: Implement proper semver resolution
   */
  static resolveVersion(name: string, versionPattern?: string): string | undefined {
    if (!this._configured)
      throw new Error("LibraryRegistry is not configured, call LibraryRegistry.Config() before using!");

    const library = this.libraries.get(name?.trim().toLowerCase());
    if (!library) return undefined;

    if (!versionPattern) return library.defaultVersion;

    // For now, just check exact match
    // TODO: Implement proper semver resolution for patterns like "^4.0.0"
    if (library.versions[versionPattern]) {
      return versionPattern;
    }

    // If no exact match, return default
    return library.defaultVersion;
  }

  /**
   * Add a library to the registry (for future extensibility)
   * This would typically be called during app initialization
   * with libraries loaded from a database
   */
  static registerLibrary(definition: LibraryDefinition): void {
    if (!this._configured)
      throw new Error("LibraryRegistry is not configured, call LibraryRegistry.Config() before using!");

    this.libraries.set(definition.name?.trim().toLowerCase(), definition);
  }
}