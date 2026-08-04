/**
 * @fileoverview Analyzes the ComponentStyles TypeScript interface to validate style property access
 * @module @memberjunction/react-test-harness
 */

import * as ts from 'typescript';
import * as path from 'path';
import * as fs from 'fs';
import { createRequire } from 'module';
import { SetupStyles } from '@memberjunction/react-runtime';
import type { ComponentStyles } from '@memberjunction/interactive-component-types';

// ESM compatibility: require.resolve is not available in ESM, use createRequire
// See: https://nodejs.org/api/module.html#modulecreaterequirefilename
const _require = createRequire(import.meta.url);

/**
 * Analyzes the ComponentStyles interface from @memberjunction/interactive-component-types
 * to provide validation and suggestions for style property access
 */
export class StylesTypeAnalyzer {
  private validPaths: Set<string>;
  private propertyMap: Map<string, string[]>;
  private defaultStyles: ComponentStyles;
  
  constructor() {
    this.validPaths = new Set();
    this.propertyMap = new Map();
    
    // Get the default styles from the runtime - single source of truth
    this.defaultStyles = SetupStyles();
    
    this.analyzeComponentStylesInterface();
  }
  
  /**
   * Analyzes the ComponentStyles interface to extract all valid property paths
   */
  private analyzeComponentStylesInterface(): void {
    try {
      // Find the type definition file
      const typePackagePath = _require.resolve('@memberjunction/interactive-component-types');
      const packageDir = path.dirname(typePackagePath);
      const typeFile = path.join(packageDir, 'src', 'runtime-types.ts');
      
      // Check if file exists, if not try the dist version
      const actualFile = fs.existsSync(typeFile) 
        ? typeFile 
        : path.join(packageDir, 'runtime-types.d.ts');
      
      if (!fs.existsSync(actualFile)) {
        // Fallback to hardcoded structure if we can't find the file
        this.loadFallbackStructure();
        return;
      }
      
      const sourceCode = fs.readFileSync(actualFile, 'utf-8');
      
      // Create a TypeScript program to parse the file
      const sourceFile = ts.createSourceFile(
        actualFile,
        sourceCode,
        ts.ScriptTarget.Latest,
        true
      );
      
      // Find the ComponentStyles interface
      const interfaceNode = this.findInterface(sourceFile, 'ComponentStyles');
      if (interfaceNode) {
        this.extractPaths(interfaceNode, []);
      } else {
        // Fallback if we can't find the interface
        this.loadFallbackStructure();
      }
    } catch (error) {
      console.warn('Failed to analyze ComponentStyles interface, using fallback structure:', error);
      this.loadFallbackStructure();
    }
  }
  
  /**
   * Finds an interface by name in a source file
   */
  private findInterface(sourceFile: ts.SourceFile, name: string): ts.InterfaceDeclaration | undefined {
    let result: ts.InterfaceDeclaration | undefined;
    
    const visit = (node: ts.Node) => {
      if (ts.isInterfaceDeclaration(node) && node.name?.text === name) {
        result = node;
        return;
      }
      ts.forEachChild(node, visit);
    };
    
    visit(sourceFile);
    return result;
  }
  
