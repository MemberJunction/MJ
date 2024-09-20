export const ApolloAPIEndpoint = 'https://api.apollo.io/v1';
export const EmailSourceName = "Apollo.io"
export const GroupSize = 10; // number of records per group to send to API, max number is 10
export const ConcurrentGroups = 1; // number of groups to process concurrently
export const MaxPeopleToEnrichPerOrg = 500;
export const ApolloAPIKey = process.env.APOLLO_API_KEY || "";