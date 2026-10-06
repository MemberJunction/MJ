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
import { BaseDiscoverDriver, DiscoverRequest, DiscoveredItem } from '@memberjunction/content-pipeline-base';
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
