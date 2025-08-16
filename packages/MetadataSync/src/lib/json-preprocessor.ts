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
    const includeKeys: string[] = [];
    const includeDirectives: Map<string, IncludeDirective> = new Map();
    
    // First pass: identify all @include keys (both @include and @include.*)
    for (const key of Object.keys(obj)) {
      if (key === '@include' || key.startsWith('@include.')) {
        includeKeys.push(key);
        const includeValue = obj[key];
        
        if (typeof includeValue === 'string') {
          // Simple string include - default to spread mode in objects
          includeDirectives.set(key, { file: includeValue, mode: 'spread' });
        } else if (includeValue && typeof includeValue === 'object') {
          // Explicit include configuration
          const directive = includeValue as IncludeDirective;
          // Default to spread mode if not specified
          if (!directive.mode) {
            directive.mode = 'spread';
          }
          includeDirectives.set(key, directive);
        }
      }
    }
    
    // Second pass: process all properties in order, spreading includes when encountered
    for (const [key, value] of Object.entries(obj)) {
      if (key === '@include' || key.startsWith('@include.')) {
        // Process this include directive
        const includeDirective = includeDirectives.get(key);
        if (includeDirective) {
          const resolvedPath = this.resolvePath(includeDirective.file, currentFilePath);
          const includedContent = await this.loadAndProcessInclude(resolvedPath);
          
          if (includeDirective.mode === 'spread') {
            // Spread mode: merge included object properties at this position
            if (includedContent && typeof includedContent === 'object' && !Array.isArray(includedContent)) {
              Object.assign(result, includedContent);
            } else {
              throw new Error(`Cannot spread non-object content from ${includeDirective.file}. Use mode: "element" for non-object includes.`);
            }
          } else if (includeDirective.mode === 'element') {
            // Element mode: directly insert the content
            // For dot notation includes, we can't replace the whole object,
            // so we'll add it as a property instead (though this is unusual)
            if (key.includes('.')) {
              // Extract the part after the dot to use as property name
              const propName = key.split('.').slice(1).join('.');
              result[propName] = includedContent;
            } else {
              // For plain @include with element mode, replace the entire object
              return includedContent;
            }
          }
        }
      } else {
        // Regular property - process recursively and handle @file references
        if (typeof value === 'string' && value.startsWith('@file:')) {
          // Process @file reference
          const filePath = value.substring(6); // Remove '@file:' prefix
          const resolvedPath = this.resolvePath(filePath, currentFilePath);
          result[key] = await this.loadFileContent(resolvedPath);
        } else if (value && typeof value === 'object') {
          result[key] = await this.processIncludesInternal(value, currentFilePath);
        } else {
          result[key] = value;
        }
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
   * Load file content and process it if it's JSON with @include directives
   * @param filePath - Path to the file to load
   * @returns The file content (processed if JSON with @includes)
   */
  private async loadFileContent(filePath: string): Promise<any> {
    if (!await fs.pathExists(filePath)) {
      // Return the original @file reference if file doesn't exist
      // This matches the behavior of SyncEngine.processFieldValue
      return `@file:${path.relative(path.dirname(filePath), filePath)}`;
    }

    try {
      if (filePath.endsWith('.json')) {
        // For JSON files, load and check for @include directives
        const jsonContent = await fs.readJson(filePath);
        const jsonString = JSON.stringify(jsonContent);
        const hasIncludes = jsonString.includes('"@include"') || jsonString.includes('"@include.');
        
        if (hasIncludes) {
          // Process @include directives in the JSON file
          return await this.processIncludesInternal(jsonContent, filePath);
        } else {
          // Return the JSON content as-is
          return jsonContent;
        }
      } else {
        // For non-JSON files, return the text content
        return await fs.readFile(filePath, 'utf-8');
      }
    } catch (error) {
      // On error, return the original @file reference
      return `@file:${path.relative(path.dirname(filePath), filePath)}`;
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