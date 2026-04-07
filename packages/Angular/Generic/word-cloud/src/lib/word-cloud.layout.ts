import { WordCloudItem, WordCloudLayoutItem } from './word-cloud.types';

/**
 * Configuration for the layout engine.
 */
export interface WordCloudLayoutConfig {
  MinFontSize: number;
  MaxFontSize: number;
  Layout: 'spiral' | 'rectangular';
  MaxItems: number;
}

/**
 * Axis-aligned bounding box for collision detection.
 */
interface BoundingBox {
  Left: number;
  Top: number;
  Right: number;
  Bottom: number;
}

/**
 * Estimates the width of a text string at a given font size.
 * Uses an average character width ratio since we cannot measure DOM elements
 * in a pure layout function.
 */
function estimateTextWidth(text: string, fontSize: number): number {
  // Average character width is roughly 0.6x the font size for sans-serif fonts
  const avgCharWidthRatio = 0.6;
  return text.length * fontSize * avgCharWidthRatio;
}

/**
 * Creates a bounding box for a word at a given position and font size,
 * accounting for rotation.
 */
function createBoundingBox(
  x: number,
  y: number,
  text: string,
  fontSize: number,
  rotation: number
): BoundingBox {
  const textWidth = estimateTextWidth(text, fontSize);
  const textHeight = fontSize * 1.2; // line-height factor
  const padding = fontSize * 0.15; // small padding between words

  // For 90-degree rotation, width and height swap
  const effectiveWidth = rotation === 90 ? textHeight : textWidth;
  const effectiveHeight = rotation === 90 ? textWidth : textHeight;

  return {
    Left: x - effectiveWidth / 2 - padding,
    Top: y - effectiveHeight / 2 - padding,
    Right: x + effectiveWidth / 2 + padding,
    Bottom: y + effectiveHeight / 2 + padding,
  };
}

/**
 * Checks whether two bounding boxes overlap.
 */
function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.Left < b.Right && a.Right > b.Left && a.Top < b.Bottom && a.Bottom > b.Top;
}

/**
 * Checks whether a candidate bounding box collides with any of the placed boxes.
 */
function hasCollision(candidate: BoundingBox, placed: BoundingBox[]): boolean {
  for (const box of placed) {
    if (boxesOverlap(candidate, box)) {
      return true;
    }
  }
  return false;
}

/**
 * Generates (x, y) positions along an Archimedean spiral from the center.
 */
function* spiralPositions(centerX: number, centerY: number, maxAttempts: number): Generator<{ X: number; Y: number }> {
  const spiralStep = 1; // angular step in radians
  const radiusGrowth = 2; // pixels per radian

  for (let i = 0; i < maxAttempts; i++) {
    const angle = spiralStep * i * 0.1;
    const radius = radiusGrowth * angle;
    yield {
      X: centerX + radius * Math.cos(angle),
      Y: centerY + radius * Math.sin(angle),
    };
  }
}

/**
 * Generates positions in a rectangular grid expanding from the center.
 */
function* rectangularPositions(centerX: number, centerY: number, maxAttempts: number): Generator<{ X: number; Y: number }> {
  const step = 8;
  yield { X: centerX, Y: centerY };
  let attempt = 1;

  for (let ring = 1; attempt < maxAttempts; ring++) {
    const offset = ring * step;
    // Top and bottom edges
    for (let dx = -offset; dx <= offset && attempt < maxAttempts; dx += step) {
      yield { X: centerX + dx, Y: centerY - offset };
      attempt++;
      yield { X: centerX + dx, Y: centerY + offset };
      attempt++;
    }
    // Left and right edges (excluding corners)
    for (let dy = -offset + step; dy < offset && attempt < maxAttempts; dy += step) {
      yield { X: centerX - offset, Y: centerY + dy };
      attempt++;
      yield { X: centerX + offset, Y: centerY + dy };
      attempt++;
    }
  }
}

/**
 * Maps a weight (0-1) to a font size between min and max.
 */
function weightToFontSize(weight: number, minFont: number, maxFont: number): number {
  const clamped = Math.max(0, Math.min(1, weight));
  return minFont + clamped * (maxFont - minFont);
}

/**
 * Decides whether a word should be rotated (90 degrees) based on its index.
 * Roughly 20% of words are rotated for visual variety.
 */
function shouldRotate(index: number): boolean {
  // Deterministic pseudo-random based on index
  return index % 5 === 3;
}

/**
 * Computes the layout for all word cloud items, returning positioned items
 * and the overall bounding viewBox.
 */
export function computeWordCloudLayout(
  items: WordCloudItem[],
  config: WordCloudLayoutConfig
): { Items: WordCloudLayoutItem[]; ViewBox: string } {
  if (!items || items.length === 0) {
    return { Items: [], ViewBox: '0 0 100 100' };
  }

  // Take top N items by weight
  const sorted = [...items]
    .sort((a, b) => b.Weight - a.Weight)
    .slice(0, config.MaxItems);

  const placedBoxes: BoundingBox[] = [];
  const layoutItems: WordCloudLayoutItem[] = [];
  const maxAttempts = 500;

  const centerX = 0;
  const centerY = 0;

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const fontSize = weightToFontSize(item.Weight, config.MinFontSize, config.MaxFontSize);
    const rotation = shouldRotate(i) ? 90 : 0;

    const positionGenerator =
      config.Layout === 'rectangular'
        ? rectangularPositions(centerX, centerY, maxAttempts)
        : spiralPositions(centerX, centerY, maxAttempts);

    let placed = false;

    for (const pos of positionGenerator) {
      const box = createBoundingBox(pos.X, pos.Y, item.Text, fontSize, rotation);

      if (!hasCollision(box, placedBoxes)) {
        placedBoxes.push(box);
        layoutItems.push({
          ...item,
          FontSize: fontSize,
          X: pos.X,
          Y: pos.Y,
          Rotation: rotation,
          Color: '', // assigned by the component based on ColorMode
          Opacity: 1,
          Index: layoutItems.length,
        });
        placed = true;
        break;
      }
    }

    // If no position found after maxAttempts, skip the word
    if (!placed) {
      continue;
    }
  }

  // Compute the overall bounding box for the viewBox
  const viewBox = computeViewBox(placedBoxes);

  return { Items: layoutItems, ViewBox: viewBox };
}

/**
 * Computes an SVG viewBox string that fits all placed bounding boxes
 * with a small amount of padding.
 */
function computeViewBox(boxes: BoundingBox[]): string {
  if (boxes.length === 0) {
    return '0 0 100 100';
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const box of boxes) {
    if (box.Left < minX) minX = box.Left;
    if (box.Top < minY) minY = box.Top;
    if (box.Right > maxX) maxX = box.Right;
    if (box.Bottom > maxY) maxY = box.Bottom;
  }

  const padding = 20;
  const x = minX - padding;
  const y = minY - padding;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;

  return `${x} ${y} ${width} ${height}`;
}
