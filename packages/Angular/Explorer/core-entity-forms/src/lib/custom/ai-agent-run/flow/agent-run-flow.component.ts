import {
  Component, Input, ElementRef, ViewChild, NgZone, ChangeDetectorRef,
  OnDestroy, AfterViewInit, ChangeDetectionStrategy, inject
} from '@angular/core';
import { Subject } from 'rxjs';
import { combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CompositeKey } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { AIAgentRunDataHelper } from '../ai-agent-run-data.service';
import { TimelineItem } from '../ai-agent-run-timeline.component';
import {
  FlowModel, FlowNode, BuildFlowModel, ActiveLeaf, Ancestors,
  FormatDuration, ShortLabel, FLOW_COLORS, FLOW_EMOJI, FLOW_LABEL
} from './agent-run-flow.model';
import { FlameCascadeComponent } from './flame-cascade.component';
import { SubwayLinesComponent } from './subway-lines.component';
import { BuildFlowModelFromTree } from './run-tree-flow-projection';
import type { AgentRunTreeNode } from '@memberjunction/ai-core-plus';
import { ConstellationComponent } from './constellation.component';
import { FlowchartComponent } from './flowchart.component';

interface FlowMode { key: string; label: string; icon: string; enabled: boolean; }

/**
 * Flow — the playable, zoomed-out execution view for an Agent Run.
 *
 * Owns the single master clock (scrub / play / speed) and the narration rail,
 * and hosts three interchangeable renderers (Flame, Subway, Constellation).
 * The per-frame loop runs *outside* Angular's zone and pushes updates straight
 * to the DOM / active renderer, so 60fps playback never triggers change detection.
 */
