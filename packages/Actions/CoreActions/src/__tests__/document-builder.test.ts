import { describe, it, expect, beforeEach } from 'vitest';
import { ArtifactBuilderService, DocumentOperation } from '../custom/utilities/artifact-builder-service';

describe('ArtifactBuilderService', () => {
    let service: ArtifactBuilderService;

    beforeEach(() => {
        service = ArtifactBuilderService.Instance;
    });

    describe('CreateDocument', () => {
        it('should create a PDF document and return a handle', () => {
            const handle = service.CreateDocument('pdf');
            expect(handle).toBeDefined();
            expect(typeof handle).toBe('string');
            expect(service.HasDocument(handle)).toBe(true);
            service.Dispose(handle);
        });

        it('should create a DOCX document with custom filename', () => {
            const handle = service.CreateDocument('docx', 'report.docx');
            const preview = service.GetPreview(handle);
            expect(preview.documentType).toBe('docx');
            expect(preview.fileName).toBe('report.docx');
            service.Dispose(handle);
        });

        it('should create an XLSX document', () => {
            const handle = service.CreateDocument('xlsx', 'data.xlsx');
            const preview = service.GetPreview(handle);
            expect(preview.documentType).toBe('xlsx');
            service.Dispose(handle);
        });

        it('should use default filenames when none provided', () => {
            const pdfHandle = service.CreateDocument('pdf');
            const docxHandle = service.CreateDocument('docx');
            const xlsxHandle = service.CreateDocument('xlsx');

            expect(service.GetPreview(pdfHandle).fileName).toBe('document.pdf');
            expect(service.GetPreview(docxHandle).fileName).toBe('document.docx');
            expect(service.GetPreview(xlsxHandle).fileName).toBe('workbook.xlsx');

            service.Dispose(pdfHandle);
            service.Dispose(docxHandle);
            service.Dispose(xlsxHandle);
        });
    });

    describe('AddContent', () => {
        it('should add operations and return section IDs', () => {
            const handle = service.CreateDocument('pdf');
            const ops: DocumentOperation[] = [
                { type: 'heading', level: 1, text: 'Title' },
                { type: 'paragraph', text: 'Hello world' },
            ];
            const sectionIds = service.AddContent(handle, ops);
            expect(sectionIds).toHaveLength(1);
            expect(typeof sectionIds[0]).toBe('string');

            const preview = service.GetPreview(handle);
            expect(preview.sectionCount).toBe(1);
            expect(preview.totalOperations).toBe(2);
            service.Dispose(handle);
        });

        it('should accumulate multiple sections', () => {
            const handle = service.CreateDocument('docx');

            service.AddContent(handle, [{ type: 'heading', level: 1, text: 'Section 1' }]);
            service.AddContent(handle, [{ type: 'paragraph', text: 'Content' }]);
            service.AddContent(handle, [
                { type: 'table', headers: ['A', 'B'], rows: [['1', '2']] },
            ]);

            const preview = service.GetPreview(handle);
            expect(preview.sectionCount).toBe(3);
            expect(preview.totalOperations).toBe(3);
            service.Dispose(handle);
        });

        it('should throw for invalid handle', () => {
            expect(() => service.AddContent('nonexistent', [{ type: 'paragraph', text: 'x' }]))
                .toThrow('not found');
        });
    });

    describe('GetPreview', () => {
        it('should return detailed section summaries', () => {
            const handle = service.CreateDocument('pdf');
            service.AddContent(handle, [
                { type: 'heading', level: 1, text: 'Introduction' },
                { type: 'paragraph', text: 'Some text' },
                { type: 'paragraph', text: 'More text' },
            ]);

            const preview = service.GetPreview(handle);
            expect(preview.sections).toHaveLength(1);
            expect(preview.sections[0].operationCount).toBe(3);
            expect(preview.sections[0].summary).toContain('Introduction');
            service.Dispose(handle);
        });

        it('should throw for invalid handle', () => {
            expect(() => service.GetPreview('nonexistent')).toThrow('not found');
        });
    });

    describe('ReplaceSection', () => {
        it('should replace section content', () => {
            const handle = service.CreateDocument('pdf');
            const [sectionId] = service.AddContent(handle, [
                { type: 'paragraph', text: 'Original' },
            ]);

            service.ReplaceSection(handle, sectionId, [
                { type: 'paragraph', text: 'Replaced' },
                { type: 'paragraph', text: 'New content' },
            ]);

            const preview = service.GetPreview(handle);
            expect(preview.sections[0].operationCount).toBe(2);
            service.Dispose(handle);
        });

        it('should throw for invalid section ID', () => {
            const handle = service.CreateDocument('pdf');
            service.AddContent(handle, [{ type: 'paragraph', text: 'x' }]);
            expect(() => service.ReplaceSection(handle, 'bad-id', [{ type: 'paragraph', text: 'y' }]))
                .toThrow('not found');
            service.Dispose(handle);
        });
    });

    describe('RemoveSection', () => {
        it('should remove a section by ID', () => {
            const handle = service.CreateDocument('pdf');
            const [id1] = service.AddContent(handle, [{ type: 'heading', level: 1, text: 'First' }]);
            service.AddContent(handle, [{ type: 'heading', level: 2, text: 'Second' }]);

            expect(service.GetPreview(handle).sectionCount).toBe(2);

            service.RemoveSection(handle, id1);
            expect(service.GetPreview(handle).sectionCount).toBe(1);
            service.Dispose(handle);
        });

        it('should throw for invalid section ID', () => {
            const handle = service.CreateDocument('pdf');
            expect(() => service.RemoveSection(handle, 'bad-id')).toThrow('not found');
            service.Dispose(handle);
        });
    });

    describe('Finalize', () => {
        it('should render a PDF document to a buffer', async () => {
            const handle = service.CreateDocument('pdf');
            service.AddContent(handle, [
                { type: 'heading', level: 1, text: 'Test Document' },
                { type: 'paragraph', text: 'This is a test paragraph.' },
            ]);

            const result = await service.Finalize(handle);
            expect(result.buffer).toBeInstanceOf(Buffer);
            expect(result.buffer.length).toBeGreaterThan(0);
            expect(result.mimeType).toBe('application/pdf');
            expect(result.fileName).toBe('document.pdf');

            // Handle should be disposed after finalization
            expect(service.HasDocument(handle)).toBe(false);
        });

        it('should render a DOCX document to a buffer', async () => {
            const handle = service.CreateDocument('docx', 'test.docx');
            service.AddContent(handle, [
                { type: 'heading', level: 1, text: 'Report Title' },
                { type: 'paragraph', text: 'Report body.' },
                { type: 'list', items: ['Item 1', 'Item 2'], ordered: true },
            ]);

            const result = await service.Finalize(handle);
            expect(result.buffer).toBeInstanceOf(Buffer);
            expect(result.buffer.length).toBeGreaterThan(0);
            expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            expect(result.fileName).toBe('test.docx');
            expect(service.HasDocument(handle)).toBe(false);
        });

        it('should throw for empty document', async () => {
            const handle = service.CreateDocument('pdf');
            await expect(service.Finalize(handle)).rejects.toThrow('empty');
            service.Dispose(handle);
        });

        it('should throw for invalid handle', async () => {
            await expect(service.Finalize('nonexistent')).rejects.toThrow('not found');
        });
    });

    describe('Dispose', () => {
        it('should remove the document handle', () => {
            const handle = service.CreateDocument('pdf');
            expect(service.HasDocument(handle)).toBe(true);
            service.Dispose(handle);
            expect(service.HasDocument(handle)).toBe(false);
        });

        it('should not throw for nonexistent handle', () => {
            expect(() => service.Dispose('nonexistent')).not.toThrow();
        });
    });

    describe('Multi-turn workflow', () => {
        it('should support a realistic incremental building flow', async () => {
            // Turn 1: Create
            const handle = service.CreateDocument('pdf', 'quarterly-report.pdf');

            // Turn 2: Add executive summary
            const [summaryId] = service.AddContent(handle, [
                { type: 'heading', level: 1, text: 'Quarterly Report Q1 2026' },
                { type: 'paragraph', text: 'This report covers the financial performance of Q1 2026.' },
            ]);

            // Turn 3: Add data table
            service.AddContent(handle, [
                { type: 'heading', level: 2, text: 'Financial Summary' },
                { type: 'table', headers: ['Metric', 'Value', 'Change'], rows: [
                    ['Revenue', '$1.2M', '+12%'],
                    ['Expenses', '$800K', '+5%'],
                    ['Profit', '$400K', '+28%'],
                ]},
            ]);

            // Turn 4: Preview
            let preview = service.GetPreview(handle);
            expect(preview.sectionCount).toBe(2);
            expect(preview.totalOperations).toBe(4);

            // Turn 5: Modify the summary
            service.ReplaceSection(handle, summaryId, [
                { type: 'heading', level: 1, text: 'Quarterly Report Q1 2026 — FINAL' },
                { type: 'paragraph', text: 'This FINAL report covers Q1 2026 financial performance.' },
            ]);

            // Turn 6: Add conclusion
            service.AddContent(handle, [
                { type: 'heading', level: 2, text: 'Conclusion' },
                { type: 'paragraph', text: 'Q1 exceeded expectations across all metrics.' },
                { type: 'hr' },
            ]);

            // Turn 7: Finalize
            preview = service.GetPreview(handle);
            expect(preview.sectionCount).toBe(3);

            const result = await service.Finalize(handle);
            expect(result.buffer.length).toBeGreaterThan(0);
            expect(result.fileName).toBe('quarterly-report.pdf');
            expect(service.HasDocument(handle)).toBe(false);
        });
    });
});
