/**
 * @fileoverview The Local File System walk, as a Discover driver.
 *
 * This is the walk that used to live inside {@link AutotagLocalFileSystem.SetNewAndModifiedContentItems},
 * lifted out so there is one implementation of "what is in this directory" with two consumers: the
 * autotagger, which parses and saves each file it is handed, and the content pipeline's Discover
 * stage, which turns each one into a working record and lets later stages do the rest.
 *
 * Lifting it changes what the walk is responsible for. It no longer reads file contents, computes a
 * text checksum or writes rows — those belong to whoever consumes it. What it reports instead is a
 * cheap fingerprint from the directory entry itself (size and modified time), which is enough to
 * tell an unchanged file from a changed one without opening it.
 *
 * @module @memberjunction/content-autotagging
 */

import fs from 'fs';
import path from 'path';
import { RegisterClass } from '@memberjunction/global';
import { BaseDiscoverDriver, DiscoverRequest, DiscoveredItem } from '@memberjunction/content-pipeline-base';

/** Registered under the name `ContentSourceType.DriverClass` already carries for this source type. */
@RegisterClass(BaseDiscoverDriver, 'AutotagLocalFileSystem')
export class LocalFileSystemDiscoverDriver extends BaseDiscoverDriver {
    public readonly Key = 'AutotagLocalFileSystem';

    public async *Discover(request: DiscoverRequest): AsyncIterable<DiscoveredItem> {
        if (!request.URL || !fs.existsSync(request.URL)) {
            throw new Error(`Local File System source path '${request.URL}' does not exist`);
        }
        yield* this.walk(request.URL, request);
    }

    /**
     * Walk one directory, recursing into subdirectories.
     *
     * Recursion is a generator rather than an accumulating array so a deep tree reports items as it
     * finds them. The previous implementation recursed without collecting the result, which quietly
     * dropped every file below the first level.
     */
    private async *walk(directory: string, request: DiscoverRequest): AsyncIterable<DiscoveredItem> {
        for (const entry of fs.readdirSync(directory)) {
            if (request.Signal.aborted) {
                return;
            }
            const full = path.join(directory, entry);
            const stats = fs.statSync(full);
            if (stats.isDirectory()) {
                yield* this.walk(full, request);
                continue;
            }
            if (!stats.isFile()) {
                continue;
            }
            yield {
                URL: full,
                Checksum: `${stats.size}:${stats.mtime.getTime()}`,
                // The raw timestamps, so a consumer with its own "changed since" rule — the
                // autotagger compares both against a last-run date — keeps it without re-stat'ing.
                Extensions: { CreatedAt: stats.ctime, ModifiedAt: stats.mtime },
                Fields: [
                    { Field: 'Title', Value: entry, Confidence: request.Confidence.DiscoveredTitle },
                    { Field: 'Date', Value: stats.mtime, Confidence: request.Confidence.DiscoveredDate },
                    ...(path.extname(entry)
                        ? [{ Field: 'FileType' as const, Value: path.extname(entry).slice(1).toLowerCase(), Confidence: request.Confidence.DiscoveredFileType }]
                        : []),
                ],
            };
        }
    }
}
