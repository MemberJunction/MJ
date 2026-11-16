import { Injectable, inject, DOCUMENT } from '@angular/core';
import { ConfigurableFocusTrap, ConfigurableFocusTrapFactory } from '@angular/cdk/a11y';

export interface MJLayerRegistration {
  Id: string;
  Container: HTMLElement;
  Modal: boolean;
  Closeable: boolean;
  OnRequestClose: (reason: 'escape' | 'backdrop' | 'programmatic') => void;
}

interface ActiveLayerEntry {
  Registration: MJLayerRegistration;
  FocusTrap: ConfigurableFocusTrap | null;
  PreviousFocus: HTMLElement | null;
}

/**
 * Single overlay stack manager for Wave 0 layers (dialog, sheet, popover, menu, tooltip, toast).
 * Coordinates LIFO Escape handling, CDK focus trapping/restore, and ref-counted body scroll lock.
 */
@Injectable({ providedIn: 'root' })
export class MJLayerService {
  private readonly doc = inject(DOCUMENT);
  private readonly focusTrapFactory = inject(ConfigurableFocusTrapFactory);

  private readonly stack: ActiveLayerEntry[] = [];
  private scrollLockCount = 0;
  private priorBodyOverflow = '';
  private keyListenerAttached = false;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || this.stack.length === 0) {
      return;
    }
    const top = this.stack[this.stack.length - 1];
    if (top.Registration.Closeable) {
      event.stopPropagation();
      top.Registration.OnRequestClose('escape');
    }
  };

  /** Registers an open layer on top of the stack and activates trap/scroll-lock when modal. */
  public Register(registration: MJLayerRegistration): void {
    this.Unregister(registration.Id);

    const previousFocus =
      this.doc.activeElement instanceof HTMLElement ? this.doc.activeElement : null;

    let focusTrap: ConfigurableFocusTrap | null = null;
    if (registration.Modal) {
      focusTrap = this.focusTrapFactory.create(registration.Container);
      this.acquireScrollLock();
      this.focusInitial(registration.Container);
    }

    this.stack.push({
      Registration: registration,
      FocusTrap: focusTrap,
      PreviousFocus: previousFocus,
    });

    this.syncKeyListener();
  }

  /** Unregisters a layer, tears down its focus trap, releases scroll lock, and restores focus. */
  public Unregister(id: string): void {
    const index = this.stack.findIndex((entry) => entry.Registration.Id === id);
    if (index === -1) {
      return;
    }

    const [removed] = this.stack.splice(index, 1);
    if (removed.FocusTrap) {
      removed.FocusTrap.destroy();
      this.releaseScrollLock();
    }

    this.syncKeyListener();

    if (removed.PreviousFocus && removed.PreviousFocus.isConnected) {
      removed.PreviousFocus.focus();
    }
  }

  /** Returns true when the given layer id is currently the topmost layer in the stack. */
  public IsTopmost(id: string): boolean {
    if (this.stack.length === 0) {
      return false;
    }
    return this.stack[this.stack.length - 1].Registration.Id === id;
  }

  /** Current number of active registered layers (useful for tests). */
  public get ActiveCount(): number {
    return this.stack.length;
  }

  private focusInitial(container: HTMLElement): void {
    queueMicrotask(() => {
      if (!container.isConnected) {
        return;
      }
      const autofocus = container.querySelector<HTMLElement>('[data-autofocus]');
      if (autofocus) {
        autofocus.focus();
        return;
      }
      const firstTabbable = container.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (firstTabbable) {
        firstTabbable.focus();
        return;
      }
      container.focus();
    });
  }

  private acquireScrollLock(): void {
    if (this.scrollLockCount === 0) {
      this.priorBodyOverflow = this.doc.body.style.overflow;
      this.doc.body.style.overflow = 'hidden';
    }
    this.scrollLockCount++;
  }

  private releaseScrollLock(): void {
    if (this.scrollLockCount <= 0) {
      return;
    }
    this.scrollLockCount--;
    if (this.scrollLockCount === 0) {
      this.doc.body.style.overflow = this.priorBodyOverflow;
    }
  }

  private syncKeyListener(): void {
    if (this.stack.length > 0 && !this.keyListenerAttached) {
      this.doc.addEventListener('keydown', this.onKeyDown, true);
      this.keyListenerAttached = true;
    } else if (this.stack.length === 0 && this.keyListenerAttached) {
      this.doc.removeEventListener('keydown', this.onKeyDown, true);
      this.keyListenerAttached = false;
    }
  }
}
