/**
 * @fileoverview {@link ArchiveExtractor} — one block per archive member, as bytes, so each member
 * goes through Extract's own detection and cascade like any other document.
 *
 * @module @memberjunction/content-pipeline
 */

import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import JSZip from 'jszip';
import { RegisterClass } from '@memberjunction/global';
import {
    ArchiveBudget,
    BaseContentExtractor,
    ContentBlock,
    DefaultPipelineTuning,
    ExtractRequest,
    ExtractResult,
} from '@memberjunction/content-pipeline-base';

/** The registered key. */
export const ARCHIVE_EXTRACTOR = 'Archive';

/** One member found inside an archive. */
export interface ArchiveMember {
    /** The member's path within the archive. */
    Path: string;
    Content: Uint8Array;
}

/** Reads zip and gzip. A deployment needing another format subclasses `Unpack` at the same key. */
@RegisterClass(BaseContentExtractor, ARCHIVE_EXTRACTOR)
export class ArchiveExtractor extends BaseContentExtractor {
    public readonly Key = ARCHIVE_EXTRACTOR;
    public readonly SupportedFileTypes = ['zip', 'gz'];

    public async Extract(request: ExtractRequest): Promise<ExtractResult> {
        const members = await this.Unpack(request);
        const blocks: ContentBlock[] = [];
        for (const member of members) {
            if (request.Signal.aborted) {
                break;
            }
            const extension = path.posix.extname(member.Path);
            blocks.push({
                Text: '',
                Content: member.Content,
                // The path keys the child, so its identity survives re-extraction.
                Key: member.Path,
                Title: path.posix.basename(member.Path, extension),
                FileType: extension.slice(1).toLowerCase() || undefined,
            });
            request.ReportProgress(`unpacked ${blocks.length}/${members.length}: ${member.Path}`);
        }
        return { Blocks: blocks };
    }

    /**
     * Unpack by the file type Extract resolved from the bytes.
     *
     * @throws When the bytes are not a readable archive or expand past the limits, so the record
     *   fails rather than reading as an empty archive.
     */
    protected async Unpack(request: ExtractRequest): Promise<ArchiveMember[]> {
        const budget = this.budget(request);
        if (budget.CurrentDepth > budget.MaxDepth) {
            throw new Error(
                `the archive nesting depth ${budget.CurrentDepth} exceeds the limit of ${budget.MaxDepth} (Options.Tuning.MaxArchiveDepth)`,
            );
        }
        if (request.FileType === 'zip') {
            return this.unzip(request.Content, budget);
        }
        if (request.FileType === 'gz') {
            if (budget.RemainingMembers < 1) {
                throw new Error(`the archive holds 1 member, over the limit of ${budget.RemainingMembers}`);
            }
            budget.RemainingMembers -= 1;
            const inflated = gunzipSync(request.Content, { maxOutputLength: budget.RemainingBytes });
            budget.RemainingBytes -= inflated.byteLength;
            // `report.csv.gz` holds `report.csv`.
            const name = path.posix.basename(request.URL.split(/[?#]/)[0]).replace(/\.gz$/i, '') || 'content';
            return [{ Path: name, Content: new Uint8Array(inflated) }];
        }
        throw new Error(`'${request.FileType}' is not an archive format this reads (zip, gz)`);
    }

    private async unzip(bytes: Uint8Array, budget: ArchiveBudget): Promise<ArchiveMember[]> {
        const zip = await JSZip.loadAsync(bytes);
        const files = Object.values(zip.files).filter((f) => !f.dir);
        if (files.length > budget.RemainingMembers) {
            throw new Error(`the archive holds ${files.length} members, over the limit of ${budget.RemainingMembers}`);
        }
        budget.RemainingMembers -= files.length;
        const members: ArchiveMember[] = [];
        for (const file of files) {
            const content = await file.async('uint8array');
            if (content.length > budget.RemainingBytes) {
                throw new Error(`the archive expands past the limit of ${budget.RemainingBytes} bytes`);
            }
            budget.RemainingBytes -= content.length;
            members.push({ Path: file.name, Content: content });
        }
        return members;
    }

    /**
     * Resolve the tree-wide archive budget: reuse `request.ArchiveBudget` when unpacking a nested
     * archive, or create a fresh budget from the source's `MaxArchiveMembers` / `MaxArchiveBytes`
     * (else the run's tuning). No default: an archive is untrusted input, so with no limit
     * configured it is refused.
     */
    private budget(request: ExtractRequest): ArchiveBudget {
        if (request.ArchiveBudget) {
            return request.ArchiveBudget;
        }
        const fromSource = (value: string | undefined) => {
            const n = Number(value);
            return value !== undefined && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
        };
        const maxMembers = fromSource(request.Parameters.MaxArchiveMembers) ?? request.Tuning?.MaxArchiveMembers ?? null;
        const maxBytes = fromSource(request.Parameters.MaxArchiveBytes) ?? request.Tuning?.MaxArchiveBytes ?? null;
        if (maxMembers === null || maxBytes === null) {
            throw new Error(
                'no archive limits are configured — set Options.Tuning.MaxArchiveMembers and Options.Tuning.MaxArchiveBytes on the ' +
                    "Record Process's Configuration, or MaxArchiveMembers / MaxArchiveBytes on the Content Source",
            );
        }
        const maxDepth =
            fromSource(request.Parameters.MaxArchiveDepth) ??
            request.Tuning?.MaxArchiveDepth ??
            DefaultPipelineTuning.MaxArchiveDepth;
        return {
            RemainingMembers: maxMembers,
            RemainingBytes: maxBytes,
            CurrentDepth: 1,
            MaxDepth: maxDepth,
        };
    }
}
