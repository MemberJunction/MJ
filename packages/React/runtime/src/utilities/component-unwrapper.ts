/**
 * @fileoverview Utility functions for unwrapping exports (components, utilities, objects) from UMD-bundled libraries
 * Handles various UMD bundle structures and module wrapping patterns
 * Intelligently handles simple functions, complex objects, and nested exports
 * @module @memberjunction/react-runtime/utilities
 */

/**
 * Core unwrapping logic - handles smart detection and various library patterns
 * @param library - The library object (e.g., antd, MaterialUI, XLSX, or a simple function like ApexCharts)
 * @param exportName - Name of the export to unwrap (e.g., 'Button', 'utils', 'DatePicker.RangePicker')
 * @param debug - Whether to log debug information
 * @returns The unwrapped export (component, utility object, function, etc.) or undefined if not found
 */
function coreUnwrapLogic(library: any, exportName: string, debug: boolean = false): any {
  // 1. Handle null/undefined/primitives - THROW EXCEPTION
  if (library == null) {
    throw new Error(`Cannot unwrap export '${exportName}' from null or undefined library`);
  }
  
  const libraryType = typeof library;
  if (libraryType === 'string' || libraryType === 'number' || libraryType === 'boolean' || libraryType === 'symbol' || libraryType === 'bigint') {
    throw new Error(`Cannot unwrap export '${exportName}' from ${libraryType} value. Library must be an object or function.`);
  }

  // 2. Handle simple function/class (like ApexCharts or a single exported component)
  if (libraryType === 'function') {
    if (debug) {
      console.log(`📦 Library is a single function/class, returning it for '${exportName}'`);
      console.log(`   Function name: ${library.name || 'anonymous'}`);
      
      // Check if it's a class with static methods
      const hasStatics = Object.keys(library).some(key => 
        key !== 'prototype' && key !== 'length' && key !== 'name' && key !== 'caller' && key !== 'arguments'
      );
      if (hasStatics) {
        console.log(`   Has static properties: ${Object.keys(library).filter(k => 
          k !== 'prototype' && k !== 'length' && k !== 'name' && k !== 'caller' && k !== 'arguments'
        ).join(', ')}`);
      }
    }
    return library;
  }

  // 3. Handle object with single property (auto-detect pattern)
  if (libraryType === 'object') {
    const objectKeys = Object.keys(library).filter(key => key !== '__esModule' && key !== 'default');
    
    if (objectKeys.length === 1 && typeof library[objectKeys[0]] === 'function') {
      if (debug) {
        console.log(`📦 Library has single exported function '${objectKeys[0]}', using it for '${exportName}'`);
      }
      return library[objectKeys[0]];
    }
    
    // Also check if library.default is the only meaningful export
    if (objectKeys.length === 0 && library.default && typeof library.default === 'function') {
      if (debug) {
        console.log(`📦 Library only has default export (function), using it for '${exportName}'`);
      }
      return library.default;
    }
  }

  // 4. Standard unwrapping for complex libraries
  if (debug) {
    console.log(`📦 Library is a complex object, attempting standard unwrapping for '${exportName}'`);
  }

  // Check if exportName contains dot notation (e.g., 'DatePicker.RangePicker')
  if (exportName.includes('.')) {
    const parts = exportName.split('.');
    let current = library;
    let pathTaken = 'library';
    
    // Navigate through the path
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      if (!current) {
        if (debug) {
          console.log(`   ❌ Cannot access '${part}' - parent is null/undefined at path: ${pathTaken}`);
        }
        return undefined;
      }
      
      // For the first part, try various unwrapping strategies
      if (i === 0) {
        // Try different paths for the first component
        if (debug) {
          console.log(`   Checking library.${part}...`);
        }
        const firstComponent = current[part];
        
        if (debug) {
          console.log(`   Checking library.default.${part}...`);
        }
        const firstDefault = current.default?.[part];
        
        if (firstComponent) {
          current = firstComponent;
          pathTaken = `library.${part}`;
          if (debug) {
            console.log(`   ✅ Found via ${pathTaken}`);
          }
        } else if (firstDefault) {
          current = firstDefault;
          pathTaken = `library.default.${part}`;
          if (debug) {
            console.log(`   ✅ Found via ${pathTaken}`);
          }
        } else {
          if (debug) {
            console.log(`   ❌ Could not find '${part}' in library`);
          }
          return undefined;
        }
      } else {
        // For nested parts, just access directly (they should be properties on the component object)
        if (debug) {
          console.log(`   Checking ${pathTaken}.${part}...`);
        }
        if (current[part]) {
          current = current[part];
          pathTaken += `.${part}`;
          if (debug) {
            console.log(`   ✅ Found via ${pathTaken}`);
          }
        } else if (current.default?.[part]) {
          // Sometimes nested components are also wrapped in default
          current = current.default[part];
          pathTaken += `.default.${part}`;
          if (debug) {
            console.log(`   ✅ Found via ${pathTaken}.default`);
          }
        } else {
          if (debug) {
            console.log(`   ❌ Could not find '${part}' at path: ${pathTaken}`);
          }
          return undefined;
        }
      }
    }
    
    // Check if the final result is a valid export (component, utility, object, etc.)
    // We accept anything except null/undefined
    const isValidExport = (obj: any): boolean => {
      return obj != null; // This checks for both null and undefined
    };
    
    if (isValidExport(current)) {
      if (debug) {
        console.log(`✅ Successfully unwrapped '${exportName}' via: ${pathTaken}`);
        const exportType = typeof current === 'function' ? 
          (current.prototype?.isReactComponent ? 'React class component' : 'function/component') :
          (typeof current === 'object' ? 'object/utility' : typeof current);
        console.log(`   Export type: ${exportType}`);
      }
      return current;
    } else if (current?.default && isValidExport(current.default)) {
      // One more check: the final export might have a default export
      if (debug) {
        console.log(`✅ Successfully unwrapped '${exportName}' via: ${pathTaken}.default`);
      }
      return current.default;
    } else {
      if (debug) {
        console.log(`   ❌ '${exportName}' at ${pathTaken} is null/undefined`);
      }
      return undefined;
    }
  }

  // Original logic for non-dot notation components
  // Track which path we used for debugging
  let unwrapPath: string = '';
  let component: any;

  // Helper to check if something is a valid export (any non-null value)
  // This allows components, utilities, objects, classes, etc.
  const isValidExport = (obj: any): boolean => {
    return obj != null; // Checks for both null and undefined
  };

  // Path 1: Direct access (library.Component)
  if (debug) {
    console.log(`   Checking library.${exportName}...`);
  }
  const directComponent = library[exportName];
  
  // Path 2: Module with default export (library.Component.default)
  if (debug && directComponent) {
    console.log(`   Checking library.${exportName}.default...`);
  }
  const moduleDefault = directComponent?.default;
  
  // Path 3: Library wrapped in default (library.default.Component)
  if (debug && library.default) {
    console.log(`   Checking library.default.${exportName}...`);
  }
  const libraryDefault = library.default?.[exportName];
  
  // Path 4: Library wrapped in default with module default (library.default.Component.default)
  if (debug && libraryDefault) {
    console.log(`   Checking library.default.${exportName}.default...`);
  }
  const libraryDefaultModule = library.default?.[exportName]?.default;

  // Check each path in order of likelihood
  if (isValidExport(directComponent)) {
    component = directComponent;
    unwrapPath = `library.${exportName}`;
    if (debug) {
      console.log(`   ✅ Found via ${unwrapPath}`);
      const exportType = typeof directComponent === 'function' ? 'function' : 
                        typeof directComponent === 'object' ? 'object' : typeof directComponent;
      console.log(`   Export type: ${exportType}`);
    }
  } else if (isValidExport(moduleDefault)) {
    component = moduleDefault;
    unwrapPath = `library.${exportName}.default`;
    if (debug) {
      console.log(`   ✅ Found via ${unwrapPath}`);
    }
  } else if (isValidExport(libraryDefault)) {
    component = libraryDefault;
    unwrapPath = `library.default.${exportName}`;
    if (debug) {
      console.log(`   ✅ Found via ${unwrapPath}`);
    }
  } else if (isValidExport(libraryDefaultModule)) {
    component = libraryDefaultModule;
    unwrapPath = `library.default.${exportName}.default`;
    if (debug) {
      console.log(`   ✅ Found via ${unwrapPath}`);
    }
  }

  // Debug logging for failure cases
  if (debug && !component) {
    console.log(`   ❌ Could not unwrap '${exportName}' from library (all paths were null/undefined)`);
    console.log('   Library structure:');
    console.log('   - Top-level keys:', Object.keys(library).slice(0, 10).join(', '), 
                Object.keys(library).length > 10 ? '...' : '');
    
    console.log(`   - library.${exportName}:`, directComponent);
    
    if (library.default) {
      console.log('   - library.default exists, keys:', 
                  Object.keys(library.default).slice(0, 10).join(', '));
    }
  }

  return component;
}

