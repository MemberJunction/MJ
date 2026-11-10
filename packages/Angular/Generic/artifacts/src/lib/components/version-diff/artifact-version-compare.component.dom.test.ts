import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  DocumentLiveBlockEngine,
  MJArtifactVersionEntity,
  SlideDeckEngine,
  SpreadsheetEngine,
} from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { ArtifactVersionDiffService } from '../../services/artifact-version-diff.service';
import { ArtifactVersionCompareComponent } from './artifact-version-compare.component';
import { DocsVersionDiffComponent } from './docs-version-diff.component';
import { SlidesVersionDiffComponent } from './slides-version-diff.component';
import { SpreadsheetVersionDiffComponent } from './spreadsheet-version-diff.component';
import { ComponentVersionDiffComponent } from './component-version-diff.component';
import { QueryVersionDiffComponent } from './query-version-diff.component';
import { MarkdownArtifactViewerComponent } from '../plugins/markdown-artifact-viewer.component';
import { SlideDeckArtifactViewerComponent } from '../plugins/slide-deck-artifact-viewer.component';
import { SpreadsheetArtifactViewerComponent } from '../plugins/spreadsheet-artifact-viewer.component';
import { ComponentArtifactViewerComponent } from '../plugins/component-artifact-viewer.component';
import { DataArtifactViewerComponent } from '../plugins/data-artifact-viewer.component';

