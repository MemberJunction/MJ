import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { Colors, Radius, Shadow, Spacing, Type } from '@/theme/tokens';

type Suggestion = {
    title: string;
    sub: string;
    color: string;
    icon: React.ReactNode;
};

type AgentPill = {
    id: string;
    name: string;
    color: string;
    initial: string;
};

const SUGGESTIONS: Suggestion[] = [
    {
        title: "Today's pipeline",
        sub: 'Open deals, owners, what changed',
        color: Colors.brand,
        icon: <Icons.Sparkle size={16} color={Colors.inverse} strokeWidth={2.2} />,
    },
    {
        title: "What's on my plate?",
        sub: 'Open tasks, approvals, and follow-ups',
        color: Colors.positive,
        icon: <Icons.Sliders size={16} color={Colors.inverse} strokeWidth={2.2} />,
    },
    {
        title: 'Look up a contact',
        sub: 'Find someone, see recent activity',
        color: Colors.agentAnalyst,
        icon: <Icons.Search size={16} color={Colors.inverse} strokeWidth={2.2} />,
    },
    {
        title: 'Research an account',
        sub: 'Recent news, signals, and risks',
        color: Colors.agentResearch,
        icon: <Icons.Database size={16} color={Colors.inverse} strokeWidth={2.2} />,
    },
];

const AGENTS: AgentPill[] = [
    { id: 'skip', name: 'Skip', color: Colors.agentSkip, initial: 'S' },
    { id: 'analyst', name: 'Account Analyst', color: Colors.agentAnalyst, initial: 'A' },
    { id: 'research', name: 'Research', color: Colors.agentResearch, initial: 'R' },
    { id: 'forecaster', name: 'Forecaster', color: Colors.agentForecaster, initial: 'F' },
    { id: 'email', name: 'Email Drafter', color: Colors.agentEmailDrafter, initial: 'E' },
];

export default function NewConversationScreen() {
    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
                <Text style={styles.title}>New conversation</Text>
                <View style={styles.iconBtn} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.heroBlock}>
                    <Text style={styles.heroTitle}>What can we help with today?</Text>
                    <Text style={styles.heroCopy}>
                        Start typing, or pick a prompt below. You can address a specific agent with{' '}
                        <Text style={styles.bold}>@</Text>.
                    </Text>
                </View>

                <View style={styles.composerCard}>
                    <TextInput
                        placeholder="Ask anything — Skip will route to the right agent…"
                        placeholderTextColor={Colors.ink3}
                        style={styles.composerInput}
                        multiline
                    />
                    <View style={styles.composerFoot}>
                        <Pressable style={styles.composerIcon}>
                            <Icons.Plus size={18} color={Colors.ink2} />
                        </Pressable>
                        <Pressable style={styles.micBtn} onPress={() => router.push('/voice-mode')}>
                            <Icons.Mic size={16} color={Colors.inverse} strokeWidth={2.2} />
                        </Pressable>
                        <Pressable style={[styles.sendBtn, styles.sendBtnMuted]}>
                            <Text style={styles.sendBtnText}>Send</Text>
                            <Icons.ChevronRight size={13} color={Colors.ink3} strokeWidth={2.5} />
                        </Pressable>
                    </View>
                </View>

                <Text style={styles.sectionLabel}>Start a conversation about…</Text>
                <View style={styles.suggestions}>
                    {SUGGESTIONS.map((s) => (
                        <Pressable key={s.title} style={styles.sug}>
                            <View style={[styles.sugIcon, { backgroundColor: s.color }]}>{s.icon}</View>
                            <View style={styles.sugBody}>
                                <Text style={styles.sugTitle}>{s.title}</Text>
                                <Text style={styles.sugSub}>{s.sub}</Text>
                            </View>
                            <Icons.ChevronRight size={16} color={Colors.ink3} strokeWidth={2} />
                        </Pressable>
                    ))}
                </View>

                <Text style={styles.sectionLabel}>Or talk to an agent</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.agentRail}>
                    {AGENTS.map((a) => (
                        <Pressable key={a.id} style={styles.agentPill}>
                            <View style={[styles.agentPillAv, { backgroundColor: a.color }]}>
                                <Text style={styles.agentPillAvText}>{a.initial}</Text>
                            </View>
                            <Text style={styles.agentPillName}>{a.name}</Text>
                        </Pressable>
                    ))}
                </ScrollView>
                <View style={{ height: Spacing.xxxl }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    title: { flex: 1, textAlign: 'center', fontSize: Type.body, fontWeight: Type.semibold, color: Colors.ink },
    content: { paddingBottom: 24 },

    heroBlock: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 8, alignItems: 'center' },
    heroTitle: { fontSize: 26, fontWeight: Type.bold, color: Colors.ink, letterSpacing: -0.5, textAlign: 'center', lineHeight: 31 },
    heroCopy: { fontSize: 14.5, color: Colors.ink2, lineHeight: 21, marginTop: 8, textAlign: 'center' },
    bold: { fontWeight: Type.semibold, color: Colors.ink },

    composerCard: { marginHorizontal: 18, marginTop: 22, backgroundColor: Colors.surface, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, padding: 14, ...Shadow.card },
    composerInput: { minHeight: 56, fontSize: 15.5, color: Colors.ink },
    composerFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    composerIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    micBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
    sendBtn: { marginLeft: 'auto', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6 },
    sendBtnMuted: { backgroundColor: Colors.surface2 },
    sendBtnText: { fontSize: 13.5, fontWeight: Type.semibold, color: Colors.ink3 },

    sectionLabel: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 8, fontSize: 11, fontWeight: Type.bold, color: Colors.ink3, letterSpacing: 1.4, textTransform: 'uppercase' },

    suggestions: { paddingHorizontal: 14, gap: 8 },
    sug: { backgroundColor: Colors.surface, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, ...Shadow.card },
    sugIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    sugBody: { flex: 1 },
    sugTitle: { fontSize: 14, fontWeight: Type.semibold, color: Colors.ink, letterSpacing: -0.1 },
    sugSub: { fontSize: 12, color: Colors.ink3, marginTop: 2 },

    agentRail: { paddingHorizontal: 14, paddingVertical: 4, flexDirection: 'row', gap: 8 },
    agentPill: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 8, paddingRight: 13, paddingVertical: 8, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: 999 },
    agentPillAv: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    agentPillAvText: { color: Colors.inverse, fontSize: 10, fontWeight: '700' },
    agentPillName: { fontSize: 13, fontWeight: Type.semibold, color: Colors.ink },
});
