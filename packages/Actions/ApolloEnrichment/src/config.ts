export const ApolloAPIEndpoint = 'https://api.apollo.io/v1';
/**
 * Base path for the list-management and search surface.
 *
 * Note the extra `/api` segment. Apollo serves the enrichment endpoints this
 * package has always used from `api.apollo.io/v1`, and the labels / saved-search /
 * record-update endpoints from `api.apollo.io/api/v1`. They are not
 * interchangeable — the same path under the wrong prefix 404s — so both live here
 * side by side rather than one being derived from the other.
 */
export const ApolloRESTEndpoint = 'https://api.apollo.io/api/v1';
export const EmailSourceName = "Apollo.io"
export const GroupSize = 10; // number of records per group to send to API, max number is 10
export const ConcurrentGroups = 1; // number of groups to process concurrently
export const MaxPeopleToEnrichPerOrg = 500;
export const ApolloAPIKey = process.env.APOLLO_API_KEY || "";