import { parentPort, workerData } from 'node:worker_threads';
import {
    SpreadsheetEngine,
    type SpreadsheetCellEditContext,
    type WorkbookSpec
} from '@memberjunction/core-entities';

export type SpreadsheetWorkerRequest =
    | {
          op: 'import';
          bytes: Uint8Array;
          configurationJson?: string | null;
      }
    | {
          op: 'patch';
          originalBytes: Uint8Array;
          workbook: WorkbookSpec;
      }
    | {
          op: 'evaluate';
          workbook: WorkbookSpec;
          editContext?: SpreadsheetCellEditContext;
      };

export type SpreadsheetWorkerReply =
    | {
          ok: true;
          workbook?: WorkbookSpec;
          bytes?: Uint8Array;
          evaluatedFormulaCount?: number;
      }
    | {
          ok: false;
          error: string;
      };

function runWorkerRequest(req: SpreadsheetWorkerRequest): SpreadsheetWorkerReply {
    try {
        const engine = SpreadsheetEngine.Instance;
        switch (req.op) {
            case 'import': {
                const workbook = engine.ImportFromXlsxBytes(req.bytes, req.configurationJson);
                return { ok: true, workbook };
            }
            case 'patch': {
                const bytes = engine.PatchXlsxBytes(req.originalBytes, req.workbook);
                return { ok: true, bytes };
            }
            case 'evaluate': {
                engine.EvaluateWorkbook(req.workbook, req.editContext);
                return {
                    ok: true,
                    workbook: req.workbook,
                    evaluatedFormulaCount: engine.LastEvaluatedFormulaCount
                };
            }
        }
    } catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : String(err)
        };
    }
}

if (parentPort && workerData) {
    const reply = runWorkerRequest(workerData as SpreadsheetWorkerRequest);
    parentPort.postMessage(reply);
}
