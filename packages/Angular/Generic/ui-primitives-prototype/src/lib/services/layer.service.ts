import { Injectable, inject, DOCUMENT } from '@angular/core';
import {
  BlockScrollStrategy,
  Overlay,
  OverlayConfig,
  OverlayRef,
  PositionStrategy,
} from '@angular/cdk/overlay';
import { DomPortal } from '@angular/cdk/portal';
import { ConfigurableFocusTrap, ConfigurableFocusTrapFactory } from '@angular/cdk/a11y';
import { Subscription } from 'rxjs';

export interface MJLayerOpenRequest {
  Id: string;
  PanelElement: HTMLElement;
  Kind: string;
  Placement: string;
  Modal: boolean;
  Closeable: boolean;
  AllowPhoneSheet: boolean;
  Anchor: string | HTMLElement | null;
  OnRequestClose: (reason: 'escape' | 'backdrop' | 'programmatic') => void;
}

interface ActiveOverlayEntry {
  Id: string;
  Modal: boolean;
  OverlayRef: OverlayRef;
  Portal: DomPortal<HTMLElement>;
  FocusTrap: ConfigurableFocusTrap | null;
  PreviousFocus: HTMLElement | null;
  AnchorElement: HTMLElement | null;
  Subscriptions: Subscription;
}

/**
 * Single CDK-backed overlay stack manager for Wave 0 layers.
 * Handles modal focus trapping, non-modal popover/menu focus entry + return,
 * anchor `aria-expanded` synchronization, menu arrow-key navigation, and DomPortal lifecycle.
 */
@Injectable({ providedIn: 'root' })
export class MJLayerService {
  private readonly doc = inject(DOCUMENT);
  private readonly overlay = inject(Overlay);
  private readonly focusTrapFactory = inject(ConfigurableFocusTrapFactory);

  private readonly stack: ActiveOverlayEntry[] = [];
  private modalScrollLock: BlockScrollStrategy | null = null;

  /** Opens a layer via CDK Overlay + DomPortal and registers it on top of the LIFO stack. */
  public Open(request: MJLayerOpenRequest): OverlayRef {
    this.Close(request.Id);

    const anchorEl = this.resolveAnchor(request.Anchor);
    const previousFocus =
      this.doc.activeElement instanceof HTMLElement ? this.doc.activeElement : anchorEl;

    if (anchorEl) {
      anchorEl.setAttribute('aria-expanded', 'true');
    }

    const config = this.buildOverlayConfig(request, anchorEl);
    const overlayRef = this.overlay.create(config);
    const portal = new DomPortal(request.PanelElement);
    overlayRef.attach(portal);

    let focusTrap: ConfigurableFocusTrap | null = null;
    if (request.Modal) {
      focusTrap = this.focusTrapFactory.create(overlayRef.overlayElement);
    }

    // Move focus into modal, popover, and menu layers so portaled content is immediately keyboard-reachable.
    if (request.Modal || request.Kind === 'popover' || request.Kind === 'menu') {
      this.focusInitial(overlayRef.overlayElement);
    }

    const subs = new Subscription();

    subs.add(
      overlayRef.backdropClick().subscribe(() => {
        if (request.Closeable && this.IsTopmost(request.Id)) {
          request.OnRequestClose('backdrop');
        }
      })
    );

    subs.add(
      overlayRef.keydownEvents().subscribe((event) => {
        if (!this.IsTopmost(request.Id)) {
          return;
        }
        if (event.key === 'Escape' && request.Closeable) {
          event.preventDefault();
          event.stopPropagation();
          request.OnRequestClose('escape');
          return;
        }
        if (request.Kind === 'menu') {
          this.handleMenuKeydown(event, overlayRef.overlayElement);
        }
      })
    );

    if (!request.Modal && request.Closeable) {
      subs.add(
        overlayRef.outsidePointerEvents().subscribe((event) => {
          if (anchorEl && event.target instanceof Node && anchorEl.contains(event.target)) {
            return;
          }
          if (this.IsTopmost(request.Id)) {
            request.OnRequestClose('backdrop');
          }
        })
      );
    }

    this.stack.push({
      Id: request.Id,
      Modal: request.Modal,
      OverlayRef: overlayRef,
      Portal: portal,
      FocusTrap: focusTrap,
      PreviousFocus: previousFocus,
      AnchorElement: anchorEl,
      Subscriptions: subs,
    });
    this.syncModalScrollLock();

    return overlayRef;
  }

