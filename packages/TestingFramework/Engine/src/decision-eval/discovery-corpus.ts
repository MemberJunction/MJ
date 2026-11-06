/**
 * @fileoverview Reads an agent-discovery corpus: `corpus.jsonl` (one request per line) and
 * `labels.jsonl` (one label per line, several sources per request). It mirrors the routing
 * corpus reader (`corpus.ts`), and shares its line parser: every line is validated, and a bad line
 * fails the whole read with its file and line number, because a request that silently drops out
 * looks exactly like one the model got right.
 *
 * Pure: the functions take the files' text, and the suite generator reads the files.
 *
 * @module @memberjunction/testing-engine
 */

import { DecisionCorpusError, ParseJsonLines, type NumberedLine } from './corpus';
import {
    DiscoveryCorpusLabelSchema,
    DiscoveryCorpusRequestSchema,
    type DiscoveryCorpusLabel,
    type DiscoveryCorpusRequest,
    type DiscoveryLabel
} from './discovery-types';

/** One labelled request: a corpus request with the label the chosen source gave it. */
export interface LabelledDiscoveryRequest {
    /** The request. */
    Request: DiscoveryCorpusRequest;
    /** Its label from the chosen source. */
    Label: DiscoveryLabel;
}

/** A discovery corpus joined to one label source. */
export interface JoinedDiscoveryCorpus {
    /** The requests that have a label from the source, in corpus order. */
    Cases: LabelledDiscoveryRequest[];
    /** IDs of requests with no label from the source. */
    UnlabelledRequestIds: string[];
    /** How many of the source's labels name a request the corpus doesn't have. */
    OrphanLabelCount: number;
}

/**
 * Parses a discovery `corpus.jsonl`. Blank lines are skipped. Throws a {@link DecisionCorpusError}
 * naming the line when a line is not JSON, does not match the request schema, or repeats an ID.
 *
 * @param text The file's text.
 * @param fileName The file's name, for messages.
 */
export function ParseDiscoveryCorpus(text: string, fileName: string = 'corpus.jsonl'): DiscoveryCorpusRequest[] {
    const requests = ParseJsonLines(text, fileName, DiscoveryCorpusRequestSchema);
    const firstLineById = new Map<string, number>();
    for (const { Line, Value } of requests) {
        const key = Value.id.toUpperCase();
        const first = firstLineById.get(key);
        if (first !== undefined) {
            throw new DecisionCorpusError(fileName, Line, `request ${Value.id} repeats the request on line ${first}`);
        }
        firstLineById.set(key, Line);
    }
    return requests.map(r => r.Value);
}

/**
 * Parses a discovery `labels.jsonl`. Blank lines are skipped. Throws a {@link DecisionCorpusError}
 * naming the line when a line is not JSON or does not match the label schema: an `agent` label
 * needs an `agentId`, and a `none` label a `kind`.
 *
 * @param text The file's text.
 * @param fileName The file's name, for messages.
 */
export function ParseDiscoveryLabels(text: string, fileName: string = 'labels.jsonl'): NumberedLine<DiscoveryCorpusLabel>[] {
    return ParseJsonLines(text, fileName, DiscoveryCorpusLabelSchema);
}

/**
 * Each request's label from one source. The same label given twice is fine; two different labels
 * from the same source for one request throw, naming both lines.
 *
 * @param labels The parsed label lines.
 * @param source The label source, such as `construction`.
 * @param fileName The label file's name, for messages.
 */
export function SelectDiscoveryLabelSource(
    labels: readonly NumberedLine<DiscoveryCorpusLabel>[],
    source: string,
    fileName: string = 'labels.jsonl'
): Map<string, DiscoveryLabel> {
    const chosen = new Map<string, NumberedLine<DiscoveryLabel>>();
    for (const { Line, Value } of labels) {
        if (Value.source !== source) {
            continue;
        }
        const key = Value.id.toUpperCase();
        const label = ToDiscoveryLabel(Value);
        const earlier = chosen.get(key);
        if (earlier && DescribeDiscoveryLabel(earlier.Value) !== DescribeDiscoveryLabel(label)) {
            throw new DecisionCorpusError(fileName, Line, `request ${Value.id} is labelled '${DescribeDiscoveryLabel(label)}' by '${source}', `
                + `but line ${earlier.Line} labels it '${DescribeDiscoveryLabel(earlier.Value)}'`);
        }
        chosen.set(key, earlier ?? { Line, Value: label });
    }
    return new Map([...chosen].map(([id, numbered]) => [id, numbered.Value]));
}

/**
 * Joins the corpus to one label source. Request IDs are compared case-insensitively.
 *
 * @param requests The corpus requests, in file order.
 * @param labelsById Each request's label from the source ({@link SelectDiscoveryLabelSource}).
 */
export function JoinDiscoveryCorpus(
    requests: readonly DiscoveryCorpusRequest[],
    labelsById: ReadonlyMap<string, DiscoveryLabel>
): JoinedDiscoveryCorpus {
    const cases: LabelledDiscoveryRequest[] = [];
    const unlabelled: string[] = [];
    const known = new Set<string>();
    for (const request of requests) {
        const key = request.id.toUpperCase();
        known.add(key);
        const label = labelsById.get(key);
        if (label) {
            cases.push({ Request: request, Label: label });
        } else {
            unlabelled.push(request.id);
        }
    }
    const orphans = [...labelsById.keys()].filter(id => !known.has(id)).length;
    return { Cases: cases, UnlabelledRequestIds: unlabelled, OrphanLabelCount: orphans };
}

/**
 * A label line without its request ID and source.
 *
 * @param label The label line.
 */
export function ToDiscoveryLabel(label: DiscoveryCorpusLabel): DiscoveryLabel {
    return label.label === 'agent' ? { label: 'agent', agentId: label.agentId } : { label: 'none', kind: label.kind };
}

/**
 * A label as one comparable string: `agent:<AGENT ID>` (upper case) or `none:<kind>`.
 *
 * @param label The label.
 */
export function DescribeDiscoveryLabel(label: DiscoveryLabel): string {
    return label.label === 'agent' ? `agent:${label.agentId.toUpperCase()}` : `none:${label.kind}`;
}
