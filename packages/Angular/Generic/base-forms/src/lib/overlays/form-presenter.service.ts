import {
  Injectable, ApplicationRef, EnvironmentInjector, createComponent, inject, ComponentRef
} from '@angular/core';
import { BaseEntity } from '@memberjunction/core';
import { Subscription } from 'rxjs';

import { MjFormDialogComponent } from './form-dialog.component';
import { MjFormSlideInComponent } from './form-slide-in.component';
import { BaseFormOverlay, FormOverlayCloseReason } from './base-form-overlay';
import { MJFormPresenterOptions, MJFormRef } from './form-presenter.types';

/**
 * Imperatively opens any MemberJunction entity form as a dialog or slide-in
 * from anywhere — one call, no template wiring.
 *
 * ```typescript
 * const ref = this.formPresenter.open({
 *   entityName: 'MJ: AI Agents',
 *   recordId: agentId,
 *   presentation: 'slide-in',
 *   config: { showRelatedEntities: false },
 * });
 * const saved = await ref.afterSaved(); // BaseEntity | null
 * ```
 *
 * Mounts the (standalone) overlay shell onto `document.body`, wires its outputs
 * to the returned {@link MJFormRef}, and tears everything down after close.
 */
@Injectable({ providedIn: 'root' })
export class MJFormPresenterService {
  private readonly appRef = inject(ApplicationRef);
  private readonly envInjector = inject(EnvironmentInjector);

  open(options: MJFormPresenterOptions): MJFormRef {
    const useSlideIn = options.presentation === 'slide-in';
    const hostEl = document.createElement('div');
    document.body.appendChild(hostEl);

    const ref: ComponentRef<BaseFormOverlay> = useSlideIn
      ? createComponent(MjFormSlideInComponent, { environmentInjector: this.envInjector, hostElement: hostEl })
      : createComponent(MjFormDialogComponent, { environmentInjector: this.envInjector, hostElement: hostEl });

    this.applyInputs(ref.instance, options, useSlideIn);
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

  /** Copies presenter options onto the overlay instance. */
  private applyInputs(inst: BaseFormOverlay, o: MJFormPresenterOptions, useSlideIn: boolean): void {
    inst.EntityName = o.entityName ?? null;
    if (o.primaryKey) inst.PrimaryKey = o.primaryKey;
    if (o.recordId) inst.RecordID = o.recordId;
    inst.Record = o.record ?? null;
    inst.NewRecordValues = o.newRecordValues ?? null;
    inst.EditMode = o.editMode ?? null;
    if (o.config) inst.Config = o.config;
    if (o.title) inst.Title = o.title;
    inst.Provider = o.provider ?? null;
    if (o.showFooter !== undefined) inst.ShowFooter = o.showFooter;
    if (o.saveButtonText) inst.SaveButtonText = o.saveButtonText;
    if (o.cancelButtonText) inst.CancelButtonText = o.cancelButtonText;

    if (useSlideIn) {
      if (o.widthPx != null) (inst as MjFormSlideInComponent).WidthPx = o.widthPx;
    } else if (o.width != null) {
      (inst as MjFormDialogComponent).Width = o.width;
    }
  }
}
