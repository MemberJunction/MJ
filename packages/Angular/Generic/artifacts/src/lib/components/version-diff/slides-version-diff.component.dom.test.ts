import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MJArtifactVersionEntity, SlideDeckEngine } from '@memberjunction/core-entities';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { SlidesVersionDiffComponent } from './slides-version-diff.component';

function makeVersion(id: string, num: number, content: string): MJArtifactVersionEntity {
  const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
  Object.defineProperties(ver, {
    ID: { value: id, enumerable: true },
    ArtifactID: { value: 'art-slide-1', enumerable: true },
    VersionNumber: { value: num, enumerable: true },
    Content: { value: content, enumerable: true },
  });
  return ver;
}

afterEach(() => TestBed.resetTestingModule());

describe('SlidesVersionDiffComponent DOM', () => {
  it('renders slide-by-slide visual comparison for modified slide titles', () => {
    const baseDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Deck v1', 'deck-1');
    const targetDeck = SlideDeckEngine.Instance.ParseDeckSpec(
      SlideDeckEngine.Instance.SerializeDeckSpec(baseDeck),
      'Deck v2',
    );
    targetDeck.Slides[0].Title = 'Q4 Board Review';
    const f = renderComponentFixture(SlidesVersionDiffComponent, {
      imports: [SlidesVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('sv1', 1, SlideDeckEngine.Instance.SerializeDeckSpec(baseDeck)),
        TargetVersion: makeVersion('sv2', 2, SlideDeckEngine.Instance.SerializeDeckSpec(targetDeck)),
      },
    });
    f.detectChanges();
    expect(query(f, '[data-testid="slides-visual-version-diff"]')).not.toBeNull();
    expect(text(f, '[data-testid="slides-visual-version-diff"]')).toContain('Q4 Board Review');
  });

  it('counts added slides in DiffResult', () => {
    const baseDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Deck v1', 'deck-2');
    const cloned = SlideDeckEngine.Instance.ParseDeckSpec(
      SlideDeckEngine.Instance.SerializeDeckSpec(baseDeck),
      'Deck v2',
    );
    const { Deck: targetDeck } = SlideDeckEngine.Instance.AddSlide(cloned, { Layout: 'BigNumber', Title: 'Added KPI Slide' });
    const f = renderComponentFixture(SlidesVersionDiffComponent, {
      imports: [SlidesVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('sv1', 1, SlideDeckEngine.Instance.SerializeDeckSpec(baseDeck)),
        TargetVersion: makeVersion('sv2', 2, SlideDeckEngine.Instance.SerializeDeckSpec(targetDeck)),
      },
    });
    f.detectChanges();
    expect(f.componentInstance.DiffResult?.AddedSlides).toBeGreaterThanOrEqual(1);
  });

  it('filters slide cards when ToggleChangedSlidesOnly is invoked', () => {
    const baseDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Deck v1', 'deck-3');
    const serialized = SlideDeckEngine.Instance.SerializeDeckSpec(baseDeck);
    const f = renderComponentFixture(SlidesVersionDiffComponent, {
      imports: [SlidesVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('sv1', 1, serialized),
        TargetVersion: makeVersion('sv2', 2, serialized),
      },
    });
    f.detectChanges();
    f.componentInstance.ToggleChangedSlidesOnly();
    f.detectChanges();
    expect(f.componentInstance.ChangedSlidesOnly).toBe(true);
    expect(f.componentInstance.FilteredSlides.length).toBe(0);
    expect(text(f, '[data-testid="slides-visual-version-diff"]')).toContain('No changed slides match the current filter');
  });

  it('renders deck theme deltas, quote/image/mj-block regions, and speaker notes redlines', () => {
    const baseDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Deck v1', 'deck-4');
    baseDeck.Slides[0].SpeakerNotes = 'Old intro note';
    baseDeck.Slides[0].Regions.push(
      {
        RegionID: 'q-1',
        Label: 'Quote',
        Kind: 'quote',
        MarkdownContent: 'Revenue grew steadily',
        QuoteAttribution: 'CFO',
      },
      {
        RegionID: 'img-1',
        Label: 'Hero',
        Kind: 'image',
        MarkdownContent: '',
        ImageUrl: 'https://example.com/hero.png',
        ImageAlt: 'Hero chart',
      },
    );

    const targetDeck = SlideDeckEngine.Instance.ParseDeckSpec(
      SlideDeckEngine.Instance.SerializeDeckSpec(baseDeck),
      'Deck v2',
    );
    targetDeck.Theme.PrimaryColor = '#ff5500';
    targetDeck.Slides[0].SpeakerNotes = 'Updated executive note';
    targetDeck.Slides[0].Regions[1].MarkdownContent = 'Revenue accelerated 24%';

    const f = renderComponentFixture(SlidesVersionDiffComponent, {
      imports: [SlidesVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('sv1', 1, SlideDeckEngine.Instance.SerializeDeckSpec(baseDeck)),
        TargetVersion: makeVersion('sv2', 2, SlideDeckEngine.Instance.SerializeDeckSpec(targetDeck)),
      },
    });
    f.detectChanges();

    const hostText = text(f, '[data-testid="slides-visual-version-diff"]');
    expect(hostText).toContain('Deck & Theme Changes');
    expect(hostText).toContain('Speaker Notes');
    expect(hostText).toContain('Hero chart');
    expect(hostText).toContain('CFO');
  });
});
