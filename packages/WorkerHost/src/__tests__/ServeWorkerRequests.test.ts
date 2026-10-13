/**
 * The worker-thread side of the protocol: each request is answered with the handler's result, or
 * with the error it threw, under the request's ID.
 */
import { describe, expect, it } from 'vitest';
import { MessageChannel } from 'node:worker_threads';
import { AnswerWorkerRequest, ServeWorkerRequests } from '../ServeWorkerRequests';
import type { WorkerResponse } from '../WorkerProtocol';

type Call = { Text: string };

describe('AnswerWorkerRequest', () => {
  it("wraps the handler's result in a success response, with its transfer list", async () => {
    const buffer = new ArrayBuffer(8);
    const answered = await AnswerWorkerRequest<Call, number>({ ID: 7, Text: 'abc' }, async (call) => ({
      Result: call.Text.length,
      Transfer: [buffer],
    }));
    expect(answered).toEqual({ Response: { ID: 7, Ok: true, Result: 3 }, Transfer: [buffer] });
  });

  it('turns a throw into a failure response carrying the message', async () => {
    const answered = await AnswerWorkerRequest<Call, number>({ ID: 8, Text: 'x' }, async () => {
      throw new Error('model failed to load');
    });
    expect(answered).toEqual({ Response: { ID: 8, Ok: false, Error: 'model failed to load' }, Transfer: [] });
  });

  it('turns a non-Error throw into a failure response too', async () => {
    const answered = await AnswerWorkerRequest<Call, number>({ ID: 9, Text: 'x' }, () => Promise.reject('plain string'));
    expect(answered.Response).toEqual({ ID: 9, Ok: false, Error: 'plain string' });
  });
});

describe('ServeWorkerRequests', () => {
  it('answers each request posted to the port', async () => {
    const { port1, port2 } = new MessageChannel();
    ServeWorkerRequests<Call, string>(async (call) => ({ Result: call.Text.toUpperCase() }), port2);
    const responses: WorkerResponse<string>[] = [];
    const received = new Promise<void>((resolve) => {
      port1.on('message', (response: WorkerResponse<string>) => {
        responses.push(response);
        if (responses.length === 2) resolve();
      });
    });
    port1.postMessage({ ID: 1, Text: 'a' });
    port1.postMessage({ ID: 2, Text: 'b' });
    await received;
    port1.close();
    expect(responses.sort((x, y) => x.ID - y.ID)).toEqual([
      { ID: 1, Ok: true, Result: 'A' },
      { ID: 2, Ok: true, Result: 'B' },
    ]);
  });
});
