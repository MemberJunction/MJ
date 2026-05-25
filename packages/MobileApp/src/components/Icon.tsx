import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';
import type { ColorValue } from 'react-native';

type IconProps = {
    size?: number;
    color?: ColorValue;
    strokeWidth?: number;
};

const D = (props: IconProps & { children: React.ReactNode }) => {
    const { size = 22, color = '#0d0d10', children } = props;
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color as string} strokeWidth={(props.strokeWidth ?? 2) as number} strokeLinecap="round" strokeLinejoin="round">
            {children}
        </Svg>
    );
};

export const Icons = {
    Menu: (p: IconProps) => (<D {...p}><Path d="M3 6h18M3 12h18M3 18h18" /></D>),
    Plus: (p: IconProps) => (<D {...p}><Path d="M12 5v14M5 12h14" /></D>),
    Search: (p: IconProps) => (<D {...p}><Circle cx={11} cy={11} r={7} /><Path d="M21 21l-4-4" /></D>),
    ChevronLeft: (p: IconProps) => (<D {...p}><Polyline points="15 6 9 12 15 18" /></D>),
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
    Sparkle: (p: IconProps) => (<D {...p}><Path d="M12 2l1.8 5.5L19 9l-5.2 1.5L12 16l-1.8-5.5L5 9l5.2-1.5z" /><Path d="M19 16l.9 2.7L22 19l-2.1.3L19 22l-.9-2.7L16 19l2.1-.3z" /></D>),
    Settings: (p: IconProps) => (<D {...p}><Circle cx={12} cy={12} r={3} /><Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></D>),
};
