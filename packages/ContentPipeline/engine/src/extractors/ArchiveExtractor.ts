/**
 * @fileoverview {@link ArchiveExtractor} — one block per archive member.
 *
 * The clearest instance of a splitting extractor: an archive holds several semantically complete
 * documents, so it becomes several records rather than one record containing a concatenation.
 *
 * How far an archive may expand is metadata, never a constant here — see `limits`.
 *
 * Every member comes back as **bytes**, never as text decoded here. Extract runs each member through
 * the same detection and extractor cascade as any other document, so an HTML member is read by the
 * HTML extractor rather than landing as raw markup, and a PDF member by the PDF extractor.
 *
 * Each member carries its own path as its key, so a child's identity is stable across re-extraction,
 * and its own file type, so the cascade routes it without re-deriving it from the archive's type.
 *
 * @module @memberjunction/content-pipeline
 */

import { gunzipSync } from 'node:zlib';
import JSZip from 'jszip';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseContentExtractor,
    ContentBlock,
    ExtractRequest,
    ExtractResult,
} from '@memberjunction/content-pipeline-base';

/** The registered key. */
export const ARCHIVE_EXTRACTOR = 'Archive';

/** One member found inside an archive. */
export interface ArchiveMember {
    /** The member's path within the archive. */
    Path: string;
    /** The member's bytes. */
    Content: Uint8Array;
}

/**
 * Reads zip, tar, gzip and gzipped-tar archives into one block per member.
 *
 * `Unpack` stays overridable: a deployment needing a format this does not read (7z, rar) subclasses
 * and registers at the same key.
 */
@RegisterClass(BaseContentExtractor, ARCHIVE_EXTRACTOR)
export class ArchiveExtractor extends BaseContentExtractor {
    public readonly Key = ARCHIVE_EXTRACTOR;
    public readonly SupportedFileTypes = ['zip', 'tar', 'gz', 'tgz'];

    public async Extract(request: ExtractRequest): Promise<ExtractResult> {
        const members = await this.Unpack(request);
        const blocks: ContentBlock[] = [];

        for (const member of members) {
            if (request.Signal.aborted) {
                break;
            }
            blocks.push({
                // Bytes, not text: the member goes through Extract like any other document.
                Text: '',
                Content: member.Content,
                // The member's path, so the child's identity survives re-extraction unchanged.
                Key: member.Path,
                Title: this.titleOf(member.Path),
                FileType: this.fileTypeOf(member.Path) ?? undefined,
            });
            request.ReportProgress(`unpacked ${blocks.length}/${members.length}: ${member.Path}`);
        }
        return { Blocks: blocks };
    }

    /**
     * Unpack the archive.
     *
     * The format is read from the bytes, not trusted from the file type: a `.gz` is either one
     * compressed file or a whole tarball, and only the contents say which.
     *
     * @throws When the bytes are not an archive this reads, or expand past the limits. Extract turns
     *   that into a failed record rather than an "empty" archive marked complete.
     */
    protected async Unpack(request: ExtractRequest): Promise<ArchiveMember[]> {
        const limits = this.limits(request);
        const bytes = request.Content;
        if (IsZip(bytes)) {
            return this.unzip(bytes, limits);
        }
        if (IsGzip(bytes)) {
            const inflated = new Uint8Array(gunzipSync(bytes, { maxOutputLength: limits.MaxBytes }));
            return IsTar(inflated)
                ? ReadTar(inflated, limits)
                : [{ Path: this.gunzippedName(request.URL), Content: inflated }];
        }
        if (IsTar(bytes)) {
            return ReadTar(bytes, limits);
        }
        throw new Error('the content is not a zip, tar or gzip archive');
    }

    private async unzip(bytes: Uint8Array, limits: ArchiveLimits): Promise<ArchiveMember[]> {
        const zip = await JSZip.loadAsync(bytes);
        const files = Object.values(zip.files).filter((f) => !f.dir);
        if (files.length > limits.MaxMembers) {
            throw new Error(`the archive holds ${files.length} members, over the limit of ${limits.MaxMembers}`);
        }
        const members: ArchiveMember[] = [];
        let total = 0;
        for (const file of files) {
            const content = await file.async('uint8array');
            total += content.length;
            if (total > limits.MaxBytes) {
                throw new Error(`the archive expands past the limit of ${limits.MaxBytes} bytes`);
            }
            members.push({ Path: file.name, Content: content });
        }
        return members;
    }

