/*************************************************
* GENERATED CODE - DO NOT MODIFY
* Generated by MemberJunction CodeGen at 5/31/2024, 8:56:40 PM
**************************************************/
import { ActionResultSimple, BaseAction, RunActionParams } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { Metadata, RunView } from "@memberjunction/core";

            
/**
 * Test2
 * Generated Class
 * User Prompt: I would like to loop through all of the records that are current in the Pending Accounts entity and for each record if the Status is Pending change it to "Active" and if it is already "Active" change to "Completed" and generate a fun comment of any kind you want to put into each record's Comments field.
 */
@RegisterClass(BaseAction, "Test2")
export class Test2_Action extends BaseAction {
    /*
		The provided code snippet performs the following operations:
		
		* Initializes the Metadata and RunView classes to interact with the MemberJunction framework.
		* Runs a view to retrieve all records from the 'Pending Accounts' entity.
		* Checks if any records were retrieved successfully.
		* Loops through each record and checks the current 'Status' field value.
		* If the status is 'Pending', it changes it to 'Active'; if 'Active', it changes it to 'Completed'.
		* Adds a fun comment to the 'Comments' field of each record.
		* Saves the updated record back to the database.
		* Keeps a count of how many records have been updated.
		* Returns a success message if records were successfully updated, including the count.
		* Returns an error message if no records were found in the 'Pending Accounts' entity.
	*/
    protected override async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const md = new Metadata();
		let updatedRecordsCount = 0;
		
		// Run a view to get all records from 'Pending Accounts' entity
		const rv = new RunView();
		const result = await rv.RunView({
		    EntityName: 'Pending Accounts',
		    ResultType: 'entity_object',
		}, params.ContextUser);
		
		if (result.Success && result.Results.length > 0) {
		    for (const record of result.Results) {
		        const currentStatus = record.Get('Status');
		        let newStatus = currentStatus;
		
		        // Update status based on current value
		        if (currentStatus === 'Pending') {
		            newStatus = 'Active';
		        } else if (currentStatus === 'Active') {
		            newStatus = 'Completed';
		        }
		
		        // Set the new status and add a fun comment
		        record.Set('Status', newStatus);
		        record.Set('Comments', 'This account just leveled up!');
		
		        // Save the updated record to the database
		        await record.Save();
		        updatedRecordsCount++;
		    }
		
		    return {
		        Success: true,
		        ResultCode: 'SUCCESS',
		        Message: updatedRecordsCount + ' records updated successfully.'
		    };
		} else {
		    return {
		        Success: false,
		        ResultCode: 'NO_RECORDS',
		        Message: 'No records found in the Pending Accounts entity.'
		    };
		}
    }
}        
            
            
export function LoadGeneratedActions() {
    // this function is a stub that is used to force the bundler to include the generated action classes in the final bundle and not tree shake them out
}
