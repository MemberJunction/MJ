/**
 * @fileoverview The Template Content a prompt renders, read at run start through a provider rather than an engine
 * cache, so a Feature Pipeline run hashes and renders the text that is in the database at run start (F-FP-6: a template
 * edit takes effect on the next run without a server restart).
 * @module @memberjunction/feature-pipelines
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, NormalizeUUID, OrdinalCompare } from '@memberjunction/global';

/** The fields of a `MJ: Template Contents` row the selection and the render need. */
export interface PromptTemplateContentRow {
    ID: string;
    Priority: number;
    __mj_CreatedAt: Date | string;
    TemplateText: string | null;
}

export class PromptTemplateContent {
    /**
     * The row a template renders: lowest `Priority`; ties are broken by the oldest row, then the lowest normalised ID, so
     * every reader of this helper picks the same row — the template engine itself breaks ties by load order, so two
     * content rows with equal Priority are not supported.
     */
    public static SelectHighestPriority<T extends Pick<PromptTemplateContentRow, 'ID' | 'Priority' | '__mj_CreatedAt'>>(rows: readonly T[]): T | undefined {
        const time = (d: Date | string | null | undefined): number => (d ? new Date(d).getTime() : 0);
        return [...rows].sort((a, b) =>
            (a.Priority - b.Priority)
            || (time(a.__mj_CreatedAt) - time(b.__mj_CreatedAt))
            || OrdinalCompare(NormalizeUUID(a.ID), NormalizeUUID(b.ID)))[0];
    }

    /**
     * The row the template renders now, read through `provider` (bypassing caches, so a row saved moments ago is seen).
     * @returns undefined when the template has no content row
     * @throws Error when the rows cannot be read — a caller must not treat a failed read as "no content"
     */
    public static async ReadCurrent(provider: IMetadataProvider, templateID: string, contextUser: UserInfo): Promise<PromptTemplateContentRow | undefined> {
        const result = await RunView.FromMetadataProvider(provider).RunView<PromptTemplateContentRow>({
            EntityName: 'MJ: Template Contents',
            ExtraFilter: `TemplateID='${EscapeSQLString(templateID)}'`,
            Fields: ['ID', 'Priority', '__mj_CreatedAt', 'TemplateText'],
            ResultType: 'simple',
            BypassCache: true,
        }, contextUser);
        if (!result.Success) {
            throw new Error(`The content of template '${templateID}' could not be read: ${result.ErrorMessage}`);
        }
        return PromptTemplateContent.SelectHighestPriority(result.Results || []);
    }
}
