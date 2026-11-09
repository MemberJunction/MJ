import type { StackAction } from './golden-layout-wrapper.service';

/** The class of the group that holds a stack header's part buttons. */
export const STACK_PART_ACTIONS_CLASS = 'dashboard-stack-actions';

/** One part button: what it does, its label and icon, and the mjButton variant it looks like. */
interface StackPartActionSpec {
    Action: StackAction;
    Label: string;
    Icon: string;
    Variant: 'secondary' | 'flat';
}

const STACK_PART_ACTIONS: readonly StackPartActionSpec[] = [
    { Action: 'edit', Label: 'Edit part', Icon: 'fa-solid fa-sliders', Variant: 'secondary' },
    { Action: 'remove', Label: 'Remove', Icon: 'fa-solid fa-trash-can', Variant: 'flat' },
];

/**
 * The part buttons for a stack header. Golden Layout renders outside Angular, so each button is a plain
 * element with the classes that `<button mjButton [Variant] Size="sm">` applies (button.scss styles them).
 */
export function BuildStackPartActions(onAction: (action: StackAction) => void): HTMLElement {
    const group = document.createElement('div');
    group.className = STACK_PART_ACTIONS_CLASS;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Part actions');
    for (const spec of STACK_PART_ACTIONS) {
        group.appendChild(buildButton(spec, onAction));
    }
    return group;
}

/** Names each button for the active part, for example "Edit part Revenue" and "Remove Revenue". */
export function LabelStackPartActions(group: HTMLElement, partTitle: string): void {
    for (const button of Array.from(group.querySelectorAll<HTMLButtonElement>('button[data-stack-action]'))) {
        const label = button.dataset['label'] ?? '';
        button.setAttribute('aria-label', partTitle ? `${label} ${partTitle}` : label);
    }
}

function buildButton(spec: StackPartActionSpec, onAction: (action: StackAction) => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mj-btn mj-btn--${spec.Variant} mj-btn--sm`;
    button.dataset['stackAction'] = spec.Action;
    button.dataset['label'] = spec.Label;
    const icon = document.createElement('i');
    icon.className = spec.Icon;
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon, document.createTextNode(spec.Label)); // text nodes, no innerHTML
    button.addEventListener('click', () => onAction(spec.Action));
    return button;
}
