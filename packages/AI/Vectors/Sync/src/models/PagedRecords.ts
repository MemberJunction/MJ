import { Readable } from 'node:stream';

/**
 * A stream to collect pages of records and emit them as individual records
 */
export class PagedRecords extends Readable {
  constructor() {
    super({ objectMode: true });
  }

  _read() {
    // no-op
  }

  /**
   * Adds a page of results to the stream
   * @param {Array<Record<string,unknown>>} page - The page of results to add to the stream
   */
  addPage(page) {
    page.forEach((row) => this.push(row));
  }

  /**
   * Called when there are no more pages to add to the stream
   */
  endStream() {
    this.push(null);
  }
}
