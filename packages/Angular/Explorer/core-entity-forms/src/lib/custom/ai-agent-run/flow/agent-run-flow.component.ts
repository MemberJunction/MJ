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
  FlowModel, FlowNode, buildFlowModel, activeLeaf, ancestors,
  formatDuration, shortLabel, FLOW_COLORS, FLOW_EMOJI, FLOW_LABEL
} from './agent-run-flow.model';
import { FlameCascadeComponent } from './flame-cascade.component';
import { SubwayLinesComponent } from './subway-lines.component';
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
  @Input() aiAgentRunId!: string;
  @Input() dataHelper!: AIAgentRunDataHelper;
  @Input() agentName: string | null = null;
  @Input() runStatus = '';
  @Input() agentIconClass: string | null = null;
  @Input() agentLogoUrl: string | null = null;

  public modes: FlowMode[] = [
    { key: 'flame', label: 'Flame Cascade', icon: 'fa-fire', enabled: true },
    { key: 'subway', label: 'Subway Lines', icon: 'fa-train-subway', enabled: true },
    { key: 'constellation', label: 'Constellation', icon: 'fa-star', enabled: true },
    { key: 'flow', label: 'Flow', icon: 'fa-diagram-project', enabled: true }
  ];
  public mode = 'flame';
  public model: FlowModel | null = null;
  public playing = false;
  public speed = 1;
  public loading = true;
  public hasData = false;
  /** Selected node detail (any mode). */
  public selectedStepItem: TimelineItem | null = null;
  private selectedNodeId = -1;
  private logRows = new Map<number, HTMLElement>();
  private lastActiveRowId = -1;

  /** The animated modes share the master clock + narration rail; Flow is static. */
  public get isAnimated(): boolean { return this.mode !== 'flow'; }
  /** Rail (now-executing + log tree) shows only for animated modes with nothing selected. */
  public get showRail(): boolean { return this.isAnimated && !this.selectedStepItem; }

  /** Right-panel width (rail / inspector), resizable + persisted per user. Default is 50px wider than the old fixed panel. */
  public panelWidth = 410;
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
  private logBuilt = false;
  private lastLeafId = -1;
  private viewReady = false;

  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  ngAfterViewInit(): void {
    this.viewReady = true;
    const savedW = UserInfoEngine.Instance.GetSetting(this.PANEL_KEY);
    if (savedW) { const n = +savedW; if (n >= 280 && n <= 760) this.panelWidth = n; }
    combineLatest([this.dataHelper.steps$, this.dataHelper.loading$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([steps, loading]) => {
        this.loading = loading && steps.length === 0;
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
    const rootIcon = { iconClass: this.agentIconClass || 'fa-robot', logoUrl: this.agentLogoUrl };
    const model = await buildFlowModel(this.agentName ?? '', this.runStatus, rootIcon, this.dataHelper);
    this.model = model;
    this.hasData = model.leaves.length > 0;
    if (wasEmpty) this.p = 0;
    this.lastLeafId = -1;
    this.logBuilt = false;
    this.cdr.markForCheck();
  }

  /* -------------------------------- transport ------------------------------- */

  public togglePlay(): void {
    if (!this.hasData) return;
    if (this.p >= 1) this.p = 0;
    this.playing = !this.playing;
    this.lastTs = 0;
  }

  public restart(): void {
    if (!this.hasData) return;
    this.p = 0; this.playing = true; this.lastTs = 0;
    this.lastLeafId = -1;
  }

  public onScrub(value: string): void {
    this.p = (+value) / 1000;
    this.playing = false;
  }

  public onSpeed(value: string): void { this.speed = (+value) / 100; }

  public selectMode(m: FlowMode): void {
    if (!m.enabled) return;
    this.mode = m.key;
    this.applyRendererSelection(this.selectedNodeId === -1 ? null : this.selectedNodeId);
  }

  private get currentRenderer(): { Render(p: number, ts: number): void; ZoomIn?(): void; ZoomOut?(): void; FitReset?(): void } | undefined {
    switch (this.mode) {
      case 'flame': return this.flame;
      case 'subway': return this.subway;
      case 'constellation': return this.constellation;
      case 'flow': return this.flowchart;
      default: return undefined;
    }
  }

  /* --------------------------- zoom (shared toolbar) ------------------------ */

  public zoomIn(): void { this.currentRenderer?.ZoomIn?.(); }
  public zoomOut(): void { this.currentRenderer?.ZoomOut?.(); }
  public fitReset(): void { this.currentRenderer?.FitReset?.(); }

  /* ---------------------------- panel resize ------------------------------- */

  public startResize(e: MouseEvent): void {
    e.preventDefault();
    this.resizing = true;
    this.resizeStartX = e.clientX;
    this.resizeStartW = this.panelWidth;
    const move = (ev: MouseEvent) => {
      if (!this.resizing) return;
      const w = this.resizeStartW + (this.resizeStartX - ev.clientX); // drag left → wider
      this.panelWidth = Math.max(280, Math.min(760, w));
      this.cdr.markForCheck();
    };
    const up = () => {
      this.resizing = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      UserInfoEngine.Instance.SetSettingDebounced(this.PANEL_KEY, String(Math.round(this.panelWidth)));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  /* -------------------------------- selection ------------------------------ */

  /** A node was clicked in any renderer (or a log row) — highlight it everywhere and show its detail. */
  public selectStep(n: FlowNode): void {
    this.zone.run(() => {
      this.selectedNodeId = n.id;
      this.selectedStepItem = this.toTimelineItem(n);
      this.cdr.markForCheck();
    });
    this.applyRendererSelection(n.id);
  }

  public closeDetail(): void {
    this.zone.run(() => { this.selectedStepItem = null; this.selectedNodeId = -1; this.cdr.markForCheck(); });
    this.applyRendererSelection(null);
    this.flowchart?.Deselect();
  }

  private applyRendererSelection(id: number | null): void {
    this.flame?.SetSelected(id);
    this.subway?.SetSelected(id);
    this.constellation?.SetSelected(id);
  }

  public onDetailNavigateActionLog(logId: string): void {
    SharedService.Instance.OpenEntityRecord('MJ: Action Execution Logs', CompositeKey.FromID(logId));
  }

  public async onDetailCopy(text: string): Promise<void> {
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ }
  }

  private toTimelineItem(n: FlowNode): TimelineItem | null {
    if (!n.raw) return null;
    return {
      id: n.raw.ID, type: 'step', title: n.name, subtitle: `Type: ${n.raw.StepType}`,
      status: n.status, startTime: n.raw.StartedAt, endTime: n.raw.CompletedAt || undefined,
      duration: formatDuration(n.realDur), icon: 'fa-circle', color: '', data: n.raw, level: n.depth
    };
  }

  /* ------------------------------- master loop ------------------------------ */

  private tick(ts: number): void {
    const animated = this.isAnimated;
    if (animated && this.playing && this.hasData) {
      if (!this.lastTs) this.lastTs = ts;
      const dt = ts - this.lastTs; this.lastTs = ts;
      this.p += dt / (this.PLAY_MS / this.speed);
      if (this.p >= 1) { this.p = 1; this.playing = false; this.zone.run(() => this.cdr.markForCheck()); }
    } else {
      this.lastTs = 0;
    }
    if (this.viewReady && this.model && this.hasData) {
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
    const leaf = activeLeaf(m, this.p);
    const prog = this.p >= leaf.t1 ? 1 : Math.max(0, (this.p - leaf.t0) / (leaf.t1 - leaf.t0));

    if (this.scrubRef) this.scrubRef.nativeElement.value = String(Math.round(this.p * 1000));
    if (this.clockRef) {
      const realT = this.p >= 1 ? m.total : leaf.r0 + prog * leaf.realDur;
      this.clockRef.nativeElement.textContent = `${formatDuration(realT)} / ${formatDuration(m.total)}`;
    }
    if (this.nowBarRef) this.nowBarRef.nativeElement.style.width = `${prog * 100}%`;

    if (leaf.id !== this.lastLeafId) {
      this.lastLeafId = leaf.id;
      this.refreshNowCard(leaf);
    }
    if (this.nowStatRef) {
      this.nowStatRef.nativeElement.textContent = this.p >= 1 ? 'done' : (this.p > leaf.t0 ? 'running' : 'starting');
    }
    if (this.loglistRef) {
      if (!this.logBuilt) { this.buildLogTree(); this.logBuilt = true; }
      this.updateLogTree();
    }
  }

  private refreshNowCard(leaf: FlowNode): void {
    const col = FLOW_COLORS[leaf.type];
    if (this.nowIcoRef) this.nowIcoRef.nativeElement.textContent = FLOW_EMOJI[leaf.type];
    if (this.nowNameRef) this.nowNameRef.nativeElement.textContent = leaf.name;
    if (this.nowTypeRef) {
      this.nowTypeRef.nativeElement.textContent = FLOW_LABEL[leaf.type];
      this.nowTypeRef.nativeElement.style.color = col;
    }
    if (this.nowDurRef) this.nowDurRef.nativeElement.textContent = formatDuration(leaf.realDur);
    if (this.nowModelRef) this.nowModelRef.nativeElement.textContent = leaf.model ?? '—';
    if (this.crumbRef) {
      const chain = ancestors(leaf);
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
        `<span class="ftree-name">${this.escape(shortLabel(n))}</span>` +
        `<span class="ftree-dur">${formatDuration(n.realDur)}</span>`;
      row.addEventListener('click', () => this.selectStep(n));
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
