/**
 * @fileoverview Server implementations of the `Skill.ExportMarkdown` / `Skill.ImportMarkdown`
 * Remote Operations — extend the CodeGen-emitted bases in `@memberjunction/core-entities`
 * (`generated/remote_operations.ts`, from the `MJ: Remote Operations` rows in
 * `metadata/remote-operations/.remote-operations.json`) and delegate to
 * {@link SkillImportExportService}. Mirrors `TemplateRunServerOperation` in
 * `@memberjunction/templates`.
 * @module @memberjunction/ai-agents
 */
import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    SkillExportMarkdownOperation,
    type SkillExportMarkdownInput,
    type SkillExportMarkdownOutput,
    SkillImportMarkdownOperation,
    type SkillImportMarkdownInput,
    type SkillImportMarkdownOutput
} from '@memberjunction/core-entities';
import { SkillImportExportService } from '../SkillImportExportService';

@RegisterClass(BaseRemotableOperation, 'Skill.ExportMarkdown')
export class SkillExportMarkdownServerOperation extends SkillExportMarkdownOperation {
    protected async InternalExecute(
        input: SkillExportMarkdownInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<SkillExportMarkdownOutput> {
        if (!input?.skillID) {
            throw new Error('skillID is required');
        }

        const { markdown, skillName } = await SkillImportExportService.ExportSkill(input.skillID, user, provider);

        return {
            markdown,
            suggestedFileName: this.sanitizeFileName(skillName)
        };
    }

    /** Strips characters that aren't safe in a downloaded filename. */
    private sanitizeFileName(name: string): string {
        return name.trim().replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, '-') || 'skill';
    }
}

@RegisterClass(BaseRemotableOperation, 'Skill.ImportMarkdown')
export class SkillImportMarkdownServerOperation extends SkillImportMarkdownOperation {
    protected async InternalExecute(
        input: SkillImportMarkdownInput,
        provider: IMetadataProvider,
        user: UserInfo
    ): Promise<SkillImportMarkdownOutput> {
        if (!input?.markdownText) {
            throw new Error('markdownText is required');
        }

        const result = await SkillImportExportService.ImportSkill(
            input.markdownText,
            user,
            { updateSkillId: input.updateSkillID },
            provider
        );

        return {
            skillID: result.skill.ID,
            skillName: result.skill.Name,
            warnings: result.warnings
        };
    }
}
