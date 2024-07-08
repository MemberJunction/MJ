import express from 'express';

import { LogError, LogStatus } from "@memberjunction/core";
import { SQLServerProviderConfigData, UserCache, setupSQLServerClient } from "@memberjunction/sqlserver-dataprovider";
import AppDataSource from "./db";
import { currentUserEmail, mjCoreSchema, serverPort } from "./config";
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
    }
];

app.get('/', async (req: any, res: any) => {
    //Run all active integrations with conditions
    const {
        RunOptions,
    } = req.query;

    console.log(`Server Request Received: RunOptions === ${RunOptions}`)
    const options = RunOptions && runOptions.length > 0 ? RunOptions.split(',') : [];
    if (await runWithOptions(options)) {
        res.json({Status: "Success"});
    }
    else {
        res.json({Status: "Error"});
    }
});

app.listen(serverPort, () =>
  console.log(`Server listening on port ${serverPort}!`)
);


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
                console.warn(`Requested option ${requestedOption} not found, skipping`);
            }
            else {
                // if the requested option is found, run it
                bSuccess = bSuccess && await executeRunOption(opt,false) // pass in false as we don't need each option to init the server again
            }
        }   
        return bSuccess;
    }
    catch (error) {
        console.error("An error occurred:", error);
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
            console.warn(e)
        }
        finally {
            option.currentRuns--;
            return bResult;
        }
    }
    else {
        console.warn(`Max concurrency of ${option.maxConcurrency} reached for ${option.name} option, skipping`);
        return false;
    }
}
 

export async function runScheduledActions(): Promise<boolean> {
    try {
        await handleServerInit(false); // init server here once 
        const user = UserCache.Instance.Users.find(u => u.Email === currentUserEmail)
        if (!user)
            throw new Error(`User ${currentUserEmail} not found in cache`);

        const actionResults = await ScheduledActionEngine.Instance.ExecuteScheduledActions(user);
        return actionResults.some(r => !r.Success) ? false : true;
    }
    catch (error) {
        console.error("An error occurred:", error);
        return false;
    }
}