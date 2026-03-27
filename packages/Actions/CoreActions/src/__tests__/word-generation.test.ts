/**
 * Unit tests for WordGeneratorAction.
 * Tests in-process document generation — no database or storage needed.
 */

import { describe, it, expect } from 'vitest';
import type { RunActionParams } from '@memberjunction/actions-base';
import { WordGeneratorAction } from '../custom/files/word-generator.action';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeParams(pairs: Record<string, unknown>): RunActionParams {
    return {
        ContextUser: null,
        Params: Object.entries(pairs).map(([Name, Value]) => ({
            Name,
            Value,
            Type: 'Input',
        })),
    } as unknown as RunActionParams;
}

function runAction(action: { InternalRunAction: (p: RunActionParams) => Promise<unknown> }, params: RunActionParams) {
    return (action as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['InternalRunAction'](params);
}

function getOutputParam(params: RunActionParams, name: string): unknown {
    return params.Params.find(p => p.Name === name)?.Value;
}

function isDocx(base64: string): boolean {
    const buf = Buffer.from(base64, 'base64');
    // DOCX is a ZIP — starts with PK magic bytes
    return buf[0] === 0x50 && buf[1] === 0x4b;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WordGeneratorAction', () => {
    it('generates a DOCX from structured sections', async () => {
        const action = new WordGeneratorAction();
        const params = makeParams({
            Sections: [
                {
                    heading: 'Quarterly Report',
                    level: 1,
                    content: [
                        { type: 'paragraph', text: 'This report covers Q1 2025 performance.' },
                        {
                            type: 'table',
                            headers: ['Metric', 'Value', 'Change'],
                            rows: [['Revenue', '$1.2M', '+12%'], ['Users', '45,000', '+8%']],
                        },
                        { type: 'list', items: ['Key finding 1', 'Key finding 2'], ordered: false },
                    ],
                },
                {
                    heading: 'Summary',
                    level: 2,
                    content: [
                        { type: 'paragraph', text: 'Overall a strong quarter.', bold: true },
                    ],
                },
            ],
            FileName: 'report.docx',
        });

        const result = await runAction(action, params) as { Success: boolean; ResultCode: string };

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');

        const docxData = getOutputParam(params, 'DocxData') as string;
        expect(docxData).toBeTruthy();
        expect(isDocx(docxData)).toBe(true);
    }, 15_000);

    it('generates a DOCX from markdown content', async () => {
        const action = new WordGeneratorAction();
        const params = makeParams({
            Content: '# Heading\n\nSome **bold** text.\n\n- Item 1\n- Item 2',
            ContentType: 'markdown',
            FileName: 'markdown.docx',
        });

        const result = await runAction(action, params) as { Success: boolean };
        expect(result.Success).toBe(true);

        const docxData = getOutputParam(params, 'DocxData') as string;
        expect(isDocx(docxData)).toBe(true);
    }, 15_000);

    it('generates a DOCX from HTML content', async () => {
        const action = new WordGeneratorAction();
        const params = makeParams({
            Content: '<h1>Report</h1><p>Hello <strong>world</strong></p><ul><li>A</li><li>B</li></ul>',
            ContentType: 'html',
            FileName: 'html.docx',
        });

        const result = await runAction(action, params) as { Success: boolean };
        expect(result.Success).toBe(true);

        const docxData = getOutputParam(params, 'DocxData') as string;
        expect(isDocx(docxData)).toBe(true);
    }, 15_000);

    it('generates a DOCX with an ordered list', async () => {
        const action = new WordGeneratorAction();
        const params = makeParams({
            Sections: [{
                heading: 'Steps',
                level: 1,
                content: [
                    { type: 'list', items: ['Step one', 'Step two', 'Step three'], ordered: true },
                ],
            }],
        });

        const result = await runAction(action, params) as { Success: boolean };
        expect(result.Success).toBe(true);
        expect(isDocx(getOutputParam(params, 'DocxData') as string)).toBe(true);
    }, 15_000);

    it('fails when no content is provided', async () => {
        const action = new WordGeneratorAction();
        const params = makeParams({ FileName: 'empty.docx' });

        const result = await runAction(action, params) as { Success: boolean; ResultCode: string };
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_CONTENT');
    });
});
