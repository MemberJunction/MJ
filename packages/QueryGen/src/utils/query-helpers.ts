/**
 * Query generation utility functions
 */

import { BusinessQuestion } from '../data/schema';

/**
 * Generate a query name from a business question
 *
 * Removes question marks, filters short words, capitalizes each word,
 * and limits to 5 words for a concise query name.
 *
 * @param question - The business question to convert
 * @returns A formatted query name
 *
 * @example
 * generateQueryName({ userQuestion: "What are the top customers by revenue?" })
 * // Returns: "What Are Top Customers Revenue"
 *
 * @example
 * generateQueryName({ userQuestion: "Show me all active users" })
 * // Returns: "Show All Active Users"
 */
export function generateQueryName(question: BusinessQuestion): string {
  return question.userQuestion
    .replace(/\?/g, '')
    .split(' ')
    .filter(word => word.length > 2)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .slice(0, 5)
    .join(' ');
}
