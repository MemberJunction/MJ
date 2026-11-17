import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { ComponentVersionDiffComponent } from './component-version-diff.component';

function makeVersion(
  id: string,
  num: number,
  content: string,
  provider?: IMetadataProvider,
): MJArtifactVersionEntity {
  const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
  Object.defineProperties(ver, {
    ID: { value: id, enumerable: true },
    ArtifactID: { value: 'art-comp-1', enumerable: true },
    VersionNumber: { value: num, enumerable: true },
    Content: { value: content, enumerable: true },
    ...(provider ? { ProviderToUse: { value: provider, enumerable: true } } : {}),
  });
  return ver;
}

afterEach(() => TestBed.resetTestingModule());

describe('ComponentVersionDiffComponent DOM', () => {
  it('renders ComponentSpec changeRequest banner and code diff', () => {
    const f = renderComponentFixture(ComponentVersionDiffComponent, {
      imports: [ComponentVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('cv1', 1, JSON.stringify({ name: 'Card', code: 'return <div>1</div>;' })),
        TargetVersion: makeVersion(
          'cv2',
          2,
          JSON.stringify({
            name: 'Card',
            changeRequest: { userRequest: 'Make header bold', type: 'style' },
            code: 'return <h1>1</h1>;',
          }),
        ),
      },
    });
    f.detectChanges();
    expect(query(f, '[data-testid="component-visual-version-diff"]')).not.toBeNull();
    expect(queryAll(f, '[data-testid="comp-diff-change-request"]').length).toBe(1);
  });

  it('tracks changed code units in DiffResult', () => {
    const f = renderComponentFixture(ComponentVersionDiffComponent, {
      imports: [ComponentVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('cv1', 1, JSON.stringify({ name: 'Chart', code: 'return <span/>;' })),
        TargetVersion: makeVersion('cv2', 2, JSON.stringify({ name: 'Chart', code: 'return <div/>;' })),
      },
    });
    f.detectChanges();
    expect(f.componentInstance.ChangedCodeUnitsCount).toBeGreaterThanOrEqual(1);
  });

  it('switches ActiveTab cleanly via SetTab', () => {
    const f = renderComponentFixture(ComponentVersionDiffComponent, {
      imports: [ComponentVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('cv1', 1, JSON.stringify({ name: 'A', code: 'x' })),
        TargetVersion: makeVersion('cv2', 2, JSON.stringify({ name: 'B', code: 'y' })),
      },
    });
    f.detectChanges();
    f.componentInstance.SetTab('code');
    f.detectChanges();
    expect(f.componentInstance.ActiveTab).toBe('code');
  });

  it('blocks live preview mounting when EvaluateComponentPermissions denies read access on a version', () => {
    const restrictedEntity = Object.assign(Object.create(null) as EntityInfo, {
      Name: 'Secret Records',
      GetUserPermisions: () => ({ CanRead: false }),
    });
    const allowedEntity = Object.assign(Object.create(null) as EntityInfo, {
      Name: 'Public Records',
      GetUserPermisions: () => ({ CanRead: true }),
    });
    const fakeUser = Object.assign(Object.create(null) as UserInfo, { ID: 'u-1', Name: 'Reader' });
    const mockProvider = Object.assign(Object.create(null) as IMetadataProvider, {
      CurrentUser: fakeUser,
      EntityByName: (name: string) => {
        if (name === 'Secret Records') return restrictedEntity;
        if (name === 'Public Records') return allowedEntity;
        return undefined;
      },
    });

    const baseContent = JSON.stringify({
      name: 'AllowedCard',
      code: 'return <div>Public</div>;',
      dataRequirements: { entities: [{ name: 'Public Records' }] },
    });
    const targetContent = JSON.stringify({
      name: 'RestrictedCard',
      code: 'return <div>Secret</div>;',
      dataRequirements: { entities: [{ name: 'Secret Records' }] },
    });

    const f = renderComponentFixture(ComponentVersionDiffComponent, {
      imports: [ComponentVersionDiffComponent],
      inputs: {
        BaseVersion: makeVersion('cv1', 1, baseContent, mockProvider),
        TargetVersion: makeVersion('cv2', 2, targetContent, mockProvider),
      },
    });
    f.detectChanges();
    f.componentInstance.SetTab('preview');
    f.detectChanges();

    expect(query(f, '[data-testid="comp-diff-base-permission-blocked"]')).toBeNull();
    expect(query(f, '[data-testid="comp-diff-target-permission-blocked"]')).not.toBeNull();
    expect(text(f, '[data-testid="comp-diff-target-permission-blocked"]')).toContain('Secret Records');
  });

  it('fails closed and blocks preview mounting when provider has no CurrentUser', () => {
    const providerWithoutUser = Object.assign(Object.create(null) as IMetadataProvider, {
      CurrentUser: undefined,
      EntityByName: () => undefined,
    });
    const baseContent = JSON.stringify({
      name: 'BaseWidget',
      code: 'return <div>Base</div>;',
    });
    const targetContent = JSON.stringify({
      name: 'TargetWidget',
      code: 'return <div>Target</div>;',
    });

    const f = renderComponentFixture(ComponentVersionDiffComponent, {
      imports: [ComponentVersionDiffComponent],
      inputs: {
        Provider: providerWithoutUser,
        BaseVersion: makeVersion('cv1', 1, baseContent, providerWithoutUser),
        TargetVersion: makeVersion('cv2', 2, targetContent, providerWithoutUser),
      },
    });
    f.detectChanges();
    f.componentInstance.SetTab('preview');
    f.detectChanges();

    expect(query(f, '[data-testid="comp-diff-base-permission-blocked"]')).not.toBeNull();
    expect(query(f, '[data-testid="comp-diff-target-permission-blocked"]')).not.toBeNull();
    expect(queryAll(f, 'mj-react-component').length).toBe(0);
  });
});
