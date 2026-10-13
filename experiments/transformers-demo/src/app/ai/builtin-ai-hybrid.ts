// Hybrid ("co-processor") path for the Chrome built-in AI experiment.
//
// The local model decides (router + tool plan), the page fetches over the network, the local model answers
// over the retrieved text. Two keyless, CORS-enabled sources stand in for Betty's knowledge base so the flow can
// be demonstrated outside MJ: Wikipedia (general knowledge) and GitHub releases (software projects).

export type ResearchTool = 'wikipedia' | 'github_latest_release' | 'none';

export interface ResearchPlan {
  Tool: ResearchTool;
  /** Search phrase for wikipedia, `owner/repo` for github_latest_release, empty for none */
  Query: string;
  Reason: string;
}

export const PLANNER_SYSTEM_PROMPT = `You are the research planner for a browser assistant. For each user question pick exactly ONE tool:
- wikipedia: general knowledge about people, places, organisations, events, concepts. Query = a short search phrase (2-5 words), not a full sentence.
- github_latest_release: questions about the latest release, version, or recent changes of an open-source project on GitHub. Query = owner/repo. MemberJunction's repository is MemberJunction/MJ.
- none: no lookup would help (math, translation, rewriting, opinions).
Reason: one short sentence.`;

export const PLANNER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    Tool: { type: 'string', enum: ['wikipedia', 'github_latest_release', 'none'] },
    Query: { type: 'string' },
    Reason: { type: 'string' },
  },
  required: ['Tool', 'Query', 'Reason'],
  additionalProperties: false,
};

export interface RetrievedContext {
  Source: string;
  Url: string;
  Text: string;
  Requests: number;
  Ms: number;
  Bytes: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  body: string | null;
}

interface WikipediaSearchResponse {
  query?: { search?: { title: string; snippet: string }[] };
  error?: { code: string; info: string };
}

interface WikipediaSummary {
  title: string;
  extract: string;
  content_urls: { desktop: { page: string } };
}

const MAX_CONTEXT_CHARS = 3000;

async function getJson<T>(url: string, signal?: AbortSignal): Promise<{ data: T; bytes: number }> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
  const raw = await res.text();
  return { data: JSON.parse(raw) as T, bytes: raw.length };
}

/** Execute the plan over the network. Returns null for tool `none`. Throws on HTTP/network failure. */
export async function RunResearchTool(plan: ResearchPlan, signal?: AbortSignal): Promise<RetrievedContext | null> {
  const t0 = performance.now();
  const query = plan.Query.trim();
  if (plan.Tool !== 'none' && !query) throw new Error(`planner chose ${plan.Tool} but returned an empty Query`);
  if (plan.Tool === 'github_latest_release') {
    // Small models emit "owner/repo", "owner / repo", "owner/repo/releases" or a full URL; keep the first two segments.
    const parts = query.replace(/^https?:\/\/(www\.)?github\.com\//i, '').split('/').map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) throw new Error(`"${plan.Query}" is not an owner/repo`);
    const repo = `${parts[0]}/${parts[1]}`;
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    const { data, bytes } = await getJson<GitHubRelease>(url, signal);
    const body = (data.body ?? '').slice(0, MAX_CONTEXT_CHARS);
    return {
      Source: `GitHub latest release of ${repo}`,
      Url: data.html_url,
      Text: `Release: ${data.name || data.tag_name}\nTag: ${data.tag_name}\nPublished: ${data.published_at}\n\n${body}`,
      Requests: 1,
      Ms: Math.round(performance.now() - t0),
      Bytes: bytes,
    };
  }
  if (plan.Tool === 'wikipedia') {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=3&format=json&origin=*&srsearch=${encodeURIComponent(query)}`;
    const search = await getJson<WikipediaSearchResponse>(searchUrl, signal);
    // MediaWiki answers 200 with {error:{…}} and no `query` for bad input.
    const top = search.data.query?.search?.[0];
    if (!top) throw new Error(`Wikipedia search found nothing for "${query}"`);
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(top.title.replace(/ /g, '_'))}`;
    const summary = await getJson<WikipediaSummary>(summaryUrl, signal);
    return {
      Source: `Wikipedia: ${summary.data.title}`,
      Url: summary.data.content_urls.desktop.page,
      Text: summary.data.extract.slice(0, MAX_CONTEXT_CHARS),
      Requests: 2,
      Ms: Math.round(performance.now() - t0),
      Bytes: search.bytes + summary.bytes,
    };
  }
  return null;
}

/**
 * Prompt for the final, local answer over the retrieved text. The chat session keeps the conversation history, so
 * the wording scopes the material to this one question and asks for nothing (like a "Source:" line) that a small
 * model would keep repeating on later, unrelated turns — the service appends the source itself.
 */
export function BuildGroundedPrompt(userMessage: string, ctx: RetrievedContext): string {
  return `Reference material for the next question only, retrieved from ${ctx.Source}:
"""
${ctx.Text}
"""
Question: ${userMessage}
Answer concisely using the reference material where it is relevant. If it does not answer the question, say so in one sentence.`;
}
