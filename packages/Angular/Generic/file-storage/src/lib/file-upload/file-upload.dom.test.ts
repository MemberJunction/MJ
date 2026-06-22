import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { MJButtonDirective, MJDialogComponent, MJDialogActionsComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, hasClass, capture } from '@memberjunction/ng-test-utils';
import { FileUploadComponent, FileSelectInfo } from './file-upload';

/**
 * DOM spec for <mj-files-file-upload>. Its only init data path is Refresh(), a
 * fire-and-forget engine Config call that sets an internal default-provider id and does
 * NOT gate any template output — so the rendered surface (the file-select label, its
 * disabled state derived from `disabled` / IsUploading, and the uploadStarted emission)
 * is deterministic without a backend. We set queue/disabled state via `setup` BEFORE the
 * first detectChanges (zoneless §5) and never exercise the async GraphQL upload path
 * (that's deferred to a live/integration test).
 */
const MOD = {
  imports: [CommonModule, MJButtonDirective, MJDialogComponent, MJDialogActionsComponent],
  declarations: [FileUploadComponent],
};

function render(setup?: (c: FileUploadComponent) => void): ComponentFixture<FileUploadComponent> {
  return renderComponentFixture(FileUploadComponent, { ...MOD, setup });
}

describe('FileUploadComponent (DOM)', () => {
  it('renders the file-select label enabled by default', () => {
    const f = render();
    expect(query(f, '.mj-file-select')).not.toBeNull();
    expect(hasClass(f, '.mj-file-select', 'disabled')).toBe(false);
    expect((query(f, 'input[type=file]') as HTMLInputElement).disabled).toBe(false);
  });

  it('marks the label + input disabled when the disabled input is true', () => {
    const f = renderComponentFixture(FileUploadComponent, { ...MOD, inputs: { disabled: true } });
    expect(hasClass(f, '.mj-file-select', 'disabled')).toBe(true);
    expect((query(f, 'input[type=file]') as HTMLInputElement).disabled).toBe(true);
  });

  it('marks the label disabled while uploading (IsUploading derived from the queues)', () => {
    const pending: FileSelectInfo = { name: 'a.txt', size: 1, rawFile: new File(['x'], 'a.txt') };
    const f = render((c) => {
      c.UploadQueue = [pending]; // IsUploading => true
    });
    expect(f.componentInstance.IsUploading).toBe(true);
    expect(hasClass(f, '.mj-file-select', 'disabled')).toBe(true);
  });

  it('emits uploadStarted when a file is chosen', () => {
    const f = render();
    const started = capture(f.componentInstance.uploadStarted);

    // jsdom has no DataTransfer, so define a minimal FileList on the real input
    // and fire its (change) handler — this exercises the same OnFileSelected path
    // the template wires up.
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    // jsdom has no FileList; build a structurally-compatible stub. Cast (not `: FileList`) so the
    // [Symbol.iterator] we provide for runtime for-of isn't rejected by the lib FileList type,
    // which omits it without "dom.iterable".
    const fileList = {
      0: file,
      length: 1,
      item: (i: number) => (i === 0 ? file : null),
      *[Symbol.iterator]() {
        yield file;
      },
    } as FileList;
    const input = query(f, 'input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: fileList, configurable: true });
    input.dispatchEvent(new Event('change'));

    expect(started).toHaveLength(1);
  });

  it('does not emit uploadStarted when the change event carries no files', () => {
    const f = render();
    const started = capture(f.componentInstance.uploadStarted);
    const input = query(f, 'input[type=file]') as HTMLInputElement;
    input.dispatchEvent(new Event('change')); // empty file list → guarded no-op
    expect(started).toHaveLength(0);
  });
});
