// Load the JIT compiler BEFORE any Angular library evaluates: npm-published Angular
// packages ship partial declarations whose static initializers need the compiler facade.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import * as publicApi from '../public-api';
import { ArtifactsModule, BaseArtifactViewerPluginComponent, ArtifactIconService } from '../public-api';

/**
 * Entry-point smoke test: importing the public entry must succeed (catches
 * broken exports / import-graph breakage) and the load-bearing symbols the
 * package exists to provide must be real constructors.
 */
describe('@memberjunction/ng-artifacts', () => {
  it('exposes a non-empty public export surface', () => {
    expect(Object.keys(publicApi).length).toBeGreaterThan(0);
  });

  it('exports its load-bearing classes as constructors', () => {
    expect(ArtifactsModule).toBeTypeOf('function');
    expect(BaseArtifactViewerPluginComponent).toBeTypeOf('function');
    expect(ArtifactIconService).toBeTypeOf('function');
  });

  it('normalizes Font Awesome Pro-only metadata icons to Font Awesome Free equivalents', () => {
    const svc = new ArtifactIconService();
    expect(svc.NormalizeMetadataIcon('fa-solid fa-brackets-curly')).toBe('fa-solid fa-file-code');
    expect(svc.NormalizeMetadataIcon('fa-solid fa-chart-mixed')).toBe('fa-solid fa-chart-line');
    expect(svc.NormalizeMetadataIcon('fa-solid fa-ts')).toBe('fa-solid fa-file-code');
    expect(svc.NormalizeMetadataIcon('fa-solid fa-table')).toBe('fa-solid fa-table');
  });
});
