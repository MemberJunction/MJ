import { describe, expect, it, vi } from 'vitest';
import { IMetadataProvider, RunView } from '@memberjunction/core';
import { MJVideoArchetypeEntity, VideoStudioEngine } from '@memberjunction/core-entities';
import { query, queryAll, renderComponentFixture } from '@memberjunction/ng-test-utils';
import { VSArchetypeEditorComponent } from './vs-archetype-editor.component';

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('VSArchetypeEditorComponent DOM', () => {
  it('makes a copy of a shipped archetype without mutating the shipped row, copies fields on Start from, scales beats with Fit to length, derives valid VideoBeatTemplate keys on Save, surfaces duplicate-name errors, and emits Saved with the new archetype ID', async () => {
    const currentUser = { ID: 'user-editor-1', Name: 'Producer' };
    const createdEntities: Record<string, unknown>[] = [];
    let shouldSaveSucceed = true;

    const shippedBriefingSaveSpy = vi.fn();
    const shippedBriefing: MJVideoArchetypeEntity = {
      ID: 'arch-shipped-briefing',
      Name: 'Executive Briefing',
      Description: 'Concise executive update',
      Category: 'Briefing',
      Status: 'Active',
      CompanyID: null,
      Company: null,
      DefaultDurationSeconds: 60,
      MinDurationSeconds: 30,
      MaxDurationSeconds: 90,
      DefaultFormats: '16:9, 9:16',
      DefaultInteractionMode: 'Auto',
      Guidance: 'Open with the headline metric.',
      BeatTemplate: '[{"Key":"hook","Label":"Hook","DefaultDurationSeconds":10},{"Key":"kpi","Label":"KPI Breakdown","DefaultDurationSeconds":30}]',
      Pacing: '{"AvgSecondsBetweenChanges":5,"HoldRules":"Hold charts for 3s."}',
      BeatTemplateObject: [
        {
          Key: 'hook',
          Label: 'Hook',
          Purpose: 'Attention grabber',
          MinDurationSeconds: 5,
          MaxDurationSeconds: 15,
          DefaultDurationSeconds: 10,
          Guidance: 'Show headline stat.',
        },
        {
          Key: 'kpi',
          Label: 'KPI Breakdown',
          Purpose: 'Show core metrics',
          MinDurationSeconds: 15,
          MaxDurationSeconds: 45,
          DefaultDurationSeconds: 30,
          RequiresDataBinding: true,
        },
      ],
      PacingObject: {
        AvgSecondsBetweenChanges: 5,
        HoldRules: 'Hold charts for 3s.',
      },
      Save: shippedBriefingSaveSpy,
    } as unknown as MJVideoArchetypeEntity;

    const shippedProductSaveSpy = vi.fn();
    const shippedProduct: MJVideoArchetypeEntity = {
      ID: 'arch-shipped-product',
      Name: 'Product Launch',
      Description: 'New feature spotlight',
      Category: 'Product',
      Status: 'Active',
      CompanyID: null,
      Company: null,
      DefaultDurationSeconds: 45,
      MinDurationSeconds: 20,
      MaxDurationSeconds: 75,
      DefaultFormats: '9:16',
      DefaultInteractionMode: 'PresentOnly',
      Guidance: 'Focus on customer outcome.',
      BeatTemplateObject: [
        {
          Key: 'problem',
          Label: 'Customer Problem',
          Purpose: 'State pain point',
          MinDurationSeconds: 5,
          MaxDurationSeconds: 15,
          DefaultDurationSeconds: 10,
        },
        {
          Key: 'demo',
          Label: 'Live Demo',
          Purpose: 'Show feature in action',
          MinDurationSeconds: 15,
          MaxDurationSeconds: 35,
          DefaultDurationSeconds: 20,
        },
      ],
      PacingObject: {
        AvgSecondsBetweenChanges: 4,
        HoldRules: 'Keep cuts brisk.',
      },
      Save: shippedProductSaveSpy,
    } as unknown as MJVideoArchetypeEntity;

    const existingCompanyArch: MJVideoArchetypeEntity = {
      ID: 'arch-company-dup',
      Name: 'Existing Company Briefing',
      Description: 'Already saved in Acme Corp',
      Category: 'Briefing',
      Status: 'Active',
      CompanyID: 'comp-1',
      Company: 'Acme Corp',
      DefaultDurationSeconds: 60,
      MinDurationSeconds: 30,
      MaxDurationSeconds: 90,
      DefaultFormats: '16:9',
      DefaultInteractionMode: 'Auto',
      Guidance: null,
      BeatTemplateObject: [
        {
          Key: 'intro',
          Label: 'Intro',
          Purpose: 'Welcome',
          MinDurationSeconds: 10,
          MaxDurationSeconds: 20,
          DefaultDurationSeconds: 15,
        },
      ],
      PacingObject: null,
    } as unknown as MJVideoArchetypeEntity;

    const customProvider = {
      CurrentUser: currentUser,
      GetEntityObject: vi.fn().mockImplementation(async () => {
        const record: Record<string, unknown> = {
          ID: 'arch-created-99',
          LatestResult: { CompleteMessage: 'Database unique constraint: duplicate archetype name' },
          Save: vi.fn().mockImplementation(async () => shouldSaveSucceed),
        };
        createdEntities.push(record);
        return record;
      }),
    } as unknown as IMetadataProvider;

    vi.spyOn(VideoStudioEngine, 'GetProviderInstance').mockReturnValue({
      Config: vi.fn().mockResolvedValue(undefined),
      Archetypes: [shippedBriefing, shippedProduct, existingCompanyArch],
    } as unknown as VideoStudioEngine);

    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
      RunView: vi.fn().mockResolvedValue({
        Success: true,
        Results: [
          { ID: 'comp-1', Name: 'Acme Corp' },
          { ID: 'comp-2', Name: 'Beta Org' },
        ],
      }),
    } as unknown as RunView);

    const fixture = renderComponentFixture(VSArchetypeEditorComponent, {
      inputs: {
        Provider: customProvider,
        Mode: 'copy',
        SourceArchetypeId: 'arch-shipped-briefing',
      },
    });

    const savedIds: string[] = [];
    fixture.componentInstance.Saved.subscribe((id: string) => savedIds.push(id));

    await flushAsync();
    fixture.detectChanges();

    const instance = fixture.componentInstance;

    // 1. Pre-populated from shipped Executive Briefing
    expect(instance.Name).toBe('Executive Briefing (Copy)');
    expect(instance.Category).toBe('Briefing');
    expect(instance.CompanyID).toBe('comp-1');
    expect(instance.DefaultDurationSeconds).toBe(60);
    expect(instance.Beats).toHaveLength(2);
    expect(instance.BeatsTotalSeconds).toBe(40);
    expect(instance.HasBeatsDurationMismatch).toBe(true);
    expect(query(fixture, '[data-testid="vs-arch-editor-beats-mismatch"]')?.textContent).toContain(
      'Beats add up to 0:40 of 1:00',
    );

    // 2. Fit to length scales beats with BuildArchetypeBeatStripItems so they sum to DefaultDurationSeconds (60s: 15s + 45s)
    const fitBtn = query(fixture, '[data-testid="vs-arch-editor-fit-to-length"]') as HTMLElement | null;
    expect(fitBtn).not.toBeNull();
    fitBtn!.click();
    fixture.detectChanges();

    expect(instance.Beats.map((b) => b.Seconds)).toEqual([15, 45]);
    expect(instance.BeatsTotalSeconds).toBe(60);
    expect(instance.HasBeatsDurationMismatch).toBe(false);
    expect(query(fixture, '[data-testid="vs-arch-editor-beats-mismatch"]')).toBeNull();

    // Verify shipped source row was never mutated by FitToLength or editing
    expect(shippedBriefing.BeatTemplateObject?.[0]?.DefaultDurationSeconds).toBe(10);
    expect(shippedBriefing.BeatTemplateObject?.[1]?.DefaultDurationSeconds).toBe(30);

    // 3. "Start from" copies fields from another archetype without mutating the source
    instance.OnStartFromChange('arch-shipped-product');
    fixture.detectChanges();
    expect(instance.Name).toBe('Product Launch (Copy)');
    expect(instance.Category).toBe('Product');
    expect(instance.DefaultDurationSeconds).toBe(45);
    expect(instance.SelectedFormats).toEqual(['9:16']);
    expect(instance.Beats.map((b) => b.Label)).toEqual(['Customer Problem', 'Live Demo']);

    // Mutate editor state and verify shippedProduct is untouched
    instance.AddBeat();
    instance.Beats[2].Label = 'Call to Action!';
    instance.Beats[2].Purpose = 'Drive signups';
    instance.Beats[2].Seconds = 15;
    instance.FitBeatsToLength();
    fixture.detectChanges();
    expect(shippedProduct.BeatTemplateObject).toHaveLength(2);
    expect(shippedProduct.Name).toBe('Product Launch');
    expect(queryAll(fixture, '[data-testid^="vs-arch-editor-beat-row-"]')).toHaveLength(3);

    // 4. Duplicate name in the same company scope shows inline error and blocks Save
    instance.Name = 'Existing Company Briefing';
    instance.CompanyID = 'comp-1';
    await instance.Save();
    fixture.detectChanges();
    expect(customProvider.GetEntityObject).not.toHaveBeenCalled();
    expect(instance.SaveError).toContain('already exists for this company');
    expect(query(fixture, '[data-testid="vs-arch-editor-error"]')?.textContent).toContain(
      'already exists for this company',
    );

    // 5. Backend duplicate-name error from entity.Save() surfaces LatestResult.CompleteMessage
    instance.Name = 'Acme Product Spotlight';
    shouldSaveSucceed = false;
    await instance.Save();
    fixture.detectChanges();
    expect(instance.SaveError).toBe('Database unique constraint: duplicate archetype name');
    expect(savedIds).toEqual([]);

    // 6. Successful Save writes a valid VideoBeatTemplate[] with keys derived from labels and emits Saved(newId)
    shouldSaveSucceed = true;
    await instance.Save();
    fixture.detectChanges();

    expect(shippedBriefingSaveSpy).not.toHaveBeenCalled();
    expect(shippedProductSaveSpy).not.toHaveBeenCalled();
    expect(savedIds).toEqual(['arch-created-99']);

    const savedEntity = createdEntities.at(-1)!;
    expect(savedEntity['Name']).toBe('Acme Product Spotlight');
    expect(savedEntity['Category']).toBe('Product');
    expect(savedEntity['CompanyID']).toBe('comp-1');
    expect(savedEntity['DefaultDurationSeconds']).toBe(45);
    expect(savedEntity['DefaultFormats']).toBe('9:16');

    const savedBeats = JSON.parse(String(savedEntity['BeatTemplate'])) as Array<{
      Key: string;
      Label: string;
      Purpose: string;
      MinDurationSeconds: number;
      MaxDurationSeconds: number;
      DefaultDurationSeconds: number;
    }>;
    expect(savedBeats).toHaveLength(3);
    expect(savedBeats.map((b) => b.Key)).toEqual([
      'customer_problem',
      'live_demo',
      'call_to_action',
    ]);
    expect(savedBeats.reduce((sum, b) => sum + b.DefaultDurationSeconds, 0)).toBe(45);

    fixture.destroy();
    vi.restoreAllMocks();
  });
});