  /**
   * Recursively extracts property paths from an interface
   */
  private extractPaths(node: ts.Node, currentPath: string[]): void {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)) {
      const members = ts.isInterfaceDeclaration(node) ? node.members : node.members;
      
      members.forEach(member => {
        if (ts.isPropertySignature(member) && member.name && ts.isIdentifier(member.name)) {
          const propName = member.name.text;
          const newPath = [...currentPath, propName];
          
          // Add this path
          this.addPath(newPath);
          
          // If the type is an object/interface, recurse
          if (member.type) {
            this.extractPathsFromType(member.type, newPath);
          }
        }
      });
    }
  }
  
  /**
   * Extracts paths from a type node
   */
  private extractPathsFromType(typeNode: ts.TypeNode, currentPath: string[]): void {
    if (ts.isTypeLiteralNode(typeNode)) {
      this.extractPaths(typeNode, currentPath);
    } else if (ts.isUnionTypeNode(typeNode)) {
      // For union types, we might have object literals
      typeNode.types.forEach(type => {
        if (ts.isTypeLiteralNode(type)) {
          this.extractPaths(type, currentPath);
        }
      });
    }
  }
  
  /**
   * Adds a path to our tracking structures
   */
  private addPath(pathArray: string[]): void {
    const pathStr = pathArray.join('.');
    this.validPaths.add(pathStr);
    
    // Add to property map for quick lookup
    const lastProp = pathArray[pathArray.length - 1];
    if (!this.propertyMap.has(lastProp)) {
      this.propertyMap.set(lastProp, []);
    }
    this.propertyMap.get(lastProp)!.push(pathStr);
  }
  
  /**
   * Loads structure from the actual runtime default styles
   */
  private loadFallbackStructure(): void {
    // Use the actual default styles as the structure source
    // We need to cast through unknown because ComponentStyles doesn't have an index signature
    this.buildPathsFromStructure(this.defaultStyles as unknown as Record<string, unknown>, []);
  }
  
  /**
   * Builds paths from a structure object
   */
  private buildPathsFromStructure(obj: Record<string, unknown>, currentPath: string[]): void {
    for (const key in obj) {
      const newPath = [...currentPath, key];
      this.addPath(newPath);
      
      const value = obj[key];
      // Check if it's an object but not a boolean (which was being compared incorrectly)
      if (value && typeof value === 'object') {
        this.buildPathsFromStructure(value as Record<string, unknown>, newPath);
      }
    }
  }
  
  /**
   * Checks if a property path is valid
   */
  isValidPath(pathArray: string[]): boolean {
    // Remove 'styles' from the beginning if present
    const cleanPath = pathArray[0] === 'styles' ? pathArray.slice(1) : pathArray;
    return this.validPaths.has(cleanPath.join('.'));
  }
  
  /**
   * Finds all paths containing a specific property name
   */
  findPropertyPaths(propertyName: string): string[] {
    const paths: string[] = [];
    
    // Look for exact matches
    if (this.propertyMap.has(propertyName)) {
      paths.push(...this.propertyMap.get(propertyName)!);
    }
    
    return paths;
  }
  
  /**
   * Gets suggestions for an invalid path
   */
  getSuggestionsForPath(invalidPath: string[]): {
    correctPaths: string[],
    availableAtParent: string[],
    didYouMean: string | null
  } {
    // Remove 'styles' prefix if present
    const cleanPath = invalidPath[0] === 'styles' ? invalidPath.slice(1) : invalidPath;
    
    const suggestions: {
      correctPaths: string[],
      availableAtParent: string[],
      didYouMean: string | null
    } = {
      correctPaths: [],
      availableAtParent: [],
      didYouMean: null
    };
    
    // Find where the misplaced property might exist
    const lastProp = cleanPath[cleanPath.length - 1];
    suggestions.correctPaths = this.findPropertyPaths(lastProp)
      .map(p => 'styles.' + p);
    
    // Get available properties at the parent level
    if (cleanPath.length > 1) {
      const parentPath = cleanPath.slice(0, -1).join('.');
      this.validPaths.forEach(validPath => {
        if (validPath.startsWith(parentPath + '.')) {
          const nextProp = validPath.substring(parentPath.length + 1).split('.')[0];
          if (nextProp && !suggestions.availableAtParent.includes(nextProp)) {
            suggestions.availableAtParent.push(nextProp);
          }
        }
      });
    } else {
      // At root level, show root properties
      this.validPaths.forEach(validPath => {
        const rootProp = validPath.split('.')[0];
        if (!suggestions.availableAtParent.includes(rootProp)) {
          suggestions.availableAtParent.push(rootProp);
        }
      });
    }
    
    // Generate "did you mean" suggestion
    if (suggestions.correctPaths.length > 0) {
      suggestions.didYouMean = suggestions.correctPaths[0];
    }
    
    return suggestions;
  }
  
  /**
   * Gets the actual default value from the runtime styles object
   * This ensures we have a single source of truth for default values
   */
  getDefaultValueForPath(pathArray: string[]): string {
    const cleanPath = pathArray[0] === 'styles' ? pathArray.slice(1) : pathArray;
    
    // Navigate the actual default styles object to get the real value
    // Cast through unknown because ComponentStyles doesn't have an index signature
    let current: Record<string, unknown> | string | number | undefined = this.defaultStyles as unknown as Record<string, unknown>;
    
    for (const prop of cleanPath) {
      if (current && typeof current === 'object' && prop in current) {
        current = current[prop] as Record<string, unknown> | string | number | undefined;
      } else {
        // Path doesn't exist in defaults, return empty string
        return "undefined";
      }
    }
    
    // If we found a value, return it properly quoted
    if (current !== undefined && current !== null) {
      // For string values, add quotes
      if (typeof current === 'string') {
        return `'${current}'`;
      }
      // For objects (intermediate paths), return undefined since we can't provide a meaningful default
      if (typeof current === 'object') {
        return "{}";
      }
      // For other primitive types, convert to string
      return String(current);
    }
    
    return "undefined";
  }
}