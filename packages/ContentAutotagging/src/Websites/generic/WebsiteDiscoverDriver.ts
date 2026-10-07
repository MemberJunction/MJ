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
import { HttpGet } from '@memberjunction/network-utils';
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
            // No checksum: a crawl knows a page exists, not what it contains. Extract computes one
            // from the text it fetches, which is the first point anything cheap is available.
            yield { URL: link };
            found++;
            if (found % 25 === 0) {
                request.ReportProgress(`crawled ${found} page(s)`);
            }
        }
    }
}
