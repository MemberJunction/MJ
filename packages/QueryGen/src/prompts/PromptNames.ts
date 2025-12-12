/**
 * Static prompt name constants for QueryGen
 *
 * All AI prompts used by QueryGen system with their exact names
 * as defined in the AI Prompt metadata.
 */

/**
 * Business Question Generator prompt
 * Generates 1-2 business questions per entity group
 */
export const PROMPT_BUSINESS_QUESTION_GENERATOR = 'Business Question Generator';

/**
 * SQL Query Writer prompt
 * Generates Nunjucks SQL templates from business questions
 */
export const PROMPT_SQL_QUERY_WRITER = 'SQL Query Writer';

/**
 * SQL Query Fixer prompt
 * Fixes SQL syntax and logic errors in generated queries
 */
export const PROMPT_SQL_QUERY_FIXER = 'SQL Query Fixer';

/**
 * Query Result Evaluator prompt
 * Evaluates if a query correctly answers the business question
 */
export const PROMPT_QUERY_EVALUATOR = 'Query Result Evaluator';

/**
 * Query Refiner prompt
 * Refines queries based on evaluation feedback
 */
export const PROMPT_QUERY_REFINER = 'Query Refiner';
