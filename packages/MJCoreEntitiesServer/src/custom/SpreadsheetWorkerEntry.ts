import { parentPort, workerData } from 'node:worker_threads';
import {
    SetSpreadsheetWorkerIsolationRequired,
    SpreadsheetEngine,
    type SpreadsheetCellEditContext,
    type WorkbookSpec
} from '@memberjunction/core-entities';

export type SpreadsheetWorkerRequest =
    | {
          Op: 'import';
          Bytes: Uint8Array;
          ConfigurationJson?: string | null;
          SkipEvaluate?: boolean;
      }
    | {
          Op: 'patch';
          OriginalBytes: Uint8Array;
          Workbook: WorkbookSpec;
      }
    | {
          Op: 'evaluate';
          Workbook: WorkbookSpec;
          EditContext?: SpreadsheetCellEditContext;
      };

export type SpreadsheetWorkerReply =
    | {
          Ok: true;
          Workbook?: WorkbookSpec;
          Bytes?: Uint8Array;
          EvaluatedFormulaCount?: number;
      }
    | {
          Ok: false;
          Error: string;
      };

function runWorkerRequest(req: SpreadsheetWorkerRequest): SpreadsheetWorkerReply {
    try {
        SetSpreadsheetWorkerIsolationRequired(false);
        const engine = SpreadsheetEngine.Instance;
        switch (req.Op) {
            case 'import': {
                const workbook = engine.ImportFromXlsxBytes(
                    req.Bytes,
                    req.ConfigurationJson,
                    req.SkipEvaluate !== undefined ? { SkipEvaluate: req.SkipEvaluate } : undefined
                );
                return { Ok: true, Workbook: workbook };
            }
            case 'patch': {
                const bytes = engine.PatchXlsxBytes(req.OriginalBytes, req.Workbook);
                return { Ok: true, Bytes: bytes };
            }
            case 'evaluate': {
                engine.EvaluateWorkbook(req.Workbook, req.EditContext);
                return {
                    Ok: true,
                    Workbook: req.Workbook,
                    EvaluatedFormulaCount: engine.LastEvaluatedFormulaCount
                };
            }
        }
    } catch (err) {
        return {
            Ok: false,
            Error: err instanceof Error ? err.message : String(err)
        };
    }
}

if (parentPort && workerData) {
    const reply = runWorkerRequest(workerData as SpreadsheetWorkerRequest);
    parentPort.postMessage(reply);
}
