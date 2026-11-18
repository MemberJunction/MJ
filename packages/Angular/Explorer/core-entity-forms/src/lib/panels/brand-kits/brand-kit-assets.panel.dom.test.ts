import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MJBrandKitEntity } from '@memberjunction/core-entities';
import type { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { BrandKitAssetsPanelComponent } from './brand-kit-assets.panel';

@Component({ standalone: true, selector: 'mj-collapsible-panel', template: '<ng-content></ng-content>' })
class CollapsiblePanelStub {
  @Input() SectionKey = '';
  @Input() SectionName = '';
  @Input() Icon = '';
  @Input() Order: number | null = null;
  @Input() Form: unknown;
  @Input() FormContext: unknown;
}

@Component({
  standalone: true,
  selector: 'mj-brand-kit-assets-editor',
  template: '<div data-testid="stub-assets-editor">{{ BrandKit?.Name }}</div>',
})
class AssetsEditorStub {
  @Input() BrandKit: MJBrandKitEntity | null = null;
  @Input() Provider: unknown = null;
  @Input() Readonly = false;
}

describe('BrandKitAssetsPanelComponent (DOM)', () => {
  it('mounts mj-brand-kit-assets-editor with the host Record', () => {
    TestBed.configureTestingModule({
      imports: [CollapsiblePanelStub, AssetsEditorStub],
      declarations: [BrandKitAssetsPanelComponent],
    });
    const fixture = TestBed.createComponent(BrandKitAssetsPanelComponent);
    fixture.componentRef.setInput('Record', { ID: 'KIT-1', Name: 'Studio Kit' } as unknown as MJBrandKitEntity);
    fixture.componentRef.setInput('FormComponent', { ProviderToUse: { ID: 'PROV' } } as unknown as BaseFormComponent);
    fixture.detectChanges();

    const editor = fixture.nativeElement.querySelector('[data-testid="stub-assets-editor"]');
    expect(editor).not.toBeNull();
    expect(editor.textContent).toContain('Studio Kit');
  });

  it('forwards FormComponent.ProviderToUse via HostProvider getter', () => {
    TestBed.configureTestingModule({
      imports: [CollapsiblePanelStub, AssetsEditorStub],
      declarations: [BrandKitAssetsPanelComponent],
    });
    const fixture = TestBed.createComponent(BrandKitAssetsPanelComponent);
    const fakeProvider = { CurrentUser: { ID: 'U1' } };
    fixture.componentRef.setInput('FormComponent', { ProviderToUse: fakeProvider } as unknown as BaseFormComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.HostProvider).toBe(fakeProvider);
  });

  it('returns null HostProvider when FormComponent is not set', () => {
    TestBed.configureTestingModule({
      imports: [CollapsiblePanelStub, AssetsEditorStub],
      declarations: [BrandKitAssetsPanelComponent],
    });
    const fixture = TestBed.createComponent(BrandKitAssetsPanelComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.HostProvider).toBeNull();
  });
});
