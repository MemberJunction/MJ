import { LayoutConfig, LayoutNode } from './interfaces/workspace-configuration.interface';

/**
 * Collapse a Golden Layout tree to ONE stack containing all component nodes
 * in visual order (row: left→right, column: top→bottom — i.e. simple
 * depth-first traversal of `content`).
 *
 * Used to render the records region single-stack on mobile WITHOUT rewriting
 * the persisted layout: callers load the RETURNED config into Golden Layout
 * while suppressing layout persistence, so the user's desktop split
 * arrangement survives the mobile session untouched.
 *
 * `componentState` is deep-cloned — Golden Layout mutates container state at
 * runtime (e.g. UpdateTabStyle Object.assigns into it), and a shared
 * reference would let those mutations reach back into the persisted tree.
 * Size fields (width/height/size) are intentionally dropped: they describe
 * the split geometry being flattened away.
 *
 * Returns null when the tree contains no component nodes (nothing to render).
 */
export function FlattenLayoutToSingleStack(config: LayoutConfig | undefined | null): LayoutConfig | null {
  const components: LayoutNode[] = [];

  const collect = (node: LayoutNode | undefined): void => {
    if (!node) {
      return;
    }
    if (node.type === 'component') {
      components.push({
        type: 'component',
        componentType: node.componentType,
        componentState: node.componentState ? structuredClone(node.componentState) : undefined,
        title: node.title,
        isClosable: node.isClosable
      });
      return;
    }
    node.content?.forEach(collect);
  };

  collect(config?.root);

  if (components.length === 0) {
    return null;
  }

  return {
    root: {
      type: 'stack',
      content: components
    }
  };
}