/**
 * Unwraps a single export from a UMD library, handling various bundle structures
 * Works with components, utilities, objects, functions, and any other exports
 * @param library - The library object (e.g., antd, MaterialUI, XLSX)
 * @param exportName - Name of the export to unwrap (e.g., 'Button', 'utils', 'writeFile')
 * @param debug - Whether to log debug information
 * @returns The unwrapped export or undefined if not found
 */
export function unwrapLibraryComponent(library: any, exportName: string, debug: boolean = false): any {
  try {
    return coreUnwrapLogic(library, exportName, debug);
  } catch (error: any) {
    if (debug) {
      console.error(`🚫 Error unwrapping export '${exportName}':`, error.message);
    }
    throw error;
  }
}

/**
 * Unwraps multiple exports from a UMD library using varargs
 * Works with any type of export: components, utilities, objects, functions, etc.
 * @param library - The library object (e.g., antd, XLSX, ApexCharts)
 * @param exportNames - Export names to unwrap (e.g., 'Button', 'utils', 'writeFile')
 * @returns Object with export names as keys and unwrapped values as values
 */
export function unwrapLibraryComponents(
  library: any,
  ...exportNames: string[]
): Record<string, any> {
  // Determine debug mode from the last parameter if it's a boolean
  let debug = false;
  let names = exportNames;
  
  // Check if the last argument is a debug flag (for backward compatibility)
  const lastArg = exportNames[exportNames.length - 1];
  if (typeof lastArg === 'boolean') {
    debug = lastArg;
    names = exportNames.slice(0, -1);
  }
  
  const components: Record<string, any> = {};
  const found: string[] = [];
  const notFound: string[] = [];
  
  // Check if library is a simple function/class that should be returned for all names
  const libraryType = typeof library;
  
  // Handle null/undefined/primitives early
  if (library == null || 
      libraryType === 'string' || 
      libraryType === 'number' || 
      libraryType === 'boolean' ||
      libraryType === 'symbol' ||
      libraryType === 'bigint') {
    // Let the core logic throw the appropriate error
    try {
      coreUnwrapLogic(library, names[0] || 'unknown', debug);
    } catch (error: any) {
      if (debug) {
        console.error(`🚫 ${error.message}`);
      }
      throw error;
    }
  }
  
  // For simple functions/classes, return the same function for all requested names
  if (libraryType === 'function') {
    if (debug) {
      console.log(`📦 Library is a single function/class, returning it for all ${names.length} requested names`);
    }
    for (const name of names) {
      components[name] = library;
      found.push(name);
    }
  } else {
    // For complex objects, use the core unwrap logic for each component
    for (const name of names) {
      try {
        const component = coreUnwrapLogic(library, name, false); // Use false to avoid verbose logging per component
        if (component) {
          components[name] = component;
          
          // Also provide a convenience mapping for the last part of the name
          // e.g., 'DatePicker.RangePicker' also available as 'RangePicker'
          if (name.includes('.')) {
            const lastPart = name.split('.').pop();
            if (lastPart && !components[lastPart]) {
              // Only add the short name if it doesn't conflict with another component
              components[lastPart] = component;
            }
          }
          
          found.push(name);
        } else {
          notFound.push(name);
        }
      } catch (error: any) {
        // If core logic throws an error, it's a critical failure
        throw error;
      }
    }
  }
  
  if (debug) {
    if (found.length > 0) {
      console.log(`📦 Successfully unwrapped ${found.length} components:`, found.join(', '));
    }
    if (notFound.length > 0) {
      console.warn(`⚠️ Could not unwrap ${notFound.length} components:`, notFound.join(', '));
    }
  }
  
  return components;
}

