import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import zxcvbn from "zxcvbn";
import * as crypto from "crypto";
import { JSONParamHelper } from "../utilities/json-param-helper";

/**
 * Action that checks password strength and generates secure passwords
 * 
 * @example
 * ```typescript
 * // Check password strength
 * await runAction({
 *   ActionName: 'Password Strength',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'check'
 *   }, {
 *     Name: 'Password',
 *     Value: 'MyPassword123!'
 *   }, {
 *     Name: 'UserInputs',
 *     Value: ['john', 'doe', 'john.doe@example.com']
 *   }]
 * });
 * 
 * // Generate secure password
 * await runAction({
 *   ActionName: 'Password Strength',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'generate'
 *   }, {
 *     Name: 'Length',
 *     Value: 16
 *   }, {
 *     Name: 'IncludeSymbols',
 *     Value: true
 *   }, {
 *     Name: 'ExcludeAmbiguous',
 *     Value: true
 *   }]
 * });
 * 
 * // Generate with requirements
 * await runAction({
 *   ActionName: 'Password Strength',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'generate'
 *   }, {
 *     Name: 'Requirements',
 *     Value: {
 *       minLength: 12,
 *       maxLength: 20,
 *       minLowercase: 2,
 *       minUppercase: 2,
 *       minNumbers: 2,
 *       minSymbols: 1
 *     }
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Password Strength")
export class PasswordStrengthAction extends BaseAction {
    
    // Character sets for password generation
    private readonly lowercase = 'abcdefghijklmnopqrstuvwxyz';
    private readonly uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    private readonly numbers = '0123456789';
    private readonly symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    private readonly ambiguous = 'il1Lo0O';

    /**
     * Checks password strength or generates secure passwords
     * 
     * @param params - The action parameters containing:
     *   - Operation: "check" | "generate" (required)
     *   - For check operation:
     *     - Password: Password to check (required)
     *     - UserInputs: Array of user-related strings to check against (optional)
     *     - Requirements: Object with minimum requirements (optional)
     *   - For generate operation:
     *     - Length: Password length (default: 16)
     *     - IncludeUppercase: Include uppercase letters (default: true)
     *     - IncludeLowercase: Include lowercase letters (default: true)
     *     - IncludeNumbers: Include numbers (default: true)
     *     - IncludeSymbols: Include symbols (default: true)
     *     - ExcludeAmbiguous: Exclude ambiguous characters (default: false)
     *     - Requirements: Object with specific requirements
     * 
     * @returns Password strength analysis or generated password
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const operation = (this.getParamValue(params, 'operation') || '').toLowerCase();
            
            if (!['check', 'generate'].includes(operation)) {
                return {
                    Success: false,
                    Message: "Operation must be 'check' or 'generate'",
                    ResultCode: "INVALID_OPERATION"
                };
            }

            if (operation === 'check') {
                return await this.checkPasswordStrength(params);
            } else {
                return await this.generatePassword(params);
            }

        } catch (error) {
            return {
                Success: false,
                Message: `Password operation failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "OPERATION_FAILED"
            };
        }
    }

    /**
     * Check password strength using zxcvbn
     */
    private async checkPasswordStrength(params: RunActionParams): Promise<ActionResultSimple> {
        const password = this.getParamValue(params, 'password');
        const userInputs = this.getParamValue(params, 'userinputs') || [];
        const requirements = JSONParamHelper.getJSONParam(params, 'requirements') || {};

        if (!password) {
            return {
                Success: false,
                Message: "Password parameter is required for check operation",
                ResultCode: "MISSING_PASSWORD"
            };
        }

        // Check password with zxcvbn
        const result = zxcvbn(password, userInputs);

        // Check against requirements
        const requirementResults = this.checkRequirements(password, requirements);

        // Determine overall pass/fail
        const meetsRequirements = Object.values(requirementResults).every(r => r === true);
        const isStrong = result.score >= 3 && meetsRequirements;

        // Get feedback
        const feedback = {
            warning: result.feedback.warning || '',
            suggestions: result.feedback.suggestions || []
        };

        // Add output parameters
        params.Params.push({
            Name: 'Score',
            Type: 'Output',
            Value: result.score
        });

        params.Params.push({
            Name: 'CrackTime',
            Type: 'Output',
            Value: result.crack_times_display.offline_slow_hashing_1e4_per_second
        });

        params.Params.push({
            Name: 'Feedback',
            Type: 'Output',
            Value: feedback
        });

        params.Params.push({
            Name: 'RequirementResults',
            Type: 'Output',
            Value: requirementResults
        });

        params.Params.push({
            Name: 'IsStrong',
            Type: 'Output',
            Value: isStrong
        });

        return {
            Success: true,
            ResultCode: isStrong ? "STRONG_PASSWORD" : "WEAK_PASSWORD",
            Message: JSON.stringify({
                score: result.score,
                scoreText: ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'][result.score],
                crackTime: result.crack_times_display.offline_slow_hashing_1e4_per_second,
                guesses: result.guesses,
                feedback: feedback,
                sequence: result.sequence.map(s => ({
                    pattern: s.pattern,
                    token: s.token.replace(/./g, '*')
                })),
                requirementResults: requirementResults,
                meetsAllRequirements: meetsRequirements,
                isStrong: isStrong
            }, null, 2)
        };
    }

    /**
     * Generate a secure password
     */
    private async generatePassword(params: RunActionParams): Promise<ActionResultSimple> {
        const length = this.getNumericParam(params, 'length', 16);
        const includeUppercase = this.getBooleanParam(params, 'includeuppercase', true);
        const includeLowercase = this.getBooleanParam(params, 'includelowercase', true);
        const includeNumbers = this.getBooleanParam(params, 'includenumbers', true);
        const includeSymbols = this.getBooleanParam(params, 'includesymbols', true);
        const excludeAmbiguous = this.getBooleanParam(params, 'excludeambiguous', false);
        const requirements = JSONParamHelper.getJSONParam(params, 'requirements') || {};

        // Validate length
        const minLength = requirements.minLength || 8;
        const maxLength = requirements.maxLength || 128;
        const finalLength = Math.max(minLength, Math.min(length, maxLength));

        if (finalLength < 4) {
            return {
                Success: false,
                Message: "Password length must be at least 4 characters",
                ResultCode: "INVALID_LENGTH"
            };
        }

        // Build character set
        let charset = '';
        let requiredChars = '';

        if (includeLowercase) {
            charset += this.lowercase;
            if (requirements.minLowercase > 0) {
                requiredChars += this.getRandomChars(this.lowercase, requirements.minLowercase);
            }
        }

        if (includeUppercase) {
            charset += this.uppercase;
            if (requirements.minUppercase > 0) {
                requiredChars += this.getRandomChars(this.uppercase, requirements.minUppercase);
            }
        }

        if (includeNumbers) {
            charset += this.numbers;
            if (requirements.minNumbers > 0) {
                requiredChars += this.getRandomChars(this.numbers, requirements.minNumbers);
            }
        }

        if (includeSymbols) {
            charset += this.symbols;
            if (requirements.minSymbols > 0) {
                requiredChars += this.getRandomChars(this.symbols, requirements.minSymbols);
            }
        }

        if (excludeAmbiguous) {
            charset = charset.split('').filter(c => !this.ambiguous.includes(c)).join('');
        }

        if (charset.length === 0) {
            return {
                Success: false,
                Message: "At least one character type must be included",
                ResultCode: "NO_CHARSET"
            };
        }

        // Generate password
        let password = requiredChars;
        const remainingLength = finalLength - password.length;

        if (remainingLength < 0) {
            return {
                Success: false,
                Message: "Cannot meet all requirements within specified length",
                ResultCode: "REQUIREMENTS_TOO_STRICT"
            };
        }

        // Add random characters
        password += this.getRandomChars(charset, remainingLength);

        // Shuffle password
        password = this.shuffleString(password);

        // Check the generated password
        const checkResult = zxcvbn(password);

        // Add output parameters
        params.Params.push({
            Name: 'GeneratedPassword',
            Type: 'Output',
            Value: password
        });

        params.Params.push({
            Name: 'PasswordLength',
            Type: 'Output',
            Value: password.length
        });

        params.Params.push({
            Name: 'PasswordScore',
            Type: 'Output',
            Value: checkResult.score
        });

        params.Params.push({
            Name: 'CharacterSet',
            Type: 'Output',
            Value: {
                hasLowercase: includeLowercase,
                hasUppercase: includeUppercase,
                hasNumbers: includeNumbers,
                hasSymbols: includeSymbols,
                excludedAmbiguous: excludeAmbiguous
            }
        });

        return {
            Success: true,
            ResultCode: "PASSWORD_GENERATED",
            Message: JSON.stringify({
                message: "Secure password generated successfully",
                length: password.length,
                score: checkResult.score,
                scoreText: ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'][checkResult.score],
                characterSet: {
                    hasLowercase: includeLowercase,
                    hasUppercase: includeUppercase,
                    hasNumbers: includeNumbers,
                    hasSymbols: includeSymbols,
                    excludedAmbiguous: excludeAmbiguous
                },
                meetsRequirements: this.checkRequirements(password, requirements)
            }, null, 2)
        };
    }

    /**
     * Check if password meets requirements
     */
    private checkRequirements(password: string, requirements: any): Record<string, boolean> {
        const results: Record<string, boolean> = {};

        if (requirements.minLength) {
            results.minLength = password.length >= requirements.minLength;
        }

        if (requirements.maxLength) {
            results.maxLength = password.length <= requirements.maxLength;
        }

        if (requirements.minLowercase) {
            const count = (password.match(/[a-z]/g) || []).length;
            results.minLowercase = count >= requirements.minLowercase;
        }

        if (requirements.minUppercase) {
            const count = (password.match(/[A-Z]/g) || []).length;
            results.minUppercase = count >= requirements.minUppercase;
        }

        if (requirements.minNumbers) {
            const count = (password.match(/[0-9]/g) || []).length;
            results.minNumbers = count >= requirements.minNumbers;
        }

        if (requirements.minSymbols) {
            const count = (password.match(/[^a-zA-Z0-9]/g) || []).length;
            results.minSymbols = count >= requirements.minSymbols;
        }

        if (requirements.noRepeating) {
            results.noRepeating = !(/(.)\1{2,}/.test(password));
        }

        if (requirements.noSequential) {
            results.noSequential = !this.hasSequential(password);
        }

        return results;
    }

    /**
     * Check for sequential characters
     */
    private hasSequential(password: string): boolean {
        const sequences = [
            'abcdefghijklmnopqrstuvwxyz',
            'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
            '0123456789',
            'qwertyuiop',
            'asdfghjkl',
            'zxcvbnm'
        ];

        for (const seq of sequences) {
            for (let i = 0; i < password.length - 2; i++) {
                const substr = password.substring(i, i + 3);
                if (seq.includes(substr) || seq.includes(substr.split('').reverse().join(''))) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Get random characters from charset
     */
    private getRandomChars(charset: string, length: number): string {
        let result = '';
        const bytes = crypto.randomBytes(length);
        for (let i = 0; i < length; i++) {
            result += charset[bytes[i] % charset.length];
        }
        return result;
    }

    /**
     * Shuffle string using Fisher-Yates algorithm
     */
    private shuffleString(str: string): string {
        const arr = str.split('');
        const bytes = crypto.randomBytes(arr.length);
        
        for (let i = arr.length - 1; i > 0; i--) {
            const j = bytes[i] % (i + 1);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        
        return arr.join('');
    }

    /**
     * Get numeric parameter with default
     */
    private getNumericParam(params: RunActionParams, name: string, defaultValue: number): number {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) return defaultValue;
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
    }

    /**
     * Get boolean parameter with default
     */
    private getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) return defaultValue;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true';
        }
        return defaultValue;
    }

    /**
     * Get parameter value by name (case-insensitive)
     */
    private getParamValue(params: RunActionParams, name: string): any {
        const param = params.Params.find(p => p.Name.toLowerCase() === name.toLowerCase());
        return param?.Value;
    }
}