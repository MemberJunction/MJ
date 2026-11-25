import { afterEach, describe, expect, it } from 'vitest';
import { SiblingInertManager } from '../lib/overlay/sibling-inert';

describe('SiblingInertManager', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sets inert on unrelated siblings while keeping spotlighted target, its ancestors, overlay, and live region active', () => {
    const shellHeader = document.createElement('header');
    const preInertDrawer = document.createElement('aside');
    preInertDrawer.inert = true;

    const mainSection = document.createElement('main');
    const targetParent = document.createElement('div');
    const target = document.createElement('button');
    target.textContent = 'Target';
    const targetSibling = document.createElement('button');
    targetSibling.textContent = 'Sibling';
    targetParent.append(target, targetSibling);
    mainSection.appendChild(targetParent);

    const overlay = document.createElement('div');
    overlay.className = 'mjt-dialog';
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');

    document.body.append(shellHeader, preInertDrawer, mainSection, overlay, liveRegion);

    const manager = new SiblingInertManager();
    manager.Apply([overlay, liveRegion, target], document.body);

    expect(shellHeader.inert).toBe(true);
    expect(shellHeader.hasAttribute('inert')).toBe(true);
    expect(targetSibling.inert).toBe(true);
    expect(Boolean(mainSection.inert)).toBe(false);
    expect(Boolean(targetParent.inert)).toBe(false);
    expect(Boolean(target.inert)).toBe(false);
    expect(Boolean(overlay.inert)).toBe(false);
    expect(Boolean(liveRegion.inert)).toBe(false);

    manager.Restore();

    expect(Boolean(shellHeader.inert)).toBe(false);
    expect(shellHeader.hasAttribute('inert')).toBe(false);
    expect(Boolean(targetSibling.inert)).toBe(false);
    // Preserves pre-existing inert state
    expect(preInertDrawer.inert).toBe(true);
  });
});