function createVersionFixture(fields: {
  ID: string;
  VersionNumber: number;
  Content: string;
  Description?: string;
  Comments?: string;
  User?: string;
  ContentHash?: string;
}): MJArtifactVersionEntity {
  const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
  Object.defineProperties(ver, {
    ID: { value: fields.ID, enumerable: true },
    ArtifactID: { value: 'art-1', enumerable: true },
    VersionNumber: { value: fields.VersionNumber, enumerable: true },
    Content: { value: fields.Content, enumerable: true },
    Description: { value: fields.Description ?? null, enumerable: true },
    Comments: { value: fields.Comments ?? null, enumerable: true },
    User: { value: fields.User ?? 'Amith Nagarajan', enumerable: true },
    ContentHash: { value: fields.ContentHash ?? `hash${fields.VersionNumber}00000`, enumerable: true },
    __mj_CreatedAt: { value: new Date('2026-11-09T10:00:00Z'), enumerable: true },
    __mj_UpdatedAt: { value: new Date('2026-11-09T10:05:00Z'), enumerable: true },
  });
  return ver;
}

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('ArtifactVersionDiffService — Universal & 5 Artifact-Specific Diff Engines', () => {
  function getService(): ArtifactVersionDiffService {
    TestBed.configureTestingModule({});
    return TestBed.inject(ArtifactVersionDiffService);
  }

  it('computes universal structural JSON path diffs and Git text diffs for structured JSON content', () => {
    const svc = getService();
    const baseJson = JSON.stringify({
      title: 'Q3 Revenue Forecast',
      metrics: { arr: 1200000, churnRate: 0.04 },
      deprecatedFlag: true,
    });
    const targetJson = JSON.stringify({
      title: 'Q4 Revenue Forecast',
      metrics: { arr: 1450000, churnRate: 0.04 },
      owner: 'Finance Team',
    });

    const jsonDiff = svc.ComputeStructuralJsonDiff(baseJson, targetJson);
    expect(jsonDiff.IsValidJson).toBe(true);
    expect(jsonDiff.AddedCount).toBeGreaterThanOrEqual(1);
    expect(jsonDiff.RemovedCount).toBeGreaterThanOrEqual(1);
    expect(jsonDiff.ModifiedCount).toBeGreaterThanOrEqual(2);
    expect(jsonDiff.FlatItems.some((i) => i.Path === 'owner' && i.Status === 'added')).toBe(true);
    expect(jsonDiff.FlatItems.some((i) => i.Path === 'deprecatedFlag' && i.Status === 'removed')).toBe(true);
    expect(jsonDiff.FlatItems.some((i) => i.Path === 'metrics.arr' && i.Status === 'modified')).toBe(true);

    const textDiff = svc.ComputeGitTextDiff(baseJson, targetJson, true);
    expect(textDiff.AddedLines).toBeGreaterThan(0);
    expect(textDiff.RemovedLines).toBeGreaterThan(0);
    expect(textDiff.SplitRows.some((r) => r.Kind === 'modified' && (r.LeftSpans?.length ?? 0) > 0)).toBe(true);
  });

  it('computes MJ Docs visual diff with word-level redlines and Live View property deltas', () => {
    const svc = getService();
    const liveBlockV1 = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective({
      BlockID: 'blk-accounts',
      Kind: 'EntityView',
      Mode: 'Live',
      Title: 'Key Enterprise Accounts',
      EntityName: 'Accounts',
      ViewName: 'All Accounts',
      ExtraFilter: "Region='NA'",
    });
    const liveBlockV2 = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective({
      BlockID: 'blk-accounts',
      Kind: 'EntityView',
      Mode: 'Live',
      Title: 'Global Enterprise Accounts',
      EntityName: 'Accounts',
      ViewName: 'Strategic Accounts',
      ExtraFilter: "Region IN ('NA','EMEA')",
    });

    const v1Doc = ['# Executive Summary', '', 'Our Q3 enterprise pipeline grew steadily across North America.', '', liveBlockV1].join('\n');
    const v2Doc = ['# Executive Summary', '', 'Our Q4 enterprise pipeline accelerated rapidly across North America and EMEA.', '', liveBlockV2].join('\n');

    const diff = svc.ComputeDocsVisualDiff(v1Doc, v2Doc);
    expect(diff.ModifiedBlocks).toBe(2);

    const modifiedProse = diff.Blocks.find((b) => b.Category === 'paragraph' && b.Status === 'modified');
    expect(modifiedProse).toBeDefined();
    expect(modifiedProse?.RedlineSpans.some((s) => s.Type === 'delete' && s.Text.includes('Q3'))).toBe(true);
    expect(modifiedProse?.RedlineSpans.some((s) => s.Type === 'insert' && s.Text.includes('Q4'))).toBe(true);

    const modifiedLiveBlock = diff.Blocks.find((b) => b.Category === 'live-block' && b.Status === 'modified');
    expect(modifiedLiveBlock).toBeDefined();
    expect(modifiedLiveBlock?.BlockSpecDeltas.length).toBeGreaterThan(0);
  });

  it('computes MJ Slides visual diff across added, removed, and modified slides with speaker notes redlines', () => {
    const svc = getService();
    const baseDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Q3 Board Deck', 'deck-1');
    baseDeck.Slides[0].SpeakerNotes = 'Welcome the board and highlight Q3 milestones.';
    let targetDeck = SlideDeckEngine.Instance.ParseDeckSpec(SlideDeckEngine.Instance.SerializeDeckSpec(baseDeck), 'Q4 Board Deck');
    targetDeck.Title = 'Q4 Annual Board Deck';
    // Modify slide 1 title + speaker notes
    targetDeck.Slides[0].Title = 'Q4 Record ARR Board Update';
    targetDeck.Slides[0].SpeakerNotes = 'Highlight Q4 record enterprise expansion and net retention.';
    // Remove slide 2 and add a brand new slide via SlideDeckEngine
    targetDeck = SlideDeckEngine.Instance.DeleteSlide(targetDeck, targetDeck.Slides[1].SlideID).Deck;
    targetDeck = SlideDeckEngine.Instance.AddSlide(targetDeck, { Layout: 'TwoColumn', Title: '2027 Strategic Roadmap' }).Deck;

    const slideDiff = svc.ComputeSlidesVisualDiff(
      SlideDeckEngine.Instance.SerializeDeckSpec(baseDeck),
      SlideDeckEngine.Instance.SerializeDeckSpec(targetDeck),
    );
    expect(slideDiff.ModifiedSlides).toBeGreaterThanOrEqual(1);
    expect(slideDiff.AddedSlides).toBe(1);
    expect(slideDiff.RemovedSlides).toBe(1);

    const firstSlideDiff = slideDiff.Slides.find((s) => s.SlideID === baseDeck.Slides[0].SlideID);
    expect(firstSlideDiff?.Status).toBe('modified');
    expect(firstSlideDiff?.SpeakerNotesChanged).toBe(true);
    expect(firstSlideDiff?.SpeakerNotesRedline.some((sp) => sp.Type === 'insert' && sp.Text.includes('Q4'))).toBe(true);
  });

  it('computes MJ Sheets visual diff for cell values, formulas, and worksheet tabs', () => {
    const svc = getService();
    const baseWb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Budget Model');
    const sheetId = baseWb.Worksheets[0].SheetID;
    SpreadsheetEngine.Instance.SetCell(baseWb, sheetId, 'A1', { Value: 'Product' });
    SpreadsheetEngine.Instance.SetCell(baseWb, sheetId, 'B1', { Value: 100 });
    SpreadsheetEngine.Instance.SetCell(baseWb, sheetId, 'B2', { Value: 200 });
    SpreadsheetEngine.Instance.SetCell(baseWb, sheetId, 'B3', { Formula: '=SUM(B1:B2)' });

    const targetWb = SpreadsheetEngine.Instance.ParseWorkbook(SpreadsheetEngine.Instance.SerializeWorkbook(baseWb));
    const targetSheetId = targetWb.Worksheets[0].SheetID;
    SpreadsheetEngine.Instance.SetCell(targetWb, targetSheetId, 'B1', { Value: 150 });
    SpreadsheetEngine.Instance.SetCell(targetWb, targetSheetId, 'B3', { Formula: '=AVERAGE(B1:B2)' });
    SpreadsheetEngine.Instance.SetCell(targetWb, targetSheetId, 'C1', { Value: 'Forecast Note' });

    const sheetDiff = svc.ComputeSpreadsheetVisualDiff(
      SpreadsheetEngine.Instance.SerializeWorkbook(baseWb),
      SpreadsheetEngine.Instance.SerializeWorkbook(targetWb),
    );
    expect(sheetDiff.Sheets.length).toBe(1);
    const revSheet = sheetDiff.Sheets[0];
    expect(revSheet.AddedCells).toBe(1);
    expect(revSheet.ModifiedValueCells).toBeGreaterThanOrEqual(1);
    expect(revSheet.ModifiedFormulaCells).toBe(1);

    const formulaCell = revSheet.ChangedEntries.find((c) => c.Address === 'B3');
    expect(formulaCell?.FormulaChanged).toBe(true);
    expect(formulaCell?.OldFormula).toBe('=SUM(B1:B2)');
    expect(formulaCell?.NewFormula).toBe('=AVERAGE(B1:B2)');
  });

  it('computes ComponentSpec diff for dependencies, libraries, dataRequirements, changeRequest, and JSX code', () => {
    const svc = getService();
    const baseSpec = JSON.stringify({
      name: 'PipelineDashboard',
      title: 'Pipeline Dashboard',
      functionalRequirements: 'Show open deals by stage.',
      technicalDesign: 'Single root component using RunView.',
      code: 'function PipelineDashboard() { return <div>v1</div>; }',
      dependencies: [
        { name: 'StageCard', code: 'function StageCard({ title }) { return <span>{title}</span>; }' },
      ],
      libraries: [{ name: 'lucide-react', version: '0.290.0', globalVariable: 'Lucide' }],
      dataRequirements: {
        mode: 'views',
        entities: [{ name: 'Deals', permissionLevels: ['Read'] }],
        queries: [],
      },
    });
    const targetSpec = JSON.stringify({
      name: 'PipelineDashboard',
      title: 'Executive Pipeline Dashboard',
      changeRequest: {
        userRequest: 'Add interactive Recharts funnel chart and KPI summary card.',
        type: 'enhancement',
      },
      functionalRequirements: 'Show open deals by stage with interactive funnel filtering.',
      technicalDesign: 'Root component plus FunnelChart dependency.',
      code: 'function PipelineDashboard() { return <main><FunnelChart /></main>; }',
      dependencies: [
        { name: 'StageCard', code: 'function StageCard({ title, count }) { return <span>{title}: {count}</span>; }' },
        { name: 'FunnelChart', code: 'function FunnelChart() { return <svg />; }' },
      ],
      libraries: [
        { name: 'lucide-react', version: '0.344.0', globalVariable: 'Lucide' },
        { name: 'recharts', version: '2.12.0', globalVariable: 'Recharts' },
      ],
      dataRequirements: {
        mode: 'hybrid',
        entities: [
          { name: 'Deals', permissionLevels: ['Read'] },
          { name: 'Accounts', permissionLevels: ['Read'] },
        ],
        queries: [{ name: 'DealsByStageSummary', categoryPath: 'Sales/Pipeline' }],
      },
    });

    const compDiff = svc.ComputeComponentSpecDiff(baseSpec, targetSpec);
    expect(compDiff.ChangeRequestPrompt).toContain('Recharts funnel chart');
    expect(compDiff.CodeUnits.find((u) => u.ComponentName === 'PipelineDashboard')?.Status).toBe('modified');
    expect(compDiff.CodeUnits.find((u) => u.ComponentName === 'StageCard')?.Status).toBe('modified');
    expect(compDiff.CodeUnits.find((u) => u.ComponentName === 'FunnelChart')?.Status).toBe('added');
    expect(compDiff.LibraryDeltas.find((l) => l.Name === 'recharts')?.Status).toBe('added');
    expect(compDiff.LibraryDeltas.find((l) => l.Name === 'lucide-react')?.Status).toBe('modified');
    expect(compDiff.EntityDeltas.find((e) => e.EntityName === 'Accounts')?.Status).toBe('added');
    expect(compDiff.QueryDeltas.some((q) => q.Status === 'added')).toBe(true);
    expect(compDiff.FunctionalRedline.some((s) => s.Type === 'insert')).toBe(true);
  });

  it('computes Query / Data artifact diff across SQL, parameters, column schema, and query plan', () => {
    const svc = getService();
    const baseQuery = JSON.stringify({
      source: 'query',
      title: 'Active Members',
      parameters: { Region: 'US', MinSpend: 500 },
      plan: 'Filter members by US region.',
      interpretation: 'Shows active US members.',
      metadata: {
        sql: "SELECT ID, Name, TotalSpend FROM vwMembers WHERE Region = 'US' AND TotalSpend >= 500",
        rowCount: 42,
        executionTimeMs: 118,
      },
      columns: [
        { field: 'ID', displayName: 'ID', sqlBaseType: 'uniqueidentifier' },
        { field: 'Name', displayName: 'Member Name', sqlBaseType: 'nvarchar' },
        { field: 'TotalSpend', displayName: 'Total Spend', sqlBaseType: 'decimal' },
      ],
      rows: [{ ID: '1', Name: 'Acme Corp', TotalSpend: 1200 }],
    });

    const targetQuery = JSON.stringify({
      source: 'query',
      title: 'Global High-Value Members',
      parameters: { Region: 'GLOBAL', MinSpend: 1000, IncludeRenewalDate: true },
      plan: 'Filter members globally above $1,000 spend and include RenewalDate.',
      interpretation: 'Shows global high-value members with upcoming renewals.',
      metadata: {
        sql: 'SELECT ID, Name, TotalSpend, RenewalDate FROM vwMembers WHERE TotalSpend >= 1000 ORDER BY TotalSpend DESC',
        rowCount: 19,
        executionTimeMs: 84,
      },
      columns: [
        { field: 'ID', displayName: 'ID', sqlBaseType: 'uniqueidentifier' },
        { field: 'Name', displayName: 'Account Name', sqlBaseType: 'nvarchar' },
        { field: 'TotalSpend', displayName: 'Total Spend', sqlBaseType: 'decimal' },
        { field: 'RenewalDate', displayName: 'Renewal Date', sqlBaseType: 'date' },
      ],
      rows: [{ ID: '1', Name: 'Acme Corp', TotalSpend: 2400, RenewalDate: '2027-01-15' }],
    });

    const qDiff = svc.ComputeQueryDataDiff(baseQuery, targetQuery);
    expect(qDiff.HasSql).toBe(true);
    expect(qDiff.SqlDiff.AddedLines).toBeGreaterThan(0);
    expect(qDiff.ParameterDeltas.find((p) => p.Label === '@MinSpend')?.Status).toBe('modified');
    expect(qDiff.ParameterDeltas.find((p) => p.Label === '@IncludeRenewalDate')?.Status).toBe('added');
    expect(qDiff.Tables[0].ColumnDeltas.find((c) => c.FieldName === 'RenewalDate')?.Status).toBe('added');
    expect(qDiff.Tables[0].ColumnDeltas.find((c) => c.FieldName === 'Name')?.Status).toBe('modified');
    expect(qDiff.PlanChanged).toBe(true);
    expect(qDiff.InterpretationChanged).toBe(true);
  });
});

