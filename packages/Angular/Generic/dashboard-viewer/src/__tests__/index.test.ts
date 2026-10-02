import { describe, it, expect } from 'vitest';
import * as publicApi from '../public-api';
import {
  DashboardViewerModule,
  DashboardViewerComponent,
  GoldenLayoutWrapperService,
  DashboardLayoutPreviewComponent,
  DashboardLayoutPreviewNodeComponent,
  BuildDashboardLayoutPreview,
} from '../public-api';

/**
 * Entry-point smoke test: importing the public entry must succeed (catches
 * broken exports / import-graph breakage) and the load-bearing symbols the
 * package exists to provide must be real constructors.
 */
describe('@memberjunction/ng-dashboard-viewer', () => {
  it('exposes a non-empty public export surface', () => {
    expect(Object.keys(publicApi).length).toBeGreaterThan(0);
  });

  it('exports its load-bearing classes as constructors', () => {
    expect(DashboardViewerModule).toBeTypeOf('function');
    expect(DashboardViewerComponent).toBeTypeOf('function');
    expect(GoldenLayoutWrapperService).toBeTypeOf('function');
  });

  it('exports the layout preview: its component, the node component a host must declare with it, and the helper', () => {
    expect(DashboardLayoutPreviewComponent).toBeTypeOf('function');
    expect(DashboardLayoutPreviewNodeComponent).toBeTypeOf('function');
    expect(BuildDashboardLayoutPreview('{"layout":{"root":{"type":"stack","content":[{"type":"component","title":"A"}]}}}')).toEqual({
      Kind: 'panel',
      Weight: 1,
      Title: 'A',
      Icon: null,
    });
  });
});
