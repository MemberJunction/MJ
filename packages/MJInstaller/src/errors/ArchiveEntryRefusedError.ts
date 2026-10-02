/**
 * Thrown by `FileSystemAdapter.ExtractZip` when an archive entry would be written outside the
 * target directory (CWE-22, "zip slip"). Kept distinct from a corrupt or unreadable archive so
 * callers can give the right advice: such an archive must not be extracted by hand either.
 *
 * Lives in its own module rather than beside the adapter so that tests which mock the adapter
 * module wholesale can still construct and match the real error.
 *
 * @module errors/ArchiveEntryRefusedError
 */
export class ArchiveEntryRefusedError extends Error {
  /** The offending entry name exactly as it appears in the archive. */
  public readonly EntryName: string;

  constructor(entryName: string) {
    // The name is attacker-controlled and this message is printed to a terminal: strip control
    // characters (ANSI/OSC escapes, newlines) so it cannot rewrite the line that reports it.
    const printable = entryName.replace(/[\u0000-\u001f\u007f]/g, '?');
    super(`ExtractZip: archive entry '${printable}' resolves outside the target directory and was refused.`);
    this.name = 'ArchiveEntryRefusedError';
    this.EntryName = entryName;
  }
}