    /**
     * How far this archive may expand: the source's own setting first, then the run's tuning.
     *
     * Both are metadata — the Content Source's `MaxArchiveMembers` / `MaxArchiveBytes` settings and
     * the Record Process's `Configuration.Tuning` — so changing them needs no release. There is no
     * default in code: an archive is untrusted input, and with no limit configured it is refused
     * rather than unpacked without one.
     */
    private limits(request: ExtractRequest): ArchiveLimits {
        const fromSource = (value: string | undefined) => {
            const n = Number(value);
            return value !== undefined && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
        };
        const maxMembers = fromSource(request.Parameters.MaxArchiveMembers) ?? request.Tuning?.MaxArchiveMembers ?? null;
        const maxBytes = fromSource(request.Parameters.MaxArchiveBytes) ?? request.Tuning?.MaxArchiveBytes ?? null;
        if (maxMembers === null || maxBytes === null) {
            throw new Error(
                'no archive limits are configured — set Tuning.MaxArchiveMembers and Tuning.MaxArchiveBytes on the ' +
                    "Record Process's Configuration, or MaxArchiveMembers / MaxArchiveBytes on the Content Source",
            );
        }
        return { MaxMembers: maxMembers, MaxBytes: maxBytes };
    }

    /** `report.csv.gz` → `report.csv`, the one member a plain gzip holds. */
    private gunzippedName(url: string): string {
        const name = (url.split(/[?#]/)[0].split('/').pop() ?? '').replace(/\.gz$/i, '');
        return name || 'content';
    }

    /** A member's file type from its path. */
    private fileTypeOf(path: string): string | null {
        const name = path.split('/').pop() ?? path;
        const dot = name.lastIndexOf('.');
        return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : null;
    }

    /** A readable title from a member's path. */
    private titleOf(path: string): string {
        const name = path.split('/').pop() ?? path;
        const dot = name.lastIndexOf('.');
        return dot > 0 ? name.slice(0, dot) : name;
    }
}

/** How far an archive may expand. */
interface ArchiveLimits {
    MaxMembers: number;
    MaxBytes: number;
}

/** `PK\x03\x04` — a zip's local file header. An empty zip starts `PK\x05\x06`. */
function IsZip(bytes: Uint8Array): boolean {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05);
}

function IsGzip(bytes: Uint8Array): boolean {
    return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** `ustar` at offset 257 of the first header. */
function IsTar(bytes: Uint8Array): boolean {
    return bytes.length >= 512 && Ascii(bytes, 257, 5) === 'ustar';
}

/**
 * Read a POSIX (ustar) tar's regular files.
 *
 * Small enough to own rather than add a dependency for: 512-byte headers, octal sizes, data padded
 * to 512. Links, directories and PAX/GNU metadata entries are skipped; a GNU long name (`L`) is
 * honoured so a deep path keeps its identity.
 */
function ReadTar(bytes: Uint8Array, limits: ArchiveLimits): ArchiveMember[] {
    const members: ArchiveMember[] = [];
    let offset = 0;
    let total = 0;
    let longName: string | null = null;
    while (offset + 512 <= bytes.length) {
        const header = bytes.subarray(offset, offset + 512);
        if (header.every((b) => b === 0)) {
            break; // End of archive.
        }
        const size = parseInt(Ascii(header, 124, 12).trim() || '0', 8);
        const type = String.fromCharCode(header[156] || 0x30);
        const prefix = Ascii(header, 345, 155);
        const name = longName ?? (prefix ? `${prefix}/${Ascii(header, 0, 100)}` : Ascii(header, 0, 100));
        const dataStart = offset + 512;
        const data = bytes.subarray(dataStart, dataStart + size);
        longName = null;

        if (type === 'L') {
            longName = new TextDecoder().decode(data).replace(/\0.*$/s, '');
        } else if (type === '0' || type === '\0') {
            total += size;
            if (members.length + 1 > limits.MaxMembers || total > limits.MaxBytes) {
                throw new Error('the archive expands past its member or size limit');
            }
            members.push({ Path: name, Content: data.slice() });
        }
        offset = dataStart + Math.ceil(size / 512) * 512;
    }
    return members;
}

/** A NUL-terminated ASCII field. */
function Ascii(bytes: Uint8Array, start: number, length: number): string {
    const field = bytes.subarray(start, start + length);
    const end = field.indexOf(0);
    return new TextDecoder('ascii').decode(end >= 0 ? field.subarray(0, end) : field);
}
