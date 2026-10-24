import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { from, tap } from 'rxjs';

// Import pre-built MJ class registrations manifest (covers all @memberjunction/* packages)
import '@memberjunction/server-bootstrap-lite/mj-class-registrations';

// Import supplemental manifest for user-defined classes (generated at prestart with --exclude-packages @memberjunction)
import './generated/class-registrations-manifest.js';

import { ServerPort } from "./config";
import { ___runObject, HandleServerInit } from './util';
import { MJGlobal } from '@memberjunction/global';
import { RunCodeGenBase, SQLCodeGenBase } from '@memberjunction/codegen-lib';
import { Metadata } from '@memberjunction/core';

const app = express();

app.use(express.json());
// get the server up and running
app.listen(ServerPort, () => console.log('Server starting up...'));

// start the initialization process
const serverInit$ = from(HandleServerInit()).pipe(
  tap(() => console.log(`🚀 Server listening on port ${ServerPort}!\n`)) // Use tap for side effects
);

serverInit$.subscribe({
  next: () => {
    // Start listening for requests only after initialization is complete
//    app.post ('/api/entity-permissions', handleEntityPermissions);
    app.post ('/api/run', requireCodeGenAuth, handleRunCodeGen);
  },
  error: (err) => console.error(`Initialization failed: ${err}`),
});

/**
 * Guards the CodeGen trigger endpoint: a CodeGen run performs DDL and metadata writes, so it must
 * never be triggerable by anyone who can merely reach the port. When MJ_CODEGEN_API_KEY is set,
 * the caller must present it in the x-mj-codegen-api-key header (compared constant-time over
 * SHA-256 digests). When no key is configured, only loopback callers are accepted.
 */
function requireCodeGenAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const configuredKey = process.env.MJ_CODEGEN_API_KEY?.trim();
  if (configuredKey) {
    const presented = req.headers['x-mj-codegen-api-key'];
    if (typeof presented === 'string') {
      const a = createHash('sha256').update(presented).digest();
      const b = createHash('sha256').update(configuredKey).digest();
      if (timingSafeEqual(a, b)) {
        next();
        return;
      }
    }
    res.status(401).json({ status: 'error', errorMessage: 'Unauthorized' });
    return;
  }
  const ip = req.socket.remoteAddress ?? '';
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    next();
    return;
  }
  res.status(401).json({
    status: 'error',
    errorMessage: 'Unauthorized: set MJ_CODEGEN_API_KEY to allow non-loopback access to /api/run',
  });
}

let runningPromise: Promise<void> | null = null;
async function handleRunCodeGen(_req: express.Request, res: express.Response) {
  try {
    if (runningPromise) {
      res.status(409).json({ status: 'error', errorMessage: 'A CodeGen run is already in progress' });
      return;
    }

    runningPromise = (async () => {
      const codeGen = MJGlobal.Instance.ClassFactory.CreateInstance<RunCodeGenBase>(RunCodeGenBase);
      if (!codeGen) {
        throw new Error("Couldn't get CodeGenRun object!!!");
      }
      await codeGen.Run();
    })();

    // Clear the latch when the run settles so later requests can start a new run.
    runningPromise
      .catch((err) => console.error(`CodeGen run failed: ${err}`))
      .finally(() => {
        runningPromise = null;
      });

    res.status(202).json({ status: 'accepted' });
  }
  catch (e) {
    runningPromise = null;
    res.status(500).json({ status: 'error', errorMessage: e instanceof Error ? e.message : 'CodeGen run failed' });
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