import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  inject,
} from '@angular/core';
import { AnchorRegistry } from './anchor-registry';

/**
 * Standalone directive (`[mjTourAnchor]`) that stamps `data-mj-tour-anchor` onto its host
 * element and eagerly registers/unregisters it with {@link AnchorRegistry}.
 */
@Directive({
  selector: '[mjTourAnchor]',
  standalone: true,
})
export class MJTourAnchorDirective implements OnInit, OnChanges, OnDestroy {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly registry = AnchorRegistry.Instance;
  private unregister: (() => void) | null = null;
  private currentKey = '';
  private stampedAttribute = false;

  @Input('mjTourAnchor') public AnchorKey = '';

  public ngOnInit(): void {
    this.syncRegistration();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if ('AnchorKey' in changes) {
      this.syncRegistration();
    }
  }

  public ngOnDestroy(): void {
    this.teardown();
  }

  private syncRegistration(): void {
    const nextKey = (this.AnchorKey ?? '').trim();
    if (nextKey === this.currentKey && this.unregister) {
      return;
    }
    this.teardown();
    this.currentKey = nextKey;
    if (nextKey) {
      this.stampedAttribute = !this.elementRef.nativeElement.hasAttribute('data-mj-tour-anchor');
      this.unregister = this.registry.RegisterAnchor(nextKey, this.elementRef.nativeElement);
    }
  }

  private teardown(): void {
    if (this.unregister) {
      this.unregister();
      this.unregister = null;
    }
    if (this.stampedAttribute && this.elementRef.nativeElement.getAttribute('data-mj-tour-anchor') === this.currentKey) {
      this.elementRef.nativeElement.removeAttribute('data-mj-tour-anchor');
    }
    this.stampedAttribute = false;
    this.currentKey = '';
  }
}
