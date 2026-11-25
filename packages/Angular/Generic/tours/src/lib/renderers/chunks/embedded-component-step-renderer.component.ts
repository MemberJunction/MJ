import {
  ChangeDetectionStrategy,
  Component,
  OnChanges,
  OnInit,
  SimpleChanges,
  ViewEncapsulation,
  computed,
  signal,
} from '@angular/core';
import { RunView } from '@memberjunction/core';
import { ComponentMetadataEngine, MJTourStepTypeEntity } from '@memberjunction/core-entities';
import { MJGlobal, RegisterClass, SafeJSONParse } from '@memberjunction/global';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import { MJReactModule, type ReactComponentEvent } from '@memberjunction/ng-react';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { TourSignals, type IEmbeddedComponentStepConfig } from '@memberjunction/tours-runtime';
import { BaseTourStepRenderer } from '../base-step-renderer';
import { TourProgressRailComponent, TourStepHeaderComponent } from '../tour-step-chrome.component';

type TourInteractiveConfig = IEmbeddedComponentStepConfig & {
  componentSpec?: ComponentSpec;
  componentId?: string;
  stepTypeComponentId?: string;
  data?: Record<string, unknown>;
};

interface InteractiveCallbacksProp {
  OnEvent: (eventName: string, payload?: Record<string, unknown>) => void;
}

/**
 * Lazy-chunked interactive `ComponentSpec` step renderer (`EmbeddedComponent` / `InteractiveComponent`).
 * Supports:
 * 1. Inline `step.Configuration.componentSpec` / `ComponentSpec`
 * 2. Database `MJ: Components` via `step.Configuration.componentId` / `ComponentID` (`ComponentMetadataEngine`)
 * 3. `TourStepType.ComponentID` (zero-deploy custom interactive step types!)
 *
 * Passes structured `data` and `callbacks.OnEvent` into `<mj-react-component>` and wires
 * `completeStep`, `chooseBranch`, and `emitSignal` (`TourSignals.Instance.Emit`).
 */
