import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from '@memberjunction/actions';
import { RunView } from "@memberjunction/core";

/**
 * Validates that an email address is not already in use by another user in the system.
 * Returns information about any existing user with the same email.
 */
@RegisterClass(BaseAction, "ValidateEmailUniqueAction")
export class ValidateEmailUniqueAction extends BaseAction {
    async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        console.log('VALIDATE EMAIL UNIQUE ACTION - InternalRunAction called with params:', {
            paramCount: params.Params.length,
            params: params.Params.map(p => ({ Name: p.Name, Value: p.Value, Type: p.Type })),
            contextUser: params.ContextUser?.Email
        });
        
        try {
            // Extract email parameter
            const email = params.Params.find(p => p.Name === 'Email')?.Value as string;

            if (!email) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Email parameter is required'
                };
            }

            // Basic email format validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_EMAIL_FORMAT',
                    Message: 'Invalid email address format'
                };
            }

            // Check if email exists in Users table
            const rv = new RunView();
            const userCheck = await rv.RunView({
                EntityName: 'Users',
                ExtraFilter: `Email='${email.replace(/'/g, "''")}'`,
                ResultType: 'simple'
            }, params.ContextUser);

            let isUnique = true;
            let existingUserID: string | null = null;
            let existingUserName: string | null = null;

            if (userCheck.Success && userCheck.Results && userCheck.Results.length > 0) {
                isUnique = false;
                existingUserID = userCheck.Results[0].ID;
                existingUserName = userCheck.Results[0].Name;
            }

            // Add output parameters
            params.Params.push({
                Name: 'IsUnique',
                Value: isUnique,
                Type: 'Output'
            });

            if (!isUnique && existingUserID) {
                params.Params.push({
                    Name: 'ExistingUserID',
                    Value: existingUserID,
                    Type: 'Output'
                });
                params.Params.push({
                    Name: 'ExistingUserName',
                    Value: existingUserName,
                    Type: 'Output'
                });
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: isUnique 
                    ? `Email '${email}' is available`
                    : `Email '${email}' is already in use by ${existingUserName}`,
                Params: params.Params
            };

        } catch (e) {
            return {
                Success: false,
                ResultCode: 'FAILED',
                Message: `Error validating email: ${e.message}`
            };
        }
    }
}

export function LoadValidateEmailUniqueAction() {
    // Prevent tree shaking
}