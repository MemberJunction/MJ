import { describe, it, expect, vi } from 'vitest';
import {
  FindFormAnchorContainerByEntity,
  FormAnchorNavigator,
  GetFormAnchorContainerForElement,
  NavigateToFormAnchor,
  RegisterFormAnchorContainer,
  UnregisterFormAnchorContainer,
  type FormAnchorHostAdapter,
  type FormAnchorNavigationTarget,
} from '../lib/container/form-anchor-navigator';

interface MockClassList {
  add: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  contains: (name: string) => boolean;
}

interface MockElementStub {
  tagName: string;
  attributes: Record<string, string>;
  classList: MockClassList;
  scrollIntoView: ReturnType<typeof vi.fn>;
  querySelector: <T extends Element = Element>(selector: string) => T | null;
  querySelectorAll: <T extends Element = Element>(selector: string) => ArrayLike<T>;
  getAttribute: (name: string) => string | null;
  closest: (selector: string) => MockElementStub | null;
}

function createMockElement(
  tagName: string,
  attributes: Record<string, string> = {},
  selectorMap: Record<string, MockElementStub> = {},
  allByAttr: Record<string, MockElementStub[]> = {}
): MockElementStub {
  const classes = new Set<string>();
  return {
    tagName,
    attributes,
    classList: {
      add: vi.fn((cls: string) => {
        classes.add(cls);
      }),
      remove: vi.fn((cls: string) => {
        classes.delete(cls);
      }),
      contains: (cls: string) => classes.has(cls),
    },
    scrollIntoView: vi.fn(),
    querySelector: <T extends Element = Element>(selector: string): T | null => {
      return (selectorMap[selector] as unknown as T) ?? null;
    },
    querySelectorAll: <T extends Element = Element>(selector: string): ArrayLike<T> => {
      const attrMatch = /^\[([a-zA-Z0-9-]+)\]$/.exec(selector);
      if (attrMatch) {
        return (allByAttr[attrMatch[1]] ?? []) as unknown as ArrayLike<T>;
      }
      return [] as unknown as ArrayLike<T>;
    },
    getAttribute: (name: string) => attributes[name] ?? null,
    closest: () => null,
  };
}

function createAdapter(overrides: Partial<FormAnchorHostAdapter> = {}): {
  adapter: FormAnchorHostAdapter;
  activateGroup: ReturnType<typeof vi.fn>;
  toggleMore: ReturnType<typeof vi.fn>;
  expandSection: ReturnType<typeof vi.fn>;
  detectChanges: ReturnType<typeof vi.fn>;
} {
  const activateGroup = vi.fn();
  const toggleMore = vi.fn();
  const expandSection = vi.fn();
  const detectChanges = vi.fn();

  const adapter: FormAnchorHostAdapter = {
    HostElement: createMockElement('mj-record-form-container') as unknown as HTMLElement,
    IsDestroyed: false,
    ChromeLayout: 'left-nav',
    MoreExpanded: false,
    FirstClassGroups: [
      { Key: 'details', SectionKeys: ['details', 'address'] },
    ],
    MoreItems: [
      { Key: 'system', SectionKeys: ['system', 'audit'] },
    ],
    GetAllChromePanels: () => [
      { SectionKey: 'address', ClaimableFieldNames: ['City', 'State'] },
      { SectionKey: 'audit', ClaimableFieldNames: ['CreatedAt'] },
    ],
    ActivateChromeGroup: activateGroup,
    ToggleMoreFolder: toggleMore,
    ExpandSection: expandSection,
    DetectChanges: detectChanges,
    WaitForSettle: async () => Promise.resolve(),
    ...overrides,
  };

  return { adapter, activateGroup, toggleMore, expandSection, detectChanges };
}

