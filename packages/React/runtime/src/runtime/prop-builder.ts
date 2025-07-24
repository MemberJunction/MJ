/**
 * @fileoverview Props builder utilities for React components.
 * Provides utilities for constructing and validating component props.
 * @module @memberjunction/react-runtime/runtime
 */

import { ComponentProps, ComponentCallbacks, ComponentStyles } from '../types';
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
  callbacks: ComponentCallbacks = {},
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
  const normalized: ComponentCallbacks = {};

  // Ensure all callbacks are functions
  if (callbacks.RefreshData && typeof callbacks.RefreshData === 'function') {
    normalized.RefreshData = callbacks.RefreshData;
  }

  if (callbacks.OpenEntityRecord && typeof callbacks.OpenEntityRecord === 'function') {
    normalized.OpenEntityRecord = callbacks.OpenEntityRecord;
  }

  if (callbacks.UpdateUserState && typeof callbacks.UpdateUserState === 'function') {
    // Create a debounced version of UpdateUserState with loop detection
    const originalCallback = callbacks.UpdateUserState;
    
    // Get or create a subject for this callback
    let subject = updateUserStateSubjects.get(originalCallback);
    if (!subject) {
      subject = new Subject<any>();
      updateUserStateSubjects.set(originalCallback, subject);
      
      // Subscribe to the subject with debounce
      const subscription = subject.pipe(
        debounceTime(debounceMs)
      ).subscribe(state => {
        console.log(`[Skip Component] UpdateUserState called after ${debounceMs}ms debounce`);
        originalCallback(state);
      });
      
      // Store the subscription for cleanup
      updateUserStateSubscriptions.set(originalCallback, subscription);
    }
    
    // Get or create loop detection state
    let loopState = loopDetectionStates.get(originalCallback);
    if (!loopState) {
      loopState = { count: 0, lastUpdate: 0, lastState: null };
      loopDetectionStates.set(originalCallback, loopState);
    }
    
    // Return a function that prevents redundant updates
    normalized.UpdateUserState = (state: any) => {
      // Check if this is a redundant update
      if (loopState!.lastState && deepEqual(state, loopState!.lastState)) {
        console.log('[Skip Component] Skipping redundant state update');
        return; // Don't process identical state updates
      }
      
      const now = Date.now();
      const timeSinceLastUpdate = now - loopState!.lastUpdate;
      
      // Check for rapid updates
      if (timeSinceLastUpdate < 100) {
        loopState!.count++;
        
        if (loopState!.count > 5) {
          console.error('[Skip Component] Rapid state updates detected - possible infinite loop');
          console.error('Updates in last 100ms:', loopState!.count);
          // Still process the update but warn
        }
      } else {
        // Reset counter if more than 100ms has passed
        loopState!.count = 0;
      }
      
      loopState!.lastUpdate = now;
      loopState!.lastState = JSON.parse(JSON.stringify(state)); // Deep clone to preserve state
      
      console.log('[Skip Component] Processing state update');
      
      // Push to debounce subject (which already has 3 second debounce)
      subject!.next(state);
    };
  }

  if (callbacks.NotifyEvent && typeof callbacks.NotifyEvent === 'function') {
    normalized.NotifyEvent = callbacks.NotifyEvent;
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
    styles: {}
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
 * Cleanup function for prop builder resources
 * @param callbacks - The callbacks object that was used to build props
 */
export function cleanupPropBuilder(callbacks: ComponentCallbacks): void {
  if (callbacks.UpdateUserState && typeof callbacks.UpdateUserState === 'function') {
    const originalCallback = callbacks.UpdateUserState;
    
    // Unsubscribe from the subject
    const subscription = updateUserStateSubscriptions.get(originalCallback);
    if (subscription) {
      subscription.unsubscribe();
      updateUserStateSubscriptions.delete(originalCallback);
    }
    
    // Complete and remove the subject
    const subject = updateUserStateSubjects.get(originalCallback);
    if (subject) {
      subject.complete();
      updateUserStateSubjects.delete(originalCallback);
    }
    
    // Clear loop detection state
    loopDetectionStates.delete(originalCallback);
  }
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
  const wrapped: ComponentCallbacks = {};

  if (callbacks.RefreshData) {
    wrapped.RefreshData = () => {
      console.log(`[${componentName}] RefreshData called`);
      callbacks.RefreshData!();
    };
  }

  if (callbacks.OpenEntityRecord) {
    wrapped.OpenEntityRecord = (entityName: string, key: any) => {
      console.log(`[${componentName}] OpenEntityRecord called:`, { entityName, key });
      callbacks.OpenEntityRecord!(entityName, key);
    };
  }

  if (callbacks.UpdateUserState) {
    wrapped.UpdateUserState = (state: any) => {
      console.log(`[${componentName}] UpdateUserState called:`, state);
      callbacks.UpdateUserState!(state);
    };
  }

  if (callbacks.NotifyEvent) {
    wrapped.NotifyEvent = (event: string, data: any) => {
      console.log(`[${componentName}] NotifyEvent called:`, { event, data });
      callbacks.NotifyEvent!(event, data);
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