@RegisterClass(BaseTourStepRenderer, 'EmbeddedComponent')
@Component({
  selector: 'mj-tour-embedded-component-step',
  standalone: true,
  imports: [MJReactModule, MJButtonDirective, TourStepHeaderComponent, TourProgressRailComponent],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="mjt-step-content"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="StepHeadingId"
      [attr.aria-describedby]="Step.Body ? StepBodyId : null"
    >
      <mj-tour-step-header
        [Step]="Step"
        [HeadingId]="StepHeadingId"
        (Dismiss)="OnDismiss()"
      />

      @if (Step.Body) {
        <div class="mjt-body" [id]="StepBodyId" [innerHTML]="FormatBodyHtml(Step.Body)"></div>
      }

      @if (loadingSpec()) {
        <div class="mjt-waiting" role="status" aria-live="polite">
          <span>Loading interactive widget...</span>
        </div>
      } @else if (specError()) {
        <div class="mjt-choice-feedback mjt-choice-feedback--incorrect" role="alert">
          {{ specError() }}
        </div>
      } @else if (resolvedSpec(); as spec) {
        <div class="mjt-react-host">
          <mj-react-component
            [Component]="spec"
            [Provider]="Provider"
            [ComponentProps]="reactComponentProps()"
            (ComponentEvent)="OnReactComponentEvent($event)"
          />
        </div>
      }

      <div class="mjt-footer">
        <div class="mjt-footer-meta">
          <mj-tour-progress-rail
            [Session]="Session"
            (StepSelected)="StepSelected.emit($event)"
          />
          <span class="mjt-kbd-row" aria-hidden="true">
            <kbd class="mjt-kbd">&larr;</kbd>
            <kbd class="mjt-kbd">&rarr;</kbd>
            <kbd class="mjt-kbd">Esc</kbd>
          </span>
        </div>
        <div class="mjt-footer-actions">
          @if (Session.CanGoBack) {
            <button
              type="button"
              mjButton
              variant="secondary"
              (click)="OnBack()"
            >
              Back
            </button>
          }
          @if (AllowNextButtonFallback) {
            <button
              type="button"
              mjButton
              variant="primary"
              (click)="OnNext()"
            >
              Continue
            </button>
          }
          <button
            type="button"
            mjButton
            variant="flat"
            (click)="OnDismiss()"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  `,
})
export class EmbeddedComponentStepRenderer
  extends BaseTourStepRenderer<TourInteractiveConfig>
  implements OnInit, OnChanges
{
  protected readonly resolvedSpec = signal<ComponentSpec | null>(null);
  protected readonly loadingSpec = signal(false);
  protected readonly specError = signal<string | null>(null);

  protected readonly reactComponentProps = computed<Record<string, unknown>>(() => {
    const cfg = this.Step?.Configuration ?? {};
    const data = cfg.InputProps ?? cfg.data ?? {};
    const callbacks: InteractiveCallbacksProp = {
      OnEvent: (eventName: string, payload?: Record<string, unknown>) => {
        this.handleInteractiveEvent(eventName, payload);
      },
    };
    return {
      data,
      step: this.Step,
      session: this.Session,
      callbacks,
    };
  });

  public get AllowNextButtonFallback(): boolean {
    return this.Step?.Configuration?.AllowNextButtonFallback !== false;
  }

  public ngOnInit(): void {
    void this.resolveComponentSpec();
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if ('Step' in changes) {
      void this.resolveComponentSpec();
    }
  }

  public OnReactComponentEvent(event: ReactComponentEvent): void {
    const payload =
      event.payload && typeof event.payload === 'object'
        ? (event.payload as Record<string, unknown>)
        : undefined;
    this.handleInteractiveEvent(event.type, payload);
  }

  public OnNext(): void {
    const signalKey =
      this.Step?.Configuration?.CompletionEventName ?? `tours.component.completed.${this.Step.StepKey}`;
    TourSignals.Instance.Emit(signalKey, { StepKey: this.Step.StepKey });
    this.NextRequested.emit({ StepKey: this.Step.StepKey });
  }

  public OnBack(): void {
    this.BackRequested.emit({ StepKey: this.Step.StepKey });
  }

  public OnDismiss(): void {
    this.DismissRequested.emit({ StepKey: this.Step.StepKey });
  }

  private handleInteractiveEvent(eventName: string, payload?: Record<string, unknown>): void {
    const completionName =
      this.Step?.Configuration?.CompletionEventName ?? `tours.component.completed.${this.Step.StepKey}`;

    if (eventName === 'completeStep' || eventName === completionName) {
      TourSignals.Instance.Emit(completionName, payload);
      this.SignalEmitted.emit({ StepKey: this.Step.StepKey, SignalKey: completionName, Payload: payload });
      this.NextRequested.emit({ StepKey: this.Step.StepKey, Data: payload });
      return;
    }

    if (eventName === 'chooseBranch') {
      const choiceKey =
        typeof payload?.['choiceKey'] === 'string'
          ? payload['choiceKey']
          : typeof payload?.['ChoiceKey'] === 'string'
            ? payload['ChoiceKey']
            : '';
      if (choiceKey) {
        this.ChoiceMade.emit({ StepKey: this.Step.StepKey, ChoiceKey: choiceKey });
      }
      return;
    }

    if (eventName === 'emitSignal') {
      const signalKey =
        typeof payload?.['signalKey'] === 'string'
          ? payload['signalKey']
          : typeof payload?.['SignalKey'] === 'string'
            ? payload['SignalKey']
            : '';
      const signalData =
        payload?.['data'] && typeof payload['data'] === 'object'
          ? (payload['data'] as Record<string, unknown>)
          : payload;
      if (signalKey) {
        TourSignals.Instance.Emit(signalKey, signalData);
        this.SignalEmitted.emit({ StepKey: this.Step.StepKey, SignalKey: signalKey, Payload: signalData });
      }
      return;
    }

    if (eventName) {
      TourSignals.Instance.Emit(eventName, payload);
      this.SignalEmitted.emit({ StepKey: this.Step.StepKey, SignalKey: eventName, Payload: payload });
    }
  }

  private async resolveComponentSpec(): Promise<void> {
    const cfg = this.Step?.Configuration;
    if (!cfg) {
      this.resolvedSpec.set(null);
      return;
    }

    // 1. Inline ComponentSpec (supports both camelCase and PascalCase keys)
    const inlineSpec = cfg.componentSpec ?? (cfg.ComponentSpec as ComponentSpec | undefined);
    if (inlineSpec && typeof inlineSpec === 'object' && 'name' in inlineSpec) {
      this.specError.set(null);
      this.resolvedSpec.set(inlineSpec as ComponentSpec);
      return;
    }

    this.loadingSpec.set(true);
    this.specError.set(null);
    try {
      const p = this.ProviderToUse;
      const engine = ComponentMetadataEngine.GetProviderInstance(p, ComponentMetadataEngine) as ComponentMetadataEngine;

      // 2. Explicit ComponentID on step config
      let componentId = cfg.componentId ?? cfg.ComponentID ?? cfg.stepTypeComponentId;

      // 3. Fallback: TourStepType.ComponentID lookup (zero-deploy custom interactive step types)
      if (!componentId && this.Step?.StepType) {
        const rv = RunView.FromMetadataProvider(p);
        const typeName = this.Step.StepType.replace(/'/g, "''");
        const stepTypeRes = await rv.RunView<MJTourStepTypeEntity>(
          {
            EntityName: 'MJ: Tour Step Types',
            ExtraFilter: `Name='${typeName}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
          },
          p.CurrentUser,
        );
        if (stepTypeRes.Success && stepTypeRes.Results[0]?.ComponentID) {
          componentId = stepTypeRes.Results[0].ComponentID;
        }
      }

      if (componentId) {
        const compEntity = await engine.FindComponentByID(componentId, p.CurrentUser, p);
        if (compEntity) {
          const parsed = compEntity.spec ?? SafeJSONParse<ComponentSpec>(compEntity.Specification);
          if (parsed) {
            this.resolvedSpec.set(parsed);
            return;
          }
        }
      }

      if (cfg.ComponentName) {
        const byName = await engine.FindComponent(cfg.ComponentName, undefined, undefined, p.CurrentUser);
        if (byName) {
          const parsed = byName.spec ?? SafeJSONParse<ComponentSpec>(byName.Specification);
          if (parsed) {
            this.resolvedSpec.set(parsed);
            return;
          }
        }
      }

      this.specError.set('Interactive component specification could not be resolved.');
      this.resolvedSpec.set(null);
    } catch (error) {
      this.specError.set(error instanceof Error ? error.message : 'Failed to load interactive component.');
      this.resolvedSpec.set(null);
    } finally {
      this.loadingSpec.set(false);
    }
  }
}

/**
 * Registers `EmbeddedComponentStepRenderer` for both `'EmbeddedComponent'` and `'InteractiveComponent'`.
 */
export function EnsureEmbeddedComponentRendererRegistered(): void {
  const factory = MJGlobal.Instance.ClassFactory;
  const rendererCls = EmbeddedComponentStepRenderer as unknown as new () => BaseTourStepRenderer;
  for (const key of ['EmbeddedComponent', 'InteractiveComponent']) {
    if (factory.GetRegistration(BaseTourStepRenderer, key) === null) {
      factory.Register(BaseTourStepRenderer, rendererCls, key);
    }
  }
}
