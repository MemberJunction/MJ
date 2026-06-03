import {
  Injectable, ApplicationRef, EnvironmentInjector, createComponent, inject, ComponentRef, Type
} from '@angular/core';
import { BaseEntity } from '@memberjunction/core';
import { Subscription } from 'rxjs';

import { MjFormDialogComponent } from './form-dialog.component';
import { MjFormSlideInComponent } from './form-slide-in.component';
import { MjFormWindowComponent } from './form-window.component';
import { BaseFormOverlay, FormOverlayCloseReason } from './base-form-overlay';
import { MJFormPresenterOptions, MJFormRef, MJFormPresentation } from './form-presenter.types';
import { FormNavigationEvent } from '../types/navigation-events';

/**
 * Imperatively opens any MemberJunction entity form as a dialog or slide-in
 * from anywhere — one call, no template wiring.
 *
 * ```typescript
 * const ref = this.formPresenter.Open({
 *   EntityName: 'MJ: AI Agents',
 *   RecordId: agentId,
 *   Presentation: 'slide-in',
 *   Config: { ShowRelatedEntities: false },
 * });
 * const saved = await ref.AfterSaved(); // BaseEntity | null
 * ```
 *
 * Mounts the (standalone) overlay shell onto `document.body`, wires its outputs
 * to the returned {@link MJFormRef}, and tears everything down after close.
 */
@Injectable({ providedIn: 'root' })
export class MJFormPresenterService {
  private readonly appRef = inject(ApplicationRef);
  private readonly envInjector = inject(EnvironmentInjector);

  Open(options: MJFormPresenterOptions): MJFormRef {
    const presentation: MJFormPresentation = options.Presentation ?? 'dialog';
    const hostEl = document.createElement('div');
    document.body.appendChild(hostEl);

    const ref: ComponentRef<BaseFormOverlay> = createComponent(
      this.shellFor(presentation),
      { environmentInjector: this.envInjector, hostElement: hostEl },
    );

    this.applyInputs(ref.instance, options, presentation);
    this.appRef.attachView(ref.hostView);

    // ── Promises wired to the overlay outputs ──
    let savedEntity: BaseEntity | null = null;
    let resolveSaved!: (e: BaseEntity | null) => void;
    let resolveClosed!: (r: FormOverlayCloseReason) => void;
    const savedPromise = new Promise<BaseEntity | null>(r => (resolveSaved = r));
    const closedPromise = new Promise<FormOverlayCloseReason>(r => (resolveClosed = r));

    const subs: Subscription[] = [
      ref.instance.Saved.subscribe(e => { savedEntity = e; }),
      ref.instance.Closed.subscribe(reason => {
        resolveSaved(savedEntity);
        resolveClosed(reason);
        // Allow the close animation to finish before destroying the view.
        setTimeout(() => teardown(), 350);
      }),
      // A form rendered INSIDE this overlay can ask to create a related record (e.g. an
      // FK field's "+ Create" footer). Handle it by opening a nested form and handing the
      // saved record back. This makes inline-create work for overlay-hosted forms, the same
      // way SingleRecordComponent handles it for tab-hosted forms.
      ref.instance.Navigate.subscribe((e: FormNavigationEvent) => this.handleOverlayNavigate(e)),
    ];

    let destroyed = false;
    const teardown = () => {
      if (destroyed) return;
      destroyed = true;
      subs.forEach(s => s.unsubscribe());
      this.appRef.detachView(ref.hostView);
      ref.destroy();
      hostEl.remove();
    };

    // Show + run an initial CD pass so the overlay renders immediately.
    ref.instance.Visible = true;
    ref.changeDetectorRef.detectChanges();

    return new MJFormRef(
      savedPromise,
      closedPromise,
      () => ref.instance.onCancel(),
      () => ref.instance.formInstance,
    );
  }

  /**
   * Handle navigation events bubbling up from a form hosted inside an overlay. Currently
   * the only one the presenter acts on is `create-related` — it opens a nested form and
   * hands the saved record back via the event's `Complete` callback.
   */
  private handleOverlayNavigate(e: FormNavigationEvent): void {
    if (e.Kind !== 'create-related') return;
    const childRef = this.Open({
      EntityName: e.EntityName,
      Presentation: e.Presentation ?? 'dialog',
      NewRecordValues: e.NewRecordValues,
      Provider: e.Provider,
    });
    childRef.AfterSaved().then(created => e.Complete(created));
  }

  /** Maps a presentation to its (standalone) overlay shell component. */
  private shellFor(p: MJFormPresentation): Type<BaseFormOverlay> {
    switch (p) {
      case 'slide-in': return MjFormSlideInComponent;
      case 'window': return MjFormWindowComponent;
      default: return MjFormDialogComponent;
    }
  }

  /** Copies presenter options onto the overlay instance. */
  private applyInputs(inst: BaseFormOverlay, o: MJFormPresenterOptions, presentation: MJFormPresentation): void {
    inst.EntityName = o.EntityName ?? null;
    if (o.PrimaryKey) inst.PrimaryKey = o.PrimaryKey;
    if (o.RecordId) inst.RecordID = o.RecordId;
    inst.Record = o.Record ?? null;
    inst.NewRecordValues = o.NewRecordValues ?? null;
    inst.SectionName = o.SectionName ?? null;
    inst.EditMode = o.EditMode ?? null;
    if (o.Config) inst.Config = o.Config;
    if (o.Title) inst.Title = o.Title;
    inst.Provider = o.Provider ?? null;
    if (o.ShowFooter !== undefined) inst.ShowFooter = o.ShowFooter;
    if (o.SaveButtonText) inst.SaveButtonText = o.SaveButtonText;
    if (o.CancelButtonText) inst.CancelButtonText = o.CancelButtonText;

    if (presentation === 'slide-in') {
      if (o.WidthPx != null) (inst as MjFormSlideInComponent).WidthPx = o.WidthPx;
    } else if (o.Width != null) {
      (inst as MjFormDialogComponent | MjFormWindowComponent).Width = o.Width;
    }
  }
}
