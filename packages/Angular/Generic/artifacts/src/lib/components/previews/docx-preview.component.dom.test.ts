import { describe, it, expect } from 'vitest';
import type { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import { DocxPreviewComponent } from './docx-preview.component';

/**
 * DOM coverage for <mj-docx-preview>, the one Word renderer in Explorer (the artifact plugin and the Files form both draw
 * with it). Drives it with real bytes: a small OOXML document with a heading, a bold run and a table, converted by the
 * real mammoth. Covers the loading state, the rendered document and its `Loaded` emit, the error state and its `Failed`
 * emit, and the setter-order guard (one input set to null before the other must not be an error).
 */

/** A 1,134-byte .docx: heading "Northwind relationship review", a paragraph, a bold run, a 2×2 table. */
const DOCX_B64 =
  'UEsDBBQAAAAIABJmQV3JTxqw6wAAAK4BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QvU7DMBDeeQrLK4odGBBCSTrwMwJDeYCTfUks7LPlc0v79jht6YAK4933q69b7YIXW8zsIvXyRrVSIJloHU29/Fi/NPdScAGy4CNhL/fIcjVcdet9QhZVTNzLuZT0oDWbGQOwigmpImPMAUo986QTmE+YUN+27Z02kQpSacriIYfuCUfY+CKed/V9LJLRsxSPR+KS1UtIyTsDpeJ6S/ZXSnNKUFV54PDsEl9XgtQXExbk74CT7q0uk51F8Q65vEKoLP0Vs9U2mk2oSvW/zYWecRydwbN+cUs5GmSukwevzkgARz/99WHu4RtQSwMEFAAAAAgAEmZBXbmBRHGwAAAAKgEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4J1TRN5pWgaEUJMuCKkrKgeIEjeNaB5KwqO3JwMDIAZG278/y233sDO5YUzGOwZNVQNBJ70yTjM4D8f1DkjKwikxe4cMFkzQ8VV7wlnkspMmExIpiEsMppzDntIkJ7QiVT6gK5PRRytyKaOmQciL0Eg3db2l8d0A/mGSXjGIvWqADEvAf2w/jkbiwcurRZd/nPhKFFlEjZnB3UdF1atdFRYob+nHi/wJUEsDBBQAAAAIABJmQV0rXxO4ewEAACMDAAARAAAAd29yZC9kb2N1bWVudC54bWyVUktv1DAQvvMrRuYCB9ZbxKNEm1QFhACpUKmtOM/aw8aq47Hs6ab773GcdhGPVdVLnLH9vcazOrkdPGwpZcehVUeLpQIKhq0Lm1ZdXX56cawgCwaLngO1akdZnXRPVmNj2dwMFAQKQ8jN2KpeJDZaZ9PTgHnBkUI5+8lpQCll2uiRk42JDeVcBAavXy6Xb/SALqiuUK7Z7ip3nKp4nupyITtPMDZb9K36TDh5O1K6W+n9nfqR7hsn6UcXLCTyKCVS7l0sxdbROF2XCkoz9LfSHfyydxl+FIuwzzZihpvoGS1ZEAaED+w9rjlVesgRDU0HJbO5BukJXPAuEMRZFZ6dfX366t3rt88XDxlIc5b1nOyuku49+yJNt/IH/t701P2mumhVkcyUtqQ6KA8G0Ze+VmTxBDx5woSbhLE/4EXWvpLO1Kb7qz9fhIZ/gXXH/B/xfQyUDkP0XuuA4keXDZfp3D1O9tTig6J6jjvFzmTkPM1tryM4/dyPQPcLUEsBAhQDFAAAAAgAEmZBXclPGrDrAAAArgEAABMAAAAAAAAAAAAAAIABAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECFAMUAAAACAASZkFduYFEcbAAAAAqAQAACwAAAAAAAAAAAAAAgAEcAQAAX3JlbHMvLnJlbHNQSwECFAMUAAAACAASZkFdK18TuHsBAAAjAwAAEQAAAAAAAAAAAAAAgAH1AQAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAMAAwC5AAAAnwMAAAAA';

function docxBytes(): ArrayBuffer {
  const bin = atob(DOCX_B64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(DocxPreviewComponent, { declarations: [DocxPreviewComponent], inputs });

/** Waits for the component's async load to finish (mammoth is a real dynamic import), then re-renders. */
async function settled(f: ComponentFixture<DocxPreviewComponent>): Promise<void> {
  for (let i = 0; i < 200 && f.componentInstance.IsLoading; i++) await new Promise((r) => setTimeout(r, 25));
  f.detectChanges();
}

describe('DocxPreviewComponent (DOM)', () => {
  it('shows the loading state until it has something to convert', () => {
    const f = render();
    expect(query(f, '.docx-preview__state')).not.toBeNull();
    expect(text(f, '.docx-preview__state')).toContain('Loading document');
    expect(query(f, '.docx-preview__content')).toBeNull();
  });

  it('renders the document from bytes and emits Loaded with the HTML', async () => {
    const f = render();
    const loaded = capture(f.componentInstance.Loaded);
    f.componentInstance.ArrayBuffer = docxBytes();
    await settled(f);
    const content = query(f, '.docx-preview__content') as HTMLElement;
    expect(content).not.toBeNull();
    expect(content.textContent).toContain('Northwind relationship review');
    expect(content.querySelector('strong')?.textContent).toBe('Bold text');
    expect(content.querySelectorAll('table td').length).toBe(4);
    expect(loaded.length).toBe(1);
    expect(loaded[0]).toContain('Northwind relationship review');
    expect(query(f, '.docx-preview__state')).toBeNull();
  });

  it('shows the error state and emits Failed when the bytes are not a Word document', async () => {
    const f = render();
    const failed = capture(f.componentInstance.Failed);
    f.componentInstance.ArrayBuffer = new TextEncoder().encode('this is not a zip').buffer as ArrayBuffer;
    await settled(f);
    expect(query(f, '.docx-preview__state--error')).not.toBeNull();
    expect(text(f, '.docx-preview__state--error')).toContain('Could not load document');
    expect(failed.length).toBe(1);
    expect(query(f, '.docx-preview__content')).toBeNull();
  });

  it('does not error when one input is set to null before the other arrives', async () => {
    const f = render();
    const failed = capture(f.componentInstance.Failed);
    f.componentInstance.Url = null;
    f.componentInstance.ArrayBuffer = null;
    await new Promise((r) => setTimeout(r, 30));
    f.detectChanges();
    expect(failed.length).toBe(0);
    expect(f.componentInstance.IsLoading).toBe(true);
  });
});
