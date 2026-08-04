import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { InteractiveComponentRenderer } from '@/interactive/InteractiveComponentRenderer';
import { parseInteractiveSpec } from '@/data/services/interactive-components';
import { Colors, Spacing, Type } from '@/theme/tokens';

/**
 * DEV HARNESS — verifies on-device interactive-component rendering.
 *
 * Route: `/interactive-demo`. Not linked from in-app navigation. Renders a real
 * agent-style component spec (stateful counter authored with web primitives
 * `<div>/<span>/<button>` + `useState`) through the full pipeline: parse spec →
 * lazy-load `@memberjunction/react-runtime` + `@babel/standalone` → Hermes
 * `new Function` compile → the web-primitive→RN shim → render. If Hermes can't
 * compile (e.g. a release build that strips the compiler), the renderer degrades
 * to its "View on desktop" fallback.
 */
const DEMO_CODE = `function DemoCounter({ utilities, styles }) {
  const [count, setCount] = useState(0);
  return (
    <div style={{ padding: 16, gap: 12 }}>
      <span style={{ fontSize: 18, fontWeight: '700', color: '#0d0d10' }}>
        Interactive component rendered on-device ✓
      </span>
      <span style={{ fontSize: 15, color: '#4a4a52' }}>
        Compiled from JSX via Hermes and mapped through the RN primitive shim.
      </span>
      <div style={{ padding: 12, backgroundColor: '#f6f5ef', borderRadius: 12 }}>
        <span style={{ fontSize: 28, fontWeight: '700', color: '#264FAF' }}>
          Count: {count}
        </span>
      </div>
      <button
        onClick={() => setCount(count + 1)}
        style={{ backgroundColor: '#264FAF', padding: 14, borderRadius: 12 }}
      >
        <span style={{ color: '#ffffff', fontWeight: '600', fontSize: 16 }}>Increment</span>
      </button>
    </div>
  );
}`;

const DEMO_SPEC = parseInteractiveSpec(
    JSON.stringify({ name: 'DemoCounter', code: DEMO_CODE }),
    'Interactive Component',
);

export default function InteractiveDemoScreen() {
    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <View style={styles.banner}>
                <Text style={styles.bannerText}>DEV · interactive component</Text>
            </View>
            <ScrollView contentContainerStyle={styles.body}>
                {DEMO_SPEC ? (
                    <InteractiveComponentRenderer spec={DEMO_SPEC} />
                ) : (
                    <Text style={styles.err}>Failed to parse demo spec.</Text>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    banner: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.surface2 },
    bannerText: { fontSize: Type.caption, fontWeight: Type.bold, color: Colors.ink3, letterSpacing: 1.2 },
    body: { padding: Spacing.lg },
    err: { color: Colors.danger, fontSize: Type.body },
});
