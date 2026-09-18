import { Readable } from 'node:stream';

/**
 * A stream to collect pages of records and emit them as individual records
 */
export class PagedRecords extends Readable {
  constructor() {
    super({ objectMode: true });
  }

  // Node calls this by exact name on the instance, so the hook keeps its own spelling.
  _read() {
    // no-op
  }

  /**
   * Adds a page of results to the stream
   * @param {Array<Record<string,unknown>>} page - The page of results to add to the stream
   */
  AddPage(page) {
    page.forEach((row) => this.push(row));
  }

  /** @deprecated Use {@link AddPage}. */
  addPage(page) {
    return this.AddPage(page);
  }

  /**
   * Called when there are no more pages to add to the stream
   */
  EndStream() {
    this.push(null);
  }

  /** @deprecated Use {@link EndStream}. */
  endStream() {
    return this.EndStream();
  }
}
