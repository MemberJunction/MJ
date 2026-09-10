import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { ValidationErrorInfo } from '@memberjunction/global';
import {
  EMPTY_SECTION_INDICATORS,
  ParseValidationSource,
  SumSectionIndicators,
  type FormSectionIndicators,
  type ParsedValidationSource,
} from './form-section-indicators';

/**
 * Anything that can answer "what is the state of section X right now".
 *
 * `mj-collapsible-panel` implements this for every section it renders, deriving the
 * counts from its `mj-form-field` children. A custom section that is NOT a collapsible
 * panel — a hero, a designer, a grid editor — can implement it too and register with
 * the container's {@link FormSectionIndicatorCoordinator}, so the rail treats it like
 * any other section.
 */
export interface FormSectionIndicatorSource {
  /** The chrome section key this source reports for (matches `mj-collapsible-panel` `SectionKey`). */
  readonly SectionKey: string;
  /** Current state. Called during change detection — must be cheap and side-effect free. */
  GetSectionIndicators(): FormSectionIndicators;
  /**
   * Whether a form-level `ValidationErrorInfo` belongs to this section. Used only to
   * decide which errors are UNROUTED (claimed by no section), so a failure nothing
   * renders still reaches the form-wide total instead of vanishing.
   */
  OwnsValidationSource(source: ParsedValidationSource): boolean;
}

/**
 * Per-container registry of section indicator sources — the join between "a rail
 * group" and "the sections it fronts", read live rather than pushed.
 *
 * **Pull, not push.** Every query asks the registered sources for their current
 * counts. Nothing is cached here and nothing is written from inside a change-detection
 * pass, which is what keeps the rail free of `ExpressionChangedAfterItHasBeenChecked`
 * errors: within one pass a field's dirty / error state is constant (it mutates in
 * event handlers), so every reader in that pass sees the same answer.
 *
 * Provided by `<mj-record-form-container>` via `providers` (not `viewProviders`), so
 * projected panels and slot-mounted `BaseFormPanel`s reach the same instance.
 */
@Injectable()
export class FormSectionIndicatorCoordinator {
  /** Insertion-ordered so totals are deterministic. */
  private readonly sources = new Map<string, FormSectionIndicatorSource>();

  /**
   * Fires when a source registers / leaves, or when a source reports that its state
   * changed (a field edit). The container marks itself for check on it so an `OnPush`
   * rail re-reads the counts on the next pass instead of waiting for its poll.
   */
  public readonly Changes = new Subject<void>();

  /** Declare (or re-declare) a section. A second source for the same key replaces the first. */
  public Register(source: FormSectionIndicatorSource): void {
    const key = source.SectionKey;
    if (!key) return;
    if (this.sources.get(key) === source) return;
    this.sources.set(key, source);
    this.Changes.next();
  }

  /** Remove a source. Keyed on identity, so a replaced source cannot evict its replacement. */
  public Unregister(source: FormSectionIndicatorSource, previousKey?: string): void {
    const key = previousKey ?? source.SectionKey;
    if (this.sources.get(key) === source) {
      this.sources.delete(key);
      this.Changes.next();
    }
  }

  /** A source's state changed (field edited, error cleared). Nudges OnPush readers. */
  public NotifyChanged(): void {
    this.Changes.next();
  }

  /** Section keys currently registered, in registration order. */
  public get RegisteredSectionKeys(): string[] {
    return [...this.sources.keys()];
  }

  /** Whether a section is registered. */
  public Has(sectionKey: string): boolean {
    return this.sources.has(sectionKey);
  }

  /** Current indicators for one section; empty when nothing is registered under that key. */
  public IndicatorsFor(sectionKey: string): FormSectionIndicators {
    const source = this.sources.get(sectionKey);
    return source ? source.GetSectionIndicators() : { ...EMPTY_SECTION_INDICATORS };
  }

  /**
   * Indicators summed over several section keys — what a rail group needs, since one
   * group (notably `Details`) fronts many panels.
   */
  public IndicatorsForKeys(sectionKeys: readonly string[]): FormSectionIndicators {
    return SumSectionIndicators(...sectionKeys.map((key) => this.IndicatorsFor(key)));
  }

  /** Indicators summed over every registered section. */
  public get TotalIndicators(): FormSectionIndicators {
    return SumSectionIndicators(...[...this.sources.values()].map((source) => source.GetSectionIndicators()));
  }

  /**
   * Form-level errors no registered section claims. Surfaced deliberately: an error that
   * vanished from every badge is worse than the no-badge behaviour this replaced.
   */
  public UnroutedValidationErrors(errors: readonly ValidationErrorInfo[] | null | undefined): ValidationErrorInfo[] {
    if (!errors?.length) return [];
    const sources = [...this.sources.values()];
    return errors.filter((error) => {
      const parsed = ParseValidationSource(error.Source);
      if (!parsed.Source) return false;
      return !sources.some((source) => source.OwnsValidationSource(parsed));
    });
  }
}
