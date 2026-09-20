/**
 * @fileoverview The HTML document that hosts a component in a real DOM.
 *
 * ## Why this exists
 *
 * Roughly a third of this deployment's registered components declare Chart.js, ApexCharts, AG Grid,
 * Leaflet or antd. Those do not fail to render natively for want of effort — they draw into an
 * `HTMLCanvasElement` or mount `HTMLElement`s, and React Native has neither. Reimplementing them
 * against `react-native-svg` would mean re-deriving each library's configuration surface and
 * getting it subtly wrong forever, on a moving target.
 *
 * A WebView *is* a browser. Given one, the component can run the same way it runs on the desktop:
 * the same react-runtime UMD bundle, the same CDN libraries the component registry names, the same
 * compile path, the same DOM. That is parity by construction rather than parity by imitation.
 *
 * ## What is deliberately not in the page
 *
 * Any credential. The page cannot call `RunView` — it has no provider and no token, and giving it
 * one would put this app's session inside a document that just executed third-party library code.
 * Instead `utilities` and `callbacks` are proxied to the native side over the bridge, which owns
 * the one authenticated provider. The page asks; the app decides and answers.
 *
 * ## Relationship to the native renderer
 *
 * This is the second of two renderers, not a replacement. Components that can run natively still
 * do — they are faster, they scroll like the rest of the app, and they inherit its typography.
 * This one is for the components that genuinely need a browser.
 */

import type { DomHostLibrary } from './bridge-protocol';

/**
 * The react-runtime UMD bundle, pinned to the version this app depends on.
 *
 * The same artifact `@memberjunction/react-test-harness` loads into Playwright, so the component is
 * compiled by exactly the code that compiles it everywhere else. It is fetched rather than bundled
 * because it is large and the WebView caches it; the trade is that DOM-host rendering needs a
 * network on first use, which the fallback copy explains.
 */
const RUNTIME_UMD_URL = 'https://unpkg.com/@memberjunction/react-runtime@6.1.0/dist/runtime.umd.js';

/** React, ReactDOM and Babel, matching `getCoreRuntimeLibraries()` in the runtime. */
const CORE_SCRIPTS = [
    'https://unpkg.com/react@18.2.0/umd/react.production.min.js',
    'https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js',
    'https://unpkg.com/@babel/standalone@7.29.1/babel.min.js',
];

/** Escapes a string for safe inclusion in an HTML attribute or text node. */
function EscapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Builds the host document.
 *
 * Takes no spec: the page boots empty and waits for an `init` message. That ordering matters —
 * a spec inlined into the HTML would have to be re-escaped into a script tag, and component code
 * containing `</script>` (entirely legal inside a string) would terminate the document early.
 * Everything that varies arrives over the bridge as JSON instead.
 *
 * @param libraries The libraries to load before mounting, from the component registry.
 */
