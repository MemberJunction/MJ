/**
 * @fileoverview The website crawl, as a Discover driver.
 *
 * {@link AutotagWebsite} already streams links lazily — `streamAllLinksFromContentSource` yields
 * each URL as the crawl finds it rather than after the whole site is walked. That generator is the
 * walk, so this driver reuses it rather than reimplementing a crawler.
 *
 * It is reached through a thin subclass that widens access to the protected crawl methods. That is
 * deliberately all the coupling there is: no crawl logic is copied, and `AutotagWebsite` is
 * untouched, so improving the crawl in one place improves it for both consumers.
 *
 * @module @memberjunction/content-autotagging
 */

import { RegisterClass } from '@memberjunction/global';
import { HttpGet, SafeFetch } from '@memberjunction/network-utils';
import {
    AccessArtifact,
    BaseDiscoverDriver,
    DiscoverRequest,
    DiscoveredItem,
} from '@memberjunction/content-pipeline-base';
import { AutotagWebsite } from './AutotagWebsite';

/**
 * Exposes the crawl without changing it.
 *
 * `streamAllLinksFromContentSource` and `getBasePath` are protected on {@link AutotagWebsite}; a
 * subclass is the supported way to reach them, and keeps the widening contained to this file.
 */
class WebsiteCrawl extends AutotagWebsite {
    public Crawl(startURL: string, rootURL: string, pattern: RegExp): AsyncIterable<string> {
        return this.streamAllLinksFromContentSource(startURL, rootURL, pattern);
    }

    public BasePath(url: string): string {
        return this.getBasePath(url);
    }

    /**
     * The session this crawl runs under, when the source needs one.
     *
     * Applied by overriding the page fetch rather than by changing {@link AutotagWebsite}: the
     * crawl logic is identical, only the credentials it carries differ.
     */
    public Access?: AccessArtifact | null;

    public override async FetchPageContent(url: string): Promise<string> {
        if (!this.Access?.Headers) {
            return super.FetchPageContent(url);
        }
        const { Data } = await HttpGet<string>(this.withAccessParameters(url), {
            ResponseType: 'text',
            Headers: { ...this.Access.Headers },
        });
        return Data;
    }

    /** A URL with any session query parameters applied, for sources that authenticate in the URL. */
    private withAccessParameters(url: string): string {
        const parameters = this.Access?.QueryParameters;
        if (!parameters || Object.keys(parameters).length === 0) {
            return url;
        }
        const resolved = new URL(url);
        for (const [name, value] of Object.entries(parameters)) {
            resolved.searchParams.set(name, value);
        }
        return resolved.toString();
    }

    /** The crawl settings a Content Source declares, applied to this instance. */
    public Configure(parameters: Readonly<Record<string, string>>): void {
        const pattern = parameters.URLPattern;
        if (pattern) {
            this.URLPattern = pattern;
        }
        const root = parameters.RootURL;
        if (root) {
            this.RootURL = root;
        }
    }
}

/** Registered under the name `ContentSourceType.DriverClass` already carries for this source type. */
@RegisterClass(BaseDiscoverDriver, 'AutotagWebsite')
export class WebsiteDiscoverDriver extends BaseDiscoverDriver {
    public readonly Key = 'AutotagWebsite';

    public async *Discover(request: DiscoverRequest): AsyncIterable<DiscoveredItem> {
        const crawl = new WebsiteCrawl();
        crawl.Configure(request.Parameters);
        // An intranet or members-only site cannot even be enumerated without credentials, so the
        // session has to reach the crawl, not just the later fetch of each page.
        crawl.Access = request.Access;
        const rootURL = request.Parameters.RootURL || crawl.BasePath(request.URL);
        const pattern = request.Parameters.URLPattern ? new RegExp(request.Parameters.URLPattern) : /.*/;

        let found = 0;
        for await (const link of crawl.Crawl(request.URL, rootURL, pattern)) {
            if (request.Signal.aborted) {
                return;
            }
            // A crawl knows a page exists, not what it holds. The server's own validators — ETag,
            // Last-Modified, Content-Length — are the cheapest honest change signal there is, so
            // each page gets one HEAD request. Without a checksum an existing page is treated as
            // unchanged, which is right for a server that offers no validators and wrong only there.
            const checksum = request.Parameters.SkipValidatorChecksum === 'true'
                ? undefined
                : await this.validatorChecksum(link, request);
            yield { URL: link, ...(checksum ? { Checksum: checksum } : {}) };
            found++;
            if (found % 25 === 0) {
                request.ReportProgress(`crawled ${found} page(s)`);
            }
        }
    }

    /**
     * A checksum from the page's HTTP validators, or undefined when the server offers none.
     *
     * Best-effort: a page whose HEAD fails is still discovered, just without a change signal. The
     * session goes only to the source's own origin, and not across a redirect elsewhere.
     */
    private async validatorChecksum(url: string, request: DiscoverRequest): Promise<string | undefined> {
        try {
            const sameOrigin = new URL(url).origin === new URL(request.URL).origin;
            const response = await SafeFetch(url, {
                method: 'HEAD',
                signal: request.Signal,
                ...(sameOrigin && request.Access?.Headers ? { headers: { ...request.Access.Headers } } : {}),
                StripHeadersOnCrossOriginRedirect: true,
            });
            if (!response.ok) {
                return undefined;
            }
            const etag = response.headers.get('etag');
            if (etag) {
                return `etag:${etag}`;
            }
            const modified = response.headers.get('last-modified');
            const length = response.headers.get('content-length');
            return modified ? `modified:${modified}|${length ?? ''}` : undefined;
        } catch {
            return undefined;
        }
    }
}
