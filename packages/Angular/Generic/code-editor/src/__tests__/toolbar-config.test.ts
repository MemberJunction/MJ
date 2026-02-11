import { describe, it, expect } from 'vitest';
import {
  TOOLBAR_BUTTONS,
  createCopyButton,
  createCopyOnlyToolbar
} from '../lib/toolbar-config';
import type { ToolbarButton, ToolbarConfig } from '../lib/toolbar-config';

describe('TOOLBAR_BUTTONS', () => {
  it('should define COPY button', () => {
    expect(TOOLBAR_BUTTONS.COPY.id).toBe('copy');
    expect(TOOLBAR_BUTTONS.COPY.icon).toBe('fa-regular fa-copy');
    expect(TOOLBAR_BUTTONS.COPY.tooltip).toBe('Copy to clipboard');
    expect(typeof TOOLBAR_BUTTONS.COPY.handler).toBe('function');
  });

  it('should define CUT button', () => {
    expect(TOOLBAR_BUTTONS.CUT.id).toBe('cut');
    expect(TOOLBAR_BUTTONS.CUT.icon).toBe('fa-solid fa-scissors');
  });

  it('should define PASTE button', () => {
    expect(TOOLBAR_BUTTONS.PASTE.id).toBe('paste');
  });

  it('should define UNDO button', () => {
    expect(TOOLBAR_BUTTONS.UNDO.id).toBe('undo');
  });

  it('should define REDO button', () => {
    expect(TOOLBAR_BUTTONS.REDO.id).toBe('redo');
  });

  it('should define FORMAT button', () => {
    expect(TOOLBAR_BUTTONS.FORMAT.id).toBe('format');
  });

  it('should define SEARCH button', () => {
    expect(TOOLBAR_BUTTONS.SEARCH.id).toBe('search');
  });

  it('should define FULLSCREEN button', () => {
    expect(TOOLBAR_BUTTONS.FULLSCREEN.id).toBe('fullscreen');
  });

  it('should define SELECT_ALL button', () => {
    expect(TOOLBAR_BUTTONS.SELECT_ALL.id).toBe('select-all');
  });

  it('should define CLEAR button', () => {
    expect(TOOLBAR_BUTTONS.CLEAR.id).toBe('clear');
  });

  it('should have unique IDs for all buttons', () => {
    const ids = Object.values(TOOLBAR_BUTTONS).map(b => b.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('createCopyButton', () => {
  it('should create a copy button based on COPY preset', () => {
    const btn = createCopyButton();
    expect(btn.id).toBe('copy');
    expect(btn.icon).toBe('fa-regular fa-copy');
    expect(btn.label).toBeUndefined();
  });

  it('should accept custom label', () => {
    const btn = createCopyButton('Copy Code');
    expect(btn.label).toBe('Copy Code');
    expect(btn.id).toBe('copy');
  });
});

describe('createCopyOnlyToolbar', () => {
  it('should create enabled toolbar with single copy button', () => {
    const config = createCopyOnlyToolbar();
    expect(config.enabled).toBe(true);
    expect(config.buttons).toHaveLength(1);
    expect(config.buttons![0].id).toBe('copy');
  });
});
