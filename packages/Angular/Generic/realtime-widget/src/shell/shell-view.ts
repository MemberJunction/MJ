/**
 * Plain-DOM views for the shell's phases: the start button, the consent notice, the loading line, the ended
 * card and the error alert. They mirror what the Angular component renders (same class names, same copy, same
 * accessibility contract) without Angular, so the shell stays tiny. Each function returns nodes; the element
 * decides where they go.
 *
 * Text is always set with `textContent`, never HTML, so a page-supplied agent name or an error message from the
 * server can never inject markup.
 */
import { FormatWidgetString, type WidgetStrings } from '../lib/strings';

type Child = Node | string;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, children: Child[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    node.setAttribute(name, value);
  }
  for (const child of children) {
    node.append(child);
  }
  return node;
}

function svg(pathData: string): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const root = document.createElementNS(ns, 'svg');
  root.setAttribute('viewBox', '0 0 24 24');
  root.setAttribute('fill', 'none');
  root.setAttribute('stroke', 'currentColor');
  root.setAttribute('stroke-width', '2');
  root.setAttribute('stroke-linecap', 'round');
  root.setAttribute('stroke-linejoin', 'round');
  root.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', pathData);
  root.append(path);
  return root;
}

const MIC = 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3';
const CHECK = 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3';
const RETRY = 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5';

export interface ViewContext {
  Strings: WidgetStrings;
  AgentName: string;
}

/** The idle surface: one button. */
export function BuildStartView(ctx: ViewContext, onStart: () => void): { root: HTMLElement; button: HTMLButtonElement } {
  const button = el('button', { type: 'button', class: 'mjw-btn mjw-btn--primary mjw-start' }, [
    svg(MIC),
    el('span', {}, [FormatWidgetString(ctx.Strings.start, ctx.AgentName)])
  ]);
  button.addEventListener('click', onStart);
  return { root: el('div', { class: 'mjw-center' }, [button]), button };
}

/**
 * The consent notice. Declarative: it names what will happen and emits the visitor's answer. The microphone is
 * not started by anything in this file. Begin is LEFT of Not now (MemberJunction's dialog-button rule).
 */
export function BuildConsentView(ctx: ViewContext, onAccept: () => void, onDecline: () => void): { root: HTMLElement; region: HTMLElement } {
  const text = (key: keyof WidgetStrings) => FormatWidgetString(ctx.Strings[key], ctx.AgentName);
  const begin = el('button', { type: 'button', class: 'mjw-btn mjw-btn--success mjw-consent__begin' }, [svg(MIC), el('span', {}, [ctx.Strings.begin])]);
  const decline = el('button', { type: 'button', class: 'mjw-btn mjw-btn--secondary mjw-consent__decline' }, [ctx.Strings.notNow]);
  begin.addEventListener('click', onAccept);
  decline.addEventListener('click', onDecline);
  const region = el('section', { class: 'mjw-card mjw-consent', role: 'region', 'aria-labelledby': 'mjw-consent-title', tabindex: '-1' }, [
    el('header', { class: 'mjw-consent__head' }, [el('h2', { id: 'mjw-consent-title', class: 'mjw-title' }, [ctx.Strings.consentGreeting])]),
    el('div', { class: 'mjw-consent__notice' }, [
      el('p', { class: 'mjw-consent__lead' }, [text('consentLead')]),
      el('ul', { class: 'mjw-consent__list' }, [el('li', {}, [text('consentVoice')]), el('li', {}, [text('consentAi')])]),
      el('p', { class: 'mjw-consent__foot' }, [text('consentFoot')])
    ]),
    el('div', { class: 'mjw-actions' }, [begin, decline])
  ]);
  return { root: el('div', { class: 'mjw-center' }, [region]), region };
}

/** The loading line shown while the call code downloads and the call connects. */
export function BuildLoadingView(label: string): HTMLElement {
  return el('div', { class: 'mjw-center', role: 'status', 'aria-live': 'polite' }, [
    el('div', { class: 'mjw-loading' }, [el('span', { class: 'mjw-dots', 'aria-hidden': 'true' }, [el('i'), el('i'), el('i')]), el('span', {}, [label])])
  ]);
}

/** The ended card, with a way to start over. */
export function BuildEndedView(ctx: ViewContext, onRestart: () => void): { root: HTMLElement; primary: HTMLButtonElement } {
  const primary = el('button', { type: 'button', class: 'mjw-btn mjw-btn--primary' }, [svg(RETRY), el('span', {}, [ctx.Strings.startOver])]);
  primary.addEventListener('click', onRestart);
  const icon = el('span', { class: 'mjw-icon', 'aria-hidden': 'true' });
  icon.append(svg(CHECK));
  const card = el('section', { class: 'mjw-card mjw-ended', 'aria-labelledby': 'mjw-ended-title' }, [
    icon,
    el('h2', { id: 'mjw-ended-title', class: 'mjw-title' }, [ctx.Strings.endedTitle]),
    el('p', { class: 'mjw-message' }, [FormatWidgetString(ctx.Strings.endedMessage, ctx.AgentName)]),
    el('div', { class: 'mjw-actions' }, [primary])
  ]);
  return { root: el('div', { class: 'mjw-center' }, [card]), primary };
}

/** The error alert: what went wrong in words, and a way forward. Never a dead end. */
export function BuildErrorView(ctx: ViewContext, message: string, onRetry: () => void): { root: HTMLElement; primary: HTMLButtonElement } {
  const primary = el('button', { type: 'button', class: 'mjw-btn mjw-btn--primary' }, [svg(RETRY), el('span', {}, [ctx.Strings.tryAgain])]);
  primary.addEventListener('click', onRetry);
  const alert = el('div', { class: 'mjw-alert', role: 'alert' }, [
    el('p', { class: 'mjw-alert__title' }, [ctx.Strings.errorTitle]),
    el('p', { class: 'mjw-alert__message' }, [message.trim().length > 0 ? message : ctx.Strings.errorDefault]),
    el('div', { class: 'mjw-actions' }, [primary])
  ]);
  return { root: el('div', { class: 'mjw-center' }, [alert]), primary };
}