describe('NavigateToFormAnchor / FormAnchorNavigator', () => {
  it('returns null when HostElement is missing or host is destroyed', async () => {
    const { adapter: missingHost } = createAdapter({ HostElement: null });
    expect(await NavigateToFormAnchor(missingHost, { AnchorType: 'Field', AnchorKey: 'Name' })).toBeNull();

    const { adapter: destroyedHost } = createAdapter({ IsDestroyed: true });
    expect(await NavigateToFormAnchor(destroyedHost, { AnchorType: 'Field', AnchorKey: 'Name' })).toBeNull();
  });

  it('switches first-class rail group, expands section, scrolls, pulses when requested, and returns target element', async () => {
    const fieldEl = createMockElement('div');
    const hostEl = createMockElement('mj-record-form-container', {}, {
      'mj-form-field[data-field-name="City"] .mj-forms-field': fieldEl,
    });
    const { adapter, activateGroup, toggleMore, expandSection, detectChanges } = createAdapter({
      HostElement: hostEl as unknown as HTMLElement,
    });

    const result = await FormAnchorNavigator.Navigate(adapter, {
      AnchorType: 'Field',
      AnchorKey: 'City',
      Pulse: true,
    });

    expect(activateGroup).toHaveBeenCalledWith('details');
    expect(toggleMore).not.toHaveBeenCalled();
    expect(expandSection).toHaveBeenCalledWith('address');
    expect(detectChanges).toHaveBeenCalledTimes(1);
    expect(fieldEl.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(fieldEl.classList.add).toHaveBeenCalledWith('mj-forms-comment-anchor-pulse');
    expect(result).toBe(fieldEl);
  });

  it('opens collapsed More folder when target section belongs to a More rail group', async () => {
    const sectionEl = createMockElement('div');
    const hostEl = createMockElement('mj-record-form-container', {}, {
      'mj-collapsible-panel[data-section-key="audit"] .mj-forms-panel': sectionEl,
    });
    const { adapter, activateGroup, toggleMore, expandSection } = createAdapter({
      HostElement: hostEl as unknown as HTMLElement,
      MoreExpanded: false,
    });

    const result = await NavigateToFormAnchor(adapter, {
      AnchorType: 'Section',
      AnchorKey: 'audit',
      ScrollBehavior: 'instant',
    });

    expect(toggleMore).toHaveBeenCalledTimes(1);
    expect(activateGroup).toHaveBeenCalledWith('system');
    expect(expandSection).toHaveBeenCalledWith('audit');
    expect(sectionEl.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'center' });
    expect(sectionEl.classList.add).not.toHaveBeenCalled();
    expect(result).toBe(sectionEl);
  });

  it('resolves RailGroup and ToolbarAction targets cleanly', async () => {
    const railEl = createMockElement('div', { 'data-rail-key': 'details' });
    const toolbarEl = createMockElement('button');
    const hostEl = createMockElement('mj-record-form-container', {}, {
      '[data-rail-key="details"]': railEl,
      'mj-form-toolbar .mj-forms-btn--history': toolbarEl,
    });
    const { adapter, activateGroup } = createAdapter({
      HostElement: hostEl as unknown as HTMLElement,
    });

    const railResult = await NavigateToFormAnchor(adapter, {
      AnchorType: 'RailGroup',
      AnchorKey: 'details',
    });
    expect(activateGroup).toHaveBeenCalledWith('details');
    expect(railResult).toBe(railEl);

    const toolbarResult = await NavigateToFormAnchor(adapter, {
      AnchorType: 'ToolbarAction',
      AnchorKey: 'history',
    });
    expect(toolbarResult).toBe(toolbarEl);
  });

  it('falls back to case-insensitive attribute match for fields when exact selector misses', async () => {
    const fieldEl = createMockElement('mj-form-field', { 'data-field-name': 'EmailAddress' });
    const hostEl = createMockElement(
      'mj-record-form-container',
      {},
      {},
      { 'data-field-name': [fieldEl] }
    );
    const { adapter } = createAdapter({
      HostElement: hostEl as unknown as HTMLElement,
    });

    const result = await NavigateToFormAnchor(adapter, {
      AnchorType: 'Field',
      AnchorKey: 'emailaddress',
    });
    expect(result).toBe(fieldEl);
  });

  it('registers and unregisters active form containers by element and entity name', () => {
    const el = createMockElement('mj-record-form-container') as unknown as HTMLElement;
    const target: FormAnchorNavigationTarget = {
      EntityName: 'MJ: Users',
      NavigateToTourAnchor: async () => null,
    };

    RegisterFormAnchorContainer(el, target);
    expect(GetFormAnchorContainerForElement(el)).toBe(target);
    expect(FindFormAnchorContainerByEntity('mj: users')).toBe(target);

    UnregisterFormAnchorContainer(el);
    expect(GetFormAnchorContainerForElement(el)).toBeNull();
    expect(FindFormAnchorContainerByEntity('MJ: Users')).toBeNull();
  });
});
