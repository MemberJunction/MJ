/**
 * @fileoverview Props builder utilities for React components.
 * Provides utilities for constructing and validating component props.
 * @module @memberjunction/react-runtime/runtime
 */

import { ComponentStyles, ComponentCallbacks } from '@memberjunction/interactive-component-types';
import { ComponentProps } from '../types';
import { Subject, debounceTime, Subscription } from 'rxjs';

/**
 * Options for building component props
 */
export interface PropBuilderOptions {
  /** Validate props before building */
  validate?: boolean;
  /** Merge with existing props */
  merge?: boolean;
  /** Transform data before passing to component */
  transformData?: (data: any) => any;
  /** Transform state before passing to component */
  transformState?: (state: any) => any;
  /** Debounce time for UpdateUserState callback in milliseconds */
  debounceUpdateUserState?: number;
}

/**
 * Builds component props from various sources
 * @param data - Component data
 * @param userState - User state object
 * @param utilities - Utility functions
 * @param callbacks - Component callbacks
 * @param components - Child components
 * @param styles - Component styles
 * @param options - Builder options
 * @returns Built component props
 */
export function buildComponentProps(
  data: any = {},
  userState: any = {},
  utilities: any = {},
  callbacks: ComponentCallbacks = {
    OpenEntityRecord: () => {},
    RegisterMethod: () => {},
    CreateSimpleNotification: () => {}
  },
  components: Record<string, any> = {},
  styles?: ComponentStyles,
  options: PropBuilderOptions = {},
  onStateChanged?: (stateUpdate: Record<string, any>) => void
): ComponentProps {
  const {
    validate = true,
    transformData,
    transformState,
    debounceUpdateUserState = 3000 // Default 3 seconds
  } = options;

  // Transform data if transformer provided
  const transformedData = transformData ? transformData(data) : data;
  const transformedState = transformState ? transformState(userState) : userState;

  // Build props object
  const props: ComponentProps = {
    data: transformedData,
    userState: transformedState,
    utilities,
    callbacks: normalizeCallbacks(callbacks, debounceUpdateUserState),
    components,
    styles: normalizeStyles(styles),
    onStateChanged
  };

  // Validate if enabled
  if (validate) {
    validateComponentProps(props);
  }

  return props;
}

// Store subjects for debouncing per component instance
const updateUserStateSubjects = new WeakMap<Function, Subject<any>>();

// Store subscriptions for cleanup
const updateUserStateSubscriptions = new WeakMap<Function, Subscription>();

// Loop detection state
interface LoopDetectionState {
  count: number;
  lastUpdate: number;
  lastState: any;
}
const loopDetectionStates = new WeakMap<Function, LoopDetectionState>();

// Deep equality check for objects
function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  
  if (!obj1 || !obj2) return false;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }
  
  return true;
}

/**
 * Normalizes component callbacks
 * @param callbacks - Raw callbacks object
 * @param debounceMs - Debounce time for UpdateUserState in milliseconds
 * @returns Normalized callbacks
 */
export function normalizeCallbacks(callbacks: any, debounceMs: number = 3000): ComponentCallbacks {
  // Provide default implementations for required callbacks
  const normalized: ComponentCallbacks = {
    OpenEntityRecord: callbacks?.OpenEntityRecord || (() => {}),
    RegisterMethod: callbacks?.RegisterMethod || (() => {}),
    CreateSimpleNotification: callbacks?.CreateSimpleNotification || (() => {})
  };

  // Copy any additional callbacks that might exist
  if (callbacks) {
    Object.keys(callbacks).forEach(key => {
      if (typeof callbacks[key] === 'function' && !normalized.hasOwnProperty(key)) {
        (normalized as any)[key] = callbacks[key];
      }
    });
  }

  return normalized;
}

/**
 * Normalizes component styles
 * @param styles - Raw styles object
 * @returns Normalized styles
 */
export function normalizeStyles(styles?: any): any {
  // Pass through the full styles object as-is
  // This allows Skip components to access their full style structure
  // including colors, typography, borders, etc.
  return styles;
}

/**
 * Validates component props
 * @param props - Props to validate
 * @throws Error if validation fails
 */
export function validateComponentProps(props: ComponentProps): void {
  // Validate data
  if (props.data === null || props.data === undefined) {
    throw new Error('Component props.data cannot be null or undefined');
  }

  // Validate userState
  if (props.userState === null) {
    throw new Error('Component props.userState cannot be null');
  }

  // Validate utilities
  if (props.utilities === null) {
    throw new Error('Component props.utilities cannot be null');
  }

  // Validate callbacks
  if (!props.callbacks || typeof props.callbacks !== 'object') {
    throw new Error('Component props.callbacks must be an object');
  }

  // Validate callback functions
  for (const [key, value] of Object.entries(props.callbacks)) {
    if (value !== undefined && typeof value !== 'function') {
      throw new Error(`Component callback "${key}" must be a function`);
    }
  }
}

