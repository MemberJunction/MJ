import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/theme/tokens';
import type { ConversationParticipantAgent } from '@/data/mock-conversations';

type Props = {
    agents: ConversationParticipantAgent[];
    /** Diameter of each avatar disc. Default 30. */
    size?: number;
    /** Border color of each avatar (matches the surface it sits on). Default page bg. */
    borderColor?: string;
};

/**
 * Stacked, slightly-overlapping circle avatars for the agents that participated
 * in a conversation. Used in the conversation list and the chat thread header
 * to make multi-agent threads visually obvious without forcing the data model
 * into a one-agent-per-thread shape.
 */
export function AgentAvatarStack({ agents, size = 30, borderColor = Colors.bg }: Props) {
    const overlap = Math.round(size * 0.32);
    const fontSize = Math.round(size * 0.36);
    const borderWidth = Math.max(1.5, Math.round(size * 0.06));

    return (
        <View style={[styles.row, { height: size, width: size + (agents.length - 1) * (size - overlap) }]}>
            {agents.map((agent, idx) => (
                <View
                    key={agent.id}
                    style={[
                        styles.disc,
                        {
                            width: size,
                            height: size,
                            borderRadius: size / 2,
                            backgroundColor: agent.color,
                            borderColor,
                            borderWidth,
                            left: idx * (size - overlap),
                            zIndex: agents.length - idx,
                        },
                    ]}
                >
                    <Text style={[styles.initial, { fontSize }]}>{agent.initial}</Text>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { position: 'relative' },
    disc: {
        position: 'absolute',
        top: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    initial: {
        color: '#ffffff',
        fontWeight: '700',
    },
});
