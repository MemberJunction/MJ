/**
 * Internal contract between the pure layout modules, the controller, the frame
 * and the chart templates (spec §7). NOT exported from public-api.ts — free to
 * change without a breaking release.
 */
import { BarOrientation } from '../chart.types';

/** Pixel size of the SVG drawing surface handed to a layout. */
export interface PlotSize { Width: number; Height: number; }

/** Plot area inside the SVG after axis margins. */
export interface PlotBox { X: number; Y: number; Width: number; Height: number; }

/** Measures rendered text width in px. */
export type TextMeasure = (text: string) => number;

/**
 * Every px measure the layouts derive from the chart's font size (see TypeMetrics in scales.ts),
 * so axes, legend rows and labels scale together instead of assuming 12px text.
 */
export interface ChartTypeMetrics {
    FontSize: number;
    LineHeight: number;
    AxisGap: number;
    ValueAxisThickness: number;
    LegendRowHeight: number;
    LegendSwatch: number;
}

/** What the frame hands a chart once it knows its size. `FontSize` is the px size `Measure` was calibrated for. */
export interface ChartSurface { Size: PlotSize; Measure: TextMeasure; FontSize: number; }

/** Horizontal text anchoring of a tick label; the area chart anchors its first/last category label inward so it never leaves the SVG. */
export type AxisTickAnchor = 'start' | 'middle' | 'end';

export interface AxisTick { Position: number; Label: string; FullLabel: string; Key: string; Anchor: AxisTickAnchor; }

export interface BarSegment {
    SeriesIndex: number;
    CategoryIndex: number;
    X: number;
    Y: number;
    Width: number;
    Height: number;
    /** > 0 only on the segment farthest from the baseline in its direction. */
    CornerRadius: number;
    /** Rectangle with only the far end rounded. */
    Path: string;
    Value: number;
    Fill: string;
    /** `${SeriesIndex}:${CategoryIndex}` — unique, for @for track. */
    Key: string;
}

/** A category's full slot along the category axis (bar + padding), for hit testing. */
export interface CategoryBand { CategoryIndex: number; Start: number; Size: number; }

export interface BarGeometry {
    Size: PlotSize;
    Type: ChartTypeMetrics;
    Box: PlotBox;
    Orientation: BarOrientation;
    Segments: BarSegment[];
    CategoryBands: CategoryBand[];
    CategoryAxis: AxisTick[];
    ValueAxis: AxisTick[];
    Baseline: number;
}

export interface DonutLabelPoint { X: number; Y: number; Anchor: 'start' | 'end'; }

export interface DonutArc {
    SliceIndex: number;
    /** Arc path centered on (0,0); the template translates it to (CenterX, CenterY). */
    Path: string;
    Fill: string;
    Percent: number;
    StartAngle: number;
    EndAngle: number;
    LabelPoint: DonutLabelPoint | null;
}

export interface DonutGeometry {
    Size: PlotSize;
    Type: ChartTypeMetrics;
    Box: PlotBox;
    CenterX: number;
    CenterY: number;
    InnerRadius: number;
    OuterRadius: number;
    Arcs: DonutArc[];
}

export interface AreaLayer {
    SeriesIndex: number;
    Path: string;
    /** Top edge only, stroked in the series color. */
    LinePath: string;
    Fill: string;
    /** Stacked lower/upper edge per category in plot px; null where the series is missing (StackMode 'none' only). */
    Y0: ReadonlyArray<number | null>;
    Y1: ReadonlyArray<number | null>;
}

export interface AreaGeometry {
    Size: PlotSize;
    Type: ChartTypeMetrics;
    Box: PlotBox;
    Layers: AreaLayer[];
    CategoryX: number[];
    CategoryAxis: AxisTick[];
    ValueAxis: AxisTick[];
    /** true for StackMode 'stacked' and 'percent'. */
    Stacked: boolean;
    Percent: boolean;
}

/** The datum under the pointer or keyboard focus. Donut: CategoryIndex = SliceIndex, SeriesIndex = 0. */
export interface ActivePoint { CategoryIndex: number; SeriesIndex: number; }

export type ChartNavKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';
export type ChartFrameKey = ChartNavKey | 'Activate' | 'Escape';

export type ChartDataIssueCode = 'length-mismatch' | 'negative-in-stacked-area' | 'negative-in-percent';

export type ChartDataStatus =
    | { Kind: 'ok' }
    | { Kind: 'empty' }
    | { Kind: 'invalid'; Code: ChartDataIssueCode; Detail: string };

export interface LegendItem { Label: string; Color: string; Key: string; }
export interface LegendFit { Visible: LegendItem[]; HiddenCount: number; Rows: number; }

export interface ChartTableRow { Header: string; Cells: string[]; Key: string; }
export interface ChartTableModel {
    Caption: string;
    ColumnHeaders: string[];
    Rows: ChartTableRow[];
    TruncatedNote: string | null;
}

export interface ChartTooltipRow { Label: string; Value: string; Color: string; Active: boolean; Key: string; }
export interface ChartTooltipModel { Title: string; Rows: ChartTooltipRow[]; }

export interface ChartAnchor { X: number; Y: number; }
