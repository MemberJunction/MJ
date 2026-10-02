/**
 * @fileoverview {@link ArchiveReader} — one block per archive member.
 *
 * The clearest instance of a splitting reader: an archive holds several semantically complete
 * documents, so it becomes several records rather than one record containing a concatenation.
 *
 * Each member carries its own path as its key, so a child's identity is stable across re-extraction,
 * and its own file type, so the cascade routes it to the right reader rather than re-deriving it.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseContentReader, ContentBlock, ReadRequest, ReadResult } from '@memberjunction/content-pipeline-base';

/** The registered key. */
export const ARCHIVE_READER = 'Archive';

/** One member found inside an archive. */
export interface ArchiveMember {
    /** The member's path within the archive. */
    Path: string;
    /** The member's bytes. */
    Content: Uint8Array;
}

/**
 * Reads an archive into one block per member.
 *
 * The unpacking itself is overridable: which archive formats a deployment supports, and what library
 * it uses, is its decision. The split behaviour — which is what this phase exists to prove — is the
 * same regardless.
 */
@RegisterClass(BaseContentReader, ARCHIVE_READER)
export class ArchiveReader extends BaseContentReader {
    public readonly Key = ARCHIVE_READER;
    public readonly SupportedFileTypes = ['zip', 'tar', 'gz', 'tgz'];

    public async Read(request: ReadRequest): Promise<ReadResult> {
        const members = await this.Unpack(request);
        const blocks: ContentBlock[] = [];

        for (const member of members) {
            if (request.Signal.aborted) {
                break;
            }
            const fileType = this.fileTypeOf(member.Path);
            blocks.push({
                Text: new TextDecoder('utf-8', { fatal: false }).decode(member.Content),
                // The member's path, so the child's identity survives re-extraction unchanged.
                Key: member.Path,
                Title: this.titleOf(member.Path),
                // Naming the member's own file type is what lets the cascade route each child to
                // the right reader instead of re-deriving it from the archive's type.
                FileType: fileType ?? undefined,
            });
            request.ReportProgress(`unpacked ${blocks.length}/${members.length}: ${member.Path}`);
        }
        return { Blocks: blocks };
    }

    /**
     * Unpack the archive. Override to support a real format.
     *
     * The base returns nothing rather than guessing at a format, so an unconfigured deployment gets
     * an honest "no content" instead of a misleading partial read.
     */
    protected async Unpack(_request: ReadRequest): Promise<ArchiveMember[]> {
        return [];
    }

    /** A member's file type from its path. */
    private fileTypeOf(path: string): string | null {
        const dot = path.lastIndexOf('.');
        return dot > 0 && dot < path.length - 1 ? path.slice(dot + 1).toLowerCase() : null;
    }

    /** A readable title from a member's path. */
    private titleOf(path: string): string {
        const name = path.split('/').pop() ?? path;
        const dot = name.lastIndexOf('.');
        return dot > 0 ? name.slice(0, dot) : name;
    }
}
