import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAgents } from '@/hooks/useAgents';
import { Colors, Radius, Type } from '@/theme/tokens';

/**
 * @fileoverview The bottom-sheet for choosing which agent answers.
 *
 * Shared rather than per-screen: the Profile screen picks the account-wide default, and voice mode
 * picks the agent for the call it is about to start. Those are two different decisions about the
 * same list, and a second copy of the list would be a second place for the avatar colours, the
 * loading state and the selected-row treatment to drift.
 */

/** One row's worth of agent identity, as {@link useAgents} shapes it. */
export type AgentPickerSelection = {
    /** `MJ: AI Agents` row id. */
    ID: string;
    /** Display name. */
    Name: string;
};

/**
 * Bottom-sheet modal for choosing an agent.
 *
 * @param Visible Whether the sheet is shown.
 * @param Title Sheet heading — say what the choice affects, since it differs per caller.
 * @param Subtitle One line explaining the consequence of choosing.
 * @param SelectedName Name of the current selection, for the checkmark. Matching on name rather
 *   than id because the Profile screen persists the name for display and only the id for use.
 * @param OnClose Dismiss without changing anything.
 * @param OnSelect Invoked with the chosen agent.
 */
export function AgentPicker({
    Visible,
    Title,
    Subtitle,
    SelectedName,
    OnClose,
    OnSelect,
}: {
    Visible: boolean;
    Title: string;
    Subtitle: string;
    SelectedName?: string;
    OnClose: () => void;
    OnSelect: (agent: AgentPickerSelection) => void;
}) {
    const { agents, loading } = useAgents();
    return (
        <Modal visible={Visible} animationType="slide" transparent onRequestClose={OnClose}>
            <Pressable style={styles.backdrop} onPress={OnClose}>
                <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                    <View style={styles.handle} />
                    <Text style={styles.title}>{Title}</Text>
                    <Text style={styles.sub}>{Subtitle}</Text>
                    {loading || agents === null ? (
                        <View style={styles.loading}>
                            <ActivityIndicator color={Colors.brand} />
                        </View>
                    ) : agents.length === 0 ? (
                        <Text style={styles.empty}>No agents are available to you in this workspace.</Text>
                    ) : (
                        <ScrollView style={styles.list}>
                            {agents.map((a) => {
                                const active = a.name === SelectedName;
                                return (
                                    <Pressable
                                        key={a.id}
                                        style={styles.row}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: active }}
                                        accessibilityLabel={`Choose ${a.name}`}
                                        onPress={() => OnSelect({ ID: a.id, Name: a.name })}
                                    >
                                        <View style={[styles.avatar, { backgroundColor: a.color }]}>
                                            <Text style={styles.avatarText}>{a.initial}</Text>
                                        </View>
                                        <Text style={styles.name}>{a.name}</Text>
                                        {active ? <Text style={styles.check}>✓</Text> : null}
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    )}
                    <Pressable style={styles.close} onPress={OnClose}>
                        <Text style={styles.closeText}>Close</Text>
                    </Pressable>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(13,13,16,0.35)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: Radius.xxl, borderTopRightRadius: Radius.xxl, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 28, maxHeight: '70%' },
    handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: Colors.line2, marginBottom: 12 },
    title: { fontSize: 18, fontWeight: '700', color: Colors.ink },
    sub: { fontSize: 13, color: Colors.ink3, marginTop: 2, marginBottom: 10 },
    loading: { paddingVertical: 28, alignItems: 'center' },
    empty: { paddingVertical: 24, fontSize: 14, color: Colors.ink3, textAlign: 'center' },
    list: { flexGrow: 0 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
    avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: Colors.inverse, fontSize: 14, fontWeight: '700' },
    name: { flex: 1, fontSize: 15, color: Colors.ink, fontWeight: Type.medium },
    check: { fontSize: 16, color: Colors.brand, fontWeight: '700' },
    close: { marginTop: 12, padding: 13, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, alignItems: 'center' },
    closeText: { fontSize: 14.5, fontWeight: Type.semibold, color: Colors.ink },
});
