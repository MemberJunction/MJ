/**
 * @fileoverview Browser-side helper for the Open in Excel buttons.
 *
 * Framework-free so both shared grids (entity-viewer, query-viewer) and any other host can use it.
 * The status answer is cached per provider: every grid on a page asks once.
 *
 * @module @memberjunction/excel-addin
 */
import { IMetadataProvider, LogError } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { DecodeBase64Url } from './handoff';
import {
    ExcelAddinBuildWorkbookOperation,
    ExcelAddinBuildWorkbookOutput,
    ExcelAddinGetStatusOperation,
    ExcelAddinStatusOutput,
    ExcelWorkbookSourceRequest,
} from './operations';

/** The outcome of {@link ExcelAddinClient.OpenInExcel}. */
export interface OpenInExcelResult {
    Success: boolean;
    FileName?: string;
    ErrorMessage?: string;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Caches the add-in's status per provider and downloads connected workbooks. */
export class ExcelAddinClient extends BaseSingleton<ExcelAddinClient> {
    private statusByProvider = new WeakMap<IMetadataProvider, Promise<ExcelAddinStatusOutput | null>>();

    public constructor() {
        super();
    }

    public static get Instance(): ExcelAddinClient {
        return ExcelAddinClient.getInstance<ExcelAddinClient>();
    }

    /**
     * The host's add-in status, or null when it can't be read (the add-in is then treated as off).
     * Asked once per provider.
     */
    public GetStatus(provider: IMetadataProvider): Promise<ExcelAddinStatusOutput | null> {
        let pending = this.statusByProvider.get(provider);
        if (!pending) {
            pending = this.fetchStatus(provider);
            this.statusByProvider.set(provider, pending);
        }
        return pending;
    }

    /** True when the host serves the add-in. */
    public async IsEnabled(provider: IMetadataProvider): Promise<boolean> {
        const status = await this.GetStatus(provider);
        return status?.Enabled === true;
    }

    /** Builds a connected workbook for the sources and downloads it in the browser. */
    public async OpenInExcel(sources: ExcelWorkbookSourceRequest[], provider: IMetadataProvider): Promise<OpenInExcelResult> {
        const result = await new ExcelAddinBuildWorkbookOperation().Execute({ Sources: sources }, { provider });
        if (!result.Success || !result.Output) {
            return { Success: false, ErrorMessage: result.ErrorMessage || 'The workbook could not be built.' };
        }
        this.download(result.Output);
        return { Success: true, FileName: result.Output.FileName };
    }

    private async fetchStatus(provider: IMetadataProvider): Promise<ExcelAddinStatusOutput | null> {
        try {
            const result = await new ExcelAddinGetStatusOperation().Execute({}, { provider });
            return result.Success && result.Output ? result.Output : null;
        } catch (e) {
            LogError(`Excel add-in status check failed: ${e instanceof Error ? e.message : String(e)}`);
            return null;
        }
    }

    private download(output: ExcelAddinBuildWorkbookOutput): void {
        const bytes = DecodeBase64Url(output.ContentBase64.replace(/\+/g, '-').replace(/\//g, '_'));
        const copy = new Uint8Array(bytes.length);
        copy.set(bytes);
        const url = URL.createObjectURL(new Blob([copy.buffer], { type: XLSX_MIME }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = output.FileName;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        // Revoke on the next task: some browsers start the download asynchronously after click().
        Promise.resolve().then(() => URL.revokeObjectURL(url));
    }
}
