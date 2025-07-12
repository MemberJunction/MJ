import { BaseSingleton } from "@memberjunction/global";

/**
 * Component registration entry with metadata
 */
export interface ComponentRegistryEntry {
  component: any;
  metadata?: {
    context?: string;
    version?: string;
    description?: string;
  };
}

/**
 * Global component registry service for managing reusable React components
 * Extends BaseSingleton to ensure a truly global singleton instance across
 * the entire application, even if this code is loaded multiple times.
 */
export class GlobalComponentRegistry extends BaseSingleton<GlobalComponentRegistry> {
  private components = new Map<string, ComponentRegistryEntry>();
  
  protected constructor() {
    super(); // Call parent constructor to register in global store
  }
  
  /**
   * Get the singleton instance
   */
  public static get Instance(): GlobalComponentRegistry {
    return super.getInstance<GlobalComponentRegistry>();
  }
  
  /**
   * Register a component with a simple key
   */
  public register(key: string, component: any): void {
    this.components.set(key, { component });
  }
  
  /**
   * Get a component by key
   */
  public get(key: string): any {
    const entry = this.components.get(key);
    return entry?.component;
  }
  
  /**
   * Register a component with metadata for versioning and context
   */
  public registerWithMetadata(
    name: string, 
    context: string, 
    version: string, 
    component: any,
    description?: string
  ): void {
    const key = this.createKey(name, context, version);
    this.components.set(key, {
      component,
      metadata: { context, version, description }
    });
    
    // Also register without version for backwards compatibility
    const contextKey = `${name}_${context}`;
    if (!this.components.has(contextKey)) {
      this.register(contextKey, component);
    }
  }
  
  /**
   * Create a standardized key from component metadata
   */
  private createKey(name: string, context: string, version: string): string {
    return `${name}_${context}_${version}`;
  }
  
  /**
   * Get all registered component keys (useful for debugging)
   */
  public getRegisteredKeys(): string[] {
    return Array.from(this.components.keys());
  }
  
  /**
   * Clear all registered components
   */
  public clear(): void {
    this.components.clear();
  }
  
  /**
   * Check if a component is registered
   */
  public has(key: string): boolean {
    return this.components.has(key);
  }
  
  /**
   * Get component with fallback options
   */
  public getWithFallback(name: string, context: string, version: string): any {
    // Try exact match first
    let key = this.createKey(name, context, version);
    if (this.has(key)) {
      return this.get(key);
    }
    
    // Try without version
    key = `${name}_${context}`;
    if (this.has(key)) {
      return this.get(key);
    }
    
    // Try global version
    key = `${name}_Global`;
    if (this.has(key)) {
      return this.get(key);
    }
    
    // Try just the name
    if (this.has(name)) {
      return this.get(name);
    }
    
    return null;
  }
  
  /**
   * Remove a component from the registry
   */
  public remove(key: string): void {
    this.components.delete(key);
  }
}