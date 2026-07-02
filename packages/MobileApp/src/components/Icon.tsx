/**
 * Hand-rolled SVG icon set (Feather-style line icons) drawn with
 * `react-native-svg`. Keeping the glyphs inline avoids pulling in an icon-font
 * dependency and lets every icon share one consistent 24x24 stroke grid.
 * Consume via the {@link Icons} map, e.g. `<Icons.Send size={20} />`.
 */
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';
import type { ColorValue } from 'react-native';

/** Shared props accepted by every icon in {@link Icons}. */
type IconProps = {
    /** Width and height of the square icon in px. Default 22. */
    size?: number;
    /** Stroke (or fill, for solid icons) color. Default near-black `#0d0d10`. */
    color?: ColorValue;
    /** Stroke thickness for outline icons. Default 2. */
    strokeWidth?: number;
};

/**
 * Internal wrapper that renders a stroked 24x24 SVG canvas with rounded caps/joins.
 * Icon definitions pass their `<Path>`/`<Circle>`/etc. children into it so they
 * don't each repeat the `<Svg>` boilerplate.
 */
const D = (props: IconProps & { children: React.ReactNode }) => {
    const { size = 22, color = '#0d0d10', children } = props;
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color as string} strokeWidth={(props.strokeWidth ?? 2) as number} strokeLinecap="round" strokeLinejoin="round">
            {children}
        </Svg>
    );
};

/**
 * Named icon components used across the app's chrome (nav, composer, list rows).
 * Most are outline icons; `Pin` and `Star` are solid (filled) variants that use
 * `color` as their fill rather than stroke.
 */
export const Icons = {
    Menu: (p: IconProps) => (<D {...p}><Path d="M3 6h18M3 12h18M3 18h18" /></D>),
    Plus: (p: IconProps) => (<D {...p}><Path d="M12 5v14M5 12h14" /></D>),
    Search: (p: IconProps) => (<D {...p}><Circle cx={11} cy={11} r={7} /><Path d="M21 21l-4-4" /></D>),
    ChevronLeft: (p: IconProps) => (<D {...p}><Polyline points="15 6 9 12 15 18" /></D>),
    Edit: (p: IconProps) => (<D {...p}><Path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><Path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></D>),
    ChevronRight: (p: IconProps) => (<D {...p}><Polyline points="9 6 15 12 9 18" /></D>),
    ChevronUp: (p: IconProps) => (<D {...p}><Polyline points="6 15 12 9 18 15" /></D>),
    ChevronDown: (p: IconProps) => (<D {...p}><Polyline points="6 9 12 15 18 9" /></D>),
    Mic: (p: IconProps) => (<D {...p}><Path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><Path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" /></D>),
    Send: (p: IconProps) => (<D {...p}><Path d="M22 2L11 13" /><Path d="M22 2l-7 20-4-9-9-4 20-7z" /></D>),
    Pin: (p: IconProps) => {
        const { size = 22, color = '#0d0d10' } = p;
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24" fill={color as string}>
                <Path d="M16 2H8L4 6v16l8-4 8 4V6l-4-4z" />
            </Svg>
        );
    },
    Star: (p: IconProps) => {
        const { size = 22, color = '#d4a25e' } = p;
        return (
            <Svg width={size} height={size} viewBox="0 0 24 24" fill={color as string}>
                <Path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
            </Svg>
        );
    },
    Database: (p: IconProps) => (<D {...p}><Rect x={3} y={3} width={18} height={18} rx={2} /><Path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></D>),
    Sliders: (p: IconProps) => (<D {...p}><Path d="M3 6h18M6 12h12M10 18h4" /></D>),
    Paperclip: (p: IconProps) => (<D {...p}><Path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></D>),
    Camera: (p: IconProps) => (<D {...p}><Path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><Circle cx={12} cy={13} r={4} /></D>),
    Image: (p: IconProps) => (<D {...p}><Rect x={3} y={3} width={18} height={18} rx={2} /><Circle cx={8.5} cy={8.5} r={1.5} /><Path d="M21 15l-5-5L5 21" /></D>),
    FileText: (p: IconProps) => (<D {...p}><Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><Path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></D>),
    X: (p: IconProps) => (<D {...p}><Path d="M18 6L6 18M6 6l12 12" /></D>),
    Sparkle: (p: IconProps) => (<D {...p}><Path d="M12 2l1.8 5.5L19 9l-5.2 1.5L12 16l-1.8-5.5L5 9l5.2-1.5z" /><Path d="M19 16l.9 2.7L22 19l-2.1.3L19 22l-.9-2.7L16 19l2.1-.3z" /></D>),
    Settings: (p: IconProps) => (<D {...p}><Circle cx={12} cy={12} r={3} /><Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></D>),
};
