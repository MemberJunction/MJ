import { describe, expect, it } from 'vitest';
import {
  BuildCanonicalSlideSuggestionRecord,
  NormalizeDocumentSuggestion,
  NormalizeSlideSuggestion,
  NormalizeSpreadsheetSuggestion,
  ParseSuggestionsFromConfiguration,
} from './artifact-suggestion-normalizer.util';

describe('artifact-suggestion-normalizer.util (NW-3)', () => {
  it('normalizes document suggestions with heading + originalSlice fallback when blockId is absent', () => {
    const sug = NormalizeDocumentSuggestion(
      {
        SuggestionID: 'doc-fallback-1',
        Domain: 'document',
        Anchor: {
          domain: 'document',
          heading: 'Live Metrics Section',
          quote: 'Initial narrative paragraph.',
        },
        OriginalSlice: 'Initial narrative paragraph.',
        ProposedReplacement: 'Revised narrative paragraph.',
        Rationale: 'Improve executive clarity',
        Status: 'Pending',
      },
      'doc-fallback-1',
    );

    expect(sug).not.toBeNull();
    expect(sug?.BlockID).toBe('');
    expect(sug?.Heading).toBe('Live Metrics Section');
    expect(sug?.Quote).toBe('Initial narrative paragraph.');
    expect(sug?.OriginalMarkdown).toBe('Initial narrative paragraph.');
    expect(sug?.ProposedMarkdown).toBe('Revised narrative paragraph.');
  });

  it('rejects document suggestions that lack both blockId and any fallback anchor or slice', () => {
    const sug = NormalizeDocumentSuggestion(
      {
        SuggestionID: 'doc-missing-anchor',
        Domain: 'document',
        Anchor: { domain: 'document' },
        OriginalSlice: '',
        ProposedReplacement: 'Replacement text',
        Rationale: 'No anchor',
        Status: 'Pending',
      },
      'doc-missing-anchor',
    );
    expect(sug).toBeNull();
  });

  it('normalizes slide suggestions with slideNumber fallback when slideId is absent and preserves SlideNumber on round-trip', () => {
    const sug = NormalizeSlideSuggestion(
      {
        SuggestionID: 'slide-fallback-2',
        Domain: 'slides',
        Anchor: {
          domain: 'slides',
          slideNumber: 2,
          regionId: 'body',
        },
        OriginalSlice: 'bullet B',
        ProposedReplacement: 'bullet B revised',
        Rationale: 'Tighten slide 2 bullet',
        Status: 'Pending',
      },
      'slide-fallback-2',
    );

    expect(sug).not.toBeNull();
    expect(sug?.SlideID).toBe('');
    expect(sug?.SlideNumber).toBe(2);
    expect(sug?.RegionID).toBe('body');
    expect(sug?.OriginalText).toBe('bullet B');
    expect(sug?.SuggestedText).toBe('bullet B revised');

    const canonical = BuildCanonicalSlideSuggestionRecord(sug!, 2, 'art-deck-1');
    expect(canonical.Anchor.slideNumber).toBe(2);
  });

  it('infers slides domain when persisted suggestion carries slideNumber without explicit Domain', () => {
    const configJson = JSON.stringify({
      suggestions: [
        {
          SuggestionID: 'slide-inferred-1',
          Anchor: { slideNumber: 3 },
          OriginalSlice: 'Old note',
          ProposedReplacement: 'New note',
          Rationale: 'Inferred domain test',
          Status: 'Pending',
        },
      ],
    });

    const slidesOnly = ParseSuggestionsFromConfiguration(configJson, 'slides');
    expect(slidesOnly).toHaveLength(1);
    expect(slidesOnly[0]?.SuggestionID).toBe('slide-inferred-1');
  });

  it('normalizes spreadsheet suggestions with sheet name fallback when sheetId is absent', () => {
    const sug = NormalizeSpreadsheetSuggestion(
      {
        SuggestionID: 'sheet-name-1',
        Domain: 'spreadsheet',
        Anchor: {
          domain: 'spreadsheet',
          sheet: 'Revenue',
          range: 'B2',
        },
        OriginalSlice: '100',
        ProposedReplacement: '250',
        Rationale: 'Updated Q4 forecast',
        Status: 'Pending',
      },
      'sheet-name-1',
    );

    expect(sug).not.toBeNull();
    expect(sug?.SheetID).toBe('Revenue');
    expect(sug?.Range).toBe('B2');
  });
});