describe('Viewer Plugins — Optional Version Diff Contract Registration', () => {
  it('wires all 5 flagship viewer plugins to their specialized visual diff components', () => {
    expect(MarkdownArtifactViewerComponent.prototype.SupportsVersionDiff).toBe(true);
    expect(MarkdownArtifactViewerComponent.prototype.GetVersionDiffComponentType()).toBe(DocsVersionDiffComponent);

    expect(SlideDeckArtifactViewerComponent.prototype.SupportsVersionDiff).toBe(true);
    expect(SlideDeckArtifactViewerComponent.prototype.GetVersionDiffComponentType()).toBe(SlidesVersionDiffComponent);

    expect(SpreadsheetArtifactViewerComponent.prototype.SupportsVersionDiff).toBe(true);
    expect(SpreadsheetArtifactViewerComponent.prototype.GetVersionDiffComponentType()).toBe(SpreadsheetVersionDiffComponent);

    expect(ComponentArtifactViewerComponent.prototype.SupportsVersionDiff).toBe(true);
    expect(ComponentArtifactViewerComponent.prototype.GetVersionDiffComponentType()).toBe(ComponentVersionDiffComponent);

    expect(DataArtifactViewerComponent.prototype.SupportsVersionDiff).toBe(true);
    expect(DataArtifactViewerComponent.prototype.GetVersionDiffComponentType()).toBe(QueryVersionDiffComponent);
  });
});

