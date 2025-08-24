/**
 * @fileoverview Runtime utilities for React components providing access to MemberJunction core functionality
 * @module @memberjunction/ng-react/utilities
 */

import { 
  Metadata, 
  RunView, 
  RunQuery, 
  RunViewParams, 
  RunQueryParams,
  LogError,
  BaseEntity,
  IEntityDataProvider
} from '@memberjunction/core';

import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { 
  ComponentUtilities, 
  SimpleAITools, 
  SimpleMetadata, 
  SimpleRunQuery, 
  SimpleRunView,
  SimpleExecutePromptParams,
  SimpleExecutePromptResult,
  SimpleEmbedTextParams,
  SimpleEmbedTextResult
} from '@memberjunction/interactive-component-types';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { SimpleVectorService } from '@memberjunction/ai-vectors-memory';

/**
 * Base class for providing runtime utilities to React components in Angular.
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
      rq: this.CreateSimpleRunQuery(rq),
      ai: this.CreateSimpleAITools()
    };            
    return u;
  }

  private CreateSimpleAITools(): SimpleAITools {
    // Get the GraphQL provider - it's the same as the BaseEntity provider
    const provider = BaseEntity.Provider;
    
    // Check if it's a GraphQLDataProvider
    if (!(provider instanceof GraphQLDataProvider)) {
      throw new Error('Current data provider is not a GraphQLDataProvider. AI tools require GraphQL provider.');
    }

    const graphQLProvider = provider as GraphQLDataProvider;
    
    return {
      ExecutePrompt: async (params: SimpleExecutePromptParams): Promise<SimpleExecutePromptResult> => {
        try {
          // Use the AI client from GraphQLDataProvider to execute simple prompt
          const result = await graphQLProvider.AI.ExecuteSimplePrompt({
            systemPrompt: params.systemPrompt,
            messages: params.messages,
            preferredModels: params.preferredModels,
            modelPower: params.modelPower
          });
          
          return {
            success: result.success,
            result: result.result || '',
            resultObject: result.resultObject,
            modelName: result.modelName || ''
          };
        } catch (error) {
          LogError(error);
          return {
            success: false,
            result: 'Failed to execute prompt: ' + (error instanceof Error ? error.message : String(error)),
            modelName: ''
          };
        }
      },
      
      EmbedText: async (params: SimpleEmbedTextParams): Promise<SimpleEmbedTextResult> => {
        try {
          // Use the AI client from GraphQLDataProvider to generate embeddings
          const result = await graphQLProvider.AI.EmbedText({
            textToEmbed: params.textToEmbed,
            modelSize: params.modelSize
          });
          
          if (result.error) {
            throw new Error(result.error || 'Failed to generate embeddings');
          }
          
          return {
            result: result.embeddings,
            modelName: result.modelName,
            vectorDimensions: result.vectorDimensions
          };
        } catch (error) {
          LogError(error);
          throw error; // Re-throw for embeddings as they're critical
        }
      },
      
      VectorService: new SimpleVectorService()
    };
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