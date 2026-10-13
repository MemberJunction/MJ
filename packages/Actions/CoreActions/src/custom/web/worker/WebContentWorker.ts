/**
 * @fileoverview Worker-thread entry point for {@link WebContentWorkerHost}: answers each call with
 * {@link HandleWebContentRequest}, so jsdom, turndown and pdf-parse never block the event loop that
 * serves requests (MJ #5510).
 *
 * @module @memberjunction/core-actions
 */

import { ServeWorkerRequests } from '@memberjunction/worker-host';
import { HandleWebContentRequest } from './WebContentWorkerHandler';
import type { WebContentResult, WebContentWorkerCall } from './WebContentWorkerProtocol';

ServeWorkerRequests<WebContentWorkerCall, WebContentResult>(HandleWebContentRequest);
