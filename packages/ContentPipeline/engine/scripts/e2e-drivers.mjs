/**
 * Drivers that make a real end-to-end run possible.
 *
 * These are demonstration implementations: real enough to exercise every seam (a real HTTP fetch, a
 * real parse, real chunking), simple enough to read. A deployment supplies its own.
 */
import { RegisterClass } from '@memberjunction/global';
import {
    BaseContentClassifier,
    BaseContentReader,
    BaseDiscoverDriver,
    BaseVectorWriter,
} from '@memberjunction/content-pipeline-base';

/**
 * Note: these use `RegisterClass(...)(Class)` rather than decorator syntax, because Node runs plain
 * `.mjs` with no decorator support. It is exactly what the decorator desugars to.
 */

/** Discovers the URLs listed in the source's configuration. */
export class ListDiscoverDriver extends BaseDiscoverDriver {
    Key = 'E2EList';
    async *Discover(request) {
        const urls = JSON.parse(request.Parameters.URLs ?? '[]');
        for (const [index, url] of urls.entries()) {
            if (request.Signal.aborted) return;
            request.ReportProgress(`found ${index + 1}/${urls.length}`);
            yield {
                URL: url,
                Fields: [
                    // Low confidence on purpose: Extract reads a better title from the document
                    // itself and should win on merit.
                    { Field: 'Title', Value: `Listing title for ${url.split('/').pop()}`, Confidence: 2 },
                    { Field: 'Date', Value: new Date('2026-01-15T00:00:00Z'), Confidence: 4 },
                ],
            };
        }
    }
}

/** Strips tags and pulls the <title> out of an HTML document. */
export class HtmlReader extends BaseContentReader {
    Key = 'E2EHtml';
    SupportedFileTypes = ['html', 'htm'];
    async Read(request) {
        const html = new TextDecoder().decode(request.Content);
        const strip = (s) =>
            s.replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

        // A document holding several <article> elements EXPANDS into one item per article — the
        // same shape as a zip's members or a CSV's rows. Each becomes a child Content Item.
        const articles = [...html.matchAll(/<article[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/gi)];
        if (articles.length > 1) {
            return {
                Blocks: articles.map(([, id, body]) => ({
                    Text: strip(body),
                    Key: id,
                    Title: /<h2>([^<]*)<\/h2>/i.exec(body)?.[1]?.trim(),
                    TitleConfidence: 8,
                })),
            };
        }

        const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
        return { Blocks: [{ Text: strip(html), Title: title, TitleConfidence: title ? 8 : undefined }] };
    }
}

/** Picks the most frequent long words as tags. Deliberately not an LLM — the seam is the point. */
export class KeywordClassifier extends BaseContentClassifier {
    Key = 'E2EKeyword';
    async Classify(request) {
        const counts = new Map();
        for (const word of request.Text.toLowerCase().match(/[a-z]{5,}/g) ?? []) {
            counts.set(word, (counts.get(word) ?? 0) + 1);
        }
        const Tags = [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([Name, n]) => ({ Name, Score: Math.min(1, n / 10) }));
        return { Tags };
    }
}

/** Records what would have been embedded, so a run is inspectable without a vector store. */
export class RecordingVectorWriter extends BaseVectorWriter {
    Key = 'E2ERecorder';
    static Upserted = [];
    static Deleted = [];
    async Upsert(records, context) {
        context.ReportProgress(`embedding ${records.length} record(s) in one call`);
        RecordingVectorWriter.Upserted.push(...records);
        return records.map((r) => ({ RecordID: r.RecordID, Success: true }));
    }
    async Delete(ids) {
        RecordingVectorWriter.Deleted.push(...ids);
    }
}

// Register each driver under the key its stage will ask for.
RegisterClass(BaseDiscoverDriver, 'E2EList')(ListDiscoverDriver);
RegisterClass(BaseContentReader, 'E2EHtml')(HtmlReader);
RegisterClass(BaseContentClassifier, 'E2EKeyword')(KeywordClassifier);
RegisterClass(BaseVectorWriter, 'E2ERecorder')(RecordingVectorWriter);
