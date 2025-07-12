import { SkipComponentCallbacks, SkipComponentRootSpec, SkipComponentStyles, SkipComponentUtilities } from "@memberjunction/skip-types";
import { ComponentMetadata } from "./component-metadata";


/**
 * Configuration for a React component to be hosted in Angular
 */
export interface ReactComponentConfig {
  component: SkipComponentRootSpec 
  
  /** The HTML container element where the React component will be rendered */
  container: HTMLElement;
  
  /** Data to pass to the component (e.g., entities, lists, etc.) */
  data?: any;
  
  /** Callbacks for component lifecycle events */
  callbacks?: SkipComponentCallbacks;
  
  /** Initial state for the component */
  initialState?: any;
  
  /** Utilities to pass to the component */
  utilities?: SkipComponentUtilities;
  
  /** Styles to pass to the component */
  styles?: SkipComponentStyles;
  
  /** Component metadata for registry integration */
  metadata?: ComponentMetadata;
}