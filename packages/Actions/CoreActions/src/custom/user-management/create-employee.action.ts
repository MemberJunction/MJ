import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { CreateRecordAction } from "../crud/create-record.action";
import { BaseAction } from '@memberjunction/actions';
import { RunView } from "@memberjunction/core";

/**
 * Creates a new employee record in the MemberJunction system.
 * This action extends CreateRecordAction to leverage existing record creation functionality
 * while adding employee-specific validation and business logic.
 */
@RegisterClass(BaseAction, "CreateEmployeeAction")
export class CreateEmployeeAction extends CreateRecordAction {
    async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract employee-specific parameters
            const email = params.Params.find(p => p.Name === 'Email')?.Value as string;
            const firstName = params.Params.find(p => p.Name === 'FirstName')?.Value as string;
            const lastName = params.Params.find(p => p.Name === 'LastName')?.Value as string;
            const title = params.Params.find(p => p.Name === 'Title')?.Value as string;
            const phone = params.Params.find(p => p.Name === 'Phone')?.Value as string;
            const companyID = params.Params.find(p => p.Name === 'CompanyID')?.Value as string;
            const supervisorID = params.Params.find(p => p.Name === 'SupervisorID')?.Value as string;
            const active = params.Params.find(p => p.Name === 'Active')?.Value !== false;

            // Validate required fields
            if (!email || !firstName || !lastName || !companyID) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'Email, FirstName, LastName, and CompanyID are required'
                };
            }

            const rv = new RunView();

            // Check if email already exists for another employee
            const existingEmployee = await rv.RunView({
                EntityName: 'Employees',
                ExtraFilter: `Email='${email.replace(/'/g, "''")}'`,
                ResultType: 'simple'
            }, params.ContextUser);

            if (existingEmployee.Success && existingEmployee.Results && existingEmployee.Results.length > 0) {
                return {
                    Success: false,
                    ResultCode: 'EMAIL_EXISTS',
                    Message: `Email address '${email}' already exists for another employee`
                };
            }

            // Validate company exists
            const companyCheck = await rv.RunView({
                EntityName: 'Companies',
                ExtraFilter: `ID='${companyID}'`,
                ResultType: 'simple'
            }, params.ContextUser);

            if (!companyCheck.Success || !companyCheck.Results || companyCheck.Results.length === 0) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_COMPANY',
                    Message: `Company ID '${companyID}' does not exist`
                };
            }

            // Validate supervisor if provided
            if (supervisorID) {
                const supervisorCheck = await rv.RunView({
                    EntityName: 'Employees',
                    ExtraFilter: `ID='${supervisorID}'`,
                    ResultType: 'simple'
                }, params.ContextUser);

                if (!supervisorCheck.Success || !supervisorCheck.Results || supervisorCheck.Results.length === 0) {
                    return {
                        Success: false,
                        ResultCode: 'INVALID_SUPERVISOR',
                        Message: `Supervisor ID '${supervisorID}' does not exist`
                    };
                }
            }

            // Prepare fields for base CreateRecordAction
            const fields: Record<string, any> = {
                FirstName: firstName,
                LastName: lastName,
                Email: email,
                CompanyID: companyID,
                Active: active
            };

            if (title) fields.Title = title;
            if (phone) fields.Phone = phone;
            if (supervisorID) fields.SupervisorID = supervisorID;

            // Transform parameters to match CreateRecordAction format
            const createParams: RunActionParams = {
                ...params,
                Params: [
                    { Name: 'EntityName', Value: 'Employees', Type: 'Input' },
                    { Name: 'Fields', Value: fields, Type: 'Input' }
                ]
            };

            // Call parent CreateRecordAction
            const result = await super.InternalRunAction(createParams);

            if (result.Success) {
                // Extract the created employee ID
                const primaryKey = result.Params?.find(p => p.Name === 'PrimaryKey')?.Value as Record<string, any>;
                if (primaryKey) {
                    params.Params.push({
                        Name: 'EmployeeID',
                        Value: primaryKey.ID,
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
                Message: `Error creating employee: ${e.message}`
            };
        }
    }
}