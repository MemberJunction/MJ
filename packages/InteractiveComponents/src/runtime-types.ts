import { CompositeKey } from '@memberjunction/global';
import { SimpleAITools, SimpleDataContext, SimpleMetadata, SimpleRunQuery, SimpleRunView } from './shared';

/**
 * Callbacks a component can use.
 */
export interface ComponentCallbacks {
  /**
   * If an action occurs inside a component where it would be desirable for the containing UI to open a specific
   * record, if supported, this event can be listened to and the container UI can then open the record.
   * @param entityName - this is the Entity NAME from the Entity metadata, not the table name or base view name. Use Entity Metadata to provide the entity name here
   * @param key - this is an array of key/value pairs representing the primary key. The format of a Composite Key is an array of KeyValuePair objects and KeyValuePair objects simply have FieldName and Value properties. In most cases entities have single-valued primary keys but this structure is here for complex entity types that have composite primary keys
   */
  OpenEntityRecord: (entityName: string, key: CompositeKey) => void;

  /**
   * Display a short non-blocking notification message to the user. The container will determine how best to display this message.
   * @param message - text to display
   * @param style - display styling
   * @param hideAfter - option to auto hide after the specified delay in milliseconds
   */
  CreateSimpleNotification: (message: string, style: 'none' | 'success' | 'error' | 'warning' | 'info', hideAfter?: number) => void;

  /**
   * Allows a component to register methods that can be called by the container.
   * @param methodName - Name of the method being registered
   * @param handler - The method implementation
   */
  RegisterMethod: (methodName: string, handler: Function) => void;
}

/**
 * Defines styles for the component. Container can provide styles to a top level component. The top level component
 * can alter these styles based on the design documentation. Top level component will pass in its computed styles to
 * each sub-component and in turn sub-components do the same recursively down to all levels. Allows sub-components to inherit styles but
 * also make adjustments as required by the design documentation.
 */
export interface ComponentStyles {
  colors: {
    // Primary palette
    primary: string; // '#5B4FE9',
    primaryHover: string; // '#4940D4',
    primaryLight?: string; // '#E8E6FF',

    // Secondary palette
    secondary: string; // '#64748B',
    secondaryHover?: string; // '#475569',

    // Status colors
    success: string; // '#10B981',
    successLight?: string; // '#D1FAE5',
    warning?: string; // '#F59E0B',
    warningLight?: string; // '#FEF3C7',
    error?: string; // '#EF4444',
    errorLight?: string; // '#FEE2E2',
    info?: string; // '#3B82F6',
    infoLight?: string; // '#DBEAFE',

    // Base colors
    background: string; // '#FFFFFF',
    surface: string; // '#F8FAFC',
    surfaceHover?: string; // '#F1F5F9',

    // Text colors
    text: string; // '#1E293B',
    textSecondary: string; // '#64748B',
    textTertiary?: string; // '#94A3B8',
    textInverse?: string; // '#FFFFFF',

    // Border colors
    border: string; // '#E2E8F0',
    borderLight?: string; // '#F1F5F9',
    borderFocus?: string; // '#5B4FE9',

    // Shadow colors
    shadow?: string; // 'rgba(0, 0, 0, 0.05)',
    shadowMedium?: string; // 'rgba(0, 0, 0, 0.1)',
    shadowLarge?: string; // 'rgba(0, 0, 0, 0.15)',

    // Allow additional custom colors
    [key: string]: string | undefined;
  };
  spacing: {
    xs: string; // '4px',
    sm: string; // '8px',
    md: string; // '16px',
    lg: string; // '24px',
    xl: string; // '32px',
    xxl?: string; // '48px',
    xxxl?: string; // '64px',

    // Allow additional custom spacing
    [key: string]: string | undefined;
  };
  typography: {
    fontFamily: string; //'-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
    fontSize: {
      xs?: string; // '12px',
      sm: string; // '14px',
      md: string; // '16px',
      lg: string; // '18px',
      xl: string; // '24px',
      xxl?: string; // '32px',
      xxxl?: string; // '40px',

      // Allow additional custom sizes
      [key: string]: string | undefined;
    };
    fontWeight?: {
      light?: string; // '300',
      regular?: string; // '400',
      medium?: string; // '500',
      semibold?: string; // '600',
      bold?: string; // '700',

      // Allow additional custom weights
      [key: string]: string | undefined;
    };
    lineHeight?: {
      tight?: string; // '1.25',
      normal?: string; // '1.5',
      relaxed?: string; // '1.75',

      // Allow additional custom line heights
      [key: string]: string | undefined;
    };
  };
  borders: {
    radius:
      | string
      | {
          // Allow either a single string or an object with multiple radius options
          sm?: string; // '6px',
          md?: string; // '8px',
          lg?: string; // '12px',
          xl?: string; // '16px',
          full?: string; // '9999px',

          // Allow additional custom radii
          [key: string]: string | undefined;
        };
    width:
      | string
      | {
          // Allow either a single string or an object with multiple width options
          thin?: string; // '1px',
          medium?: string; // '2px',
          thick?: string; // '3px',

          // Allow additional custom widths
          [key: string]: string | undefined;
        };
  };
  shadows?: {
    sm?: string; // '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md?: string; // '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg?: string; // '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl?: string; // '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    inner?: string; // 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',

    // Allow additional custom shadows
    [key: string]: string | undefined;
  };
  transitions?: {
    fast?: string; // '150ms ease-in-out',
    normal?: string; // '250ms ease-in-out',
    slow?: string; // '350ms ease-in-out',

    // Allow additional custom transitions
    [key: string]: string | undefined;
  };
  overflow: string;
}

