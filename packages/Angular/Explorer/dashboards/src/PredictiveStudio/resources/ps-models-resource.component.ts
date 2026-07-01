import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { PSResourceBase } from './ps-resource-base';
import { PSPanelKey } from '../predictive-studio.types';
import { MODELS_SECTIONS, PSSection, sectionGroups, sectionsInGroup, sectionLabel, sectionIcon, hasSection } from '../predictive-studio.nav';

/**
 * **Models** — the trained-model lifecycle door (one of Predictive Studio's three consolidated nav
 * items, alongside `Predictions` and `Studio`). Hosts the registry + production section panels
 * (`ps-registry`, `ps-production`) behind an internal left-nav. The active section round-trips through
 * the `section` query param, so the `Overview` panel's cross-door "view in production" links (and any
 * deep link) can land directly on the right section. No docked copilot here — these are read/manage
 * surfaces; model creation + the Model Dev Agent live in the `Studio` and `Predictions` doors.
 */
@RegisterClass(BaseResourceComponent, 'PredictiveStudioModelsResource')
@Component({
  standalone: false,
  selector: 'mj-ps-models-resource',
  template: `
    <mj-page-header-interior [Title]="activeLabel"
      Subtitle="Versioned trained models and what's live in production">
    </mj-page-header-interior>
    <mj-page-body-interior>
      @if (isLoading) {
        <mj-loading text="Loading Models…" size="medium"></mj-loading>
      } @else {
        <div class="ps-models-host" data-testid="ps-models-shell">
          <aside class="ps-leftnav">
            @for (group of groups; track group) {
              @if (group) { <div class="ps-nav-group">{{ group }}</div> }
              @for (item of itemsForGroup(group); track item.key) {
                <button class="ps-nav-item" [class.active]="activeSection === item.key"
                  [attr.data-testid]="'ps-nav-' + item.key" (click)="selectSection(item.key)">
                  <i [class]="item.icon"></i> <span>{{ item.label }}</span>
                </button>
              }
            }
          </aside>

          <section class="ps-content" [attr.data-testid]="'ps-panel-' + activeSection">
            @switch (activeSection) {
              @case ('registry') { <ps-registry [engine]="engine" [provider]="ProviderToUse" [currentUser]="ProviderToUse.CurrentUser"></ps-registry> }
              @case ('production') { <ps-production [engine]="engine"></ps-production> }
            }
          </section>
        </div>
      }
    </mj-page-body-interior>
  `,
  styles: [
    `
      :host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }
      .ps-models-host { display: flex; flex: 1; min-height: 0; overflow: hidden; }
      .ps-leftnav { width: 210px; flex: none; border-right: 1px solid var(--mj-border-default); background: var(--mj-bg-surface-card); overflow-y: auto; padding: 10px 8px; display: flex; flex-direction: column; gap: 2px; }
      .ps-nav-group { font-size: var(--mj-text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--mj-text-muted); padding: 12px 10px 4px; }
      .ps-nav-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 8px 10px; border: none; background: transparent; border-radius: var(--mj-radius-md); cursor: pointer; color: var(--mj-text-secondary); font-size: var(--mj-text-sm); font-weight: 500; transition: background .12s, color .12s; }
      .ps-nav-item i { width: 18px; text-align: center; color: var(--mj-text-muted); }
      .ps-nav-item:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
      .ps-nav-item.active { background: color-mix(in srgb, var(--mj-brand-primary) 12%, transparent); color: var(--mj-brand-primary); font-weight: 600; }
      .ps-nav-item.active i { color: var(--mj-brand-primary); }
      .ps-content { flex: 1; min-width: 0; overflow-y: auto; padding: 8px 14px 24px; }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSModelsResourceComponent extends PSResourceBase {
  protected readonly SectionKey = 'models';
  protected readonly SectionLabel = 'Models';
  protected readonly SectionIcon = 'fa-solid fa-cubes';

  private readonly cdrLocal = inject(ChangeDetectorRef);

  public activeSection: PSPanelKey = 'registry';
  public readonly sections: readonly PSSection[] = MODELS_SECTIONS;

  override ngOnInit(): void {
    super.ngOnInit();
    const initial = this.GetQueryParams()['section'] as PSPanelKey | undefined;
    if (initial && hasSection(this.sections, initial)) this.activeSection = initial;
  }

  protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
    const next = params['section'] as PSPanelKey | undefined;
    if (next && next !== this.activeSection && hasSection(this.sections, next)) {
      this.activeSection = next;
      this.cdrLocal.detectChanges();
    }
  }

  protected override extraAgentContext(): Record<string, unknown> {
    return { ActiveSection: sectionLabel(this.sections, this.activeSection) };
  }

  public get groups(): string[] { return sectionGroups(this.sections); }
  public itemsForGroup(group: string): PSSection[] { return sectionsInGroup(this.sections, group); }
  public get activeLabel(): string { return sectionLabel(this.sections, this.activeSection); }
  public get activeIcon(): string { return sectionIcon(this.sections, this.activeSection); }

  public selectSection(key: PSPanelKey): void {
    if (this.activeSection === key) return;
    this.activeSection = key;
    this.UpdateQueryParams({ section: key });
    this.publishAgentContext();
    this.cdrLocal.detectChanges();
  }
}

/** Tree-shaking prevention — called from the subpath module so the @RegisterClass survives bundling. */
export function LoadPSModelsResource(): void {
  // intentionally empty
}
