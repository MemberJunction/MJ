/**
 * @fileoverview General-purpose validation types for use across MemberJunction
 * 
 * These types provide a standard way to represent validation results and errors
 * throughout the framework, independent of any specific validation implementation.
 * 
 * @module @memberjunction/global
 * @author MemberJunction.com
 * @since 2.68.0
 */

/**
 * Enumeration of validation error types
 */
export const ValidationErrorType = {
    Failure: 'Failure',
    Warning: 'Warning',
} as const;

export type ValidationErrorType = typeof ValidationErrorType[keyof typeof ValidationErrorType];

/**
 * Information about a single validation error
 */
export class ValidationErrorInfo {
    Source: string;
    Message: string;
    Value: any;
    Type: ValidationErrorType;

    constructor(Source: string, Message: string, Value: any, Type: ValidationErrorType = ValidationErrorType.Failure) {
        this.Source = Source;
        this.Message = Message;
        this.Value = Value;
        this.Type = Type;
    }
}

/**
 * Result of a validation operation
 */
export class ValidationResult {
    Success: boolean = false;
    Errors: ValidationErrorInfo[] = [];
}