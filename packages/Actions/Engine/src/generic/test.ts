/*


import { Metadata, RunView, BaseEntity } from "@memberjunction/core";
import { ActionResult } from "@memberjunction/actions-base";

    async function test(params: any) {
        // Create an instance of Metadata to interact with entities.
        const md = new Metadata();
        
        // Create an instance of RunView to retrieve multiple records from the 'Pending Accounts' entity.
        const rv = new RunView();
        
        // Fetch all the records from the 'Pending Accounts' entity as BaseEntity objects.
        const pendingAccounts = await rv.RunView({
            EntityName: 'PendingAccounts',
            ResultType: 'entity_object'
        }, params.userInfo);
        
        // Iterate over each record.
        for (const account of pendingAccounts.Results) {
            // If the Status is 'Pending'
            if (account.Status === 'Pending') {
                // Change the Status to 'Active'.
                account.Status = 'Active';
            } else if (account.Status === 'Active') { // If the Status is 'Active'
                // Change the Status to 'Completed'.
                account.Status = 'Completed';
            }
            
            // Add a fun comment to the Comments field in each record.
            account.Comments = 'Keep up the good work!';
            
            // Save the updated record back to the database.
            await account.Save();
        }
    }
    


    async function test2(params: any) {      
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'Pending Accounts',
            ResultType: 'entity_object'
        }, params.contextUser);

        if (result.Success) {
            for (const account of result.Results as any[]) {
                const status = account.Status;
                if (status === 'Pending') {
                    account.Status = 'Active';
                } else if (status === 'Active') {
                    account.Status = 'Completed';
                }
                account.Comments = 'Processed by automation - Have a great day!';
                await account.Save();
            }
            return {
                Success: true,
                ResultCode: 'Success',
                Message: 'All pending accounts have been processed.'
            };
        } else {
            return {
                Success: false,
                ResultCode: 'FailedToRetrieve',
                Message: 'Failed to retrieve pending accounts.'
            };
        }
    }
    */