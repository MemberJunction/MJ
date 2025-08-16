import fs from 'fs-extra';
import path from 'path';

/**
 * Include directive configuration
 */
export interface IncludeDirective {
  file: string;
  mode?: 'spread' | 'element';
}

/**
 * Preprocesses JSON files to handle @include directives
 * Supports including external JSON files with spreading or element insertion
 */
export class JsonPreprocessor {
  private visitedPaths: Set<string> = new Set();

  /**
   * Process a JSON file and resolve all @include directives
   * @param filePath - Path to the JSON file to process
   * @returns The processed JSON data with all includes resolved
   */
  async processFile(filePath: string): Promise<any> {
    this.visitedPaths.clear();
    const fileContent = await fs.readJson(filePath);
    return this.processIncludesInternal(fileContent, filePath);
  }

  /**
   * Recursively process @include directives in JSON data
   * @param data - The JSON data to process
   * @param currentFilePath - Path of the current file for resolving relative paths
   * @returns The processed data with includes resolved
   */
  private async processIncludesInternal(data: any, currentFilePath: string): Promise<any> {
    // Process based on data type
    if (Array.isArray(data)) {
      return this.processArray(data, currentFilePath);
    } else if (data && typeof data === 'object') {
      return this.processObject(data, currentFilePath);
    } else {
      return data;
    }
  }

  /**
   * Process an array, handling @include directives
   * @param arr - The array to process
   * @param currentFilePath - Current file path for resolving relative paths
   * @returns Processed array with includes resolved
   */
  private async processArray(arr: any[], currentFilePath: string): Promise<any[]> {
    const result: any[] = [];
    
    for (const item of arr) {
      // Check for string-based include in array (default element mode)
      if (typeof item === 'string' && item.startsWith('@include:')) {
        const includePath = item.substring(9).trim();
        const resolvedPath = this.resolvePath(includePath, currentFilePath);
        const includedContent = await this.loadAndProcessInclude(resolvedPath);
        
        // If included content is an array, spread its elements
        if (Array.isArray(includedContent)) {
          result.push(...includedContent);
        } else {
          // Otherwise add as single element
          result.push(includedContent);
        }
      } else if (item && typeof item === 'object') {
        // Process nested objects/arrays
        result.push(await this.processIncludesInternal(item, currentFilePath));
      } else {
        result.push(item);
      }
    }
    
    return result;
  }

  /**
   * Process an object, handling @include directives
   * @param obj - The object to process
   * @param currentFilePath - Current file path for resolving relative paths
   * @returns Processed object with includes resolved
   */
  private async processObject(obj: any, currentFilePath: string): Promise<any> {
    const result: any = {};
    let hasInclude = false;
    let includeDirective: IncludeDirective | null = null;
    
    // Check for @include property
    if ('@include' in obj) {
      hasInclude = true;
      const includeValue = obj['@include'];
      
      if (typeof includeValue === 'string') {
        // Simple string include - default to spread mode in objects
        includeDirective = { file: includeValue, mode: 'spread' };
      } else if (includeValue && typeof includeValue === 'object') {
        // Explicit include configuration
        includeDirective = includeValue as IncludeDirective;
        // Default to spread mode if not specified
        if (!includeDirective.mode) {
          includeDirective.mode = 'spread';
        }
      }
    }
    
    // Process the include if found
    if (hasInclude && includeDirective) {
      const resolvedPath = this.resolvePath(includeDirective.file, currentFilePath);
      const includedContent = await this.loadAndProcessInclude(resolvedPath);
      
      if (includeDirective.mode === 'spread') {
        // Spread mode: merge included object properties
        if (includedContent && typeof includedContent === 'object' && !Array.isArray(includedContent)) {
          Object.assign(result, includedContent);
        } else {
          throw new Error(`Cannot spread non-object content from ${includeDirective.file}. Use mode: "element" for non-object includes.`);
        }
      } else if (includeDirective.mode === 'element') {
        // Element mode: directly insert the content
        // This essentially replaces the entire object with the included content
        return includedContent;
      }
    }
    
    // Process remaining properties
    for (const [key, value] of Object.entries(obj)) {
      if (key === '@include') {
        // Skip the @include property itself
        continue;
      }
      
      // Recursively process nested structures
      if (value && typeof value === 'object') {
        result[key] = await this.processIncludesInternal(value, currentFilePath);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Load and process an included file
   * @param filePath - Path to the file to include
   * @returns The processed content of the included file
   */
  private async loadAndProcessInclude(filePath: string): Promise<any> {
    const absolutePath = path.resolve(filePath);
    
    // Check if this file is already being processed (circular reference)
    if (this.visitedPaths.has(absolutePath)) {
      throw new Error(`Circular reference detected: ${absolutePath} is already being processed`);
    }
    
    if (!await fs.pathExists(filePath)) {
      throw new Error(`Include file not found: ${filePath}`);
    }
    
    // Add to visited paths before processing
    this.visitedPaths.add(absolutePath);
    
    try {
      const content = await fs.readJson(filePath);
      // Process the content (visited tracking is handled in this method)
      return this.processIncludesInternal(content, filePath);
    } finally {
      // Remove from visited paths after processing
      this.visitedPaths.delete(absolutePath);
    }
  }

  /**
   * Resolve a potentially relative path to an absolute path
   * @param includePath - The path specified in the @include
   * @param currentFilePath - The current file's path
   * @returns Absolute path to the included file
   */
  private resolvePath(includePath: string, currentFilePath: string): string {
    const currentDir = path.dirname(currentFilePath);
    return path.resolve(currentDir, includePath);
  }

  /**
   * Process JSON data that's already loaded (for integration with existing code)
   * @param data - The JSON data to process
   * @param filePath - The file path (for resolving relative includes)
   * @returns Processed data with includes resolved
   */
  async processJsonData(data: any, filePath: string): Promise<any> {
    this.visitedPaths.clear();
    return this.processIncludesInternal(data, filePath);
  }
}