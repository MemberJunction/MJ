/**
 * @fileoverview Standard anchor resolver logic classes for all 13 strategies (§5.1 & §7):
 * Registered, FormField, FormSection, FormRailGroup, FormToolbarAction, NavItem,
 * RailPage, AppSwitcher, GridColumn, Omnibar, ChatComposer, Role, Selector.
 * @module @memberjunction/tours-runtime
 */

import { RegisterClass } from '@memberjunction/global';
import type { TourCapabilityRequirement } from '../host-contracts';
import type {
    ITourAnchor,
    TourAnchorResolution,
    TourValidationIssue,
    TourValidationResult,
} from '../types';
import { BaseTourAnchorResolver } from './base-anchor-resolver';

function requireField(
    anchor: ITourAnchor,
    field: keyof ITourAnchor,
    code: string,
    message: string,
): TourValidationIssue[] {
    const val = anchor[field];
    if (typeof val !== 'string' || val.trim().length === 0) {
        return [{ Code: code, Message: message, Field: String(field), Severity: 'Error' }];
    }
    return [];
}

@RegisterClass(BaseTourAnchorResolver, 'Registered')
export class RegisteredAnchorResolver extends BaseTourAnchorResolver {
    public readonly ResolutionRung: TourAnchorResolution = 'Registered';

    public ValidateAnchor(anchor: ITourAnchor): TourValidationResult {
        return this.buildResult(
            requireField(anchor, 'Key', 'ANCHOR_REGISTERED_MISSING_KEY', 'Registered anchor requires Key.'),
        );
    }

    protected override GetSelectorHints(anchor: ITourAnchor): string[] {
        return anchor.Key ? [`[data-mj-tour-anchor="${anchor.Key}"]`] : [];
    }
}

@RegisterClass(BaseTourAnchorResolver, 'FormField')
export class FormFieldAnchorResolver extends BaseTourAnchorResolver {
    public readonly ResolutionRung: TourAnchorResolution = 'Semantic';
    public override readonly RequiredCapabilities: TourCapabilityRequirement = { MJForms: true };

    public ValidateAnchor(anchor: ITourAnchor): TourValidationResult {
        const errors = [
            ...requireField(anchor, 'Field', 'ANCHOR_FORM_FIELD_MISSING_FIELD', 'FormField anchor requires Field.'),
        ];
        return this.buildResult(errors);
    }

    protected override GetSelectorHints(anchor: ITourAnchor): string[] {
        return anchor.Field ? [`[data-field-name="${anchor.Field}"]`] : [];
    }
}

@RegisterClass(BaseTourAnchorResolver, 'FormSection')
export class FormSectionAnchorResolver extends BaseTourAnchorResolver {
    public readonly ResolutionRung: TourAnchorResolution = 'Semantic';
    public override readonly RequiredCapabilities: TourCapabilityRequirement = { MJForms: true };

    public ValidateAnchor(anchor: ITourAnchor): TourValidationResult {
        return this.buildResult(
            requireField(anchor, 'SectionKey', 'ANCHOR_FORM_SECTION_MISSING_KEY', 'FormSection anchor requires SectionKey.'),
        );
    }

    protected override GetSelectorHints(anchor: ITourAnchor): string[] {
        return anchor.SectionKey ? [`[data-section-key="${anchor.SectionKey}"]`] : [];
    }
}

@RegisterClass(BaseTourAnchorResolver, 'FormRailGroup')
export class FormRailGroupAnchorResolver extends BaseTourAnchorResolver {
    public readonly ResolutionRung: TourAnchorResolution = 'Semantic';
    public override readonly RequiredCapabilities: TourCapabilityRequirement = { MJForms: true };

    public ValidateAnchor(anchor: ITourAnchor): TourValidationResult {
        return this.buildResult(
            requireField(anchor, 'RailKey', 'ANCHOR_FORM_RAIL_MISSING_KEY', 'FormRailGroup anchor requires RailKey.'),
        );
    }

    protected override GetSelectorHints(anchor: ITourAnchor): string[] {
        return anchor.RailKey ? [`[data-rail-key="${anchor.RailKey}"]`] : [];
    }
}

@RegisterClass(BaseTourAnchorResolver, 'FormToolbarAction')
export class FormToolbarActionAnchorResolver extends BaseTourAnchorResolver {
    public readonly ResolutionRung: TourAnchorResolution = 'Semantic';
    public override readonly RequiredCapabilities: TourCapabilityRequirement = { MJForms: true };

    public ValidateAnchor(anchor: ITourAnchor): TourValidationResult {
        return this.buildResult(
            requireField(anchor, 'ActionKey', 'ANCHOR_TOOLBAR_MISSING_KEY', 'FormToolbarAction anchor requires ActionKey.'),
        );
    }

    protected override GetSelectorHints(anchor: ITourAnchor): string[] {
        return anchor.ActionKey ? [`[data-toolbar-action="${anchor.ActionKey}"]`] : [];
    }
}

@RegisterClass(BaseTourAnchorResolver, 'NavItem')
export class NavItemAnchorResolver extends BaseTourAnchorResolver {
    public readonly ResolutionRung: TourAnchorResolution = 'Semantic';
    public override readonly RequiredCapabilities: TourCapabilityRequirement = { Navigation: ['MJ App'] };

    public ValidateAnchor(anchor: ITourAnchor): TourValidationResult {
        if (!anchor.NavItemKey?.trim() && !anchor.DriverClass?.trim()) {
            return this.buildResult([
                {
                    Code: 'ANCHOR_NAV_ITEM_MISSING_ID',
                    Message: 'NavItem anchor requires NavItemKey or DriverClass (never Label).',
                    Field: 'NavItemKey',
                    Severity: 'Error',
                },
            ]);
        }
        return this.buildResult([]);
    }