/**
 * This is the function signature for the print function that is provided by the component via the SkipComponentObject
 */
export type ComponentPrintFunction = () => void;
/**
 * This is the function signature for the refresh function that is provided by the component via the SkipComponentObject
 */
export type ComponentRefreshFunction = () => void;

/**
 * The component will create this object and it will include the members defined in this interface and return upon its main function being called.
 */
export interface ComponentObject {
  /**
   * The React component function that receives props including data, userState, callbacks, utilities, and styles.
   */
  component: Function;

  /**
   * The optional print function that is called when the user clicks on the print button in the parent of the component. This function will never be called by the parent before the init function so the print function
   * can assume the component has been initialized;
   */
  print?: ComponentPrintFunction;

  /**
   * The optional refresh function that is called when the user clicks on the refresh button in the parent of the component. This function will never be called by the parent before the init function so the refresh function
   */
  refresh?: ComponentRefreshFunction;

  /**
   * Gets the current data state of the component.
   * Used by AI agents to understand what data is currently displayed.
   */
  getCurrentDataState?: () => any;

  /**
   * Gets the history of data state changes in the component.
   * Returns an array of timestamped state snapshots.
   */
  getDataStateHistory?: () => Array<{ timestamp: Date; state: any }>;

  /**
   * Validates the current state of the component.
   * Returns true if valid, false or validation errors otherwise.
   */
  validate?: () => boolean | { valid: boolean; errors?: string[] };

  /**
   * Checks if the component has unsaved changes.
   */
  isDirty?: () => boolean;

  /**
   * Resets the component to its initial state.
   */
  reset?: () => void;

  /**
   * Scrolls to a specific element or position within the component.
   * @param target - Element selector, element reference, or scroll options
   */
  scrollTo?: (target: string | HTMLElement | { top?: number; left?: number }) => void;

  /**
   * Sets focus to a specific element within the component.
   * @param target - Element selector or element reference
   */
  focus?: (target?: string | HTMLElement) => void;

  /**
   * Generic method invoker for custom methods
   * @param methodName - Name of the method to invoke
   * @param args - Arguments to pass to the method
   * @returns The result of the method call, or undefined if method doesn't exist
   */
  invokeMethod?: (methodName: string, ...args: any[]) => any;

  /**
   * Check if a method is registered on the component
   * @param methodName - Name of the method to check
   * @returns true if the method exists
   */
  hasMethod?: (methodName: string) => boolean;
}

/**
 * This interface defines the utilities that are available to the component at runtime. These utilities are used to interact with the host MJ system to
 * retrieve metadata, run views, and run queries. The utilities are passed into the ComponentInitFunction by the container.
 */
export interface ComponentUtilities {
  md: SimpleMetadata;
  rv: SimpleRunView;
  rq: SimpleRunQuery;
  /**
   * Access to AI tools. This will not always be available in all environments and security contexts, ensure
   * component code has fallbacks when this property is undefined
   */
  ai?: SimpleAITools;
}
