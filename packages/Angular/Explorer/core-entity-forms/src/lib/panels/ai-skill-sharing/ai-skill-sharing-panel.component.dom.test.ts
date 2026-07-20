import { describe, it, expect } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { query, queryAll } from '@memberjunction/ng-test-utils';
import type { MJAISkillEntity } from '@memberjunction/core-entities';
import { AISkillSharingPanel } from './ai-skill-sharing-panel.component';

/**
 * DOM coverage for <mj-ai-skill-sharing-panel> — a BaseFormPanel slot that adds Manage-Permissions
 * / Export / Import actions to the MJ: AI Skills form. It reads permission state from the global
 * Metadata.Provider (no CurrentUser in a unit context → CanShareSkills is false, so the
 * Manage-Permissions button is hidden — an assertable gate). The Remote-Operation calls behind
 * Export/Import are out of unit scope; these specs cover what the panel OWNS: the unsaved-record
 * hint vs. the action row (driven by CanExportImport = Record.IsSaved), the Export/Import buttons,
 * their disabled/label flip while a transfer is in-flight, and opening the permissions dialog.
 *
 * `<mj-collapsible-panel>` (projects content) and `<mj-skill-permissions-dialog>` (heavy, from
 * ng-agents) are replaced with lightweight stubs. Record is a minimal MJAISkillEntity stub whose
 * only read field is `IsSaved`.
 */

@Component({ standalone: true, selector: 'mj-collapsible-panel', template: '<ng-content></ng-content>' })
class CollapsiblePanelStub {
  @Input() SectionKey = '';
  @Input() SectionName = '';
  @Input() Icon = '';
  @Input() Form: unknown;
  @Input() FormContext: unknown;
}

@Component({ standalone: true, selector: 'mj-skill-permissions-dialog', template: '<div class="perms-dialog"></div>' })
class SkillPermissionsDialogStub {
  @Input() Skill: unknown;
  @Output() Closed = new EventEmitter<void>();
}

const makeRecord = (isSaved: boolean): MJAISkillEntity =>
  ({ ID: 'skill-1', IsSaved: isSaved, Load: async () => true }) as unknown as MJAISkillEntity;

function render(isSaved = true): ComponentFixture<AISkillSharingPanel> {
  TestBed.configureTestingModule({
    imports: [MJButtonDirective, CollapsiblePanelStub, SkillPermissionsDialogStub],
    declarations: [AISkillSharingPanel],
  });
  const fixture = TestBed.createComponent(AISkillSharingPanel);
  fixture.componentRef.setInput('Record', makeRecord(isSaved));
  fixture.detectChanges(false);
  return fixture;
}

const sync = (f: ComponentFixture<AISkillSharingPanel>) => {
  f.componentRef.changeDetectorRef.markForCheck();
  f.detectChanges(false);
};
const buttonByText = (f: ComponentFixture<AISkillSharingPanel>, t: string) =>
  queryAll(f, 'button').find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

describe('AISkillSharingPanel (DOM)', () => {
  it('shows the save-first hint and no action buttons for an unsaved record', () => {
    const fixture = render(false);
    expect(query(fixture, '.ai-skill-sharing-hint')).not.toBeNull();
    expect(query(fixture, '.ai-skill-sharing-actions')).toBeNull();
  });

  it('shows the Export and Import buttons for a saved record', () => {
    const fixture = render(true);
    expect(query(fixture, '.ai-skill-sharing-actions')).not.toBeNull();
    expect(buttonByText(fixture, 'Export SKILL.md')).toBeTruthy();
    expect(buttonByText(fixture, 'Import SKILL.md')).toBeTruthy();
  });

  it('hides Manage Permissions when the user cannot share skills (no current user)', () => {
    const fixture = render(true);
    // CanShareSkills reads Metadata.Provider.CurrentUser which is absent in a unit context → false
    expect(fixture.componentInstance.CanShareSkills).toBe(false);
    expect(buttonByText(fixture, 'Manage Permissions')).toBeUndefined();
  });

  it('disables the Export button and swaps its label while exporting', () => {
    const fixture = render(true);
    expect(buttonByText(fixture, 'Export SKILL.md').disabled).toBe(false);
    fixture.componentInstance.IsExporting = true;
    sync(fixture);
    const exporting = buttonByText(fixture, 'Exporting');
    expect(exporting).toBeTruthy();
    expect(exporting.disabled).toBe(true);
  });

  it('opens the permissions dialog when OpenPermissionsDialog runs', () => {
    const fixture = render(true);
    expect(query(fixture, 'mj-skill-permissions-dialog')).toBeNull();
    fixture.componentInstance.OpenPermissionsDialog();
    sync(fixture);
    expect(query(fixture, 'mj-skill-permissions-dialog')).not.toBeNull();
  });

  it('closes the permissions dialog on OnPermissionsDialogClosed', () => {
    const fixture = render(true);
    fixture.componentInstance.OpenPermissionsDialog();
    sync(fixture);
    fixture.componentInstance.OnPermissionsDialogClosed();
    sync(fixture);
    expect(query(fixture, 'mj-skill-permissions-dialog')).toBeNull();
  });
});