    protected override GetSelectorHints(anchor: ITourAnchor): string[] {
        const hints: string[] = [];
        if (anchor.NavItemKey) hints.push(`[data-nav-item-key="${anchor.NavItemKey}"]`);
        if (anchor.DriverClass) hints.push(`[data-driver-class="${anchor.DriverClass}"]`);
        return hints;
    }
}

@RegisterClass(BaseTourAnchorResolver, 'RailPage')
export class RailPageAnchorResolver extends BaseTourAnchorResolver {
    public readonly ResolutionRung: TourAnchorResolution = 'Semantic';
    public override readonly RequiredCapabilities: TourCapabilityRequirement = { Navigation: ['MJ App'] };

    public ValidateAnchor(anchor: ITourAnchor): TourValidationResult {
        return this.buildResult(
            requireField(anchor, 'PageId', 'ANCHOR_RAIL_PAGE_MISSING_ID', 'RailPage anchor requires PageId.'),
        );
    }

    protected override GetSelectorHints(anchor: ITourAnchor): string[] {
        return anchor.PageId ? [`[data-rail-page-id="${anchor.PageId}"]`] : [];
    }
}

@RegisterClass(BaseTourAnchorResolver, 'AppSwitcher')
export class AppSwitcherAnchorResolver extends BaseTourAnchorResolver {
    public readonly ResolutionRung: TourAnchorResolution = 'Semantic';
    public override readonly RequiredCapabilities: TourCapabilityRequirement = { Navigation: ['MJ App'] };

    public ValidateAnchor(_anchor: ITourAnchor): TourValidationResult {
        return this.buildResult([]);
    }

    protected override GetSelectorHints(anchor: ITourAnchor): string[] {
        return anchor.AppName
            ? [`[data-mj-tour-anchor="core.shell.app-switcher"][data-app-name="${anchor.AppName}"]`]
            : ['[data-mj-tour-anchor="core.shell.app-switcher"]'];
    }
}

@RegisterClass(BaseTourAnchorResolver, 'GridColumn')
export class GridColumnAnchorResolver extends BaseTourAnchorResolver {
    public readonly ResolutionRung: TourAnchorResolution = 'Semantic';

    public ValidateAnchor(anchor: ITourAnchor): TourValidationResult {
        return this.buildResult(
            requireField(anchor, 'ColumnKey', 'ANCHOR_GRID_COLUMN_MISSING_KEY', 'GridColumn anchor requires ColumnKey.'),
        );
    }

    protected override GetSelectorHints(anchor: ITourAnchor): string[] {
        return anchor.ColumnKey ? [`[data-column-key="${anchor.ColumnKey}"]`] : [];
    }
}

@RegisterClass(BaseTourAnchorResolver, 'Omnibar')
export class OmnibarAnchorResolver extends BaseTourAnchorResolver {
    public readonly ResolutionRung: TourAnchorResolution = 'Semantic';
    public override readonly RequiredCapabilities: TourCapabilityRequirement = { Navigation: ['MJ App'] };

    public ValidateAnchor(_anchor: ITourAnchor): TourValidationResult {
        return this.buildResult([]);
    }

    protected override GetSelectorHints(_anchor: ITourAnchor): string[] {
        return ['[data-mj-tour-anchor="core.shell.omnibar"]'];
    }
}

@RegisterClass(BaseTourAnchorResolver, 'ChatComposer')
export class ChatComposerAnchorResolver extends BaseTourAnchorResolver {
    public readonly ResolutionRung: TourAnchorResolution = 'Semantic';
    public override readonly RequiredCapabilities: TourCapabilityRequirement = {
        Agent: ['Chat', 'Chat and Voice'],
    };

    public ValidateAnchor(_anchor: ITourAnchor): TourValidationResult {
        return this.buildResult([]);
    }

    protected override GetSelectorHints(_anchor: ITourAnchor): string[] {
        return ['[data-mj-tour-anchor="core.chat.composer"]'];
    }
}

@RegisterClass(BaseTourAnchorResolver, 'Role')
export class RoleAnchorResolver extends BaseTourAnchorResolver {
    public readonly ResolutionRung: TourAnchorResolution = 'Role';

    public ValidateAnchor(anchor: ITourAnchor): TourValidationResult {
        return this.buildResult(
            requireField(anchor, 'Role', 'ANCHOR_ROLE_MISSING_ROLE', 'Role anchor requires Role.'),
        );
    }

    protected override GetSelectorHints(anchor: ITourAnchor): string[] {
        if (!anchor.Role) return [];
        return anchor.Name
            ? [`[role="${anchor.Role}"][aria-label="${anchor.Name}"]`]
            : [`[role="${anchor.Role}"]`];
    }
}

@RegisterClass(BaseTourAnchorResolver, 'Selector')
export class SelectorAnchorResolver extends BaseTourAnchorResolver {
    public readonly ResolutionRung: TourAnchorResolution = 'Selector';

    public ValidateAnchor(anchor: ITourAnchor): TourValidationResult {
        const errors = requireField(
            anchor,
            'Selector',
            'ANCHOR_SELECTOR_MISSING',
            'Selector anchor requires Selector.',
        );
        const warnings: TourValidationIssue[] = [
            {
                Code: 'ANCHOR_CSS_SELECTOR_FALLBACK',
                Message: 'CSS Selector anchors are brittle and flagged by the tour-anchors gate; prefer Registered or Semantic anchors.',
                Field: 'Selector',
                Severity: 'Warning',
            },
        ];
        return this.buildResult(errors, warnings);
    }

    protected override GetSelectorHints(anchor: ITourAnchor): string[] {
        return anchor.Selector ? [anchor.Selector] : [];
    }
}
