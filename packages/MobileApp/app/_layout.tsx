import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApolloProviderRoot } from '@/providers/apollo-provider';
import { MJProviderRoot } from '@/providers/mj-provider';
import { Colors } from '@/theme/tokens';

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.bg }}>
            <SafeAreaProvider>
                <ApolloProviderRoot>
                    <MJProviderRoot>
                        <StatusBar style="dark" />
                        <Stack
                            screenOptions={{
                                headerShown: false,
                                contentStyle: { backgroundColor: Colors.bg },
                                animation: 'slide_from_right',
                            }}
                        />
                    </MJProviderRoot>
                </ApolloProviderRoot>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
