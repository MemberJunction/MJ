import { describe, it, expect } from 'vitest';
import {
    ApplyDocumentDesignConfigToMarkdown,
    ComputeDocumentStats,
    DOCUMENT_DESIGN_PRESETS,
    ExtractDocumentDesignConfig,
    GetDocumentDesignPreset,
    IsValidDocumentDesignPresetID,
    ParseDocumentFrontmatter,
} from '../custom/DocumentDesignPresets';

describe('DocumentDesignPresets & Frontmatter helpers', () => {
    it('exposes five distinct design presets with valid hex color palettes', () => {
        expect(DOCUMENT_DESIGN_PRESETS).toHaveLength(5);
        for (const preset of DOCUMENT_DESIGN_PRESETS) {
            expect(IsValidDocumentDesignPresetID(preset.ID)).toBe(true);
            expect(preset.PrimaryHex).toMatch(/^[0-9A-F]{6}$/);
            expect(preset.AccentHex).toMatch(/^[0-9A-F]{6}$/);
            expect(preset.MutedHex).toMatch(/^[0-9A-F]{6}$/);
            expect(preset.TableHeaderBgHex).toMatch(/^[0-9A-F]{6}$/);
            expect(preset.TableStripeBgHex).toMatch(/^[0-9A-F]{6}$/);
            expect(preset.CalloutBgHex).toMatch(/^[0-9A-F]{6}$/);
        }
        expect(IsValidDocumentDesignPresetID('unknown-preset')).toBe(false);
        expect(GetDocumentDesignPreset('nonexistent').ID).toBe('modern-clean');
    });

    it('parses frontmatter linearly and round-trips design config while preserving custom keys', () => {
        const md = [
            '---',
            'title: "Q4 Board Memo"',
            'owner: "Amith"',
            '---',
            '# Overview',
            '',
            'Revenue grew 28% YoY.',
        ].join('\n');

        const parsed = ParseDocumentFrontmatter(md);
        expect(parsed.HasFrontmatter).toBe(true);
        expect(parsed.Fields['title']).toBe('Q4 Board Memo');
        expect(parsed.Fields['owner']).toBe('Amith');
        expect(parsed.Body.startsWith('# Overview')).toBe(true);

        const updated = ApplyDocumentDesignConfigToMarkdown(md, {
            PresetID: 'executive-memo',
            PageSize: 'a4',
            Orientation: 'landscape',
            Watermark: 'DRAFT',
            RunningHeader: 'Confidential — Q4 Review',
            ShowPageNumbers: false,
        });

        const parsedAfter = ParseDocumentFrontmatter(updated);
        expect(parsedAfter.Fields['title']).toBe('Q4 Board Memo');
        expect(parsedAfter.Fields['owner']).toBe('Amith');

        const extracted = ExtractDocumentDesignConfig(updated);
        expect(extracted.PresetID).toBe('executive-memo');
        expect(extracted.PageSize).toBe('a4');
        expect(extracted.Orientation).toBe('landscape');
        expect(extracted.Watermark).toBe('DRAFT');
        expect(extracted.RunningHeader).toBe('Confidential — Q4 Review');
        expect(extracted.ShowPageNumbers).toBe(false);

        const cleared = ApplyDocumentDesignConfigToMarkdown(updated, { Watermark: '' });
        expect(ExtractDocumentDesignConfig(cleared).Watermark).toBe('');
    });

    it('computes document stats excluding frontmatter and mj-block payloads', () => {
        const md = [
            '---',
            'designPreset: "technical-spec"',
            '---',
            '# Architecture Overview',
            '',
            'First paragraph with five words.',
            '',
            ':::mj-block',
            '{"BlockID":"b1","Kind":"EntityView","EntityName":"Users","Mode":"Live"}',
            ':::',
            '',
            '## Summary',
            'Second short paragraph.',
        ].join('\n');

        const stats = ComputeDocumentStats(md);
        expect(stats.HeadingCount).toBe(2);
        expect(stats.LiveBlockCount).toBe(1);
        expect(stats.ParagraphCount).toBe(2);
        // "Architecture Overview" (2) + "First paragraph with five words." (5) + "Summary" (1) + "Second short paragraph." (3) = 11
        expect(stats.WordCount).toBe(11);
        expect(stats.EstimatedReadMinutes).toBe(1);
        expect(stats.EstimatedPages).toBe(1);
    });
});
