/**
 * Error types for the Computer Use engine.
 *
 * ErrorCategory is a string union (not an enum) per MJ convention.
 * Each category maps to a specific recovery strategy:
 *
 * - BrowserCrash:        Attempt browser restart, resume from last URL
 * - NavigationTimeout:   Retry with backoff, then ask Judge for guidance
 * - ElementNotFound:     Feed error context to Controller for alternative approach
 * - LLMError:            Retry with exponential backoff (3 attempts)
 * - LLMParseError:       Re-prompt with stricter format instructions (2 retries)
 * - ToolExecutionError:  Report to Controller, let it decide next action
 * - AuthenticationError: Reset domain auth state, retry auth once, then fail
 * - DomainBlocked:       Inform Controller, it must choose another path
 * - Cancelled:           Graceful shutdown, return partial results
 */
export type ErrorCategory =
    | 'BrowserCrash'
    | 'NavigationTimeout'
    | 'ElementNotFound'
    | 'LLMError'
    | 'LLMParseError'
    | 'ToolExecutionError'
    | 'AuthenticationError'
    | 'DomainBlocked'
    | 'Cancelled';

/**
 * Structured error that wraps an original Error with metadata
 * useful for the engine's error recovery logic.
 */
export class ComputerUseError {
    /** Categorization of the error for recovery routing */
    public Category: ErrorCategory;
    /** Human-readable error message */
    public Message: string;
    /** Step number where the error occurred (if applicable) */
    public StepNumber?: number;
    /** The original Error for stack trace preservation */
    public OriginalError?: Error;

    constructor(category: ErrorCategory, message: string, originalError?: Error) {
        this.Category = category;
        this.Message = message;
        this.OriginalError = originalError;
    }
}
