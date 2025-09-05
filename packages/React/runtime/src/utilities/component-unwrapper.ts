/**
 * @fileoverview Utility functions for unwrapping components from UMD-bundled libraries
 * Handles various UMD bundle structures and module wrapping patterns
 * @module @memberjunction/react-runtime/utilities
 */

/**
 * Unwraps a single component from a UMD library, handling various bundle structures
 * @param library - The library object (e.g., antd, MaterialUI)
 * @param componentName - Name of the component to unwrap (e.g., 'Button', 'Table', 'DatePicker.RangePicker')
 * @param debug - Whether to log debug information
 * @returns The unwrapped component or undefined if not found
 */
export function unwrapComponent(library: any, componentName: string, debug: boolean = false): any {
  if (!library) {
    if (debug) {
      console.error(`🚫 Library is null or undefined when unwrapping '${componentName}'`);
    }
    return undefined;
  }

  // Check if componentName contains dot notation (e.g., 'DatePicker.RangePicker')
  if (componentName.includes('.')) {
    const parts = componentName.split('.');
    let current = library;
    let pathTaken = 'library';
    
    // Navigate through the path
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      if (!current) {
        if (debug) {
          console.warn(`⚠️ Cannot access '${part}' - parent is null/undefined at path: ${pathTaken}`);
        }
        return undefined;
      }
      
      // For the first part, try various unwrapping strategies
      if (i === 0) {
        // Try different paths for the first component
        const firstComponent = current[part];
        const firstDefault = current.default?.[part];
        
        if (firstComponent) {
          current = firstComponent;
          pathTaken = `library.${part}`;
        } else if (firstDefault) {
          current = firstDefault;
          pathTaken = `library.default.${part}`;
        } else {
          if (debug) {
            console.warn(`⚠️ Could not find '${part}' in library`);
          }
          return undefined;
        }
      } else {
        // For nested parts, just access directly (they should be properties on the component object)
        if (current[part]) {
          current = current[part];
          pathTaken += `.${part}`;
        } else if (current.default?.[part]) {
          // Sometimes nested components are also wrapped in default
          current = current.default[part];
          pathTaken += `.default.${part}`;
        } else {
          if (debug) {
            console.warn(`⚠️ Could not find '${part}' at path: ${pathTaken}`);
          }
          return undefined;
        }
      }
    }
    
    // Check if the final result is a valid component
    const isValidComponent = (obj: any): boolean => {
      if (!obj) return false;
      if (typeof obj === 'function') return true;
      if (typeof obj === 'object' && obj.$$typeof) return true;
      return false;
    };
    
    if (isValidComponent(current)) {
      if (debug) {
        console.log(`✅ Successfully unwrapped '${componentName}' via: ${pathTaken}`);
      }
      return current;
    } else if (current?.default && isValidComponent(current.default)) {
      // One more check: the final component might have a default export
      if (debug) {
        console.log(`✅ Successfully unwrapped '${componentName}' via: ${pathTaken}.default`);
      }
      return current.default;
    } else {
      if (debug) {
        console.warn(`⚠️ Found '${componentName}' at ${pathTaken} but it's not a valid React component`);
        console.log(`   Type: ${typeof current}, Value:`, current);
      }
      return undefined;
    }
  }

  // Original logic for non-dot notation components
  // Track which path we used for debugging
  let unwrapPath: string = '';
  let component: any;

  // Path 1: Direct access (library.Component)
  const directComponent = library[componentName];
  
  // Path 2: Module with default export (library.Component.default)
  const moduleDefault = directComponent?.default;
  
  // Path 3: Library wrapped in default (library.default.Component)
  const libraryDefault = library.default?.[componentName];
  
  // Path 4: Library wrapped in default with module default (library.default.Component.default)
  const libraryDefaultModule = library.default?.[componentName]?.default;

  // Helper to check if something is a valid React component
  const isValidComponent = (obj: any): boolean => {
    if (!obj) return false;
    // Check if it's a function (functional component or class component)
    if (typeof obj === 'function') return true;
    // Check for React special types (memo, forwardRef, lazy, etc.)
    if (typeof obj === 'object' && obj.$$typeof) return true;
    return false;
  };

  // Check each path in order of likelihood
  if (isValidComponent(directComponent)) {
    component = directComponent;
    unwrapPath = `library.${componentName}`;
  } else if (isValidComponent(moduleDefault)) {
    component = moduleDefault;
    unwrapPath = `library.${componentName}.default`;
  } else if (isValidComponent(libraryDefault)) {
    component = libraryDefault;
    unwrapPath = `library.default.${componentName}`;
  } else if (isValidComponent(libraryDefaultModule)) {
    component = libraryDefaultModule;
    unwrapPath = `library.default.${componentName}.default`;
  }

  // Debug logging
  if (debug) {
    if (component) {
      console.log(`✅ Successfully unwrapped '${componentName}' via: ${unwrapPath}`);
      const componentType = typeof component === 'function' ? 
        (component.prototype?.isReactComponent ? 'class component' : 'functional component') :
        'React special type';
      console.log(`   Component type: ${componentType}`);
    } else {
      console.warn(`⚠️ Could not unwrap component '${componentName}' from library`);
      console.log('   Library structure:');
      console.log('   - Top-level keys:', Object.keys(library).slice(0, 10).join(', '), 
                  Object.keys(library).length > 10 ? '...' : '');
      
      if (directComponent) {
        console.log(`   - library.${componentName} type:`, typeof directComponent);
        if (typeof directComponent === 'object' && directComponent !== null) {
          const keys = Object.keys(directComponent);
          console.log(`   - library.${componentName} keys:`, keys.slice(0, 5).join(', '),
                      keys.length > 5 ? '...' : '');
        }
      }
      
      if (library.default) {
        console.log('   - library.default exists, keys:', 
                    Object.keys(library.default).slice(0, 10).join(', '));
      }
    }
  }

  return component;
}

