/**
 * A single item to display in the word cloud.
 */
export interface WordCloudItem {
  /** Display text */
  Text: string;
  /** Weight / importance (0.0 - 1.0) - determines font size */
  Weight: number;
  /** Optional category for color grouping in 'categorical' color mode */
  Category?: string;
  /** Optional arbitrary metadata passed through click/hover events */
  Metadata?: Record<string, unknown>;
}

/**
 * Event payload emitted when the user interacts with a word cloud item.
 */
export interface WordCloudItemEvent {
  /** The item that was interacted with */
  Item: WordCloudItem;
  /** The original DOM event */
  Event: MouseEvent;
}

/**
 * Internal representation of a word cloud item after layout computation.
 */
export interface WordCloudLayoutItem extends WordCloudItem {
  /** Computed font size in pixels */
  FontSize: number;
  /** Computed X position (center of the text) */
  X: number;
  /** Computed Y position (center of the text) */
  Y: number;
  /** Rotation in degrees (0 or 90) */
  Rotation: number;
  /** Computed CSS color string */
  Color: string;
  /** Computed opacity (used in weight-gradient mode) */
  Opacity: number;
  /** Index for animation staggering */
  Index: number;
}