@Component({
  standalone: false,
  selector: 'mj-ai-agent-run-flow',
  templateUrl: './agent-run-flow.component.html',
  styleUrls: ['./agent-run-flow.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AIAgentRunFlowComponent implements AfterViewInit, OnDestroy {
  @Input() AiAgentRunId!: string;

  /** @deprecated Use {@link AiAgentRunId}. */
  @Input() set aiAgentRunId(value: string) {
    this.AiAgentRunId = value;
  }
  /** @deprecated Use {@link AiAgentRunId}. */
  get aiAgentRunId(): string {
    return this.AiAgentRunId;
  }
  @Input() DataHelper!: AIAgentRunDataHelper;

  /** @deprecated Use {@link DataHelper}. */
  @Input() set dataHelper(value: AIAgentRunDataHelper) {
    this.DataHelper = value;
  }
  /** @deprecated Use {@link DataHelper}. */
  get dataHelper(): AIAgentRunDataHelper {
    return this.DataHelper;
  }
  @Input() AgentName: string | null = null;

  /** @deprecated Use {@link AgentName}. */
  @Input() set agentName(value: string | null) {
    this.AgentName = value;
  }
  /** @deprecated Use {@link AgentName}. */
  get agentName(): string | null {
    return this.AgentName;
  }
  @Input() RunStatus = '';

  /** @deprecated Use {@link RunStatus}. */
  @Input() set runStatus(value: AIAgentRunFlowComponent['RunStatus']) {
    this.RunStatus = value;
  }
  /** @deprecated Use {@link RunStatus}. */
  get runStatus(): AIAgentRunFlowComponent['RunStatus'] {
    return this.RunStatus;
  }
  @Input() AgentIconClass: string | null = null;

  /** @deprecated Use {@link AgentIconClass}. */
  @Input() set agentIconClass(value: string | null) {
    this.AgentIconClass = value;
  }
  /** @deprecated Use {@link AgentIconClass}. */
  get agentIconClass(): string | null {
    return this.AgentIconClass;
  }
  @Input() AgentLogoUrl: string | null = null;

  /** @deprecated Use {@link AgentLogoUrl}. */
  @Input() set agentLogoUrl(value: string | null) {
    this.AgentLogoUrl = value;
  }
  /** @deprecated Use {@link AgentLogoUrl}. */
  get agentLogoUrl(): string | null {
    return this.AgentLogoUrl;
  }

  /**
   * The run's execution tree, loaded once by the form and shared with every tab.
   *
   * Setter-based so a refresh upstream rebuilds all three renderers immediately — they share one
   * model, so one rebuild updates whichever is on screen and every one behind it.
   */
  @Input()
  set RunTree(value: AgentRunTreeNode | null) {
    this.runTree = value;
    void this.rebuildModel();
  }
  private runTree: AgentRunTreeNode | null = null;

  public Modes: FlowMode[] = [
    { key: 'subway', label: 'Subway Lines', icon: 'fa-train-subway', enabled: true },
    { key: 'constellation', label: 'Constellation', icon: 'fa-star', enabled: true },
    { key: 'flow', label: 'Flow', icon: 'fa-diagram-project', enabled: true },
    { key: 'flame', label: 'Flame Cascade', icon: 'fa-fire', enabled: true }
  ];

  /** @deprecated Use {@link Modes}. */
  public get modes(): FlowMode[] {
    return this.Modes;
  }
  /** @deprecated Use {@link Modes}. */
  public set modes(value: FlowMode[]) {
    this.Modes = value;
  }
  public Mode = 'subway';

  /** @deprecated Use {@link Mode}. */
  public get mode() {
    return this.Mode;
  }
  /** @deprecated Use {@link Mode}. */
  public set mode(value) {
    this.Mode = value;
  }
  public model: FlowModel | null = null;
  public Playing = false;

  /** @deprecated Use {@link Playing}. */
  public get playing() {
    return this.Playing;
  }
  /** @deprecated Use {@link Playing}. */
  public set playing(value) {
    this.Playing = value;
  }
  public Speed = 1;

  /** @deprecated Use {@link Speed}. */
  public get speed() {
    return this.Speed;
  }
  /** @deprecated Use {@link Speed}. */
  public set speed(value) {
    this.Speed = value;
  }
  public Loading = true;

  /** @deprecated Use {@link Loading}. */
  public get loading() {
    return this.Loading;
  }
  /** @deprecated Use {@link Loading}. */
  public set loading(value) {
    this.Loading = value;
  }
  public HasData = false;

  /** @deprecated Use {@link HasData}. */
  public get hasData() {
    return this.HasData;
  }
  /** @deprecated Use {@link HasData}. */
  public set hasData(value) {
    this.HasData = value;
  }
  /** Selected node detail (any mode). */
  public SelectedStepItem: TimelineItem | null = null;

  /** @deprecated Use {@link SelectedStepItem}. */
  public get selectedStepItem(): TimelineItem | null {
    return this.SelectedStepItem;
  }
  /** @deprecated Use {@link SelectedStepItem}. */
  public set selectedStepItem(value: TimelineItem | null) {
    this.SelectedStepItem = value;
  }
  private selectedNodeId = -1;
  private logRows = new Map<number, HTMLElement>();
  private lastActiveRowId = -1;

  /** The animated modes share the master clock + narration rail; Flow is static. */
  public get IsAnimated(): boolean { return this.Mode !== 'flow'; }

  /** @deprecated Use {@link IsAnimated}. */
  public get isAnimated(): boolean {
    return this.IsAnimated;
  }
  /** Rail (now-executing + log tree) shows only for animated modes with nothing selected. */
  public get ShowRail(): boolean { return this.IsAnimated && !this.SelectedStepItem; }

  /** @deprecated Use {@link ShowRail}. */
  public get showRail(): boolean {
    return this.ShowRail;
  }

  /** Right-panel width (rail / inspector), resizable + persisted per user. Default is 50px wider than the old fixed panel. */
  public PanelWidth = 410;

  /** @deprecated Use {@link PanelWidth}. */
  public get panelWidth() {
    return this.PanelWidth;
  }
  /** @deprecated Use {@link PanelWidth}. */
  public set panelWidth(value) {
    this.PanelWidth = value;
  }
  private readonly PANEL_KEY = 'mj.agentRunFlow.panelWidth.v1';
  private resizing = false;
  private resizeStartX = 0;
  private resizeStartW = 0;

  @ViewChild(FlameCascadeComponent) private flame?: FlameCascadeComponent;
  @ViewChild(SubwayLinesComponent) private subway?: SubwayLinesComponent;
  @ViewChild(ConstellationComponent) private constellation?: ConstellationComponent;
  @ViewChild(FlowchartComponent) private flowchart?: FlowchartComponent;

  @ViewChild('scrub') private scrubRef?: ElementRef<HTMLInputElement>;
  @ViewChild('clock') private clockRef?: ElementRef<HTMLElement>;
  @ViewChild('crumb') private crumbRef?: ElementRef<HTMLElement>;
  @ViewChild('nowIco') private nowIcoRef?: ElementRef<HTMLElement>;
  @ViewChild('nowName') private nowNameRef?: ElementRef<HTMLElement>;
  @ViewChild('nowType') private nowTypeRef?: ElementRef<HTMLElement>;
  @ViewChild('nowDur') private nowDurRef?: ElementRef<HTMLElement>;
  @ViewChild('nowModel') private nowModelRef?: ElementRef<HTMLElement>;
  @ViewChild('nowStat') private nowStatRef?: ElementRef<HTMLElement>;
  @ViewChild('nowBar') private nowBarRef?: ElementRef<HTMLElement>;
  @ViewChild('loglist') private loglistRef?: ElementRef<HTMLElement>;

  private destroy$ = new Subject<void>();
  private rafId: number | null = null;
  private p = 0;
  private lastTs = 0;
  private readonly PLAY_MS = 11000;
  private logModelRef: FlowModel | null = null;
  private lastLeafId = -1;
  private viewReady = false;

  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  ngAfterViewInit(): void {
    this.viewReady = true;
    const savedW = UserInfoEngine.Instance.GetSetting(this.PANEL_KEY);
    if (savedW) { const n = +savedW; if (n >= 280) this.PanelWidth = Math.min(n, this.maxPanelWidth()); }
    combineLatest([this.DataHelper.steps$, this.DataHelper.loading$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([steps, loading]) => {
        this.Loading = loading && steps.length === 0;
        if (!loading || steps.length > 0) this.rebuildModel();
        this.cdr.markForCheck();
      });
    this.zone.runOutsideAngular(() => {
      this.rafId = requestAnimationFrame(ts => this.tick(ts));
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next(); this.destroy$.complete();
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
  }

  private async rebuildModel(): Promise<void> {
    const wasEmpty = !this.model;
    await AIEngineBase.Instance.EnsureLoaded(); // agent icons/logos read synchronously during build
    const rootIcon = { iconClass: this.AgentIconClass || 'fa-robot', logoUrl: this.AgentLogoUrl };
    // The TREE is the source. It carries the run's steps AND any task-graph work those steps
    // submitted — which the step-row builder cannot see at all, because a workflow's steps live in
    // MJ: Tasks rather than in the run's step list. Falling back to the step builder when the tree
    // has not arrived keeps the view populated on first paint rather than flashing empty.
    const model = this.runTree
      ? BuildFlowModelFromTree(this.runTree, this.AgentName ?? '', this.RunStatus, rootIcon)
      : await BuildFlowModel(this.AgentName ?? '', this.RunStatus, rootIcon, this.DataHelper);
    if (!model) return;
    this.model = model;
    this.HasData = model.leaves.length > 0;
    if (wasEmpty) this.p = 0;
    this.lastLeafId = -1;
    this.cdr.markForCheck();
  }

  /* -------------------------------- transport ------------------------------- */

  public TogglePlay(): void {
    if (!this.HasData) return;
    if (this.p >= 1) this.p = 0;
    this.Playing = !this.Playing;
    this.lastTs = 0;
  }

  /** @deprecated Use {@link TogglePlay}. */
  public togglePlay(): void {
    return this.TogglePlay();
  }

  public Restart(): void {
    if (!this.HasData) return;
    this.p = 0; this.Playing = true; this.lastTs = 0;
    this.lastLeafId = -1;
  }

  /** @deprecated Use {@link Restart}. */
  public restart(): void {
    return this.Restart();
  }

  public OnScrub(value: string): void {
    this.p = (+value) / 1000;
    this.Playing = false;
  }

  /** @deprecated Use {@link OnScrub}. */
  public onScrub(value: string): void {
    return this.OnScrub(value);
  }

  public OnSpeed(value: string): void { this.Speed = (+value) / 100; }

  /** @deprecated Use {@link OnSpeed}. */
  public onSpeed(value: string): void {
    return this.OnSpeed(value);
  }

  public SelectMode(m: FlowMode): void {
    if (!m.enabled) return;
    this.Mode = m.key;
    this.applyRendererSelection(this.selectedNodeId === -1 ? null : this.selectedNodeId);
    this.currentRenderer?.ReapplyView?.(); // ensure the now-visible renderer shows its OWN (per-type) zoom
  }

  /** @deprecated Use {@link SelectMode}. */
  public selectMode(m: FlowMode): void {
    return this.SelectMode(m);
  }

  private get currentRenderer(): { Render(p: number, ts: number): void; ZoomIn?(): void; ZoomOut?(): void; FitReset?(): void; ReapplyView?(): void } | undefined {
    switch (this.Mode) {
      case 'flame': return this.flame;
      case 'subway': return this.subway;
      case 'constellation': return this.constellation;
      case 'flow': return this.flowchart;
      default: return undefined;
    }
  }

  /* --------------------------- zoom (shared toolbar) ------------------------ */

  public ZoomIn(): void { this.currentRenderer?.ZoomIn?.(); }

  /** @deprecated Use {@link ZoomIn}. */
  public zoomIn(): void {
    return this.ZoomIn();
  }
  public ZoomOut(): void { this.currentRenderer?.ZoomOut?.(); }

  /** @deprecated Use {@link ZoomOut}. */
  public zoomOut(): void {
    return this.ZoomOut();
  }
  public FitReset(): void { this.currentRenderer?.FitReset?.(); }

  /** @deprecated Use {@link FitReset}. */
  public fitReset(): void {
    return this.FitReset();
  }

  /* ---------------------------- panel resize ------------------------------- */

  /** Cap the right panel at 75% of the viewport width. */
  private maxPanelWidth(): number { return Math.max(360, window.innerWidth * 0.75); }

  public StartResize(e: MouseEvent): void {
    e.preventDefault();
    this.resizing = true;
    this.resizeStartX = e.clientX;
    this.resizeStartW = this.PanelWidth;
    const move = (ev: MouseEvent) => {
      if (!this.resizing) return;
      const w = this.resizeStartW + (this.resizeStartX - ev.clientX); // drag left → wider
      this.PanelWidth = Math.max(280, Math.min(this.maxPanelWidth(), w));
      this.cdr.markForCheck();
    };
    const up = () => {
      this.resizing = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      UserInfoEngine.Instance.SetSettingDebounced(this.PANEL_KEY, String(Math.round(this.PanelWidth)));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  /** @deprecated Use {@link StartResize}. */
  public startResize(e: MouseEvent): void {
    return this.StartResize(e);
  }

  /* -------------------------------- selection ------------------------------ */

  /** A node was clicked in any renderer (or a log row) — highlight it everywhere and show its detail. */
  public SelectStep(n: FlowNode): void {
    this.zone.run(() => {
      this.selectedNodeId = n.id;
      this.SelectedStepItem = this.toTimelineItem(n);
      this.cdr.markForCheck();
    });
    this.applyRendererSelection(n.id);
  }

  /** @deprecated Use {@link SelectStep}. */
  public selectStep(n: FlowNode): void {
    return this.SelectStep(n);
  }

  public CloseDetail(): void {
    this.zone.run(() => { this.SelectedStepItem = null; this.selectedNodeId = -1; this.cdr.markForCheck(); });
    this.applyRendererSelection(null);
    this.flowchart?.Deselect();
  }

  /** @deprecated Use {@link CloseDetail}. */
  public closeDetail(): void {
    return this.CloseDetail();
  }

  private applyRendererSelection(id: number | null): void {
    this.flame?.SetSelected(id);
    this.subway?.SetSelected(id);
    this.constellation?.SetSelected(id);
  }

  public OnDetailNavigateActionLog(logId: string): void {
    SharedService.Instance.OpenEntityRecord('MJ: Action Execution Logs', CompositeKey.FromID(logId));
  }

  /** @deprecated Use {@link OnDetailNavigateActionLog}. */
  public onDetailNavigateActionLog(logId: string): void {
    return this.OnDetailNavigateActionLog(logId);
  }

  public async OnDetailCopy(text: string): Promise<void> {
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ }
  }

  /** @deprecated Use {@link OnDetailCopy}. */
  public async onDetailCopy(text: string): Promise<void> {
    return this.OnDetailCopy(text);
  }

  private toTimelineItem(n: FlowNode): TimelineItem | null {
    if (!n.raw) return null;
    return {
      id: n.raw.ID, type: 'step', title: n.name, subtitle: `Type: ${n.raw.StepType}`,
      status: n.status, startTime: n.raw.StartedAt, endTime: n.raw.CompletedAt || undefined,
      duration: FormatDuration(n.realDur), icon: 'fa-circle', color: '', data: n.raw, level: n.depth
    };
  }

  /* ------------------------------- master loop ------------------------------ */

  private tick(ts: number): void {
    const animated = this.IsAnimated;
    if (animated && this.Playing && this.HasData) {
      if (!this.lastTs) this.lastTs = ts;
      const dt = ts - this.lastTs; this.lastTs = ts;
      this.p += dt / (this.PLAY_MS / this.Speed);
      if (this.p >= 1) { this.p = 1; this.Playing = false; this.zone.run(() => this.cdr.markForCheck()); }
    } else {
      this.lastTs = 0;
    }
    if (this.viewReady && this.model && this.HasData) {
      if (animated) {
        this.currentRenderer?.Render(this.p, ts);
        this.updateRail(ts);
      } else {
        // Flow (static): just ensure the flowchart is built; no clock.
        this.flowchart?.Render(0, ts);
      }
    }
    this.rafId = requestAnimationFrame(t => this.tick(t));
  }

  /* ------------------------------ narration rail ---------------------------- */

  private updateRail(_ts: number): void {
    const m = this.model!;

    // (Re)populate the imperative rail content whenever the rail DOM is fresh
    // (the @if remounted it with template defaults) or the model changed. Without
    // this, a remount at run-completion leaves an empty log + a blank now-card.
    if (this.loglistRef &&
        (this.logModelRef !== m || (this.loglistRef.nativeElement.childElementCount === 0 && m.nodes.length > 1))) {
      this.buildLogTree();
      this.logModelRef = m;
      this.lastLeafId = -1; // force the now-card to repopulate the fresh DOM
    }

    const leaf = ActiveLeaf(m, this.p);
    const prog = this.p >= leaf.t1 ? 1 : Math.max(0, (this.p - leaf.t0) / (leaf.t1 - leaf.t0));

    if (this.scrubRef) this.scrubRef.nativeElement.value = String(Math.round(this.p * 1000));
    if (this.clockRef) {
      const realT = this.p >= 1 ? m.total : leaf.r0 + prog * leaf.realDur;
      this.clockRef.nativeElement.textContent = `${FormatDuration(realT)} / ${FormatDuration(m.total)}`;
    }
    if (this.nowBarRef) this.nowBarRef.nativeElement.style.width = `${prog * 100}%`;

    if (leaf.id !== this.lastLeafId) {
      this.lastLeafId = leaf.id;
      this.refreshNowCard(leaf);
    }
    if (this.nowStatRef) {
      this.nowStatRef.nativeElement.textContent = this.p >= 1 ? 'done' : (this.p > leaf.t0 ? 'running' : 'starting');
    }
    if (this.loglistRef) this.updateLogTree();
  }

  private refreshNowCard(leaf: FlowNode): void {
    const col = FLOW_COLORS[leaf.type];
    if (this.nowIcoRef) this.nowIcoRef.nativeElement.textContent = FLOW_EMOJI[leaf.type];
    if (this.nowNameRef) this.nowNameRef.nativeElement.textContent = leaf.name;
    if (this.nowTypeRef) {
      this.nowTypeRef.nativeElement.textContent = FLOW_LABEL[leaf.type];
      this.nowTypeRef.nativeElement.style.color = col;
    }
    if (this.nowDurRef) this.nowDurRef.nativeElement.textContent = FormatDuration(leaf.realDur);
    if (this.nowModelRef) this.nowModelRef.nativeElement.textContent = leaf.model ?? '—';
    if (this.crumbRef) {
      const chain = Ancestors(leaf);
      this.crumbRef.nativeElement.innerHTML = chain.map((n, i) =>
        `${i ? '<span class="sep">›</span>' : ''}<span style="color:${FLOW_COLORS[n.type]}">${FLOW_EMOJI[n.type]} ${this.escape(n.name)}</span>`
      ).join('');
    }
  }

  /* ------------------------------ log tree (rail) --------------------------- */

  /** Build a clickable indented tree of every step, mirroring the run hierarchy. */
  private buildLogTree(): void {
    const list = this.loglistRef!.nativeElement;
    list.innerHTML = '';
    this.logRows.clear();
    this.lastActiveRowId = -1;
    const m = this.model!;
    for (const n of m.nodes) {
      if (n.depth === 0) continue; // skip the synthetic root (it's the header)
      const col = FLOW_COLORS[n.type];
      const row = document.createElement('div');
      row.className = 'ftree-row';
      row.style.paddingLeft = `${6 + (n.depth - 1) * 15}px`;
      const ico = n.logoUrl
        ? `<img class="ftree-logo" src="${this.escape(n.logoUrl)}" alt=""/>`
        : `<i class="ftree-ico fa-solid ${this.escape(n.iconClass)}" style="color:${col}"></i>`;
      row.innerHTML = ico +
        `<span class="ftree-name">${this.escape(ShortLabel(n))}</span>` +
        `<span class="ftree-dur">${FormatDuration(n.realDur)}</span>`;
      row.addEventListener('click', () => this.SelectStep(n));
      list.appendChild(row);
      this.logRows.set(n.id, row);
    }
  }

  /** Sync each log row's state (pending / running / done / selected) with the clock. */
  private updateLogTree(): void {
    const m = this.model!;
    for (const n of m.nodes) {
      if (n.depth === 0) continue;
      const row = this.logRows.get(n.id);
      if (!row) continue;
      const started = this.p >= n.t0;
      const active = started && this.p < n.t1;
      row.classList.toggle('ftree-pending', !started);
      row.classList.toggle('ftree-active', active);
      row.classList.toggle('ftree-done', this.p >= n.t1);
      row.classList.toggle('ftree-selected', n.id === this.selectedNodeId);
      if (active && n.id !== this.lastActiveRowId && !n.children.length) {
        this.lastActiveRowId = n.id;
        row.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  private escape(s: string): string {
    return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
  }
}
