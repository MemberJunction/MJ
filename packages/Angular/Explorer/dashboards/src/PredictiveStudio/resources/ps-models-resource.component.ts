import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { UserInfoEngine } from '@memberjunction/core-entities';
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
        <div class="ps-models-host" [class.nav-collapsed]="isNavCollapsed" data-testid="ps-models-shell">
          @if (isNavCollapsed) {
            <div class="ps-nav-collapsed-strip" role="region" aria-label="Models navigation (collapsed)">
              <button class="ps-nav-rail-collapse" type="button" (click)="toggleNav()" aria-label="Expand models navigation" title="Expand navigation">
                <i class="fa-solid fa-chevron-right"></i>
              </button>
              <div class="ps-nav-collapsed-strip-label"><i class="fa-solid fa-cubes"></i> Models</div>
            </div>
          }

          <as-split direction="horizontal" class="models-splitter" unit="percent" [gutterSize]="isNavCollapsed ? 0 : 6" (dragEnd)="onSplitDragEnd($event.sizes)">
            @if (!isNavCollapsed) {
              <as-split-area [size]="navSizePct" [minSize]="10" [maxSize]="30">
                <aside class="ps-leftnav">
                  <div class="ps-leftnav-header">
                    <span class="ps-leftnav-title">Lifecycle</span>
                    <button class="ps-leftnav-collapse-btn" type="button" (click)="toggleNav()" title="Collapse navigation" aria-label="Collapse navigation">
                      <i class="fa-solid fa-chevron-left"></i>
                    </button>
                  </div>
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
              </as-split-area>
            }

            <as-split-area [size]="isNavCollapsed ? 100 : contentSizePct" [minSize]="50">
              <section class="ps-content" [class.fill]="activeSection === 'registry' || activeSection === 'production'" [attr.data-testid]="'ps-panel-' + activeSection">
                @switch (activeSection) {
                  @case ('registry') { <ps-registry [engine]="engine" [provider]="ProviderToUse" [currentUser]="ProviderToUse.CurrentUser" [initialModelId]="initialModelId"></ps-registry> }
                  @case ('production') { <ps-production [engine]="engine"></ps-production> }
                }
              </section>
            </as-split-area>
          </as-split>
        </div>
      }
    </mj-page-body-interior>
  `,
  styles: [
    `
      :host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }
      .ps-models-host { display: flex; flex: 1; min-height: 0; overflow: hidden; width: 100%; height: 100%; }
      .models-splitter { flex: 1; width: 100%; height: 100%; min-height: 0; min-width: 0; background: transparent; }
      .models-splitter .as-split-gutter { background: transparent; transition: background-color 0.15s ease; position: relative; }
      .models-splitter .as-split-gutter:hover { background-color: var(--mj-brand-primary, #6366f1); }
      .models-splitter .as-split-gutter::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 2px; height: 24px; border-radius: 1px; background: var(--mj-border-strong, #cbd5e1); }
      .models-splitter .as-split-gutter:hover::after { background: #ffffff; }

      .ps-nav-collapsed-strip { width: 44px; min-width: 44px; max-width: 44px; flex: none; background: var(--mj-bg-surface); border-right: 1px solid var(--mj-border-default); display: flex; flex-direction: column; align-items: center; padding: 10px 0; gap: 14px; z-index: 2; }
      .ps-nav-rail-collapse { background: var(--mj-bg-surface-subtle); border: 1px solid var(--mj-border-default); border-radius: 6px; color: var(--mj-text-secondary); cursor: pointer; display: grid; place-items: center; width: 28px; height: 28px; padding: 0; font-size: 11px; transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease; }
      .ps-nav-rail-collapse:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); border-color: var(--mj-border-strong); }
      .ps-nav-collapsed-strip-label { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--mj-text-muted); display: flex; align-items: center; gap: 8px; text-transform: uppercase; }

      .ps-leftnav { width: 100%; height: 100%; border-right: 1px solid var(--mj-border-default); background: var(--mj-bg-surface-card); overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 2px; box-sizing: border-box; }
      .ps-leftnav-header { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px 8px; border-bottom: 1px solid var(--mj-border-subtle); margin-bottom: 4px; }
      .ps-leftnav-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--mj-text-muted); }
      .ps-leftnav-collapse-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); color: var(--mj-text-muted); cursor: pointer; transition: all 0.15s ease; padding: 0; }
      .ps-leftnav-collapse-btn:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); border-color: var(--mj-border-strong); }

      .ps-nav-group { font-size: var(--mj-text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--mj-text-muted); padding: 10px 8px 4px; }
      .ps-nav-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 8px 10px; border: none; background: transparent; border-radius: var(--mj-radius-md); cursor: pointer; color: var(--mj-text-secondary); font-size: var(--mj-text-sm); font-weight: 500; transition: background .12s, color .12s; }
      .ps-nav-item i { width: 18px; text-align: center; color: var(--mj-text-muted); }
      .ps-nav-item:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
      .ps-nav-item.active { background: color-mix(in srgb, var(--mj-brand-primary) 12%, transparent); color: var(--mj-brand-primary); font-weight: 600; }
      .ps-nav-item.active i { color: var(--mj-brand-primary); }
      .ps-content { width: 100%; height: 100%; flex: 1; min-width: 0; overflow-y: auto; padding: 8px 14px 24px; }
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
  public initialModelId?: string;
  public isNavCollapsed = false;
  public navSizePct = 14;
  public contentSizePct = 86;

  override ngOnInit(): void {
    super.ngOnInit();
    const qp = this.GetQueryParams();
    const initial = qp['section'] as PSPanelKey | undefined;
    if (initial && hasSection(this.sections, initial)) this.activeSection = initial;
    if (qp['modelId']) this.initialModelId = qp['modelId'];
    this.loadLayoutPrefs();
  }

  public toggleNav(): void {
    this.isNavCollapsed = !this.isNavCollapsed;
    this.saveLayoutPrefs();
    this.cdrLocal.detectChanges();
  }

  public onSplitDragEnd(sizes: readonly (number | '*')[]): void {
    if (Array.isArray(sizes) && sizes.length === 2 && typeof sizes[0] === 'number' && typeof sizes[1] === 'number') {
      this.navSizePct = Math.round(sizes[0]);
      this.contentSizePct = Math.round(sizes[1]);
      this.saveLayoutPrefs();
    }
  }

  private loadLayoutPrefs(): void {
    const raw = UserInfoEngine.Instance.GetSetting('mj.predictiveStudio.models.layout');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.navSizePct === 'number' && parsed.navSizePct >= 10 && parsed.navSizePct <= 35) {
          this.navSizePct = parsed.navSizePct;
          this.contentSizePct = 100 - parsed.navSizePct;
        }
        if (typeof parsed.isNavCollapsed === 'boolean') {
          this.isNavCollapsed = parsed.isNavCollapsed;
        }
      } catch {}
    }
  }

  private saveLayoutPrefs(): void {
    const prefs = {
      navSizePct: this.navSizePct,
      contentSizePct: this.contentSizePct,
      isNavCollapsed: this.isNavCollapsed,
    };
    UserInfoEngine.Instance.SetSettingDebounced('mj.predictiveStudio.models.layout', JSON.stringify(prefs));
  }

  protected override async OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): Promise<void> {
    const next = params['section'] as PSPanelKey | undefined;
    if (next && next !== this.activeSection && hasSection(this.sections, next)) {
      this.activeSection = next;
    }
    if (params['modelId']) {
      this.initialModelId = params['modelId'];
      if (this.engine && !this.engine.Models.some((m) => UUIDsEqual(m.ID, params['modelId']))) {
        await this.engine.Config(true, this.ProviderToUse.CurrentUser ?? undefined, this.ProviderToUse);
      }
    }
    this.cdrLocal.detectChanges();
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
