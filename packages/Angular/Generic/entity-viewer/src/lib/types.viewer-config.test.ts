import { describe, it, expect } from 'vitest';
import { DEFAULT_VIEWER_CONFIG, ResolveViewerConfig } from './types';

describe('ResolveViewerConfig', () => {
  it('defaults to workspace chrome with the Explorer header on', () => {
    const cfg = ResolveViewerConfig();
    expect(cfg.chrome).toBe('workspace');
    expect(cfg.showFilter).toBe(true);
    expect(cfg.showViewModeToggle).toBe(true);
    expect(cfg.showRecordCount).toBe(true);
    expect(cfg.showPagination).toBe(true);
    expect(cfg.pageSize).toBe(DEFAULT_VIEWER_CONFIG.pageSize);
  });

  it('embedded chrome turns off header filter, toggle, count, and pagination', () => {
    const cfg = ResolveViewerConfig({ chrome: 'embedded' });
    expect(cfg.showFilter).toBe(false);
    expect(cfg.showViewModeToggle).toBe(false);
    expect(cfg.showRecordCount).toBe(false);
    expect(cfg.showPagination).toBe(false);
    expect(cfg.pageSize).toBe(8);
  });

  it('explicit booleans win over the embedded preset', () => {
    const cfg = ResolveViewerConfig({ chrome: 'embedded', showFilter: true, pageSize: 12 });
    expect(cfg.showFilter).toBe(true);
    expect(cfg.showPagination).toBe(false);
    expect(cfg.pageSize).toBe(12);
  });
});
