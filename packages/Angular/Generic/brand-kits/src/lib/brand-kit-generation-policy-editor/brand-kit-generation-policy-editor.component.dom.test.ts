import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, queryAll, typeInto, click } from '@memberjunction/ng-test-utils';
import { MJBrandKitEntity } from '@memberjunction/core-entities';
import {
  BrandKitGenerationPolicyEditorComponent,
  SYNTHETIC_PEOPLE_POLICY_WARNING,
} from './brand-kit-generation-policy-editor.component';

function makeStubBrandKit(overrides?: Partial<MJBrandKitEntity>): MJBrandKitEntity {
  return {
    ID: 'KIT-1',
    Name: 'Default Brand Kit',
    GenerationPolicyObject: null,
    Save: vi.fn(async () => true),
    LatestResult: null,
    ...overrides,
  } as unknown as MJBrandKitEntity;
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe('BrandKitGenerationPolicyEditorComponent (DOM)', () => {
  it('defaults AllowSyntheticPeople to false and renders the §3.4 warning when toggled on', () => {
    const kit = makeStubBrandKit();
    const fixture = renderComponentFixture(BrandKitGenerationPolicyEditorComponent, {
      inputs: { BrandKit: kit },
    });

    const synthCheckbox = query(fixture, '[data-testid="bkgp-allow-synthetic-people"]') as HTMLInputElement | null;
    expect(synthCheckbox).not.toBeNull();
    expect(synthCheckbox?.checked).toBe(false);
    expect(query(fixture, '[data-testid="bkgp-synthetic-people-warning"]')).toBeNull();

    // Toggle AllowSyntheticPeople on
    synthCheckbox?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.AllowSyntheticPeople).toBe(true);
    const warning = query(fixture, '[data-testid="bkgp-synthetic-people-warning"]');
    expect(warning).not.toBeNull();
    expect(warning?.textContent).toContain(SYNTHETIC_PEOPLE_POLICY_WARNING);
    expect(warning?.textContent).toContain(
      'A generated person may never be presented as a member, customer, employee or speaker'
    );
  });

  it('adds and removes AvoidSubjects chips and emits PolicyChanged', () => {
    const kit = makeStubBrandKit({
      GenerationPolicyObject: {
        AllowGeneratedImages: true,
        AllowGeneratedVideo: true,
        AllowSyntheticPeople: false,
        AvoidSubjects: ['competitor logos'],
        StylePrompt: 'Clean editorial',
        MaxGenerationCostPerRun: 12,
      },
    });
    const fixture = renderComponentFixture(BrandKitGenerationPolicyEditorComponent, {
      inputs: { BrandKit: kit },
    });

    const changedSpy = vi.fn();
    fixture.componentInstance.PolicyChanged.subscribe(changedSpy);

    expect(queryAll(fixture, '[data-testid="bkgp-avoid-chip"]').length).toBe(1);

    typeInto(fixture, '[data-testid="bkgp-new-subject-input"]', 'stock handshakes');
    (query(fixture, '[data-testid="bkgp-add-subject-btn"]') as HTMLButtonElement | null)?.click();
    fixture.detectChanges();

    const chipsAfterAdd = queryAll(fixture, '[data-testid="bkgp-avoid-chip"]');
    expect(chipsAfterAdd.length).toBe(2);
    expect(fixture.componentInstance.AvoidSubjects).toEqual(['competitor logos', 'stock handshakes']);
    expect(changedSpy).toHaveBeenCalled();

    // Remove the first chip
    (queryAll(fixture, '[data-testid="bkgp-avoid-chip-remove"]')[0] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(queryAll(fixture, '[data-testid="bkgp-avoid-chip"]').length).toBe(1);
    expect(fixture.componentInstance.AvoidSubjects).toEqual(['stock handshakes']);
  });

  it('surfaces BrandKit.LatestResult error when Save() returns false and emits PolicySaved when Save() succeeds', async () => {
    const kit = makeStubBrandKit({
      Save: vi.fn(async () => false),
      LatestResult: {
        Success: false,
        Message: 'Save failed',
        CompleteMessage: 'Database constraint violation while saving Brand Kit policy.',
      } as unknown as MJBrandKitEntity['LatestResult'],
    });
    const fixture = renderComponentFixture(BrandKitGenerationPolicyEditorComponent, {
      inputs: { BrandKit: kit },
    });

    const savedSpy = vi.fn();
    fixture.componentInstance.PolicySaved.subscribe(savedSpy);

    click(fixture, '[data-testid="bkgp-save-btn"]');
    await flushAsync();
    fixture.detectChanges();

    const errBanner = query(fixture, '[data-testid="bkgp-save-error"]');
    expect(errBanner).not.toBeNull();
    expect(errBanner?.textContent).toContain('Database constraint violation while saving Brand Kit policy.');
    expect(savedSpy).not.toHaveBeenCalled();

    // Now succeed
    (kit.Save as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
    click(fixture, '[data-testid="bkgp-save-btn"]');
    await flushAsync();
    fixture.detectChanges();

    expect(query(fixture, '[data-testid="bkgp-save-error"]')).toBeNull();
    expect(savedSpy).toHaveBeenCalledTimes(1);
  });
});