describe('ArtifactVersionCompareComponent (DOM) — Git History, Visual Diff & Universal Fallback', () => {
  it('mounts DocsVersionDiffComponent in Visual Diff mode and supports switching to Unified / Split', () => {
    const v1 = createVersionFixture({
      ID: 'ver-1',
      VersionNumber: 1,
      Description: 'Initial draft',
      Content: '# Strategy\n\nLaunch regional pilot in Q3.',
    });
    const v2 = createVersionFixture({
      ID: 'ver-2',
      VersionNumber: 2,
      Description: 'Expanded rollout',
      Content: '# Strategy\n\nLaunch global enterprise rollout in Q4.',
    });

    const f = renderComponentFixture(ArtifactVersionCompareComponent, {
      imports: [ArtifactVersionCompareComponent, DocsVersionDiffComponent],
      inputs: {
        Versions: [v2, v1],
        BaseVersion: v1,
        TargetVersion: v2,
        BaseVersionNumber: 1,
        TargetVersionNumber: 2,
        VisualDiffComponentType: DocsVersionDiffComponent,
        CanEdit: true,
      },
    });
    f.detectChanges();

    // Defaults to Visual Diff when plugin provides VisualDiffComponentType
    expect(f.componentInstance.ActiveMode).toBe('visual');
    expect(query(f, '[data-testid="docs-visual-version-diff"]')).not.toBeNull();
    expect(text(f, '[data-testid="docs-visual-version-diff"]')).toContain('regional');
    expect(text(f, '[data-testid="docs-visual-version-diff"]')).toContain('global');

    // Switch to Unified diff
    (query(f, '[data-testid="compare-mode-unified"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(query(f, '[data-testid="universal-unified-diff"]')).not.toBeNull();

    // Switch to Split diff
    (query(f, '[data-testid="compare-mode-split"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(query(f, '[data-testid="universal-split-diff"]')).not.toBeNull();

    // Restore v1 emits RestoreVersionRequested(1)
    const restoreEvents = capture(f.componentInstance.RestoreVersionRequested);
    (query(f, '[data-testid="restore-compared-version-btn"]') as HTMLButtonElement).click();
    expect(restoreEvents).toEqual([1]);
  });

  it('defaults to universal JSON Tree diff when an artifact type has no custom visual diff plugin', () => {
    const v1 = createVersionFixture({
      ID: 'ver-10',
      VersionNumber: 1,
      Content: JSON.stringify({ status: 'draft', threshold: 0.75 }),
    });
    const v2 = createVersionFixture({
      ID: 'ver-20',
      VersionNumber: 2,
      Content: JSON.stringify({ status: 'published', threshold: 0.9, reviewer: 'AI Ops' }),
    });
    const v3 = createVersionFixture({
      ID: 'ver-30',
      VersionNumber: 3,
      Content: JSON.stringify({ status: 'published', threshold: 0.95, reviewer: 'AI Ops' }),
    });

    const f = renderComponentFixture(ArtifactVersionCompareComponent, {
      imports: [ArtifactVersionCompareComponent],
      inputs: {
        Versions: [v3, v2, v1],
        BaseVersion: v2,
        TargetVersion: v3,
        BaseVersionNumber: 2,
        TargetVersionNumber: 3,
        VisualDiffComponentType: null,
        CanEdit: false,
      },
    });
    f.detectChanges();

    expect(f.componentInstance.ActiveMode).toBe('json-tree');
    expect(query(f, '[data-testid="structural-json-diff-panel"]')).not.toBeNull();
    expect(text(f, '[data-testid="structural-json-diff-panel"]')).toContain('threshold');
    // Read-only viewer hides Restore button
    expect(query(f, '[data-testid="restore-compared-version-btn"]')).toBeNull();

    // Clicking commit v2 in the Git timeline emits v1 -> v2
    const pairChanges = capture(f.componentInstance.ComparePairChanged);
    (query(f, '[data-testid="commit-node-v2"]') as HTMLElement).click();
    expect(pairChanges).toEqual([{ baseVersionNumber: 1, targetVersionNumber: 2 }]);

    // Clicking Swap emits swapped pair
    (query(f, '[data-testid="swap-compare-versions-btn"]') as HTMLButtonElement).click();
    expect(pairChanges[pairChanges.length - 1]).toEqual({ baseVersionNumber: 3, targetVersionNumber: 2 });
  });

  it('renders QueryVersionDiffComponent cleanly', () => {
    const qBase = createVersionFixture({
      ID: 'qv1',
      VersionNumber: 1,
      Content: JSON.stringify({ metadata: { sql: 'SELECT 1 AS CountVal', rowCount: 1 }, columns: [{ field: 'CountVal' }], rows: [{ CountVal: 1 }] }),
    });
    const qTarget = createVersionFixture({
      ID: 'qv2',
      VersionNumber: 2,
      Content: JSON.stringify({ metadata: { sql: 'SELECT 2 AS CountVal', rowCount: 1 }, columns: [{ field: 'CountVal' }], rows: [{ CountVal: 2 }] }),
    });
    const qFixture = renderComponentFixture(QueryVersionDiffComponent, {
      imports: [QueryVersionDiffComponent],
      inputs: { BaseVersion: qBase, TargetVersion: qTarget },
    });
    qFixture.detectChanges();
    expect(query(qFixture, '[data-testid="query-visual-version-diff"]')).not.toBeNull();
  });

  it('renders SlidesVersionDiffComponent cleanly', () => {
    const deckBase = SlideDeckEngine.Instance.CreateDefaultDeck('Deck v1', 'd1');
    const deckTarget = SlideDeckEngine.Instance.ParseDeckSpec(SlideDeckEngine.Instance.SerializeDeckSpec(deckBase), 'Deck v2');
    deckTarget.Slides[0].Title = 'Updated Title';
    const sBase = createVersionFixture({ ID: 'sv1', VersionNumber: 1, Content: SlideDeckEngine.Instance.SerializeDeckSpec(deckBase) });
    const sTarget = createVersionFixture({ ID: 'sv2', VersionNumber: 2, Content: SlideDeckEngine.Instance.SerializeDeckSpec(deckTarget) });
    const sFixture = renderComponentFixture(SlidesVersionDiffComponent, {
      imports: [SlidesVersionDiffComponent],
      inputs: { BaseVersion: sBase, TargetVersion: sTarget },
    });
    sFixture.detectChanges();
    expect(query(sFixture, '[data-testid="slides-visual-version-diff"]')).not.toBeNull();
  });

  it('renders SpreadsheetVersionDiffComponent cleanly', () => {
    const wbBase = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Sheet v1');
    SpreadsheetEngine.Instance.SetCell(wbBase, wbBase.Worksheets[0].SheetID, 'A1', { Value: 10 });
    const wbTarget = SpreadsheetEngine.Instance.ParseWorkbook(SpreadsheetEngine.Instance.SerializeWorkbook(wbBase));
    SpreadsheetEngine.Instance.SetCell(wbTarget, wbTarget.Worksheets[0].SheetID, 'A1', { Value: 25 });
    const shBase = createVersionFixture({ ID: 'sh1', VersionNumber: 1, Content: SpreadsheetEngine.Instance.SerializeWorkbook(wbBase) });
    const shTarget = createVersionFixture({ ID: 'sh2', VersionNumber: 2, Content: SpreadsheetEngine.Instance.SerializeWorkbook(wbTarget) });
    const shFixture = renderComponentFixture(SpreadsheetVersionDiffComponent, {
      imports: [SpreadsheetVersionDiffComponent],
      inputs: { BaseVersion: shBase, TargetVersion: shTarget },
    });
    shFixture.detectChanges();
    expect(query(shFixture, '[data-testid="spreadsheet-visual-version-diff"]')).not.toBeNull();
  });

  it('renders ComponentVersionDiffComponent cleanly', () => {
    const cBase = createVersionFixture({
      ID: 'cv1',
      VersionNumber: 1,
      Content: JSON.stringify({ name: 'MetricCard', code: 'function MetricCard() { return <div>10</div>; }' }),
    });
    const cTarget = createVersionFixture({
      ID: 'cv2',
      VersionNumber: 2,
      Content: JSON.stringify({
        name: 'MetricCard',
        changeRequest: { userRequest: 'Use bold header', type: 'style' },
        code: 'function MetricCard() { return <h1>10</h1>; }',
      }),
    });
    const cFixture = renderComponentFixture(ComponentVersionDiffComponent, {
      imports: [ComponentVersionDiffComponent],
      inputs: { BaseVersion: cBase, TargetVersion: cTarget },
    });
    cFixture.detectChanges();
    expect(query(cFixture, '[data-testid="component-visual-version-diff"]')).not.toBeNull();
    expect(queryAll(cFixture, '[data-testid="comp-diff-change-request"]').length).toBe(1);
  });

  it('diffs two 20,000-line versions quickly using bounded Myers + hash-anchor fallback without quadratic allocation (E4)', () => {
    const svc = TestBed.inject(ArtifactVersionDiffService);
    const baseLines: string[] = [];
    const targetLines: string[] = [];
    for (let i = 0; i < 20000; i++) {
      baseLines.push(`line-${i}: steady baseline payload entry ${i}`);
      if (i === 5000) {
        targetLines.push(`line-${i}: UPDATED payload entry ${i}`);
        targetLines.push(`line-${i}-extra: inserted audit note`);
      } else if (i !== 12000) {
        targetLines.push(`line-${i}: steady baseline payload entry ${i}`);
      }
    }

    const startMs = performance.now();
    const diff = svc.ComputeGitTextDiff(baseLines.join('\n'), targetLines.join('\n'), false);
    const elapsedMs = performance.now() - startMs;

    expect(elapsedMs).toBeLessThan(250);
    expect(diff.AddedLines).toBe(2);
    expect(diff.RemovedLines).toBe(2);
    expect(diff.UnchangedLines).toBe(19998);
  });

  it('computes StructuralJsonDiff and GitTextDiff lazily only for the active tab and caches per version pair (E4)', () => {
    const v1 = createVersionFixture({
      ID: 'lazy-v1',
      VersionNumber: 1,
      Content: JSON.stringify({ title: 'Draft 1', count: 1 }),
    });
    const v2 = createVersionFixture({
      ID: 'lazy-v2',
      VersionNumber: 2,
      Content: JSON.stringify({ title: 'Draft 2', count: 2 }),
    });

    const jsonDiffSpy = vi.spyOn(ArtifactVersionDiffService.prototype, 'ComputeStructuralJsonDiff');
    const gitDiffSpy = vi.spyOn(ArtifactVersionDiffService.prototype, 'ComputeGitTextDiff');

    const f = renderComponentFixture(ArtifactVersionCompareComponent, {
      imports: [ArtifactVersionCompareComponent, DocsVersionDiffComponent],
      inputs: {
        Versions: [v2, v1],
        BaseVersion: v1,
        TargetVersion: v2,
        BaseVersionNumber: 1,
        TargetVersionNumber: 2,
        VisualDiffComponentType: DocsVersionDiffComponent,
        CanEdit: false,
      },
    });
    f.detectChanges();

    // In 'visual' mode, neither StructuralJsonDiff nor GitTextDiff should run eagerly
    expect(f.componentInstance.ActiveMode).toBe('visual');
    expect(jsonDiffSpy).not.toHaveBeenCalled();
    expect(gitDiffSpy).not.toHaveBeenCalled();

    // Switch to 'unified' -> computes GitTextDiff once, still skips StructuralJsonDiff
    f.componentInstance.SetMode('unified');
    f.detectChanges();
    expect(gitDiffSpy).toHaveBeenCalledTimes(1);
    expect(jsonDiffSpy).not.toHaveBeenCalled();

    // Switch to 'split' -> reuses cached GitTextDiff without recomputing
    f.componentInstance.SetMode('split');
    f.detectChanges();
    expect(gitDiffSpy).toHaveBeenCalledTimes(1);

    // Switch to 'json-tree' -> computes StructuralJsonDiff once
    f.componentInstance.SetMode('json-tree');
    f.detectChanges();
    expect(jsonDiffSpy).toHaveBeenCalledTimes(1);

    // Switch back to 'unified' and 'json-tree' -> both served from per-pair cache
    f.componentInstance.SetMode('unified');
    f.componentInstance.SetMode('json-tree');
    expect(gitDiffSpy).toHaveBeenCalledTimes(1);
    expect(jsonDiffSpy).toHaveBeenCalledTimes(1);

    jsonDiffSpy.mockRestore();
    gitDiffSpy.mockRestore();
  });
});
