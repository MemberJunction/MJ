import { CodeNameFromString, EntityFieldValueListType, EntityInfo, Metadata, SeverityType, TypeScriptTypeFromSQLType } from '@memberjunction/core';
import fs from 'fs';
import path from 'path';
import { makeDir } from '../Misc/util';
import { RegisterClass } from '@memberjunction/global';
import { ActionEntity, ActionLibraryEntity } from '@memberjunction/core-entities';
import { logError, logMessage, logStatus } from './status_logging';
import { mkdirSync } from 'fs-extra';
import { ActionEngineServer, ActionEntityServerEntity } from '@memberjunction/actions';
import { ActionEntityExtended } from '@memberjunction/actions-base';

/**
 * Base class for generating entity sub-classes, you can sub-class this class to modify/extend your own entity sub-class generator logic
 */
@RegisterClass(ActionSubClassGeneratorBase)
export class ActionSubClassGeneratorBase {

    protected getAllActionLibrariesAndUsedItems(actions: ActionEntityExtended[]) {
        // get all of the libraries from the combination of distinct libraries from all of the actions we have here
        const allActionLibraries: {Library: string, LibraryID: string, ItemsUsedArray: string[]}[] = [];
        actions.forEach(action => {
            action.Libraries.forEach(lib => {
                if (!allActionLibraries.find(l => l.LibraryID === lib.LibraryID)) {
                    allActionLibraries.push({
                        Library: lib.Library,
                        LibraryID: lib.LibraryID,
                        ItemsUsedArray: lib.ItemsUsed && lib.ItemsUsed.length > 0 ? lib.ItemsUsed.split(',').map(item => item.trim()) : []
                    });
                }
                else {
                    // lib already in array, make sure the ItemsUsed for this paritcular Action are merged in to the ItemsUsed array in the entry
                    // in the allActionLibraries array element
                    const existingLib = allActionLibraries.find(l => l.LibraryID === lib.LibraryID);
                    if(existingLib && lib.ItemsUsed && lib.ItemsUsed.length > 0) {
                        const itemsUsed = lib.ItemsUsed.split(',').map(item => item.trim());
                        if(itemsUsed.length > 0) {
                            itemsUsed.forEach(item => {
                                if (!existingLib.ItemsUsedArray.includes(item)) {
                                    existingLib.ItemsUsedArray.push(item);
                                }
                            });
                        }
                    }
                }
            });
        });
        return allActionLibraries;
    }
    public async generateActions(actions: ActionEntityExtended[], directory: string): Promise<boolean> {
        try {
            const actionFilePath = path.join(directory, 'action_subclasses.ts');
            // get all of the libraries from the combination of distinct libraries from all of the actions we have here
            const allActionLibraries = this.getAllActionLibrariesAndUsedItems(actions);

            const actionHeader = `/*************************************************
* GENERATED CODE - DO NOT MODIFY
* Generated by MemberJunction CodeGen
**************************************************/
import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
${allActionLibraries.map(lib => `import { ${lib.ItemsUsedArray.map(item => item).join(', ')} } from "${lib.Library}";`).join('\n')}
`;
            let sCode: string = "";
            for (const action of actions) {
                sCode += await this.generateSingleAction(action, directory);
            }
            let actionCode = actionHeader + sCode;

            // finally add the LoadGeneratedActions() stub function at the very end
            actionCode += `
            
export function LoadGeneratedActions() {
    // this function is a stub that is used to force the bundler to include the generated action classes in the final bundle and not tree shake them out
}
`;    

            mkdirSync(directory, { recursive: true });
            fs.writeFileSync(actionFilePath, actionCode);
            return true;    
        }
        catch (e) {
            logError(`Error generating actions`, e);
            return false;
        }
    }

    /**
     * 
     * description: Generate a single Action
     * @description
     * @param action 
     * @param directory 
     * @returns 
     */
    public async generateSingleAction(action: ActionEntity, directory: string): Promise<string> {
        if (action.Status !== 'Active' || action.CodeApprovalStatus !=='Approved') {
            //logMessage(`    Skipping action ${action.Name} because Status <> Active and/or CodeApprovalStatus <> Approved --- Status: ${action.Status}, Code Approval Status: ${action.CodeApprovalStatus}`, SeverityType.Warning, false);
            return "";
        }

        try {
            const codeName = CodeNameFromString(action.Name);
            const actionClassName = codeName + '_Action';
            // replace all \n with \t\t\n
            const generatedCode = action.Code ? action.Code.replace(/\n/g, '\n\t\t') : 'throw new Error("Action not yet implemented")';
            const codeComments = action.CodeComments ? action.CodeComments.replace(/\n/g, '\n\t\t') : '';
            const codeCommentsInserted = codeComments ? `/*\n\t\t${codeComments}\n\t*/` : '';
            const actionCode = `
            
/**
 * ${action.Name}
 * Generated Class
 * User Prompt: ${action.UserPrompt}${action.UserComments ? "\n * User Comments: " + action.UserComments : ""}
 */
@RegisterClass(BaseAction, "${action.Name}")
export class ${actionClassName} extends BaseAction {
    ${codeCommentsInserted}
    protected override async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        ${generatedCode}
    }
}        
            `
            return actionCode;
        }
        catch (e) {
            logError(`Error generating action ${action.Name}`, e);
            throw e
        }
    }
}