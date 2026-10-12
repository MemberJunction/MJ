/*
 * Drives the sample page. External file (not inline) so the page's CSP can say script-src 'self'.
 * Everything the page does to the widget is one of the documented attributes, properties, methods or events.
 */
(function () {
  'use strict';

  var EVENTS = [
    'mj-ready',
    'mj-phase-changed',
    'mj-session-started',
    'mj-session-ended',
    'mj-verified',
    'mj-session-event',
    'mj-channel-opened',
    'mj-channel-event',
    'mj-channel-output',
    'mj-error'
  ];

  var widget = document.getElementById('widget');
  var log = document.getElementById('log');

  function append(name, detail) {
    var item = document.createElement('li');
    item.textContent = name + ' ' + JSON.stringify(detail);
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
  }

  EVENTS.forEach(function (name) {
    widget.addEventListener(name, function (event) {
      append(name, event.detail);
    });
  });

  function report(promise) {
    return Promise.resolve(promise).catch(function (error) {
      append('page-error', { message: error && error.message ? error.message : String(error) });
    });
  }

  document.getElementById('apply').addEventListener('click', function () {
    widget.apiUrl = document.getElementById('api-url').value;
    widget.widgetKey = document.getElementById('widget-key').value;
  });
  document.getElementById('start').addEventListener('click', function () {
    report(widget.start());
  });
  document.getElementById('end').addEventListener('click', function () {
    report(widget.end());
  });
  document.getElementById('verify').addEventListener('click', function () {
    report(widget.openChannel('IdentityVerification', {}));
  });
  document.getElementById('note').addEventListener('click', function () {
    try {
      widget.sendContextNote('The visitor is reading the sample page.');
    } catch (error) {
      append('page-error', { message: error.message });
    }
  });

  // Lets a test (or a curious reader) see that the one script tag defined the element.
  customElements.whenDefined('mj-realtime-widget').then(function () {
    document.body.setAttribute('data-widget-defined', 'true');
  });
})();
