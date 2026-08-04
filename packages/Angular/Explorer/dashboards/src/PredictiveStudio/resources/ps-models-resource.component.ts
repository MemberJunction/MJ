import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { PSResourceBase } from './ps-resource-base';
import { PSPanelKey } from '../predictive-studio.types';
import { MODELS_SECTIONS, PSSection, sectionGroups, sectionsInGroup, sectionLabel, hasSection } from '../predictive-studio.nav';
import { buildModelsAgentContext, resolvePSRecord, buildPSNotFoundError } from '../predictive-studio-agent-context';
import { validateStringParam } from '../../shared/agent-tool-validation';

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
    <mj-page-header-interior [Title]="activeLabel" [Subtitle]="activeSubtitle">
    </mj-page-header-interior>
    <mj-page-body-interior [Flex]="true" [Padding]="false">
      @if (isLoading) {
        <mj-loading text="Loading Models…" size="medium"></mj-loading>
      } @else if (loadError) {
        <div class="ps-load-error" data-testid="ps-load-error" role="alert">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <div class="ps-load-error-text">
            <strong>Couldn't load {{ sectionTitle }}</strong>
            <span class="ps-load-error-detail">{{ loadError }}</span>
          </div>
          <button mjButton variant="secondary" size="sm" (click)="retryLoad()"><i class="fa-solid fa-rotate-right"></i> Try again</button>
        </div>
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

          <section class="ps-content" [class.fill]="activeSection === 'registry'" [attr.data-testid]="'ps-panel-' + activeSection">
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
      /* Fill mode (registry): the section stops page-scrolling so the panel's inner
         columns (model list / detail) can each own their scrollbar. */
      .ps-content.fill { overflow: hidden; display: flex; flex-direction: column; padding-bottom: 14px; }
      .ps-content.fill > * { flex: 1; min-height: 0; display: flex; flex-direction: column; }
      .ps-load-error { display: flex; align-items: center; gap: 14px; max-width: 620px; margin: 32px auto; padding: 18px 20px; border: 1px solid var(--mj-status-error-border); background: var(--mj-status-error-bg); border-radius: var(--mj-radius-lg); }
      .ps-load-error > i { font-size: 24px; color: var(--mj-status-error); }
      .ps-load-error-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
      .ps-load-error-text strong { color: var(--mj-text-primary); }
      .ps-load-error-detail { color: var(--mj-text-secondary); font-size: var(--mj-text-sm); word-break: break-word; }
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

  /** Deep agent context for the Models door: active section + trained-model lifecycle counts. */
  protected override extraAgentContext(): Record<string, unknown> {
    const models = this.engine.Models;
    return buildModelsAgentContext({
      ActiveSection: this.activeSection,
      ActiveSectionLabel: this.activeLabel,
      SectionLabels: this.sections.map((s) => s.label),
      TotalModelCount: models.length,
      PublishedModelCount: this.engine.PublishedModels.length,
      DraftModelCount: models.filter((m) => m.Status === 'Draft').length,
      ProductionModelCount: models.filter((m) => this.engine.RecordProcessIDsForModel(m.ID).length > 0).length,
    });
  }

  /**
   * 🔒 Read/navigate-only agent tool for the Models door: switch the active section (Model Registry ↔
   * Models in Production). NO promote/retire/delete/score tool is exposed — model lifecycle changes stay
   * behind the user's own clicks.
   */
  protected override registerAgentTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'SwitchModelsSection',
        Description: 'Switch the Models door to a section. Pass the section key or label (see SectionLabels): Model Registry or Models in Production.',
        ParameterSchema: { type: 'object', properties: { section: { type: 'string', description: 'The section key or label to switch to' } } },
        Handler: async (params: Record<string, unknown>) => {
          const check = validateStringParam(params['section'], 'section');
          if (!check.ok) return check.result;
          const candidates = this.sections.map((s) => ({ ID: s.key, Name: s.label }));
          const match = resolvePSRecord(check.value, candidates);
          if (!match) return { Success: false, ErrorMessage: buildPSNotFoundError(check.value, candidates, 'section') };
          this.selectSection(match.ID as PSPanelKey);
          return { Success: true, Data: { activeSection: match.Name } };
        },
      },
    ]);
  }

  public get groups(): string[] { return sectionGroups(this.sections); }
  public itemsForGroup(group: string): PSSection[] { return sectionsInGroup(this.sections, group); }
  public get activeLabel(): string { return sectionLabel(this.sections, this.activeSection); }

  /** Section-specific subtitle for the interior header. */
  public get activeSubtitle(): string {
    const map: Record<string, string> = {
      registry: 'Versioned trained models, their metrics, and lineage.',
      production: "What's scoring live, and its recent runs.",
    };
    return map[this.activeSection] ?? '';
  }

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
