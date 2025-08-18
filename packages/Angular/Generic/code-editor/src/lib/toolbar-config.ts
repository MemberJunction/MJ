import { Type } from '@angular/core';
import { EditorView } from '@codemirror/view';

/**
 * Configuration for a single toolbar button
 */
export interface ToolbarButton {
  /** Unique identifier for the button */
  id: string;
  /** Font Awesome icon class */
  icon: string;
  /** Tooltip text shown on hover */
  tooltip?: string;
  /** Optional text label to display alongside icon */
  label?: string;
  /** Position within the toolbar */
  position?: 'left' | 'right';
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Whether the button is visible */
  visible?: boolean;
  /** Handler function called when button is clicked */
  handler?: (editor: EditorView) => void | Promise<void>;
  /** Optional custom component to render instead of default button */
  customRenderer?: Type<any>;
}

/**
 * Group of toolbar buttons
 */
export interface ToolbarButtonGroup {
  /** Unique identifier for the group */
  id: string;
  /** Buttons in this group */
  buttons: ToolbarButton[];
  /** Whether to show a separator after this group */
  separator?: boolean;
}

/**
 * Main toolbar configuration
 */
export interface ToolbarConfig {
  /** Whether the toolbar is enabled (defaults to false) */
  enabled: boolean;
  /** Position of the toolbar relative to editor */
  position?: 'top' | 'bottom';
  /** Individual buttons (simple configuration) */
  buttons?: ToolbarButton[];
  /** Button groups (advanced configuration) */
  groups?: ToolbarButtonGroup[];
  /** Custom CSS class to apply to toolbar */
  customClass?: string;
}

/**
 * Event emitted when a toolbar button is clicked
 */
export interface ToolbarActionEvent {
  /** ID of the button that was clicked */
  buttonId: string;
  /** Reference to the editor instance */
  editor: EditorView;
}

/**
 * Pre-defined toolbar buttons for common operations
 */
export const TOOLBAR_BUTTONS = {
  COPY: {
    id: 'copy',
    icon: 'fa-regular fa-copy',
    tooltip: 'Copy to clipboard',
    handler: async (editor: EditorView) => {
      const text = editor.state.doc.toString();
      try {
        await navigator.clipboard.writeText(text);
        // Could emit success event here
      } catch (err) {
        console.error('Failed to copy text:', err);
      }
    }
  } as ToolbarButton,
  
  CUT: {
    id: 'cut',
    icon: 'fa-solid fa-scissors',
    tooltip: 'Cut',
    handler: async (editor: EditorView) => {
      const text = editor.state.doc.toString();
      try {
        await navigator.clipboard.writeText(text);
        // Clear the editor
        editor.dispatch({
          changes: { from: 0, to: editor.state.doc.length, insert: '' }
        });
      } catch (err) {
        console.error('Failed to cut text:', err);
      }
    }
  } as ToolbarButton,
  
  PASTE: {
    id: 'paste',
    icon: 'fa-solid fa-paste',
    tooltip: 'Paste from clipboard',
    handler: async (editor: EditorView) => {
      try {
        const text = await navigator.clipboard.readText();
        const pos = editor.state.selection.main.head;
        editor.dispatch({
          changes: { from: pos, to: pos, insert: text }
        });
      } catch (err) {
        console.error('Failed to paste text:', err);
      }
    }
  } as ToolbarButton,
  
  UNDO: {
    id: 'undo',
    icon: 'fa-solid fa-undo',
    tooltip: 'Undo',
    handler: (editor: EditorView) => {
      // CodeMirror will handle undo through its own commands
      editor.focus();
      document.execCommand('undo');
    }
  } as ToolbarButton,
  
  REDO: {
    id: 'redo',
    icon: 'fa-solid fa-redo',
    tooltip: 'Redo',
    handler: (editor: EditorView) => {
      // CodeMirror will handle redo through its own commands
      editor.focus();
      document.execCommand('redo');
    }
  } as ToolbarButton,
  
  FORMAT: {
    id: 'format',
    icon: 'fa-solid fa-indent',
    tooltip: 'Format code',
    handler: (editor: EditorView) => {
      // This would need language-specific formatting
      console.log('Format not yet implemented');
    }
  } as ToolbarButton,
  
  SEARCH: {
    id: 'search',
    icon: 'fa-solid fa-search',
    tooltip: 'Search',
    handler: (editor: EditorView) => {
      // Open CodeMirror search panel
      editor.focus();
      // This would need to trigger CodeMirror's search command
      console.log('Search not yet implemented');
    }
  } as ToolbarButton,
  
  FULLSCREEN: {
    id: 'fullscreen',
    icon: 'fa-solid fa-expand',
    tooltip: 'Toggle fullscreen',
    handler: (editor: EditorView) => {
      const container = editor.dom.closest('.mj-code-editor-wrapper');
      if (container) {
        container.classList.toggle('fullscreen');
        // Update icon
        const button = container.querySelector('[data-button-id="fullscreen"] i');
        if (button) {
          button.className = container.classList.contains('fullscreen') 
            ? 'fa-solid fa-compress' 
            : 'fa-solid fa-expand';
        }
      }
    }
  } as ToolbarButton,
  
  SELECT_ALL: {
    id: 'select-all',
    icon: 'fa-solid fa-i-cursor',
    tooltip: 'Select all',
    handler: (editor: EditorView) => {
      editor.dispatch({
        selection: { anchor: 0, head: editor.state.doc.length }
      });
      editor.focus();
    }
  } as ToolbarButton,
  
  CLEAR: {
    id: 'clear',
    icon: 'fa-solid fa-eraser',
    tooltip: 'Clear editor',
    handler: (editor: EditorView) => {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: '' }
      });
    }
  } as ToolbarButton
};

/**
 * Helper function to create a simple copy button configuration
 */
export function createCopyButton(customLabel?: string): ToolbarButton {
  return {
    ...TOOLBAR_BUTTONS.COPY,
    label: customLabel
  };
}

/**
 * Helper function to create a toolbar with just a copy button
 */
export function createCopyOnlyToolbar(): ToolbarConfig {
  return {
    enabled: true,
    buttons: [TOOLBAR_BUTTONS.COPY]
  };
}