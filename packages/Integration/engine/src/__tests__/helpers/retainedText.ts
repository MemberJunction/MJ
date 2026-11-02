import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

setFlagsFromString('--expose-gc');
const collectGarbage = runInNewContext('gc') as () => void;

/** Size of one simulated response page. Large enough that Node stores the text outside the JS heap. */
export const PAGE_MB = 4;

/** A page of response text that starts with `<v>{firstValue}</v>`. */
export function ResponsePage(firstValue: string): string {
    return Buffer.from(`<v>${firstValue}</v>` + 'x'.repeat(PAGE_MB * 1048576)).toString('latin1');
}

/** The first `<v>` value of a page, read the way a regex-based parser reads it. */
export function ParseFirstValue(page: string): string {
    const match = /<v>([^<]*)<\/v>/.exec(page);
    if (!match) throw new Error('page has no <v> value');
    return match[1];
}

/** MB of text Node holds outside the JS heap, measured after a full garbage collection. */
export async function ExternalTextMB(): Promise<number> {
    await new Promise(resolve => setTimeout(resolve, 0));
    // V8 keeps the input of the last regex match (RegExp.lastMatch); point it at a small string.
    /./.exec('.');
    collectGarbage();
    collectGarbage();
    return process.memoryUsage().external / 1048576;
}
