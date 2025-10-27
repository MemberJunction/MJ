import { SimpleVectorService } from '@memberjunction/ai-vectors-memory';
import { BaseEntity, EntityInfo, RunQueryParams, RunQueryResult, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/global';

/**
 * This is a simple data context object that is passed into the ComponentInitFunction containing any required `static` data. This object is empty when the mode is `dynamic`
 */
export type SimpleDataContext = {
  [key: string]: any;
};

/**
 * Access system metadata and get entity objects to do CRUD operations on entities.
 */
export interface SimpleMetadata {
  /**
   * Array of entity metadata objects that describe the entities in the system.
   */
  Entities: EntityInfo[];
  /**
   * Retrieves a single BaseEntity derived class for the specified entity
   * @param entityName
   */
  GetEntityObject(entityName: string, contextUser?: UserInfo): Promise<BaseEntity>;
}

/**
 * Simple interface for running views in MJ
 */
export interface SimpleRunView {
  /**
   * Run a single view and return the results. The view is run dynamically against the MemberJunction host environment.
   * @param params
   * @returns
   */
  RunView: (params: RunViewParams, contextUser?: UserInfo) => Promise<RunViewResult>;
  /**
   * Runs multiple views and returns the results. This is efficient for running views in **parallel**.
   * @param params
   * @returns
   */
  RunViews: (params: RunViewParams[], contextUser?: UserInfo) => Promise<RunViewResult[]>;
}

/**
 * Simple interface for running predefined queries in MJ
 */
export interface SimpleRunQuery {
  /**
   * Run a single predefined query.
   * @param params
   * @returns
   */
  RunQuery: (params: RunQueryParams, contextUser?: UserInfo) => Promise<RunQueryResult>;
}

/**
 * Params for an Interactive Component to execute a prompt
 */
export interface SimpleExecutePromptParams {
  /**
   * Text for the prompt, will be sent in as the system message
   */
  systemPrompt: string;
  /**
   * Optional, message history to append to the conversation after the system prompt
   */
  messages?: Array<{ message: string; role: 'user' | 'assistant' }>;
  /**
   * An ordered array of model names that are preferred for this prompt. This is not guaranteed but the preferences
   * are taken into account
   */
  preferredModels?: string[];
  /**
   * Optional power level for model selection when preferredModels is not provided.
   * 'lowest' = least powerful/cheapest model
   * 'medium' = balanced power/cost (default)
   * 'highest' = most powerful model
   */
  modelPower?: 'lowest' | 'medium' | 'highest';
  /**
   * Optional context user information
   */
  contextUser?: UserInfo;
}

/**
 * Simple return structure for prompt execution
 */
export interface SimpleExecutePromptResult {
  success: boolean;
  /**
   * Raw string result
   */
  result: string;
  /**
   * If the result was JSON or contained JSON anywhere within it that could be parsed, this will contain
   * the JSON object
   */
  resultObject?: any;
  /**
   * The model that was used for the response
   */
  modelName: string;
}

/**
 *
 */
export interface SimpleEmbedTextParams {
  /**
   * Either a single string or an array of strings to calculate embeddings for
   */
  textToEmbed: string | string[];
  modelSize: 'small' | 'medium';
  contextUser?: UserInfo;
}

/**
 * Results of a call to EmbedText
 */
export interface SimpleEmbedTextResult {
  /**
   * Either a single vector if a single string was provided in params, or an array of vectors if an array of strings was provided to the method
   */
  result: number[] | Array<number[]>;
  /**
   * Name of the model used for embedding calculation
   */
  modelName: string;
  /**
   * Number of dimensions in each vector
   */
  vectorDimensions: number;
}

/**
 * Provides a simple interface for InteractiveComponents to perform a wide variety of common AI operations
 * such as prompt execution with LLMs, calculating embeddings on strings, and using vector search for small to mediun
 * sized datasets in memory.
 */
export interface SimpleAITools {
  /**
   * Uses an LLM to respond to a provided prompt. Often used by interactive components to provide rich analysis of data within a component that a user
   * is interested in gaining qualitative insights on
   * @param params
   * @returns
   */
  ExecutePrompt: (params: SimpleExecutePromptParams) => Promise<SimpleExecutePromptResult>;

  /**
   * Used to calculate vector embeddings for one or more strings. Uses very fast small/medium sized
   * local models so the embeddings can be rapidly calculated for hundreds or even thousands of pieces of text.
   * This allows interactive components to dynamically compute similarity/distance between any kinds of data
   * and generate very interesting interactive experiences for users
   * @param params
   * @returns
   */
  EmbedText: (params: SimpleEmbedTextParams) => Promise<SimpleEmbedTextResult>;

  /**
   * Instance of the SimpleVectorService that can be used by Interactive Components
   * @see SimpleVectorService for more details on this. This object can perform a wide array
   * of vector data operations such as KNN, Similarity Scoring, and more.
   */
  VectorService: SimpleVectorService;
}
