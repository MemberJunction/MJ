import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icons } from '@/components/Icon';
import { EntityList } from '@/explorer/ExplorerLists';
import { Colors, Radius, Type } from '@/theme/tokens';

/**
 * Entity picker screen.
 *
 * Route: `/explorer/entities`. Adds this app's screen chrome around {@link EntityList}; the list
 * itself is shared with the hosted Data Explorer surface in `host/data-explorer-resources.tsx`,
 * which the Apps tab reaches through the `DataExplorerResource` driver class. One list, two entry
 * points, so they cannot drift.
 */
export default function EntitiesScreen() {
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
                <Pressable hitSlop={8} style={styles.iconBtn} onPress={() => router.back()}>
                    <Icons.ChevronLeft size={22} color={Colors.ink} strokeWidth={2.2} />
                </Pressable>
                <Text style={styles.title}>Entities</Text>
                <View style={styles.iconBtn} />
            </View>

            <EntityList />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.line2 },
    iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    title: { flex: 1, textAlign: 'center', fontSize: Type.body, fontWeight: Type.semibold, color: Colors.ink },
});
