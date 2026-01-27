import express from 'express';
import { from, tap } from 'rxjs';

import { ___serverPort } from "./config";
import { ___runObject, handleServerInit } from './util';
import { MJGlobal } from '@memberjunction/global';
import { RunCodeGenBase, SQLCodeGenBase } from '@memberjunction/codegen-lib';
import { Metadata } from '@memberjunction/core';
import AppDataSource from '@memberjunction/codegen-lib/dist/Config/db-connection';

const app = express();

app.use(express.json());
// get the server up and running
app.listen(___serverPort, () => console.log('Server starting up...'));

// start the initialization process
const serverInit$ = from(handleServerInit()).pipe(
  tap(() => console.log(`🚀 Server listening on port ${___serverPort}!\n`)) // Use tap for side effects
);

serverInit$.subscribe({
  next: () => {
    // Start listening for requests only after initialization is complete
//    app.post ('/api/entity-permissions', handleEntityPermissions);
    app.post ('/api/run', handleRunCodeGen);
  },
  error: (err) => console.error(`Initialization failed: ${err}`),
});


let runningPromise: Promise<void> | null = null;
async function handleRunCodeGen() {
  try {
    if (runningPromise) {
      return runningPromise;
    }
    else {
      runningPromise = new Promise(async () => {
        // We now need to process the entity permissions for the entities specified
        const codeGen = MJGlobal.Instance.ClassFactory.CreateInstance<RunCodeGenBase>(RunCodeGenBase);
        if (!codeGen) {
          throw new Error("Couldn't get CodeGenRun object!!!")
        }

        await codeGen?.Run();
      });
    }
  } 
  catch (e) {

  } 
}

// async function handleEntityPermissions(req: any, res: any) {
//   if (!req || !req.body) 
//     res.status(400).send('Invalid request');
//   else {
//     const params = req.body;
//     // params should have a single property in it, entityIDArray, which is an array of entity IDs to update
//     const entityIDArray = params.entityIDArray;
//     if (!entityIDArray || !Array.isArray(entityIDArray)) {
//       res.status(400).send('Invalid request');
//       return;
//     }  
//     else {
//       // we now need to process the entity permissions for the entities specified
//       const sqlCodeGenObject = MJGlobal.Instance.ClassFactory.CreateInstance<SQLCodeGenBase>(SQLCodeGenBase);
//       if (!sqlCodeGenObject) {
//         res.status(500).send('Failed to create SQLCodeGenBase instance');
//         return;
//       }
//       try {
//         const md = new Metadata();
//         // force a metadata refresh because the permissions might be out of date
//         console.log('Request received to update entity permissions for entities: ', entityIDArray.map(e => e.toString()).join(', '));
//         console.log('Refreshing metadata...');
//         await md.Refresh()
//         const entities = md.Entities.filter(e => entityIDArray.includes(e.ID));
//         await sqlCodeGenObject.generateAndExecuteEntitySQLToSeparateFiles({
//           ds: AppDataSource, 
//           entities: entities, 
//           directory: '', 
//           onlyPermissions: true, 
//           writeFiles: false,
//           skipExecution: false
//         })
//         res.status(200).send({ status: 'ok' });
//         console.log('Entity permissions updated successfully');
//       } catch (err: any) {
//         res.status(500).send({ status: 'error', errorMessage: err.message });
//       }
//     }
//   }
// }