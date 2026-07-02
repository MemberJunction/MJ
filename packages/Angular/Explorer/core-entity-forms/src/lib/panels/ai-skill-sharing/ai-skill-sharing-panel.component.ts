import { Component, ViewChild, ElementRef } from '@angular/core';
import { RegisterClassEx } from '@memberjunction/global';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import { Metadata, AuthorizationEvaluator } from '@memberjunction/core';
import { MJAISkillEntity } from '@memberjunction/core-entities';
// CodeGen-generated Remote Operation classes for AISkill.ExportMarkdown / AISkill.ImportMarkdown
// (see metadata/remote-operations/.remote-operations.json) — requires `mj codegen` to have run
// against the migration that seeds them before this file compiles.
import { AISkillExportMarkdownOperation, AISkillImportMarkdownOperation } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';

/** `MJ: Authorizations.Name` gating the Manage Permissions action — seeded in metadata/authorizations/.agent-skills.json. */
const CAN_SHARE_SKILLS_AUTH_NAME = 'Can Share Skills';

/**
 * Adds Manage Permissions / Export SKILL.md / Import SKILL.md actions to the generated
 * `MJ: AI Skills` form via the BaseFormPanel slot system (Pattern 1 — see PANELS.md) rather than a
 * full custom form override, since the generated form's field panels and related-entity grids are
 * otherwise fine as-is.
 *
 * - Manage Permissions opens the dedicated `<mj-skill-permissions-dialog>` (from
 *   `@memberjunction/ng-agents`), which reads/writes the dedicated `MJ: AI Skill Permissions`
 *   table (per-user / per-role View/Run/Edit/Delete) — the same open-by-default, dedicated-table
 *   model AI Agents use. It is gated behind the "Can Share Skills" authorization; authoring/using
 *   your own skills never requires it.
 * - Export/Import call the `AISkill.ExportMarkdown` / `AISkill.ImportMarkdown` Remote Operations
 *   (typed, provider-routed — see guides/REMOTE_OPERATIONS_GUIDE.md), which wrap
 *   `SkillImportExportService` in `@memberjunction/ai-agents` server-side.
 */
@RegisterClassEx(BaseFormPanel, {
    key: 'ai-skills:sharing-portability',
    skipNullKeyWarning: true,
    metadata: { entity: 'MJ: AI Skills', slot: 'after-fields', sortKey: 50 },
})
@Component({
    standalone: false,
    selector: 'mj-ai-skill-sharing-panel',
    templateUrl: './ai-skill-sharing-panel.component.html',
    styleUrls: ['./ai-skill-sharing-panel.component.css'],
})
export class AISkillSharingPanel extends BaseFormPanel<MJAISkillEntity> {
    @ViewChild('importFileInput') importFileInput!: ElementRef<HTMLInputElement>;

    public PermissionsDialogVisible = false;

    public IsExporting = false;
    public IsImporting = false;

    /**
     * Whether the current user may manage this skill's permission grid (per-user / per-role
     * View/Run/Edit/Delete on the skill). `BaseFormPanel` has no Provider input (the panel slot
     * system doesn't thread one through yet), so this uses the global default provider —
     * consistent with the rest of the not-yet-multi-provider-migrated panel system today.
     */
    public get CanShareSkills(): boolean {
        const md = Metadata.Provider; // global-provider-ok: BaseFormPanel slots have no Provider input; panel system is single-provider today
        if (!md?.CurrentUser) {
            return false;
        }
        const auth = md.Authorizations?.find(a => a.Name === CAN_SHARE_SKILLS_AUTH_NAME);
        if (!auth) {
            return false;
        }
        try {
            return new AuthorizationEvaluator().CurrentUserCanExecuteWithAncestors(auth, md);
        } catch {
            return false;
        }
    }

    public get CanExportImport(): boolean {
        return !!this.Record?.IsSaved;
    }

    public OpenPermissionsDialog(): void {
        this.PermissionsDialogVisible = true;
    }

    public OnPermissionsDialogClosed(): void {
        this.PermissionsDialogVisible = false;
    }

    public async ExportMarkdown(): Promise<void> {
        this.IsExporting = true;
        try {
            const result = await new AISkillExportMarkdownOperation().Execute(
                { skillID: this.Record.ID },
                { provider: Metadata.Provider } // global-provider-ok: BaseFormPanel slots have no Provider input; panel system is single-provider today
            );
            if (!result.Success || !result.Output) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Export failed: ${result.ErrorMessage ?? 'unknown error'}`,
                    'error',
                    5000
                );
                return;
            }
            this.downloadTextFile(result.Output.markdown, `${result.Output.suggestedFileName}.SKILL.md`);
        } catch (error) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `Export failed: ${(error as Error).message}`,
                'error',
                5000
            );
        } finally {
            this.IsExporting = false;
        }
    }

    /** Opens the hidden file input; the actual import happens in `OnImportFileSelected`. */
    public TriggerImport(): void {
        this.importFileInput?.nativeElement.click();
    }

    public async OnImportFileSelected(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = ''; // allow re-selecting the same file next time
        if (!file) {
            return;
        }

        this.IsImporting = true;
        try {
            const markdownText = await file.text();
            const result = await new AISkillImportMarkdownOperation().Execute(
                { markdownText, updateSkillID: this.Record.ID },
                { provider: Metadata.Provider } // global-provider-ok: BaseFormPanel slots have no Provider input; panel system is single-provider today
            );
            if (!result.Success || !result.Output) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Import failed: ${result.ErrorMessage ?? 'unknown error'}`,
                    'error',
                    5000
                );
                return;
            }
            if (result.Output.warnings.length > 0) {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Imported "${result.Output.skillName}" with ${result.Output.warnings.length} warning(s): ${result.Output.warnings.join('; ')}`,
                    'warning',
                    8000
                );
            } else {
                MJNotificationService.Instance.CreateSimpleNotification(
                    `Imported "${result.Output.skillName}".`,
                    'success',
                    3000
                );
            }
            // Refresh this record's fields (Instructions/Description/Category may have changed).
            await this.Record.Load(this.Record.ID);
        } catch (error) {
            MJNotificationService.Instance.CreateSimpleNotification(
                `Import failed: ${(error as Error).message}`,
                'error',
                5000
            );
        } finally {
            this.IsImporting = false;
        }
    }

    private downloadTextFile(text: string, fileName: string): void {
        const blob = new Blob([text], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
    }
}
