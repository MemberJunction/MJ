import { describe, expect, it } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { IMetadataProvider, RunViewParams, RunViewResult } from '@memberjunction/core';
import { PSPipelineBindingsComponent } from './pipeline-bindings.component';
import type { AfterBindingChangedEventArgs, BeforeBindingChangedEventArgs } from '../ps-widget-events';
import type { VersionRowFields } from '../versioned-list/lineage-reads';
import { DOUBLE_USER_ID, RowsMatching, ViewResult } from '../versioned-list/version-rows.test-support';
import { HostElement, QueryElement } from '../ps-dom-queries.test-support';

const PIPELINE_ID = 'AAAAAAAA-1111-4222-8333-444444444444';
const UNIT_V1 = '11111111-2222-4333-8444-555555555555';
const UNIT_V2 = '11111111-2222-4333-8444-666666666666';
const PROTOCOL_V1 = '33333333-4444-4555-8666-777777777777';

/** The pipeline row double: its two binding columns, and the entity calls the widget makes when it saves. */
interface PipelineDouble {
  ID: string;
  PredictionUnitID: string | null;
  EvaluationProtocolID: string | null;
  Saves: number;
  LatestResult: { CompleteMessage: string } | null;
  Save(): Promise<boolean>;
}

const versionRows: VersionRowFields[] = [
  { ID: UNIT_V1, LineageRootID: UNIT_V1, Version: 1, Name: 'Renewal', __mj_CreatedAt: '2026-01-01T00:00:00Z' },
  { ID: UNIT_V2, LineageRootID: UNIT_V1, Version: 2, Name: 'Renewal', __mj_CreatedAt: '2026-02-01T00:00:00Z' },
  { ID: PROTOCOL_V1, LineageRootID: PROTOCOL_V1, Version: 1, Name: 'Renewal protocol', __mj_CreatedAt: '2026-01-01T00:00:00Z' },
];

/** A pipeline bound to unit v1 and protocol v1; `Save` fails with `failWith` when it is given. */
function pipelineDouble(failWith: string | null): PipelineDouble {
  const pipeline: PipelineDouble = {
    ID: PIPELINE_ID, PredictionUnitID: UNIT_V1, EvaluationProtocolID: PROTOCOL_V1, Saves: 0, LatestResult: null,
    Save: async (): Promise<boolean> => {
      pipeline.Saves += 1;
      if (failWith === null) return true;
      pipeline.LatestResult = { CompleteMessage: failWith };
      return false;
    },
  };
  return pipeline;
}

/** A provider (cast-free: `Object.create(null)` + `Object.assign`) over the pipeline double and the version rows. */
function providerFor(pipeline: PipelineDouble): IMetadataProvider {
  const provider: IMetadataProvider = Object.create(null);
  const runView = async (params: RunViewParams): Promise<RunViewResult<PipelineDouble | VersionRowFields>> =>
    params.EntityName === 'MJ: ML Training Pipelines' ? ViewResult([pipeline]) : ViewResult(RowsMatching(versionRows, params));
  Object.assign(provider, {
    CurrentUser: { ID: DOUBLE_USER_ID },
    RunView: runView,
    RunViews: async (all: RunViewParams[]): Promise<RunViewResult<PipelineDouble | VersionRowFields>[]> => Promise.all(all.map(runView)),
  });
  return provider;
}

interface Rendered {
  readonly Fixture: ComponentFixture<PSPipelineBindingsComponent>;
  readonly Pipeline: PipelineDouble;
  readonly After: AfterBindingChangedEventArgs[];
}

async function render(failWith: string | null = null): Promise<Rendered> {
  const pipeline = pipelineDouble(failWith);
  const fixture = TestBed.createComponent(PSPipelineBindingsComponent);
  fixture.componentInstance.Provider = providerFor(pipeline);
  fixture.componentInstance.PipelineID = PIPELINE_ID;
  const after: AfterBindingChangedEventArgs[] = [];
  fixture.componentInstance.AfterBindingChanged.subscribe((e) => after.push(e));
  fixture.detectChanges();
  // ngOnInit starts a load it does not await; awaiting a second load here supersedes it, so the test sees the loaded state
  await fixture.componentInstance.Load();
  return { Fixture: fixture, Pipeline: pipeline, After: after };
}

describe('PSPipelineBindingsComponent (DOM)', () => {
  it('shows each bound version and offers the latest unit version', async () => {
    const { Fixture } = await render();
    const host = HostElement(Fixture);
    expect(host.querySelector('[data-testid="ps-binding-unit"]')?.textContent).toContain('Renewal v1');
    expect(QueryElement(host, '[data-testid="ps-bind-latest-unit"]', HTMLButtonElement).textContent).toContain('Use v2');
    expect(host.querySelector('[data-testid="ps-bind-latest-protocol"]')).toBeNull();
  });

  it('binds the latest unit version, saves the pipeline and emits AfterBindingChanged', async () => {
    const { Fixture, Pipeline, After } = await render();
    await Fixture.componentInstance.UseLatest('unit');
    expect([Pipeline.PredictionUnitID, Pipeline.Saves]).toEqual([UNIT_V2, 1]);
    expect(After).toHaveLength(1);
    expect([After[0]?.PipelineID, After[0]?.Which, After[0]?.VersionID, After[0]?.Success, After[0]?.ErrorMessage]).toEqual([PIPELINE_ID, 'unit', UNIT_V2, true, null]);
    expect(Fixture.componentInstance.Unit?.Version).toBe(2);
  });

  it('does not save when a host cancels BeforeBindingChanged, and does not emit AfterBindingChanged', async () => {
    const { Fixture, Pipeline, After } = await render();
    const seen: BeforeBindingChangedEventArgs[] = [];
    Fixture.componentInstance.BeforeBindingChanged.subscribe((e) => { seen.push(e); e.Cancel = true; e.CancelReason = 'Retrain first.'; });
    await Fixture.componentInstance.UseLatest('unit');
    expect([seen[0]?.Which, seen[0]?.VersionID]).toEqual(['unit', UNIT_V2]);
    expect([Pipeline.Saves, Pipeline.PredictionUnitID, After.length]).toEqual([0, UNIT_V1, 0]);
    expect(Fixture.componentInstance.Error).toBe('Retrain first.');
  });

  it('shows the save message when the pipeline save fails and reports it in AfterBindingChanged', async () => {
    const { Fixture, Pipeline, After } = await render('The unit and the protocol disagree: horizon-mismatch.');
    await Fixture.componentInstance.UseLatest('unit');
    Fixture.detectChanges();
    expect(Pipeline.Saves).toBe(1);
    expect([After[0]?.Success, After[0]?.ErrorMessage]).toEqual([false, 'The unit and the protocol disagree: horizon-mismatch.']);
    expect(HostElement(Fixture).querySelector('[data-testid="ps-bindings-error"]')?.textContent).toContain('horizon-mismatch');
  });
});
