/*************************************************
* GENERATED CODE - DO NOT MODIFY
* Generated by MemberJunction CodeGen at 5/29/2024, 8:37:35 PM
**************************************************/
import { ActionResultSimple, BaseAction, RunActionParams } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { RunView, UserInfo, BaseEntity, Metadata } from "@memberjunction/core";

            
/**
 * Validate Accounts
 * Generated Class
 * User Prompt: For the provided entity object, check to see if the Name property has a length of > 10. If it does, then make sure that it has a first letter of A, C, X, or Y. If the name is <= 10 in length then it can start only with O, P, or a number. 
 */
@RegisterClass(BaseAction, "Validate Accounts")
export class Validate_Accounts_Action extends BaseAction {
    /*
		The provided code accomplishes the following steps:
		
		* Extracts the 'EntityObject' from the input parameters.
		* Checks if 'EntityObject' is provided, if not, returns a failure message.
		* Retrieves the 'Name' property from the 'EntityObject'.
		* Checks if the 'Name' property is present, if not, returns a failure message.
		* Evaluates the length of the 'Name'.
		    * If the 'Name' length is greater than 10 characters:
		        * Verifies that the first letter is one of 'A', 'C', 'X', or 'Y'.
		        * If not, returns a failure message.
		    * If the 'Name' length is 10 characters or fewer:
		        * Verifies that the first character is one of 'O', 'P', or a number ('0'-'9').
		        * If not, returns a failure message.
		* If all checks are passed, returns a success message indicating the name is valid.
	*/
    protected override async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const entityObject = params.Params.find(p => p.Name === 'EntityObject')?.Value;
		if (!entityObject) {
		    return {
		        Success: false,
		        ResultCode: 'EntityObjectNotFound',
		        Message: 'The entity object was not provided.'
		    };
		}
		
		const name = entityObject.Name;
		if (!name) {
		    return {
		        Success: false,
		        ResultCode: 'NameNotFound',
		        Message: 'The Name property is missing in the entity object.'
		    };
		}
		
		const nameLength = name.length;
		if (nameLength > 10) {
		    const initialChar = name.charAt(0).toUpperCase();
		    if (!['A', 'C', 'X', 'Y'].includes(initialChar)) {
		        return {
		            Success: false,
		            ResultCode: 'InvalidNameCharacter',
		            Message: 'For names longer than 10 characters, the first letter must be A, C, X, or Y.'
		        };
		    }
		} else {
		    const initialChar = name.charAt(0).toUpperCase();
		    if (!['O', 'P', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(initialChar)) {
		        return {
		            Success: false,
		            ResultCode: 'InvalidNameCharacterForShortName',
		            Message: 'For names 10 characters or shorter, the first letter must be O, P, or a number.'
		        };
		    }
		}
		
		return {
		    Success: true,
		    ResultCode: 'ValidationPassed',
		    Message: 'The entity object name is valid.'
		};
    }
}        
            
            
export function LoadGeneratedActions() {
    // this function is a stub that is used to force the bundler to include the generated action classes in the final bundle and not tree shake them out
}