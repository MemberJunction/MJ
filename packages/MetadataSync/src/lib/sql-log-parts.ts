/**
 * The lines `mj sync push` and `mj sync watch` print when a captured SQL log was split into
 * several part files by `sqlLogging.maxFileSize`. Both print every part: the user has to
 * commit (or rename) all of them, not just the first.
 *
 * @param paths - every part file, in order (`SqlLoggingSession.FilePaths`); two or more
 * @param maxFileSize - the size limit the capture was split at, in bytes
 */
export function DescribeSqlLogParts(paths: string[], maxFileSize: number): string[] {
  const mib = maxFileSize / (1024 * 1024);
  const limit = mib >= 1 ? `${mib >= 10 ? Math.round(mib) : mib.toFixed(1)} MiB` : `${Math.round(maxFileSize / 1024)} KiB`;
  const pad = String(paths.length).length;
  return [
    `📝 SQL log split into ${paths.length} parts (each ≤ ~${limit} unless a single statement exceeds it):`,
    ...paths.map((p, i) => `   ${String(i + 1).padStart(pad, '0')}. ${p}`),
  ];
}