export function BuildHostPage(libraries: readonly DomHostLibrary[]): string {
    const cssLinks = libraries
        .filter((l) => !!l.CdnCssUrl)
        .map((l) => `<link rel="stylesheet" href="${EscapeHtml(l.CdnCssUrl as string)}">`)
        .join('\n    ');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>
    /* The page is a panel inside a native screen, not a web page: no margins of its own, and a
       transparent ground so the native surface colour shows through. */
    html, body { margin: 0; padding: 0; background: transparent; }
    body { font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; }
    #root { padding: 2px; }
    .mj-host-error { padding: 12px; font-size: 13px; color: #991b1b; background: #fef2f2;
                     border: 1px solid #fecaca; border-radius: 10px; }
  </style>
  ${cssLinks}
</head>
<body>
  <div id="root"></div>
  <script>
  (function () {
    var pending = {};
    var rpcSeq = 0;

    function send(msg) {
      if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
    }
    function fail(message) {
      send({ Type: 'error', Message: String(message) });
      var root = document.getElementById('root');
      if (root) { root.innerHTML = '<div class="mj-host-error"></div>'; root.firstChild.textContent = String(message); }
    }

    // Anything thrown outside React's tree — a library failing to initialise, an async callback —
    // would otherwise leave a blank panel with no explanation on the native side.
    window.addEventListener('error', function (e) { fail(e.message || 'Script error'); });
    window.addEventListener('unhandledrejection', function (e) {
      fail((e.reason && e.reason.message) || 'Unhandled promise rejection');
    });

    /** Issues a request the native side answers, as a promise the component can await. */
    function rpc(method, args) {
      return new Promise(function (resolve, reject) {
        var id = 'r' + (++rpcSeq);
        pending[id] = { resolve: resolve, reject: reject };
        send({ Type: 'rpc', ID: id, Method: method, Args: args });
      });
    }
    function callback(name, args) { send({ Type: 'callback', Name: name, Args: args }); }

    window.__mjReceive = function (raw) {
      var msg;
      try { msg = JSON.parse(raw); } catch (e) { return; }
      if (msg.Type === 'rpc-result') {
        var p = pending[msg.ID];
        if (!p) return;
        delete pending[msg.ID];
        if (msg.Error) { p.reject(new Error(msg.Error)); } else { p.resolve(msg.Value); }
        return;
      }
      if (msg.Type === 'init') { mount(msg).catch(function (e) { fail(e && e.message ? e.message : e); }); }
    };

    function loadScript(url) {
      return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = url; s.async = false;
        s.onload = resolve;
        s.onerror = function () { reject(new Error('Could not load ' + url)); };
        document.head.appendChild(s);
      });
    }

    /** Reports the rendered height so the native container can size itself to the content. */
    function reportHeight() {
      var h = Math.ceil(document.documentElement.scrollHeight || document.body.scrollHeight || 0);
      if (h > 0) send({ Type: 'height', Pixels: h });
    }

    async function mount(init) {
      // Core first and in order: ReactDOM's UMD factory captures window.React at execution time,
      // which is the same reason the web loader sequences these rather than racing them.
      for (var i = 0; i < CORE.length; i++) { await loadScript(CORE[i]); }
      await loadScript(RUNTIME_URL);

      // Then the component's own libraries, by the URLs the component registry gave us.
      var libs = {};
      for (var j = 0; j < init.Libraries.length; j++) {
        var lib = init.Libraries[j];
        try {
          await loadScript(lib.CdnUrl);
          libs[lib.GlobalVariable] = window[lib.GlobalVariable];
        } catch (e) {
          // One unavailable library should cost the component that library, not the whole render.
          send({ Type: 'error', Message: 'Library ' + lib.Name + ' failed to load' });
        }
      }

      var RT = window.MJReactRuntime;
      if (!RT || !RT.createReactRuntime) { throw new Error('MemberJunction React runtime did not load'); }

      var runtime = RT.createReactRuntime(window.Babel, undefined, {
        React: window.React, ReactDOM: window.ReactDOM, libraries: libs
      });

      // A content hash is what the native path derives here, so two revisions of one component
      // name cannot collide in a long-lived registry. This page renders exactly one component and
      // is torn down with it, so its registry cannot have a second revision to collide with — and
      // depending on a helper the PUBLISHED runtime bundle may predate would couple the page to a
      // specific release for no benefit.
      var result = await runtime.manager.loadHierarchy(init.Spec, {
        defaultNamespace: 'Global',
        defaultVersion: init.Spec.version || 'mobile-dom-host',
        returnType: 'both'
      });
      if (!result.success || !result.rootComponent) {
        var first = (result.errors && result.errors[0]) || {};
        throw new Error((first.componentName ? first.componentName + ': ' : '') + (first.message || 'Component failed to load'));
      }

      // The same prop bag the native renderer builds — utilities proxied rather than local.
      var utilities = {
        rv: {
          RunView: function (p) { return rpc('rv.RunView', [p]); },
          RunViews: function (p) { return rpc('rv.RunViews', [p]); }
        },
        rq: { RunQuery: function (p) { return rpc('rq.RunQuery', [p]); } },
        md: { Entities: [] },
        ai: { ExecutePrompt: function (p) { return rpc('ai.ExecutePrompt', [p]); } }
      };
      try { utilities.md.Entities = await rpc('md.Entities', []); } catch (e) { /* non-fatal */ }

      // buildComponentProps is a module export, not a member of the object createReactRuntime
      // returns — that object carries the compiler, registry, resolver and manager only.
      var props = RT.buildComponentProps({}, init.SavedUserSettings || {}, utilities, {
        OpenEntityRecord: function (entityName, key) { callback('OpenEntityRecord', [entityName, key]); },
        CreateSimpleNotification: function (message, style) { callback('CreateSimpleNotification', [message, style]); },
        NotifyEvent: function (name, args) { callback('NotifyEvent', [name, args]); },
        RegisterMethod: function () {}
      }, result.components || {}, init.Styles);
      props.libraries = libs;
      props.savedUserSettings = init.SavedUserSettings || {};
      props.onSaveUserSettings = function (s) { callback('SaveUserSettings', [s]); };

      var Root = result.rootComponent.component || result.rootComponent;
      var Boundary = RT.createErrorBoundary(window.React, { logErrors: true, recovery: 'retry' });
      window.ReactDOM.createRoot(document.getElementById('root'))
        .render(window.React.createElement(Boundary, null, window.React.createElement(Root, props)));

      send({ Type: 'ready' });
      // Charts and grids size themselves after their own first paint, so one height report on
      // mount is always too early. An observer keeps the native container honest as it settles.
      reportHeight();
      if (window.ResizeObserver) { new ResizeObserver(reportHeight).observe(document.body); }
      setTimeout(reportHeight, 300);
      setTimeout(reportHeight, 1200);
    }

    var CORE = ${JSON.stringify(CORE_SCRIPTS)};
    var RUNTIME_URL = ${JSON.stringify(RUNTIME_UMD_URL)};
    // No "I am ready" ping: this script runs synchronously in the body, so window.__mjReceive
    // exists before the load event the native side waits for.
  })();
  </script>
</body>
</html>`;
}
