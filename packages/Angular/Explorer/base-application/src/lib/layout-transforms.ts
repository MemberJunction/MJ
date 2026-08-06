import { LayoutConfig, LayoutNode } from './interfaces/workspace-configuration.interface';

/**
 * A persisted layout node as golden-layout SERIALIZES it — carries GL's
 * size fields that aren't part of the workspace-facing LayoutNode contract.
 */
interface SerializedLayoutNode extends LayoutNode {
  size?: number | string;
  sizeUnit?: string;
  minSizeUnit?: string;
}

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
/**
 * Prepare a PERSISTED layout node tree for loading into golden-layout.
 *
 * Two jobs, both load-bearing:
 *
 * 1. NORMALIZE GL-serialized fields: `size` + `sizeUnit` combine into GL's
 *    single-string form ("50%"), invalid width/height are dropped, and GL
 *    internals (`minSizeUnit`) are stripped.
 *
 * 2. ISOLATE the persisted config from GL's runtime: every node is a fresh
 *    object and `componentState` is DEEP-CLONED. Golden Layout mutates
 *    container state at runtime (UpdateTabStyle Object.assigns into it) —
 *    handing it shared references would let those mutations reach back into
 *    the persisted workspace configuration object. The mobile flatten path
 *    already clones; this closes the same hole for DESKTOP restores (main
 *    layout AND records region), making "GL never holds persisted refs" a
 *    structural invariant rather than a per-path convention.
 */
export function SanitizeLayoutNodeForLoad(node: LayoutNode): LayoutNode {
  const source = node as SerializedLayoutNode;
  const sanitized: SerializedLayoutNode = { ...source };

  if (sanitized.componentState) {
    sanitized.componentState = structuredClone(sanitized.componentState);
  }

  // Combine size + sizeUnit into Golden Layout's single-string form
  if (sanitized.size !== undefined && sanitized.sizeUnit !== undefined && typeof sanitized.size === 'number') {
    sanitized.size = `${sanitized.size}${sanitized.sizeUnit}`;
    delete sanitized.sizeUnit;
  }

  // Drop width/height unless they're the string/number forms GL accepts
  if (sanitized.width !== undefined && typeof sanitized.width !== 'number' && typeof sanitized.width !== 'string') {
    delete sanitized.width;
  }
  if (sanitized.height !== undefined && typeof sanitized.height !== 'number' && typeof sanitized.height !== 'string') {
    delete sanitized.height;
  }

  // GL-internal field that must not round-trip into a load config
  delete sanitized.minSizeUnit;

  if (sanitized.content) {
    sanitized.content = sanitized.content.map(child => SanitizeLayoutNodeForLoad(child));
  }

  return sanitized;
}

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
