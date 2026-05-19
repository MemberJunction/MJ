import { Redirect } from 'expo-router';

/**
 * App root — for Phase 1 we land directly on the conversation list.
 * Phase 2 will route through an auth gate first.
 */
export default function Index() {
    return <Redirect href="/conversations" />;
}
