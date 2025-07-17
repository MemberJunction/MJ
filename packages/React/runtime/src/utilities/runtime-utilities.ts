/**
 * @fileoverview Runtime utilities for React components providing access to MemberJunction core functionality
 * @module @memberjunction/react-runtime/utilities
 */

import { 
  Metadata, 
  RunView, 
  RunQuery, 
  RunViewParams, 
  RunQueryParams,
  LogError
} from '@memberjunction/core';
import { 
  MapEntityInfoToSkipEntityInfo
} from '@memberjunction/skip-types';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { ComponentUtilities, SimpleMetadata, SimpleRunQuery, SimpleRunView } from '@memberjunction/interactive-component-types';

/**
 * Base class for providing runtime utilities to React components.
 * This class can be extended and registered with MJ's ClassFactory
 * to provide custom implementations of data access methods.
 */
@RegisterClass(RuntimeUtilities, 'RuntimeUtilities')
export class RuntimeUtilities {
  /**
   * Builds the complete utilities object for React components
   * This is the main method that components will use
   */
  public buildUtilities(): ComponentUtilities {
    const md = new Metadata();
    return this.SetupUtilities(md);
  }

  /**
   * Sets up the utilities object - copied from skip-chat implementation
   */
  private SetupUtilities(md: Metadata): ComponentUtilities {
    const rv = new RunView();
    const rq = new RunQuery();
    const u: ComponentUtilities = {
      md: this.CreateSimpleMetadata(md),
      rv: this.CreateSimpleRunView(rv),
      rq: this.CreateSimpleRunQuery(rq)
    };            
    return u;
  }

  private CreateSimpleMetadata(md: Metadata): SimpleMetadata {
    return {
      Entities: md.Entities,
      GetEntityObject: (entityName: string) => {
        return md.GetEntityObject(entityName)
      }
    }
  }

  private CreateSimpleRunQuery(rq: RunQuery): SimpleRunQuery {
    return {
      RunQuery: async (params: RunQueryParams) => {
        // Run a single query and return the results
        try {
          const result = await rq.RunQuery(params);
          return result;
        } catch (error) {
          LogError(error);
          throw error; // Re-throw to handle it in the caller
        }
      }
    }
  }

  private CreateSimpleRunView(rv: RunView): SimpleRunView {
    return {
      RunView: async (params: RunViewParams) => {
        // Run a single view and return the results
        try {
          const result = await rv.RunView(params);
          return result;
        } catch (error) {
          LogError(error);
          throw error; // Re-throw to handle it in the caller
        }
      },
      RunViews: async (params: RunViewParams[]) => {
        // Runs multiple views and returns the results
        try {
          const results = await rv.RunViews(params);
          return results;
        } catch (error) {
          LogError(error);
          throw error; // Re-throw to handle it in the caller
        }
      }
    }
  }
}

/**
 * Factory function to create RuntimeUtilities
 * In a Node.js environment, this will use MJ's ClassFactory for runtime substitution
 * In a browser environment, it will use the base class directly
 */
export function createRuntimeUtilities(): RuntimeUtilities {
  // Check if we're in a Node.js environment with MJGlobal available
  if (typeof window === 'undefined') {
    try {
      // Use ClassFactory to get the registered class, defaulting to base RuntimeUtilities
      const obj = MJGlobal.Instance.ClassFactory.CreateInstance<RuntimeUtilities>(RuntimeUtilities);
      if (!obj) {
        throw new Error('Failed to create RuntimeUtilities instance');
      }

      // Ensure the object is an instance of RuntimeUtilities
      return obj;
    } catch (e) {
      // Fall through to default
    }
  }
  
  // Default: just use the base class
  return new RuntimeUtilities();
}