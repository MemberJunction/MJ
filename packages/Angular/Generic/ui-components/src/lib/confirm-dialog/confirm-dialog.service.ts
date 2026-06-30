import { ApplicationRef, ComponentRef, Injectable, createComponent, inject } from '@angular/core';
import { MJConfirmDialogComponent, MJConfirmDialogType } from './confirm-dialog.component';

/**
 * Options for {@link MJConfirmService.Confirm}. Mirror the `<mj-confirm-dialog>`
 * inputs, but in a flat options bag suited to an imperative call.
 */
export interface MJConfirmOptions {
  /** Primary prompt text. */
  message: string;
  /** Title-bar heading. Defaults to 'Confirm'. */
  title?: string;
  /** Optional secondary line, rendered smaller/muted beneath the message. */
  detail?: string;
  /** Visual intent — drives the header icon + confirm button color. Defaults to 'default'. */
  type?: MJConfirmDialogType;
  /** Affirmative button label. Defaults to 'Confirm'. */
  confirmText?: string;
  /** Dismiss button label. Defaults to 'Cancel'. */
  cancelText?: string;
  /** Font Awesome icon override (e.g. "fa-solid fa-trash"). `''` suppresses the icon. */
  icon?: string;
}

/**
 * MJConfirmService — Imperative, Promise-based confirmation prompts.
 *
 * The one-liner replacement for native `window.confirm()` (an anti-pattern this
 * codebase bans) and for the boilerplate of wiring `<mj-confirm-dialog>` into a
 * template just to ask a yes/no question. It dynamically mounts an
 * `MJConfirmDialogComponent` to `document.body`, shows it, and resolves a
 * `Promise<boolean>` — `true` on confirm, `false` on cancel/backdrop/Esc — then
 * tears the component down.
 *
 * @example
 * ```typescript
 * private confirm = inject(MJConfirmService);
 *
 * // Simplest — replaces `if (window.confirm('Discard changes?')) { ... }`
 * if (await this.confirm.Confirm('Discard unsaved changes?')) {
 *   this.discard();
 * }
 *
 * // Destructive delete with a detail line
 * if (await this.confirm.ConfirmDelete({
 *   message: 'Delete this user?',
 *   detail: 'This action cannot be undone.',
 * })) {
 *   await this.deleteUser();
 * }
 * ```
 *
 * **Async work after confirm:** because this resolves a boolean, the dialog has
 * already closed by the time your `await` continues — there's no in-dialog
 * spinner. When you need a "keep open + spinner while I save" UX, use the
 * `<mj-confirm-dialog>` component directly with its `Processing` input instead.
 *
 * **Synchronous guards:** `window.confirm` blocks the thread; a synchronous
 * `CanClose`/`beforeunload` guard that must return a boolean *immediately*
 * cannot use this async service. Those rare cases stay on `window.confirm` as a
 * documented exception.
 */
@Injectable({ providedIn: 'root' })
export class MJConfirmService {
  private appRef = inject(ApplicationRef);

  /**
   * Ask the user to confirm. Pass a bare string for the simplest case, or an
   * options bag for control over title/type/labels/detail.
   * @returns a Promise resolving `true` if confirmed, `false` otherwise.
   */
  Confirm(options: MJConfirmOptions | string): Promise<boolean> {
    const opts: MJConfirmOptions = typeof options === 'string' ? { message: options } : options;

    return new Promise<boolean>((resolve) => {
      const ref = createComponent(MJConfirmDialogComponent, {
        environmentInjector: this.appRef.injector,
      });
      this.applyInputs(ref, opts);
      document.body.appendChild(ref.location.nativeElement);
      this.appRef.attachView(ref.hostView);

      let settled = false;
      const finish = (result: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
        confirmedSub.unsubscribe();
        cancelledSub.unsubscribe();
        this.appRef.detachView(ref.hostView);
        ref.location.nativeElement.remove();
        ref.destroy();
        resolve(result);
      };

      const confirmedSub = ref.instance.Confirmed.subscribe(() => finish(true));
      const cancelledSub = ref.instance.Cancelled.subscribe(() => finish(false));

      ref.instance.Visible = true;
      ref.changeDetectorRef.detectChanges();
    });
  }

  /**
   * Convenience for destructive deletes — `type: 'danger'` and a 'Delete'
   * confirm label by default (both overridable via `options`).
   */
  ConfirmDelete(options: Omit<MJConfirmOptions, 'type'>): Promise<boolean> {
    return this.Confirm({ confirmText: 'Delete', ...options, type: 'danger' });
  }

  private applyInputs(ref: ComponentRef<MJConfirmDialogComponent>, opts: MJConfirmOptions): void {
    const i = ref.instance;
    i.Message = opts.message;
    if (opts.title != null) {
      i.Title = opts.title;
    }
    if (opts.detail != null) {
      i.DetailMessage = opts.detail;
    }
    if (opts.type != null) {
      i.Type = opts.type;
    }
    if (opts.confirmText != null) {
      i.ConfirmText = opts.confirmText;
    }
    if (opts.cancelText != null) {
      i.CancelText = opts.cancelText;
    }
    if (opts.icon != null) {
      i.Icon = opts.icon;
    }
  }
}