  /** Closes and disposes the CDK Overlay, syncing `aria-expanded` and restoring focus. */
  public Close(id: string): void {
    const index = this.stack.findIndex((entry) => entry.Id === id);
    if (index === -1) {
      return;
    }

    const wasTopmost = index === this.stack.length - 1;
    const [removed] = this.stack.splice(index, 1);
    this.syncModalScrollLock();
    removed.Subscriptions.unsubscribe();
    if (removed.FocusTrap) {
      removed.FocusTrap.destroy();
    }
    if (removed.AnchorElement) {
      removed.AnchorElement.setAttribute('aria-expanded', 'false');
    }
    if (removed.OverlayRef.hasAttached()) {
      removed.OverlayRef.detach();
    }
    removed.OverlayRef.dispose();

    if (
      wasTopmost &&
      removed.PreviousFocus &&
      removed.PreviousFocus.isConnected
    ) {
      removed.PreviousFocus.focus();
    }
  }

  /** Returns true when the given layer id is currently the topmost layer in the stack. */
  public IsTopmost(id: string): boolean {
    if (this.stack.length === 0) {
      return false;
    }
    return this.stack[this.stack.length - 1].Id === id;
  }

  /** Current number of active registered layers (useful for tests). */
  public get ActiveCount(): number {
    return this.stack.length;
  }

  private buildOverlayConfig(
    request: MJLayerOpenRequest,
    anchorEl: HTMLElement | null
  ): OverlayConfig {
    let positionStrategy: PositionStrategy = this.overlay
      .position()
      .global()
      .centerHorizontally()
      .centerVertically();

    if (request.Kind === 'sheet') {
      if (request.Placement === 'bottom') {
        positionStrategy = this.overlay.position().global().centerHorizontally().bottom('0');
      } else if (request.Placement === 'start') {
        positionStrategy = this.overlay.position().global().left('0').top('0');
      } else {
        positionStrategy = this.overlay.position().global().right('0').top('0');
      }
    } else if (request.Kind === 'popover' || request.Kind === 'menu') {
      if (anchorEl) {
        positionStrategy = this.overlay
          .position()
          .flexibleConnectedTo(anchorEl)
          .withPositions([
            { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
            { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
            { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
          ]);
      } else {
        positionStrategy = this.overlay.position().global().left('24px').top('72px');
      }
    }

    const panelClasses: string[] = [];
    if (request.Kind === 'dialog' && request.AllowPhoneSheet) {
      panelClasses.push('mj-layer-pane-phone-sheet');
    }

    return new OverlayConfig({
      hasBackdrop: request.Modal,
      backdropClass: 'mj-layer-backdrop',
      panelClass: panelClasses,
      positionStrategy,
      scrollStrategy: request.Modal
        ? this.overlay.scrollStrategies.noop()
        : this.overlay.scrollStrategies.reposition(),
      disposeOnNavigation: true,
    });
  }

  private syncModalScrollLock(): void {
    const hasOpenModal = this.stack.some((entry) => entry.Modal);
    if (hasOpenModal) {
      if (!this.modalScrollLock) {
        this.modalScrollLock = this.overlay.scrollStrategies.block();
      }
      this.modalScrollLock.enable();
    } else if (this.modalScrollLock) {
      this.modalScrollLock.disable();
    }
  }

  private resolveAnchor(anchor: string | HTMLElement | null): HTMLElement | null {
    if (!anchor) {
      return null;
    }
    if (anchor instanceof HTMLElement) {
      return anchor;
    }
    return this.doc.querySelector<HTMLElement>(anchor);
  }

  private handleMenuKeydown(event: KeyboardEvent, container: HTMLElement): void {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }
    const items = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]'
      )
    ).filter((el) => el.getAttribute('aria-disabled') !== 'true');

    if (items.length === 0) {
      return;
    }
    event.preventDefault();
    const currentIndex = items.indexOf(this.doc.activeElement as HTMLElement);
    let nextIndex = 0;
    if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    } else if (event.key === 'End') {
      nextIndex = items.length - 1;
    }
    items[nextIndex]?.focus();
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
      const checkedMenuItem = container.querySelector<HTMLElement>(
        '[role="menuitemradio"][aria-checked="true"]'
      );
      if (checkedMenuItem) {
        checkedMenuItem.focus();
        return;
      }
      const firstTabbable = container.querySelector<HTMLElement>(
        '[role="menuitem"], [role="menuitemradio"], a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (firstTabbable) {
        firstTabbable.focus();
        return;
      }
      const panel = container.querySelector<HTMLElement>('.mj-layer-panel');
      panel?.focus();
    });
  }
}
