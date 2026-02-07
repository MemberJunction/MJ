import express from 'express';

import { LogError, LogStatus, Metadata } from "@memberjunction/core";
import { UserCache } from "@memberjunction/sqlserver-dataprovider";
import { currentUserEmail, serverPort } from "./config";
import { handleServerInit } from './util';
import { ScheduledActionEngine } from '@memberjunction/scheduled-actions';
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
 
// these can be command line options when running this from command line or they
// can be HTTP query strig params, a comma delimited list passed into a GET request
// on the query string for the parameter RunOptions, for example
// http://localhost:8000/?RunOptions=all 
// in the future we might have other RunOptions

type runOption = {
    name: string;
    description?: string;
    run: (initServer: boolean) => Promise<boolean>;
    maxConcurrency?: number;
    currentRuns?: number;
}

const runOptions: runOption[] = [
    {
        name: "all",
        description: "Run all processes",
        run: runAll,
        maxConcurrency: 1,
    },
    {
        name: "ScheduledActions",
        description: "Run all scheduled actions",
        run: runScheduledActions,
        maxConcurrency: 1,
    },
    {
        name: "enrichaccounts",
        description: "Run Apollo Enrichment for Accounts",
        run: enrichAccounts,
        maxConcurrency: 1
    },
    {
        name: "enrichcontacts",
        description: "Run Apollo Enrichment for Contacts",
        run: enrichContacts,
        maxConcurrency: 1
    }
    ,{
        name: "autoTagAndVectorize",
        description: "Run Autotag and Vectorize Content",
        run: autotagAndVectorize,
        maxConcurrency: 1
    }
    
];

app.get('/', async (req: any, res: any) => {
    //Run all active integrations with conditions
    const {
        options,
    } = req.query;

    LogStatus(`Server Request Received: options === ${options}`);
    let typedOptions: string = options;    
    const optionsToRun: string[] = typedOptions.includes(',') ? typedOptions.split(',') : [typedOptions];
    if (await runWithOptions(optionsToRun)) {
        res.json({Status: "Success"});
    }
    else {
        res.json({Status: "Error"});
    }
});

app.listen(serverPort, () => {
        LogStatus(`Server listening on port ${serverPort}!`)
});


async function runWithOptions(options: string[]): Promise<boolean> {
    try {
        // first check for the all flag and if that is inluded, just run all and ignore everything else, or if NO params are passed, run all
        if (options.includes("all") || options.length === 0) {
            return await runAll();
        }
    
        // next loop through the runOptions and run any that are included in the args, if we get here that means we don't have the all flag
        await handleServerInit(false); // init server here once
        let bSuccess = true;
        for (const requestedOption of options) {
            // loop through the requested options from the caller and run each one
            const opt = runOptions.find(o => o.name.trim().toLowerCase() === requestedOption.trim().toLowerCase())
            if (!opt) {
                // if the requested option is not found, log a warning and skip it
                LogStatus(`Requested option ${requestedOption} not found, skipping`);
            }
            else {
                // if the requested option is found, run it
                LogStatus(`Running option ${opt.name}`);
                bSuccess = bSuccess && await executeRunOption(opt,false) // pass in false as we don't need each option to init the server again
            }
        }   
        return bSuccess;
    }
    catch (error) {
        LogError("An error occurred:", undefined, error);
        return false;
    }
}

export async function runAll(): Promise<boolean> {
    // loop through the runOptions and run each one, filter out the all option since that is what WE are doing here :)
    let bSuccess: boolean = true;
    await handleServerInit(false); // init server here once 
    for (const option of runOptions.filter(o => o.name !== "all")) {
        bSuccess = bSuccess && await executeRunOption(option, false); // pass in false as we don't need each option to init the server again
    }
    return bSuccess
}

async function executeRunOption(option: runOption, initServer: boolean): Promise<boolean> {
    if (option.currentRuns === undefined) {
        option.currentRuns = 0;
    }
    if (option.maxConcurrency === undefined) {
        option.maxConcurrency = 1;
    }
    if (option && option.maxConcurrency > option.currentRuns) {
        option.currentRuns++;
        let bResult: boolean = false;
        try {
            bResult = await option.run(initServer)
        }
        catch (e) {
            LogStatus(e)
        }
        finally {
            option.currentRuns--;
            return bResult;
        }
    }
    else {
        LogError(`Max concurrency of ${option.maxConcurrency} reached for ${option.name} option, skipping`);
        return false;
    }
}
 

export async function runScheduledActions(): Promise<boolean> {
    try {
        await handleServerInit(false); // init server here once 
        const user = UserCache.Instance.Users.find(u => u.Email === currentUserEmail)
        if (!user){
            throw new Error(`User ${currentUserEmail} not found in cache`);
        }

        ScheduledActionEngine.Instance.Config(false, user);
        const actionResults = await ScheduledActionEngine.Instance.ExecuteScheduledActions(user);
        return actionResults.some(r => !r.Success) ? false : true;
    }
    catch (error) {
        LogError("An error occurred:", undefined, error);
        return false;
    }
}

export async function enrichAccounts(): Promise<boolean> {
    return await runScheduledAction("Apollo Enrichment - Accounts");
}

export async function enrichContacts(): Promise<boolean> {
    return await runScheduledAction("Apollo Enrichment - Contacts");
}

export async function autotagAndVectorize(): Promise<boolean> {
    return await runScheduledAction("Autotag And Vectorize Content");
}

export async function runScheduledAction(actionName: string): Promise<boolean> {
    try {
        await handleServerInit(false); // init server here once 
        const user = UserCache.Instance.Users.find(u => u.Email === currentUserEmail)
        if (!user){
            throw new Error(`User ${currentUserEmail} not found in cache`);
        }

        ScheduledActionEngine.Instance.Config(false, user);
        const actionResults = await ScheduledActionEngine.Instance.ExecuteScheduledAction(actionName, user);
        return actionResults.Success;
    }
    catch (error) {
        LogError("An error occurred:", undefined, error);
        return false;
    }
}