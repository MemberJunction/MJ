import { ApolloClient, ApolloProvider, HttpLink, InMemoryCache, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import type { ReactNode } from 'react';
import { Env } from '@/config/env';

/**
 * Apollo client wired against the MJAPI GraphQL endpoint.
 *
 * Phase 1: uses a static dev token from Env.devAuthToken.
 * Phase 2: token comes from expo-secure-store (after real OAuth lands).
 */
function createApolloClient(): ApolloClient<unknown> {
  const httpLink = new HttpLink({ uri: Env.graphqlUrl });

  const authLink = setContext((_operation, { headers }) => ({
    headers: {
      ...headers,
      ...(Env.devAuthToken ? { authorization: `Bearer ${Env.devAuthToken}` } : {}),
    },
  }));

  return new ApolloClient({
    link: from([authLink, httpLink]),
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: { fetchPolicy: 'cache-and-network' },
    },
  });
}

const client = createApolloClient();

export function ApolloProviderRoot({ children }: { children: ReactNode }) {
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
