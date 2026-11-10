import { describe, it, expect, vi, afterEach } from 'vitest';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { MJArtifactVersionEntity, SlideDeckEngine } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import { SlideDeckArtifactViewerComponent } from './slide-deck-artifact-viewer.component';

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

function makeSlideVersion(): MJArtifactVersionEntity {
  const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Board Deck', 'deck-dom-1');
  const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
  Object.defineProperties(ver, {
    ID: { value: 'sv-dom-1', enumerable: true },
    ArtifactID: { value: 'art-slide-dom-1', enumerable: true },
    Name: { value: 'Board Deck', enumerable: true },
    VersionNumber: { value: 1, enumerable: true },
    ContentMode: { value: 'Text', enumerable: true },
    Configuration: { value: null, enumerable: true },
    Content: { value: SlideDeckEngine.Instance.SerializeDeckSpec(deck), enumerable: true },
  });
  return ver;
}

describe('SlideDeckArtifactViewerComponent DOM', () => {
  it('mounts read-only by default (B3) and renders the slide deck workspace', () => {
    const f = renderComponentFixture(SlideDeckArtifactViewerComponent, {
      imports: [FormsModule],
      declarations: [SlideDeckArtifactViewerComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      schemas: [NO_ERRORS_SCHEMA],
      inputs: {
        artifactVersion: makeSlideVersion(),
        readonly: true,
      },
    });
    f.detectChanges();
    expect(f.componentInstance.IsEditable).toBe(false);
    expect(query(f, '.mj-slides-shell')).not.toBeNull();
  });

  it('toggles filmstrip rail visibility via ToggleFilmstrip', () => {
    const f = renderComponentFixture(SlideDeckArtifactViewerComponent, {
      imports: [FormsModule],
      declarations: [SlideDeckArtifactViewerComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      schemas: [NO_ERRORS_SCHEMA],
      inputs: {
        artifactVersion: makeSlideVersion(),
        readonly: true,
      },
      setup: (inst) => {
        inst.ToggleFilmstrip();
      },
    });
    f.detectChanges();
    expect(f.componentInstance.ShowFilmstrip).toBe(false);
  });

  it('wires ContentCommitted output on base viewer contract', () => {
    const f = renderComponentFixture(SlideDeckArtifactViewerComponent, {
      imports: [FormsModule],
      declarations: [SlideDeckArtifactViewerComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      schemas: [NO_ERRORS_SCHEMA],
      inputs: {
        artifactVersion: makeSlideVersion(),
        readonly: true,
      },
    });
    f.detectChanges();
    const committed = capture(f.componentInstance.ContentCommitted);
    f.componentInstance.ContentCommitted.emit('{}');
    expect(committed).toEqual(['{}']);
  });
});
