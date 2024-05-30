/*************************************************
* GENERATED CODE - DO NOT MODIFY
* Generated by MemberJunction CodeGen at 5/29/2024, 8:37:35 PM
**************************************************/
import { ActionResultSimple, BaseAction, RunActionParams } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { RunView, UserInfo, BaseEntity, Metadata } from "@memberjunction/core";

            
/**
 * Test2
 * Generated Class
 * User Prompt: I would like to loop through all of the records that are current in the Pending Accounts entity and for each record if the Status is Pending change it to "Active" and if it is already "Active" change to "Completed" and generate a fun comment of any kind you want to put into each record's Comments field.
 */
@RegisterClass(BaseAction, "Test2")
export class Test2_Action extends BaseAction {
    /*
		The code performs the following steps:
		
		1. Fetches all records from the 'Pending Accounts' entity using `RunView`.
		2. Iterates through each record and checks the current `Status` field.
		3. Updates the `Status` field: if it is 'Pending', it changes to 'Active'; if it is already 'Active', it changes to 'Completed'.
		4. Adds a fun comment ('Updated status with a smile! ??') to the `Comments` field of each record.
		5. Saves the updated record.
		6. Returns a success message if all records are processed correctly. If an error occurs during the process, it returns an error message with the specific error details.
	*/
    protected override async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const md = new Metadata();
		const rv = new RunView();
		
		try {
		  // Fetch all records from 'Pending Accounts'
		  const result = await rv.RunView({
		    EntityName: 'Pending Accounts',
		    ResultType: 'entity_object',
		  }, params.ContextUser);
		
		  if (!result.Success) {
		    return { Success: false, ResultCode: 'ERROR_FETCHING_RECORDS', Message: 'Failed to fetch records from Pending Accounts.' };
		  }
		
		  for (const record of result.Results as any) {
		    // Retrieve current status
		    const currentStatus = record.Status;
		
		    // Update status based on current value
		    if (currentStatus === 'Pending') {
		      record.Status = 'Active';
		    } else if (currentStatus === 'Active') {
		      record.Status = 'Completed';
		    }
		
		    // Add a fun comment
		    record.Comments = 'Updated status with a smile! ??';
		
		    // Save the record
		    await record.Save();
		  }
		
		  return { Success: true, ResultCode: 'SUCCESS', Message: 'All records have been processed and updated successfully.' };
		} catch (error) {
		  return { Success: false, ResultCode: 'ERROR_PROCESSING_RECORDS', Message: 'An error occurred while processing the records: ' + error.message };
		}
    }
}        
            
            
export function LoadGeneratedActions() {
    // this function is a stub that is used to force the bundler to include the generated action classes in the final bundle and not tree shake them out
}