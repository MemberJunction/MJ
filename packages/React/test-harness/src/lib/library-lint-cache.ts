/**
 * Library lint rule cache with compiled validators
 * Ensures we only load and compile library lint rules once
 */

import { ComponentLibraryEntity, ComponentMetadataEngine } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import * as t from '@babel/types';

export interface CompiledValidator {
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  validateFn: (ast: t.File, path: any, t: typeof import('@babel/types'), context: any) => any;
}

export interface CompiledLibraryRules {
  library: ComponentLibraryEntity;
  initialization?: any;
  lifecycle?: any;
  validators?: Record<string, CompiledValidator>;
  options?: any;
}

export class LibraryLintCache {
  private static instance: LibraryLintCache;
  private compiledRules: Map<string, CompiledLibraryRules> = new Map();
  private loadingPromise: Promise<void> | null = null;
  private isLoaded = false;

  private constructor() {}

  public static getInstance(): LibraryLintCache {
    if (!LibraryLintCache.instance) {
      LibraryLintCache.instance = new LibraryLintCache();
    }
    return LibraryLintCache.instance;
  }

  /**
   * Load and compile all library lint rules
   * Returns existing promise if already loading
   */
  public async loadLibraryRules(contextUser?: UserInfo): Promise<void> {
    // If already loaded, return immediately
    if (this.isLoaded) {
      return Promise.resolve();
    }

    // If loading is in progress, return the existing promise
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    // Start loading
    this.loadingPromise = this.performLoad(contextUser);
    
    try {
      await this.loadingPromise;
      this.isLoaded = true;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async performLoad(contextUser?: UserInfo): Promise<void> {
    // Initialize ComponentMetadataEngine if needed
    await ComponentMetadataEngine.Instance.Config(false, contextUser);
    
    // Get all libraries
    const allLibraries = ComponentMetadataEngine.Instance.ComponentLibraries;
    
    // Process each library
    for (const library of allLibraries) {
      if (library.LintRules) {
        try {
          // Parse the LintRules JSON
          const lintRules = typeof library.LintRules === 'string' 
            ? JSON.parse(library.LintRules) 
            : library.LintRules;
          
          // Compile validators if they exist
          const compiledRules: CompiledLibraryRules = {
            library,
            initialization: lintRules.initialization,
            lifecycle: lintRules.lifecycle,
            options: lintRules.options
          };
          
          // Compile validator functions
          if (lintRules.validators) {
            compiledRules.validators = {};
            
            for (const [name, validator] of Object.entries(lintRules.validators)) {
              if (validator && typeof validator === 'object') {
                const validatorDef = validator as any;
                if (validatorDef.validate) {
                  try {
                    // Create the validation function from the string
                    // The validate property should contain the full function code after @file resolution
                    const validateFn = new Function('ast', 'path', 't', 'context', 
                      `return (${validatorDef.validate})(ast, path, t, context);`
                    ) as any;
                    
                    compiledRules.validators[name] = {
                      description: validatorDef.description,
                      severity: validatorDef.severity,
                      validateFn
                    };
                  } catch (error) {
                    console.warn(`Failed to compile validator ${name} for library ${library.Name}:`, error);
                  }
                }
              }
            }
          }
          
          // Cache the compiled rules
          this.compiledRules.set(library.Name || '', compiledRules);
          
        } catch (error) {
          console.warn(`Failed to parse LintRules for library ${library.Name}:`, error);
        }
      }
    }
  }

  /**
   * Get compiled rules for a specific library
   */
  public getLibraryRules(libraryName: string): CompiledLibraryRules | undefined {
    return this.compiledRules.get(libraryName);
  }

  /**
   * Get all compiled library rules
   */
  public getAllLibraryRules(): CompiledLibraryRules[] {
    return Array.from(this.compiledRules.values());
  }

  /**
   * Clear the cache (useful for testing or when libraries are updated)
   */
  public clearCache(): void {
    this.compiledRules.clear();
    this.isLoaded = false;
    this.loadingPromise = null;
  }
}