/**
 * Auto-detects and unwraps all components from a library
 * Uses PascalCase detection to identify likely component exports
 * @param library - The library object
 * @param debug - Whether to log debug information
 * @returns Object with all detected components
 */
export function unwrapAllLibraryComponents(library: any, debug: boolean = false): Record<string, any> {
  const components: Record<string, any> = {};
  
  // Handle simple function/class case
  const libraryType = typeof library;
  
  // Handle null/undefined/primitives early
  if (library == null || 
      libraryType === 'string' || 
      libraryType === 'number' || 
      libraryType === 'boolean' ||
      libraryType === 'symbol' ||
      libraryType === 'bigint') {
    try {
      coreUnwrapLogic(library, 'auto-detect', debug);
    } catch (error: any) {
      if (debug) {
        console.error(`🚫 ${error.message}`);
      }
      throw error;
    }
  }
  
  // For simple functions/classes, return it with its name
  if (libraryType === 'function') {
    const functionName = library.name || 'Component';
    if (debug) {
      console.log(`📦 Library is a single function/class '${functionName}', returning it as the only component`);
    }
    components[functionName] = library;
    return components;
  }
  
  // Helper to check if a key looks like a component name (PascalCase)
  const looksLikeComponentName = (key: string): boolean => {
    if (!key || key.length === 0) return false;
    // Must start with uppercase letter
    if (key[0] !== key[0].toUpperCase()) return false;
    // Exclude common non-component exports
    if (['__esModule', 'VERSION', 'version', 'default'].includes(key)) return false;
    // Should have at least one lowercase letter (to distinguish from CONSTANTS)
    return /[a-z]/.test(key);
  };
  
  const checkedKeys = new Set<string>();
  
  // Check direct properties
  for (const key of Object.keys(library)) {
    if (looksLikeComponentName(key)) {
      try {
        const component = coreUnwrapLogic(library, key, false);
        if (component) {
          components[key] = component;
          checkedKeys.add(key);
        }
      } catch (error) {
        // Skip components that can't be unwrapped
      }
    }
  }
  
  // Check library.default properties if it exists
  if (library.default && typeof library.default === 'object') {
    for (const key of Object.keys(library.default)) {
      if (!checkedKeys.has(key) && looksLikeComponentName(key)) {
        try {
          const component = coreUnwrapLogic(library, key, false);
          if (component) {
            components[key] = component;
            checkedKeys.add(key);
          }
        } catch (error) {
          // Skip components that can't be unwrapped
        }
      }
    }
  }
  
  if (debug) {
    const exportNames = Object.keys(components);
    if (exportNames.length > 0) {
      console.log(`🔍 Auto-detected ${exportNames.length} components from library`);
      console.log('   Components:', exportNames.slice(0, 20).join(', '),
                  exportNames.length > 20 ? `... and ${exportNames.length - 20} more` : '');
    } else {
      console.warn('⚠️ No components auto-detected from library');
      console.log('   Library type:', typeof library);
      if (library) {
        console.log('   Top-level keys:', Object.keys(library).slice(0, 10).join(', '));
      }
    }
  }
  
  return components;
}

// Legacy exports for backward compatibility
export const unwrapComponent = unwrapLibraryComponent;
export const unwrapComponents = (library: any, exportNames: string[], debug: boolean = false) => {
  return unwrapLibraryComponents(library, ...exportNames, debug as any);
};
export const unwrapAllComponents = unwrapAllLibraryComponents;