/**
 * Unwraps multiple components from a UMD library
 * @param library - The library object
 * @param componentNames - Array of component names to unwrap (supports dot notation like 'DatePicker.RangePicker')
 * @param debug - Whether to log debug information
 * @returns Object with component names as keys and unwrapped components as values
 */
export function unwrapComponents(
  library: any, 
  componentNames: string[], 
  debug: boolean = false
): Record<string, any> {
  const components: Record<string, any> = {};
  const found: string[] = [];
  const notFound: string[] = [];
  
  for (const name of componentNames) {
    const component = unwrapComponent(library, name, false); // Use false to avoid verbose logging per component
    if (component) {
      // For dot notation names, we might want to store them with a simpler key
      // For example, 'DatePicker.RangePicker' could be stored as 'RangePicker'
      // But to maintain backward compatibility and clarity, we'll use the full path as the key
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
export function unwrapAllComponents(library: any, debug: boolean = false): Record<string, any> {
  const components: Record<string, any> = {};
  const checkedKeys = new Set<string>();
  
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
  
  // Check direct properties
  for (const key of Object.keys(library)) {
    if (looksLikeComponentName(key)) {
      const component = unwrapComponent(library, key, false);
      if (component) {
        components[key] = component;
        checkedKeys.add(key);
      }
    }
  }
  
  // Check library.default properties if it exists
  if (library.default && typeof library.default === 'object') {
    for (const key of Object.keys(library.default)) {
      if (!checkedKeys.has(key) && looksLikeComponentName(key)) {
        const component = unwrapComponent(library, key, false);
        if (component) {
          components[key] = component;
          checkedKeys.add(key);
        }
      }
    }
  }
  
  if (debug) {
    const componentNames = Object.keys(components);
    if (componentNames.length > 0) {
      console.log(`🔍 Auto-detected ${componentNames.length} components from library`);
      console.log('   Components:', componentNames.slice(0, 20).join(', '),
                  componentNames.length > 20 ? `... and ${componentNames.length - 20} more` : '');
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