import { Command, Flags } from '@oclif/core';
import type { PublishRequest, PublishResult, WorkJson } from '@memberjunction/work-queue-core';
import { WorkQueueEngine } from '@memberjunction/work-queue-engine';
import { FormatTable } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

/** Turns `key=value` flags into message attributes; the first `=` splits, so values may contain `=`. */
export function ParseAttributes(pairs: string[] | undefined): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const pair of pairs ?? []) {
    const separator = pair.indexOf('=');
    if (separator <= 0) {
      throw new Error(`--attribute expects key=value, got '${pair}'`);
    }
    attributes[pair.slice(0, separator)] = pair.slice(separator + 1);
  }
  return attributes;
}

/** Parses the --payload JSON; any JSON value is a legal payload, an object is the useful one. */
export function ParsePayload(json: string): WorkJson {
  try {
    return JSON.parse(json) as WorkJson;
  } catch (error) {
    throw new Error(`--payload is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface PublishFlags {
  payload: WorkJson;
  partitionKey?: string;
  dedupKey?: string;
  attributes: Record<string, string>;
  count: number;
}

/**
 * One request per copy. With --count above 1 each copy carries a `sequence` attribute (1-based) so the copies can
 * be told apart in logs and dead-letter lists; a --dedup-key applies to the first copy only, since the ledger
 * would (correctly) report every later copy as a Duplicate.
 */
export function BuildPublishRequests(flags: PublishFlags): PublishRequest[] {
  return Array.from({ length: flags.count }, (_, index) => {
    const request: PublishRequest = { Payload: flags.payload, Attributes: { ...flags.attributes } };
    if (flags.count > 1) {
      request.Attributes = { ...request.Attributes, sequence: String(index + 1) };
    }
    if (flags.partitionKey !== undefined) {
      request.PartitionKey = flags.partitionKey;
    }
    if (flags.dedupKey !== undefined && index === 0) {
      request.DeduplicationKey = flags.dedupKey;
    }
    return request;
  });
}

export function FormatPublishResults(results: PublishResult[]): string {
  return FormatTable(
    ['#', 'Message ID', 'Status', 'Error'],
    results.map((result, index) => [String(index + 1), result.MessageID, result.Status, result.Error ? `${result.Error.Code}: ${result.Error.Message}` : '']),
  );
}

export default class QueuePublish extends Command {
  static description = 'Publish messages to a work-queue topic from this machine through MJ code (no API key needed)';

  static examples = [
    '<%= config.bin %> <%= command.id %> --topic samples.hello --payload \'{"name":"Paul"}\'',
    '<%= config.bin %> <%= command.id %> --topic samples.hello --payload \'{"sleepMs":60000}\' --partition-key customer-42',
    '<%= config.bin %> <%= command.id %> --topic samples.hello --count 5 --partition-key k1 --attribute source=demo',
  ];

  static flags = {
    topic: Flags.string({ char: 't', description: 'Topic name', required: true }),
    payload: Flags.string({ char: 'p', description: 'Message payload as JSON', default: '{}' }),
    'partition-key': Flags.string({ char: 'k', description: 'PartitionKey for Exclusive / Ordered subscriptions' }),
    'dedup-key': Flags.string({ description: 'DeduplicationKey: a repeat within the topic TTL is reported as Duplicate' }),
    attribute: Flags.string({ char: 'a', description: 'Message attribute as key=value (repeatable)', multiple: true }),
    count: Flags.integer({ char: 'n', description: 'How many copies to publish in one batch', default: 1, min: 1 }),
    json: Flags.boolean({ description: 'Print the publish results as JSON', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueuePublish);
    const requests = BuildPublishRequests({
      payload: ParsePayload(flags.payload), partitionKey: flags['partition-key'], dedupKey: flags['dedup-key'],
      attributes: ParseAttributes(flags.attribute), count: flags.count,
    });
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    let rejected = 0;
    try {
      await WorkQueueEngine.Instance.Config(false, session.User, session.Provider);
      const results = await WorkQueueEngine.Instance.PublishAs(flags.topic, requests, { ContextUser: session.User });
      rejected = results.filter(result => result.Status === 'Rejected').length;
      this.log(flags.json ? JSON.stringify(results, null, 2) : FormatPublishResults(results));
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await session.Close();
    }
    if (failure) {
      this.error(failure, { exit: 1 });
    }
    if (rejected > 0) {
      this.error(`${rejected} of ${requests.length} message(s) were rejected`, { exit: 1 });
    }
  }
}
