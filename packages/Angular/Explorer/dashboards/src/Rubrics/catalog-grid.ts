import { AllCommunityModule, ModuleRegistry, themeAlpine, type Theme } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

/** Alpine theme bound to the Explorer color tokens. */
export function CatalogGridTheme(): Theme {
    return themeAlpine.withParams({
        backgroundColor: 'var(--mj-bg-surface)',
        foregroundColor: 'var(--mj-text-primary)',
        textColor: 'var(--mj-text-primary)',
        borderColor: 'var(--mj-border-default)',
        chromeBackgroundColor: 'var(--mj-bg-surface-card)',
        headerBackgroundColor: 'var(--mj-bg-surface-card)',
        headerTextColor: 'var(--mj-text-secondary)',
        cellTextColor: 'var(--mj-text-primary)',
        subtleTextColor: 'var(--mj-text-muted)',
        dataBackgroundColor: 'var(--mj-bg-surface)',
        oddRowBackgroundColor: 'var(--mj-bg-surface-card)',
        accentColor: 'var(--mj-brand-primary)',
        borderRadius: 'var(--mj-radius-sm)',
        browserColorScheme: 'inherit',
    });
}
