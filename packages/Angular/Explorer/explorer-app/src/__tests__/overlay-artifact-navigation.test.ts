// Load the JIT compiler BEFORE any Angular library evaluates: npm-published Angular
// packages ship partial declarations whose static initializers need the compiler facade.
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { MJExplorerAppComponent } from '../public-api';

describe('MJExplorerAppComponent.OnOverlayNavigationRequested', () => {
  it('opens an artifact the chat overlay asks for in its own tab', async () => {
    const app: MJExplorerAppComponent = Object.create(MJExplorerAppComponent.prototype);
    const openArtifact = vi.fn(() => 'tab-9');
    const openNavItem = vi.fn(async () => null);
    Object.assign(app, { navigationService: { OpenArtifact: openArtifact, OpenNavItemByName: openNavItem, SwitchToApp: vi.fn() } });

    await app.OnOverlayNavigationRequested({ navItemName: '', ArtifactID: 'art-9', ArtifactName: 'Sales — Live Sheet' });

    expect(openArtifact).toHaveBeenCalledWith('art-9', 'Sales — Live Sheet');
    expect(openNavItem).not.toHaveBeenCalled();
  });
});