/**
 * Merges multiple prop objects
 * @param propsList - Array of props to merge
 * @returns Merged props
 */
export function mergeProps(...propsList: Partial<ComponentProps>[]): ComponentProps {
  const merged: ComponentProps = {
    data: {},
    userState: {},
    utilities: {},
    callbacks: {},
    components: {},
    styles: {} as ComponentStyles
  };

  for (const props of propsList) {
    if (props.data) {
      merged.data = { ...merged.data, ...props.data };
    }

    if (props.userState) {
      merged.userState = { ...merged.userState, ...props.userState };
    }

    if (props.utilities) {
      merged.utilities = { ...merged.utilities, ...props.utilities };
    }

    if (props.callbacks) {
      merged.callbacks = { ...merged.callbacks, ...props.callbacks };
    }

    if (props.components) {
      merged.components = { ...merged.components, ...props.components };
    }

    if (props.styles) {
      merged.styles = { ...merged.styles, ...props.styles };
    }
  }

  return merged;
}
 
/**
 * Creates a props transformer function
 * @param transformations - Map of prop paths to transformer functions
 * @returns Props transformer
 */
export function createPropsTransformer(
  transformations: Record<string, (value: any) => any>
): (props: ComponentProps) => ComponentProps {
  return (props: ComponentProps) => {
    const transformed = { ...props };

    for (const [path, transformer] of Object.entries(transformations)) {
      const pathParts = path.split('.');
      let current: any = transformed;
      
      // Navigate to the parent of the target property
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (!current[pathParts[i]]) {
          current[pathParts[i]] = {};
        }
        current = current[pathParts[i]];
      }

      // Apply transformation
      const lastPart = pathParts[pathParts.length - 1];
      if (current[lastPart] !== undefined) {
        current[lastPart] = transformer(current[lastPart]);
      }
    }

    return transformed;
  };
}

/**
 * Creates a callback wrapper that adds logging
 * @param callbacks - Original callbacks
 * @param componentName - Component name for logging
 * @returns Wrapped callbacks
 */
export function wrapCallbacksWithLogging(
  callbacks: ComponentCallbacks,
  componentName: string
): ComponentCallbacks {
  const wrapped: ComponentCallbacks = {
    OpenEntityRecord: callbacks?.OpenEntityRecord || (() => {}),
    RegisterMethod: callbacks?.RegisterMethod || (() => {}),
    CreateSimpleNotification: callbacks?.CreateSimpleNotification || (() => {})
  };

  // Wrap any additional callbacks that might exist
  Object.keys(callbacks).forEach(key => {
    if (key !== 'OpenEntityRecord' && key !== 'RegisterMethod' && key !== 'CreateSimpleNotification' && typeof (callbacks as any)[key] === 'function') {
      (wrapped as any)[key] = (...args: any[]) => {
        console.log(`[${componentName}] ${key} called with args:`, args);
        return (callbacks as any)[key](...args);
      };
    }
  });

  if (callbacks.OpenEntityRecord) {
    wrapped.OpenEntityRecord = (entityName: string, key: any) => {
      console.log(`[${componentName}] OpenEntityRecord called:`, { entityName, key });
      callbacks.OpenEntityRecord!(entityName, key);
    };
  }

  if (callbacks.RegisterMethod) {
    wrapped.RegisterMethod = (methodName: any, handler: any) => {
      console.log(`[${componentName}] RegisterMethod called for:`, methodName);
      callbacks.RegisterMethod!(methodName, handler);
    };
  }

  if (callbacks.CreateSimpleNotification) {
    wrapped.CreateSimpleNotification = (message: string, style: "none" | "success" | "error" | "warning" | "info", hideAfter?: number) => {
      console.log(`[${componentName}] CreateSimpleNotification called:`, { message, style, hideAfter });
      callbacks.CreateSimpleNotification!(message, style, hideAfter);
    };
  }

  return wrapped;
}

/**
 * Extracts props paths used by a component
 * @param componentCode - Component source code
 * @returns Array of prop paths
 */
export function extractPropPaths(componentCode: string): string[] {
  const paths: string[] = [];
  
  // Simple regex patterns to find prop access
  const patterns = [
    /props\.data\.(\w+)/g,
    /props\.userState\.(\w+)/g,
    /props\.utilities\.(\w+)/g,
    /props\.callbacks\.(\w+)/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(componentCode)) !== null) {
      paths.push(match[0]);
    }
  }

  return [...new Set(paths)]; // Remove duplicates
}