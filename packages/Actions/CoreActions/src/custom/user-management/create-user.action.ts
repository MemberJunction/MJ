import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { CreateRecordAction } from "../crud/create-record.action";
import { BaseAction } from '@memberjunction/actions';
import { RunView } from "@memberjunction/core";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";

/**
 * Creates a new user in the MemberJunction system with validation and optional employee linking.
 * This action extends CreateRecordAction to leverage existing record creation functionality
 * while adding user-specific validation and business logic.
 */
@RegisterClass(BaseAction, "CreateUserAction")
export class CreateUserAction extends CreateRecordAction {
    async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract user-specific parameters
            const email = params.Params.find(p => p.Name === 'Email')?.Value as string;
            const firstName = params.Params.find(p => p.Name === 'FirstName')?.Value as string;
            const lastName = params.Params.find(p => p.Name === 'LastName')?.Value as string;
            const title = params.Params.find(p => p.Name === 'Title')?.Value as string;
            const type = params.Params.find(p => p.Name === 'Type')?.Value as string || 'User';
            const isActive = params.Params.find(p => p.Name === 'IsActive')?.Value !== false;
            const employeeID = params.Params.find(p => p.Name === 'EmployeeID')?.Value as string;

            // Validate required fields
            if (!email || !firstName || !lastName) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Email, FirstName, and LastName are required'
                };
            }

            // Check if email already exists using UserCache
            const existingUser = UserCache.Users?.find(u => 
                u.Email?.toLowerCase() === email.toLowerCase()
            );

            if (existingUser) {
                return {
                    Success: false,
                    ResultCode: 'EMAIL_EXISTS',
                    Message: `Email address '${email}' already exists in the system`
                };
            }

            // Validate employee ID if provided
            if (employeeID) {
                const rv = new RunView();
                const employeeCheck = await rv.RunView({
                    EntityName: 'Employees',
                    ExtraFilter: `ID='${employeeID}'`,
                    ResultType: 'simple'
                }, params.ContextUser);

                if (!employeeCheck.Success || !employeeCheck.Results || employeeCheck.Results.length === 0) {
                    return {
                        Success: false,
                        ResultCode: 'INVALID_EMPLOYEE',
                        Message: `Employee ID '${employeeID}' does not exist`
                    };
                }
            }

            // Prepare fields for base CreateRecordAction
            const fields: Record<string, any> = {
                FirstName: firstName,
                LastName: lastName,
                Email: email,
                Name: `${firstName} ${lastName}`,
                Type: type,
                IsActive: isActive
            };

            if (title) fields.Title = title;
            if (employeeID) {
                fields.EmployeeID = employeeID;
                fields.LinkedRecordType = 'Employee';
                fields.LinkedEntityID = '@lookup:Entities.Name=Employees';
                fields.LinkedEntityRecordID = employeeID;
            }

            // Transform parameters to match CreateRecordAction format
            const createParams: RunActionParams = {
                ...params,
                Params: [
                    { Name: 'EntityName', Value: 'Users', Type: 'Input' },
                    { Name: 'Fields', Value: fields, Type: 'Input' }
                ]
            };

            // Call parent CreateRecordAction
            const result = await super.InternalRunAction(createParams);

            if (result.Success) {
                // Extract the created user ID and add user-specific output parameters
                const primaryKey = result.Params?.find(p => p.Name === 'PrimaryKey')?.Value as Record<string, any>;
                if (primaryKey) {
                    params.Params.push({
                        Name: 'UserID',
                        Value: primaryKey.ID,
                        Type: 'Output'
                    });
                    params.Params.push({
                        Name: 'Name',
                        Value: fields.Name,
                        Type: 'Output'
                    });
                }
                
                return {
                    ...result,
                    Params: params.Params
                };
            }

            return result;

        } catch (e) {
            return {
                Success: false,
                ResultCode: 'FAILED',
                Message: `Error creating user: ${e.message}`
            };
        }
    }
}