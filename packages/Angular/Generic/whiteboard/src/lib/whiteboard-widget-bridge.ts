/**
 * LIVE WHITEBOARD — the HTML-widget INPUT BRIDGE (`MJWhiteboard.submit`), the AMBIENT
 * INTERACTION RECORDER, and the in-frame half of the TWO-WAY widget protocol.
 *
 * HTML widgets are tutoring-style "illustrate a concept and GET USER INPUT" chunks —
 * micro-forms, HTML+SVG explainers, concept animations, one-question quizzes. They render
 * inside a strictly sandboxed iframe (`sandbox="allow-scripts"` only, opaque origin), so
 * the ONLY way data can flow out is `postMessage`. This module is the Angular-free half of
 * that bridge:
 *
 *  - {@link InjectWhiteboardSubmitHelper} prepends ONE helper script to every widget's
 *    `srcdoc` (exactly once) that defines BOTH halves of the bridge:
 *      1. `window.MJWhiteboard.submit(data)` — the EXPLICIT input path; the widget calls
 *         it from a button / form handler and the helper posts the payload to the parent.
 *      2. The AMBIENT interaction recorder — passive document-level listeners (click /
 *         change / debounced input / focusin / focusout) that observe form activity the
 *         widget author wrote NO script for, batch it, and post it to the parent as a
 *         `__mjWhiteboardInteraction` message. Password / hidden / protected inputs are
 *         skipped entirely; every value is truncated client-side. The recorder is defensive:
 *         every handler is wrapped in try/catch so it can never break widget code.
 *      3. The COMMAND side of the two-way bridge: it posts `__mjWhiteboardReady` (once per
 *         document, with a random document token) and answers host commands sent with
 *         `__mjWhiteboardCommand` — `inspect` (a text outline with `f#` / `a#` refs),
 *         `operate` (click / set / select / check / uncheck / focus steps), `call` (a named
 *         action the widget registered with `MJWhiteboard.onAction`) and `restoreState`
 *         (the widget's saved state envelope). Commands are accepted only from `parent`.
 *         It also tags what the AGENT caused (`by: 'agent'` on submits and interaction
 *         batches), and keeps widget state (`MJWhiteboard.setState` / `onRestore`, plus
 *         automatic form state for widgets that don't use them).
 *    The helper targets `'*'` deliberately: the frame runs in an OPAQUE origin, so there is
 *    no concrete origin to name; the HOST side validates the message instead. The host half
 *    of the command channel (markers, validators, the broker) lives in
 *    `whiteboard-widget-protocol.ts` / `whiteboard-widget-broker.ts`.
 *  - {@link EvaluateWidgetSubmitMessage} / {@link EvaluateWidgetInteractionMessage} are
 *    that host-side validation: the marker property must be present, the `event.source`
 *    must resolve to a TRACKED widget iframe (anything else is dropped), the payload is
 *    size-capped (oversize → warn + drop), and interaction batches are shape-checked.
 *  - {@link SummarizeWidgetInteractions} compresses one validated interaction batch into a
 *    compact human line (`clicked "Playful pink"; changed "vibe" to "pink"; typing in
 *    "email"`) — what the channel plugin forwards to the live agent.
 *
 * The board component owns the single `window` 'message' listener and emits accepted
 * submissions as {@link WhiteboardWidgetSubmitEvent} and accepted ambient batches as
 * {@link WhiteboardWidgetInteractionEvent}; the channel plugin forwards them to the live
 * agent context as `[whiteboard]` notes (interaction notes throttled per widget). Both
 * events carry an optional `Author: 'agent'` when the helper claimed the agent caused them.
 */

import type { WhiteboardAuthor } from './whiteboard-state';

/** Marker property carried on every explicit-submit bridge postMessage payload. */
export const WHITEBOARD_SUBMIT_MARKER = '__mjWhiteboardSubmit';

/** Marker property carried on every ambient-interaction bridge postMessage payload. */
export const WHITEBOARD_INTERACTION_MARKER = '__mjWhiteboardInteraction';

/** Max chars an in-widget recorded VALUE keeps (recorder-side truncation, defensive re-clip host-side). */
export const WHITEBOARD_INTERACTION_VALUE_MAX_CHARS = 120;

/** Max chars a recorded element LABEL keeps. */
export const WHITEBOARD_INTERACTION_LABEL_MAX_CHARS = 40;

/** Recorder batch flush interval (ms). */
export const WHITEBOARD_INTERACTION_FLUSH_MS = 1500;

/** Recorder batch flushes immediately at this queue depth. */
export const WHITEBOARD_INTERACTION_FLUSH_AT = 12;

/** Per-field typing debounce inside the recorder (ms). */
export const WHITEBOARD_INTERACTION_TYPE_DEBOUNCE_MS = 800;

/**
 * Section 1 of the helper — the ONE-WAY input bridge: `window.MJWhiteboard.submit`, the
 * ambient interaction recorder and the auto-submit fallback (see {@link WHITEBOARD_SUBMIT_HELPER}).
 * It also publishes its building blocks on the helper-private `MJWhiteboard.__h` namespace so
 * the later sections (outline, operate, state) reuse the SAME labels and field identity, and
 * it asks `__h` (filled by the author section) for the author tag of every event it records.
 * Protected fields (`__h.isProtected`, defined by the later inspect section) are resolved
 * LAZILY through `isGuarded`, at event time, and skipped like password / hidden ones.
 */
const HELPER_BRIDGE_SECTION =
  `window.MJWhiteboard={__lastSubmitAt:0,__h:{},submit:function(data){var M=window.MJWhiteboard,h=M.__h,by='user';try{if(h.silent&&h.silent()){return;}if(h.submitTag){by=h.submitTag();}}catch(e){}M.__lastSubmitAt=Date.now();var msg={__mjWhiteboardSubmit:true,data:data};if(by==='agent'){msg.by='agent';}try{if(h.onSubmit){h.onSubmit(data);}}catch(e){}parent.postMessage(msg,'*');}};
(function(){
var VALUE_MAX=120,LABEL_MAX=40,FLUSH_MS=1500,FLUSH_AT=12,TYPE_MS=800;
var queue=[],queueBy='user',flushTimer=null,typeTimers={},H=window.MJWhiteboard.__h;
function tagOf(e){try{return H.tagOf?H.tagOf(e):'user';}catch(err){return 'user';}}
function quiet(){try{return !!(H.silent&&H.silent());}catch(err){return false;}}
function flush(){flushTimer=null;if(!queue.length){return;}var batch=queue,by=queueBy;queue=[];try{var msg={__mjWhiteboardInteraction:true,events:batch};if(by==='agent'){msg.by='agent';}parent.postMessage(msg,'*');}catch(e){}}
function flushNow(){if(flushTimer){clearTimeout(flushTimer);flushTimer=null;}flush();}
function push(ev,by){by=by==='agent'?'agent':'user';if(queue.length&&queueBy!==by){flushNow();}queueBy=by;queue.push(ev);if(queue.length>=FLUSH_AT){flushNow();return;}if(!flushTimer){flushTimer=setTimeout(flush,FLUSH_MS);}}
function clip(v,max){v=String(v==null?'':v);return v.length>max?v.slice(0,max):v;}
function isPrivate(el){var t=(el&&el.type?String(el.type):'').toLowerCase();return t==='password'||t==='hidden';}
function isGuarded(el){if(isPrivate(el)){return true;}try{return !!(H.isProtected&&H.isProtected(el));}catch(e){return true;}}
function labelOf(el){if(!el||!el.getAttribute){return '';}var v=el.getAttribute('aria-label')||el.getAttribute('name')||el.id;if(v){return clip(v,LABEL_MAX);}var t=(el.textContent||'').replace(/\\s+/g,' ').trim();return t?clip(t,LABEL_MAX):'';}
function fieldLabel(el){var own=labelOf(el);if(own){return own;}try{if(el.labels&&el.labels.length){var lt=(el.labels[0].textContent||'').replace(/\\s+/g,' ').trim();if(lt){return clip(lt,LABEL_MAX);}}var wrap=el.closest?el.closest('label'):null;if(wrap){var wt=(wrap.textContent||'').replace(/\\s+/g,' ').trim();if(wt){return clip(wt,LABEL_MAX);}}}catch(e){}return el.tagName?el.tagName.toLowerCase():'field';}
function isField(el){var t=el&&el.tagName?el.tagName.toUpperCase():'';return t==='INPUT'||t==='TEXTAREA'||t==='SELECT';}
function fieldValue(el){if(el.type==='checkbox'){return el.checked?'checked':'unchecked';}return clip(el.value,VALUE_MAX);}
document.addEventListener('click',function(e){try{if(quiet()){return;}var el=e.target&&e.target.closest?e.target.closest('button,a,label,input[type="button"],input[type="submit"],[role="button"],[aria-label]'):null;if(!el){return;}var lbl=labelOf(el);if(!lbl){return;}push({kind:'click',target:lbl,tag:el.tagName.toLowerCase()},tagOf(e));}catch(err){}},true);
document.addEventListener('change',function(e){try{if(quiet()){return;}var el=e.target;if(!isField(el)||isGuarded(el)){return;}var name=fieldLabel(el);if(typeTimers[name]){clearTimeout(typeTimers[name]);delete typeTimers[name];}push({kind:'change',target:name,value:fieldValue(el)},tagOf(e));}catch(err){}},true);
document.addEventListener('input',function(e){try{if(quiet()){return;}var el=e.target;if(!isField(el)||isGuarded(el)){return;}var t=(el.type||'').toLowerCase();if(t==='checkbox'||t==='radio'){return;}var name=fieldLabel(el),by=tagOf(e);if(typeTimers[name]){clearTimeout(typeTimers[name]);}typeTimers[name]=setTimeout(function(){delete typeTimers[name];try{push({kind:'input',target:name,value:clip(el.value,VALUE_MAX)},by);}catch(e2){}},TYPE_MS);}catch(err){}},true);
document.addEventListener('focusin',function(e){try{if(quiet()){return;}var el=e.target;if(!isField(el)||isPrivate(el)){return;}push({kind:'focus',target:fieldLabel(el)},tagOf(e));}catch(err){}});
document.addEventListener('focusout',function(e){try{if(quiet()){return;}var el=e.target;if(!isField(el)||isPrivate(el)){return;}push({kind:'blur',target:fieldLabel(el)},tagOf(e));}catch(err){}});
var AUTO_DEDUPE_MS=600;
function ownLabelText(el){try{var t='';if(el.labels&&el.labels.length){t=el.labels[0].textContent||'';}if(!t&&el.closest){var w=el.closest('label');t=w?(w.textContent||''):'';}return t.replace(/\\s+/g,' ').trim();}catch(e){return '';}}
function checkedValue(el){var v=el.getAttribute?el.getAttribute('value'):null;if(v!=null&&v.trim()!==''){return clip(v,VALUE_MAX);}var lt=ownLabelText(el);return clip(lt||el.value,VALUE_MAX);}
function collectFields(scope){var out={},els=(scope&&scope.querySelectorAll?scope:document).querySelectorAll('input,select,textarea');for(var i=0;i<els.length;i++){var el=els[i];if(isGuarded(el)){continue;}var t=(el.type||'').toLowerCase();if((t==='radio'||t==='checkbox')&&!el.checked){continue;}var name=fieldLabel(el);if(t==='checkbox'){(out[name]=Array.isArray(out[name])?out[name]:[]).push(checkedValue(el));}else if(t==='radio'){out[name]=checkedValue(el);}else{out[name]=clip(el.value,VALUE_MAX);}}return out;}
function autoSubmit(scope,trigger,by){try{if(quiet()){return;}var last=window.MJWhiteboard.__lastSubmitAt||0;if(Date.now()-last<AUTO_DEDUPE_MS){return;}var fields=collectFields(scope);var payload={__auto:true,trigger:clip(trigger||'submit',LABEL_MAX),fields:fields};H.forced=by||'user';try{window.MJWhiteboard.submit(payload);}finally{H.forced=null;}}catch(err){}}
document.addEventListener('submit',function(e){try{e.preventDefault();autoSubmit(e.target,'form',tagOf(e));}catch(err){}},true);
document.addEventListener('click',function(e){try{var b=e.target&&e.target.closest?e.target.closest('button,input[type="submit"],input[type="button"]'):null;if(!b){return;}var label=(labelOf(b)||'')+' '+(b.getAttribute('type')||'');if(!/submit|send|done|go\\b|answer|check/i.test(label)){return;}var by=tagOf(e);setTimeout(function(){autoSubmit(b.form||document,labelOf(b)||'button',by);},150);}catch(err){}},true);
H.flush=flushNow;H.clip=clip;H.isPrivate=isPrivate;H.isGuarded=isGuarded;H.labelOf=labelOf;H.fieldLabel=fieldLabel;H.ownLabelText=ownLabelText;H.checkedValue=checkedValue;
})();
`;

/**
 * Section 2 — AUTHOR TAGGING (PLAN §6.6). Decides per event whether the agent or the person
 * caused it, at EVENT time:
 *  - while an operate step runs synchronously, or in the same task as an untrusted click
 *    inside the agent window (its trusted `input` / `change` / `submit` consequences) → agent;
 *  - `isTrusted === true` → user, always;
 *  - untrusted inside the agent window (a command running, plus 750 ms) → agent; outside → user.
 * An explicit `MJWhiteboard.submit` is agent only inside the window AND when the last input
 * event before it (recorded by a window capture listener) was agent-tagged, or there was none
 * since the window opened. The recorder queue flushes at the window's start and end, and
 * `push` also flushes whenever the author changes, so every batch has a single author.
 */
const HELPER_AUTHOR_SECTION = String.raw`(function(){
var H=window.MJWhiteboard.__h,WINDOW_MS=750;
var active=0,windowEnd=0,windowStart=0,stepDepth=0,cascade=false,silentDepth=0,lastInput=null,endTimer=null;
function inWindow(){return active>0||Date.now()<windowEnd;}
function decide(trusted){if(stepDepth>0||cascade){return 'agent';}if(trusted){return 'user';}return inWindow()?'agent':'user';}
function flushQueue(){try{if(H.flush){H.flush();}}catch(e){}}
H.tagOf=function(e){try{return decide(!!(e&&e.isTrusted));}catch(err){return 'user';}};
H.agentBegin=function(){flushQueue();if(!inWindow()){windowStart=Date.now();}active++;};
H.agentEnd=function(){active=Math.max(0,active-1);if(active>0){return;}windowEnd=Date.now()+WINDOW_MS;flushQueue();if(endTimer){clearTimeout(endTimer);}endTimer=setTimeout(function(){endTimer=null;if(!inWindow()){flushQueue();}},WINDOW_MS+1);};
H.step=function(fn){stepDepth++;try{return fn();}finally{stepDepth--;}};
H.silence=function(fn){silentDepth++;try{fn();}finally{setTimeout(function(){silentDepth=Math.max(0,silentDepth-1);},0);}};
H.silent=function(){return silentDepth>0;};
H.submitTag=function(){if(H.forced){return H.forced;}if(!inWindow()){return 'user';}if(stepDepth>0||cascade){return 'agent';}if(lastInput&&lastInput.at>=windowStart){return lastInput.by;}return 'agent';};
function noteInput(e){try{var trusted=!!e.isTrusted;lastInput={by:decide(trusted),at:Date.now()};if(!trusted&&e.type==='click'&&inWindow()&&!cascade){cascade=true;setTimeout(function(){cascade=false;},0);}}catch(err){}}
var kinds=['pointerdown','mousedown','keydown','click','input','change','submit'];
for(var i=0;i<kinds.length;i++){window.addEventListener(kinds[i],noteInput,true);}
})();
`;

/**
 * Section 3 — INSPECT (PLAN §6.2): the text outline the agent reads, plus target resolution
 * for operate. Refs (`f1…` fields, `a1…` actions) live in a helper-private map rebuilt on
 * every outline; nothing is stamped into the widget DOM. Visibility is decided by computed
 * style and attributes (never geometry: a hidden pane and jsdom both report zero sizes).
 * Password / hidden inputs are omitted; protected fields show `[REDACTED, not writable]`.
 * The protected test runs on NORMALIZED names (camelCase and `_` / `-` split into words,
 * lowercased), so `cc_number`, `otpCode`, `ssnLast4`, `PIN code` match while `Flashcard`,
 * `Spinner`, `Pinned`, `Opinion` don't. `__h.scrub` drops password / protected keys (and any
 * key that itself names a protected thing) from submit data before `answered` / `submitted`.
 */
const HELPER_INSPECT_SECTION = String.raw`(function(){
var H=window.MJWhiteboard.__h,OUTLINE_MAX=3000,TEXT_MAX=160,VALUE_MAX=120,LABEL_MAX=60,TRUNC='\n… (truncated)';
var PROTECTED=/passw|passcode|\botp\b|\bone ?time\b|cvv|cvc|\bcvn\b|\bcsc\b|card ?(number|num|no)\b|credit ?card|\bcc ?(number|num|no)\b|\bccnum\b|\bssn\b|social ?security|security ?code|\bpin\b|\biban\b|routing ?number|account ?number/;
var INTERACTIVE='button,a[href],input,select,textarea,[role=button],[role=checkbox],[role=radio],[role=tab],[role=switch],[role=slider],[role=option],[role=link],[contenteditable]';
var CONTEXT='h1,h2,h3,h4,h5,h6,p,li,dt,dd,legend,caption,figcaption,blockquote,td,th,div';
var refs={};
function attr(el,n){return el&&el.getAttribute?el.getAttribute(n):null;}
function txt(el){return ((el&&el.textContent)||'').replace(/\s+/g,' ').trim();}
function q(s){return JSON.stringify(String(s==null?'':s));}
function isFieldEl(el){var t=el.tagName;var ce=attr(el,'contenteditable');return t==='INPUT'||t==='SELECT'||t==='TEXTAREA'||(ce!=null&&String(ce).toLowerCase()!=='false');}
function norm(s){return String(s==null?'':s).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function protectedName(s){return PROTECTED.test(norm(s));}
function isProtected(el){try{if(!isFieldEl(el)){return false;}var ac=String(attr(el,'autocomplete')||'').toLowerCase();if(ac.indexOf('cc-')===0||ac==='one-time-code'){return true;}var hay=[attr(el,'name'),el.id,attr(el,'aria-label'),H.fieldLabel(el),H.ownLabelText(el)];for(var i=0;i<hay.length;i++){if(hay[i]&&protectedName(hay[i])){return true;}}return false;}catch(e){return true;}}
function guardedKeys(){var out={},els=document.querySelectorAll('input,select,textarea');for(var i=0;i<els.length;i++){var el=els[i],tag=el.tagName.toLowerCase();if(String(el.type||'').toLowerCase()!=='password'&&!isProtected(el)){continue;}var ks=[attr(el,'name'),el.id,attr(el,'aria-label'),H.fieldLabel(el),H.ownLabelText(el)];for(var j=0;j<ks.length;j++){if(ks[j]&&ks[j]!==tag){out[ks[j]]=1;}}}return out;}
function scrubIn(v,keys,depth){if(v===null||typeof v!=='object'||depth>4){return v;}if(Array.isArray(v)){var a=[];for(var i=0;i<v.length;i++){a.push(scrubIn(v[i],keys,depth+1));}return a;}var o={};for(var k in v){if(Object.prototype.hasOwnProperty.call(v,k)&&!keys.hasOwnProperty(k)&&!protectedName(k)){o[k]=scrubIn(v[k],keys,depth+1);}}return o;}
function summaryOf(d){for(var c=d.firstElementChild;c;c=c.nextElementSibling){if(c.tagName==='SUMMARY'){return c;}}return null;}
function hidden(el){for(var n=el;n&&n.nodeType===1;n=n.parentElement){if(n.hasAttribute('hidden')||attr(n,'aria-hidden')==='true'){return true;}if(n.tagName==='DETAILS'&&n!==el&&!n.hasAttribute('open')){var s=summaryOf(n);if(!s||!(s===el||s.contains(el))){return true;}}var cs=window.getComputedStyle?window.getComputedStyle(n):null;if(cs){if(cs.display==='none'){return true;}if(n===el&&(cs.visibility==='hidden'||cs.visibility==='collapse')){return true;}}}return false;}
function kindOf(el){var tag=el.tagName.toLowerCase(),role=String(attr(el,'role')||'').toLowerCase(),t=String(el.type||'').toLowerCase();
if(tag==='input'){if(t==='hidden'||t==='password'){return null;}if(t==='button'||t==='submit'||t==='reset'||t==='image'){return {k:'a',t:'button'};}return {k:'f',t:t||'text'};}
if(tag==='select'){return {k:'f',t:'select'};}if(tag==='textarea'){return {k:'f',t:'textarea'};}
if(role==='checkbox'||role==='switch'||role==='radio'||role==='slider'){return {k:'f',t:role,aria:true};}
if(tag==='button'||role==='button'){return {k:'a',t:'button'};}if(role==='tab'||role==='option'){return {k:'a',t:role};}if(tag==='a'||role==='link'){return {k:'a',t:'link'};}
var ce=attr(el,'contenteditable');if(ce!=null&&String(ce).toLowerCase()!=='false'){return {k:'f',t:'editable'};}return null;}
function actionLabel(el){return H.clip(attr(el,'aria-label')||txt(el)||(el.tagName==='INPUT'?el.value:'')||attr(el,'title')||attr(el,'alt')||H.labelOf(el)||'',LABEL_MAX);}
function fieldName(el,c){if(c.aria){return H.clip(attr(el,'aria-label')||txt(el)||H.labelOf(el),LABEL_MAX);}if(c.t==='radio'||c.t==='checkbox'){return H.clip(H.ownLabelText(el)||attr(el,'aria-label')||attr(el,'value')||H.fieldLabel(el),LABEL_MAX);}if(c.t==='editable'){return H.clip(attr(el,'aria-label')||attr(el,'name')||el.id||'text',LABEL_MAX);}var v=attr(el,'aria-label')||visLabel(el);if(v){return H.clip(v,LABEL_MAX);}var l=H.fieldLabel(el);if(l===el.tagName.toLowerCase()&&attr(el,'placeholder')){l=H.clip(attr(el,'placeholder'),LABEL_MAX);}return l;}
function visLabel(el){try{var lb=(el.labels&&el.labels.length)?el.labels[0]:(el.closest?el.closest('label'):null);if(!lb){return '';}var c=lb.cloneNode(true),x=c.querySelectorAll('input,select,textarea,button');for(var i=0;i<x.length;i++){x[i].parentNode.removeChild(x[i]);}return (c.textContent||'').replace(/\s+/g,' ').trim();}catch(e){return '';}}
function range(a,b){return ' ('+(a==null||a===''?'?':a)+'–'+(b==null||b===''?'?':b)+')';}
function options(el){var o=[];for(var i=0;i<el.options.length;i++){o.push(txt(el.options[i]));}return ' (options: '+H.clip(o.join(', '),VALUE_MAX)+')';}
function selected(el){var s=[];for(var i=0;i<el.options.length;i++){if(el.options[i].selected){s.push(txt(el.options[i]));}}return s.join(', ');}
function valueOf(el,c){if(c.aria){if(c.t==='slider'){var n=attr(el,'aria-valuenow');return (n==null?'?':H.clip(n,VALUE_MAX))+range(attr(el,'aria-valuemin'),attr(el,'aria-valuemax'));}return attr(el,'aria-checked')==='true'?'checked':'unchecked';}
if(c.t==='radio'||c.t==='checkbox'){return el.checked?'checked':'unchecked';}if(c.t==='range'){return H.clip(el.value,VALUE_MAX)+range(el.min||'0',el.max||'100');}
if(c.t==='number'){return el.value===''?'""':H.clip(el.value,VALUE_MAX);}if(c.t==='select'){return q(H.clip(selected(el),VALUE_MAX))+options(el);}
if(c.t==='editable'){return q(H.clip(txt(el),VALUE_MAX));}return q(H.clip(el.value,VALUE_MAX));}
function isDisabled(el){try{if(el.matches&&el.matches(':disabled')){return true;}}catch(e){}return !!(el.disabled||attr(el,'aria-disabled')==='true');}
function flags(el){var s='';if(isDisabled(el)){s+=' [disabled]';}if(el.readOnly){s+=' [readonly]';}if(el.closest&&el.closest('[data-mj-agent="off"]')){s+=' [not operable]';}return s;}
function line(el,c,ref){if(c.k==='a'){return ref+' '+c.t+' '+q(actionLabel(el))+(attr(el,'aria-selected')==='true'?' (selected)':'')+flags(el);}
var s=ref+' '+c.t+' '+q(fieldName(el,c));if((c.t==='radio'||c.t==='checkbox')&&!c.aria&&attr(el,'name')){s+=' (group '+q(H.clip(attr(el,'name'),LABEL_MAX))+')';}
return s+' = '+(isProtected(el)?'[REDACTED, not writable]':valueOf(el,c))+flags(el);}
function context(el){if(el.querySelector(INTERACTIVE+','+CONTEXT)){return null;}var p=el.parentElement;if(p&&p.closest&&p.closest(INTERACTIVE+',label')){return null;}var t=txt(el);if(!t||t.length>TEXT_MAX||hidden(el)){return null;}var tag=el.tagName.toLowerCase();return {text:(/^h[1-6]$/.test(tag)?tag:'text')+' '+q(t)};}
function scan(){var out=[],root=document.body||document.documentElement;if(!root){return out;}var all=root.querySelectorAll(INTERACTIVE+','+CONTEXT);for(var i=0;i<all.length;i++){var el=all[i];if(el.matches(INTERACTIVE)){var c=kindOf(el);if(c&&!hidden(el)){out.push({el:el,c:c});}continue;}var item=context(el);if(item){out.push(item);}}return out;}
function header(){var st=H.stateInfo?H.stateInfo():null,acts=H.actionList?H.actionList():[],s='widget',t=(document.title||'').replace(/\s+/g,' ').trim(),n=[];if(t){s+=' '+q(H.clip(t,LABEL_MAX));}
for(var i=0;i<acts.length;i++){n.push(acts[i].name);}if(n.length){s+=' · actions: '+n.join(', ');}
if(st&&st.declared!=null){s+=' · state: '+H.clip(JSON.stringify(st.declared),200);}if(st&&st.answered){s+=' · answered '+new Date(st.answered.at).toISOString();}return s;}
function answeredOut(a){var d=a.data,s='';try{s=JSON.stringify(d);}catch(e){s='';}return {at:a.at,data:s&&s.length>2000?H.clip(s,2000):(d===undefined?null:d)};}
H.isProtected=isProtected;H.isFieldEl=isFieldEl;H.isDisabled=isDisabled;
H.scrub=function(data){try{return scrubIn(data,guardedKeys(),0);}catch(e){return null;}};
H.inspect=function(){refs={};var f=0,a=0,first=header(),lines=[first],len=first.length,cut=false,items=scan();
for(var i=0;i<items.length;i++){var it=items[i],ref=it.c?(it.c.k==='f'?'f'+(f+1):'a'+(a+1)):'',s=it.c?line(it.el,it.c,ref):it.text;
if(len+1+s.length>OUTLINE_MAX-TRUNC.length){cut=true;break;}if(it.c){if(it.c.k==='f'){f++;}else{a++;}refs[ref]=it.el;}lines.push(s);len+=1+s.length;}
var res={outline:lines.join('\n')+(cut?TRUNC:''),actions:H.actionList?H.actionList():[]},st=H.stateInfo?H.stateInfo():null;
if(st&&st.declared!=null){res.state=H.clip(JSON.stringify(st.declared),500);}if(st&&st.answered){res.answered=answeredOut(st.answered);}return res;};
function refOf(el){for(var k in refs){if(refs.hasOwnProperty(k)&&refs[k]===el){return k;}}return null;}
function describe(list){var out=[];for(var i=0;i<list.length&&i<8;i++){var el=list[i],r=refOf(el),c=kindOf(el),l=c?(c.k==='a'?actionLabel(el):fieldName(el,c)):H.labelOf(el);out.push((r?r+' ':'')+q(l));}return out.join(', ')+(list.length>8?', …':'');}
function ambiguous(t,list){for(var k=0;k<list.length;k++){if(!refOf(list[k])){try{H.inspect();}catch(e){}break;}}return {code:'ambiguous_target',error:q(t)+' matches '+list.length+' elements: '+describe(list)+'. Use a ref or a more specific label.'};}
function labelsOf(el,c){var l=[c.k==='a'?actionLabel(el):fieldName(el,c)],more=[H.fieldLabel(el),attr(el,'aria-label'),attr(el,'placeholder'),c.k==='a'?'':visLabel(el)];for(var i=0;i<more.length;i++){if(more[i]&&l.indexOf(more[i])<0){l.push(more[i]);}}return l;}
function matchLabels(cands,test){var out=[];for(var i=0;i<cands.length;i++){for(var j=0;j<cands[i].labels.length;j++){if(test(cands[i].labels[j])){out.push(cands[i].el);break;}}}return out;}
H.resolve=function(target){var t=String(target==null?'':target).trim();if(!t){return {code:'invalid_args',error:'A step has no target.'};}
if(/^[fa]\d+$/.test(t)){var r=refs[t];if(!r||!document.documentElement.contains(r)){return {code:'stale_ref',error:'Ref '+t+' is not from the current widget outline. Inspect the widget again, or target by label.'};}return {el:r};}
var items=scan(),cands=[],i,lt=t.toLowerCase();for(i=0;i<items.length;i++){if(items[i].c){cands.push({el:items[i].el,labels:labelsOf(items[i].el,items[i].c)});}}
var hit=matchLabels(cands,function(l){return l===t;});if(hit.length===1){return {el:hit[0]};}if(hit.length>1){return ambiguous(t,hit);}
hit=matchLabels(cands,function(l){return l.toLowerCase().indexOf(lt)>=0;});if(hit.length===1){return {el:hit[0]};}if(hit.length>1){return ambiguous(t,hit);}
var sel=null;try{sel=document.querySelectorAll(t);}catch(e){sel=null;}if(sel&&sel.length===1){return {el:sel[0]};}if(sel&&sel.length>1){var arr=[];for(i=0;i<sel.length;i++){arr.push(sel[i]);}return ambiguous(t,arr);}
return {code:'target_not_found',error:'Nothing in the widget matches '+q(t)+'. Inspect it for refs and labels.'};};
})();
`;

/**
 * Section 4 — OPERATE (PLAN §6.3): run 1–5 steps in order, yielding one macrotask between
 * steps and re-resolving each target when it runs; stop at the first failure. Values are set
 * through the PROTOTYPE setter followed by bubbling `input` + `change`, so framework value
 * trackers (React and friends) see a real change. Each touched control gets a feedback ring
 * (an overlay; the widget's own styles are never touched). The reply waits one macrotask +
 * 250 ms (timers, never `requestAnimationFrame`, which stalls in a non-rendered frame) so an
 * auto-submit lands in `submitted`.
 */
const HELPER_OPERATE_SECTION = String.raw`(function(){
var H=window.MJWhiteboard.__h,MAX_STEPS=5,SETTLE_MS=250,RING_MS=800,REPLY_ROOM=7900,OPS={click:1,set:1,select:1,check:1,uncheck:1,focus:1},captures=[];
H.onSubmit=function(raw){var data=H.scrub?H.scrub(raw):raw;for(var i=0;i<captures.length;i++){captures[i].fired=true;captures[i].data=data;}try{if(H.recordAnswered){H.recordAnswered(data);}}catch(e){}};
function q(s){return JSON.stringify(String(s==null?'':s));}
function txt(el){return ((el&&el.textContent)||'').replace(/\s+/g,' ').trim();}
function typeOf(el){return String(el.type||'').toLowerCase();}
function fail(code,error){var r={ok:false,error:error};if(code){r.code=code;}return r;}
function fire(el,type){var ev;try{ev=new Event(type,{bubbles:true});}catch(e){ev=document.createEvent('Event');ev.initEvent(type,true,false);}el.dispatchEvent(ev);}
function setNative(el,v){var p=Object.getPrototypeOf(el),d=null;while(p&&!d){d=Object.getOwnPropertyDescriptor(p,'value');p=Object.getPrototypeOf(p);}if(d&&d.set){d.set.call(el,v);}else{el.value=v;}}
H.fire=fire;H.setNative=setNative;
function editable(el){var ce=el.getAttribute('contenteditable');return ce!=null&&String(ce).toLowerCase()!=='false';}
function choice(el){return el.tagName==='INPUT'&&(typeOf(el)==='checkbox'||typeOf(el)==='radio');}
function ariaChoice(el){var r=String(el.getAttribute('role')||'').toLowerCase();return r==='checkbox'||r==='switch'||r==='radio';}
function doCheck(el,want){if(choice(el)){if(typeOf(el)==='radio'&&!want){return fail('invalid_args','A radio option cannot be unchecked; check another option instead.');}if(el.checked!==want){el.click();}return el.checked===want?{ok:true}:fail(null,'The widget kept the control '+(el.checked?'checked':'unchecked')+'.');}
if(ariaChoice(el)){if((el.getAttribute('aria-checked')==='true')!==want){el.click();}return {ok:true};}return fail('invalid_args','"check" / "uncheck" work on checkboxes, radios and switches.');}
function doSelect(el,v){if(el.tagName==='INPUT'&&typeOf(el)==='radio'){return doCheck(el,true);}if(el.tagName!=='SELECT'){return fail('invalid_args','"select" works on a select list or a radio option.');}if(v==null){return fail('invalid_args','"select" needs a value (an option value or label).');}
var o=el.options,hit=-1,i,lv=v.toLowerCase(),names=[];for(i=0;i<o.length&&hit<0;i++){if(o[i].value===v){hit=i;}}for(i=0;i<o.length&&hit<0;i++){if(txt(o[i])===v){hit=i;}}for(i=0;i<o.length&&hit<0;i++){if(txt(o[i]).toLowerCase()===lv){hit=i;}}
if(hit<0){for(i=0;i<o.length;i++){names.push(txt(o[i]));}return fail('target_not_found','No option '+q(v)+'. Options: '+H.clip(names.join(', '),200)+'.');}if(o[hit].disabled){return fail('disabled','That option is disabled.');}
if(el.multiple){o[hit].selected=true;}else{setNative(el,o[hit].value);if(el.selectedIndex!==hit){el.selectedIndex=hit;}}fire(el,'input');fire(el,'change');return {ok:true};}
function doSet(el,v){if(v==null){return fail('invalid_args','"set" needs a value.');}if(el.tagName==='SELECT'){return doSelect(el,v);}if(choice(el)){return fail('invalid_args','Use "check" or "uncheck" for a '+typeOf(el)+'.');}
if(el.tagName==='INPUT'||el.tagName==='TEXTAREA'){if(el.readOnly){return fail('disabled','The field is read-only.');}setNative(el,v);fire(el,'input');fire(el,'change');return {ok:true};}
if(editable(el)){el.textContent=v;fire(el,'input');return {ok:true};}return fail('invalid_args','"set" works on text fields, select lists and editable text.');}
function apply(el,op,v){switch(op){case 'click':if(el.click){el.click();}else{fire(el,'click');}return {ok:true};case 'focus':if(el.focus){el.focus();}return {ok:true};
case 'set':return doSet(el,v);case 'select':return doSelect(el,v);case 'check':return doCheck(el,true);case 'uncheck':return doCheck(el,false);}return fail('invalid_args','Unknown op.');}
function ring(el,color){try{var r=el.getBoundingClientRect(),d=document.createElement('div'),s=d.style,reduce=false;try{reduce=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}catch(e){}
d.setAttribute('aria-hidden','true');s.position='fixed';s.left=(r.left-3)+'px';s.top=(r.top-3)+'px';s.width=(r.width+6)+'px';s.height=(r.height+6)+'px';s.boxSizing='border-box';s.border='2px solid '+color;s.borderRadius='6px';s.pointerEvents='none';s.zIndex='2147483647';
if(!reduce){s.transition='opacity 300ms ease-out';}(document.body||document.documentElement).appendChild(d);setTimeout(function(){try{if(reduce){if(d.parentNode){d.parentNode.removeChild(d);}return;}s.opacity='0';setTimeout(function(){if(d.parentNode){d.parentNode.removeChild(d);}},300);}catch(e){}},reduce?RING_MS:RING_MS-300);}catch(e){}}
function runStep(s,color){var r=H.resolve(s.target);if(!r.el){return fail(r.code,r.error);}var el=r.el;
if(H.isPrivate(el)||(H.isFieldEl(el)&&H.isProtected(el))){return fail('not_operable','That field is protected; the agent cannot read or change it.');}
if(el.closest&&el.closest('[data-mj-agent="off"]')){return fail('not_operable','The widget marks this control as not operable by the agent.');}
if(H.isDisabled(el)){return fail('disabled','The control is disabled.');}ring(el,color);return H.step(function(){return apply(el,s.op,s.value);});}
function parseSteps(args){var s=args&&args.steps,out=[];if(!s||typeof s.length!=='number'||s.length<1||s.length>MAX_STEPS){return null;}for(var i=0;i<s.length;i++){var x=s[i];if(!x||typeof x.target!=='string'||!OPS.hasOwnProperty(x.op)){return null;}
var v=x.value;if(v!=null&&typeof v!=='string'&&typeof v!=='number'&&typeof v!=='boolean'){return null;}out.push({target:x.target,op:x.op,value:v==null?null:String(v)});}return out;}
function ringColor(args){var c=args&&args.ringColor;return typeof c==='string'&&/^[#a-zA-Z0-9(),.%\s-]{1,64}$/.test(c)?c:'Highlight';}
function jsonable(d){try{var s=JSON.stringify(d===undefined?null:d);return s===undefined?null:JSON.parse(s);}catch(e){return '[the submitted data could not be serialized]';}}
H.operate=function(args,done){if(H.operable&&!H.operable()){done(false,null,'not_operable','This widget does not allow agent operation.');return;}
var steps=parseSteps(args);if(!steps){done(false,null,'invalid_args','operate needs 1-'+MAX_STEPS+' steps of { target, op, value? }.');return;}
var color=ringColor(args),results=[],i=0,cap={fired:false,data:null};captures.push(cap);H.agentBegin();
function finish(){var k=captures.indexOf(cap);if(k>=0){captures.splice(k,1);}var out={steps:results,outline:''};try{out.outline=H.inspect().outline;}catch(e){}
if(cap.fired){out.submitted=jsonable(cap.data);try{if(JSON.stringify(out).length>REPLY_ROOM){out.submitted='[the submitted data is too large to return here]';}}catch(e){}}H.agentEnd();done(true,out);}
function next(){var r;try{r=runStep(steps[i],color);}catch(e){r=fail(null,'The step failed: '+H.clip(e&&e.message?e.message:e,200));}results.push(r);i++;
if(!r.ok||i>=steps.length){setTimeout(function(){setTimeout(finish,SETTLE_MS);},0);return;}setTimeout(next,0);}
next();};
})();
`;

/**
 * Section 5 — ACTIONS (PLAN §6.4): `MJWhiteboard.onAction(name, handler, description?)` /
 * `offAction(name)`. Changes are announced (debounced 100 ms) once the ready message went
 * out; `call` runs the handler inside the agent window and replies with its JSON result.
 */
const HELPER_ACTIONS_SECTION = String.raw`(function(){
var M=window.MJWhiteboard,H=M.__h,NAME=/^[A-Za-z][\w-]{0,39}$/,MAX=30,DESC_MAX=200,REPLY_MAX=8000,actions={},order=[],postTimer=null;
function warn(m){try{if(window.console&&console.warn){console.warn('[MJWhiteboard] '+m);}}catch(e){}}
function message(e){return H.clip(e&&e.message?e.message:String(e),500);}
H.actionList=function(){var out=[];for(var i=0;i<order.length;i++){var o={name:order[i]},d=actions[order[i]].description;if(d){o.description=d;}out.push(o);}return out;};
function announce(){if(postTimer){clearTimeout(postTimer);}postTimer=setTimeout(function(){postTimer=null;try{if(H.readySent){parent.postMessage({__mjWhiteboardActions:true,actions:H.actionList()},'*');}}catch(e){}},100);}
M.onAction=function(name,handler,description){try{if(typeof name!=='string'||!NAME.test(name)){warn('onAction: invalid action name '+JSON.stringify(String(name)));return false;}if(typeof handler!=='function'){warn('onAction: the handler must be a function');return false;}
if(!actions.hasOwnProperty(name)){if(order.length>=MAX){warn('onAction: at most '+MAX+' actions');return false;}order.push(name);}
actions[name]={handler:handler,description:typeof description==='string'?H.clip(description.replace(/\s+/g,' ').trim(),DESC_MAX):''};announce();return true;}catch(e){return false;}};
M.offAction=function(name){try{if(!actions.hasOwnProperty(name)){return false;}delete actions[name];order.splice(order.indexOf(name),1);announce();return true;}catch(e){return false;}};
H.call=function(args,done){if(H.operable&&!H.operable()){done(false,null,'not_operable','This widget does not allow agent operation.');return;}var name=args&&args.action;
if(typeof name!=='string'||!name){done(false,null,'invalid_args','call needs an action name.');return;}
if(!actions.hasOwnProperty(name)){done(false,null,'unknown_action','The widget has no action '+JSON.stringify(name)+'. Registered: '+(order.length?order.join(', '):'none')+'.');return;}
var settled=false,p,handler=actions[name].handler,payload=args.payload===undefined?null:args.payload;H.agentBegin();
function end(ok,result,code,error){if(settled){return;}settled=true;H.agentEnd();done(ok,result,code,error);}
try{p=Promise.resolve(H.step(function(){return handler(payload);}));}catch(e){end(false,null,'action_failed',message(e));return;}
p.then(function(v){var json;try{json=JSON.stringify(v===undefined?null:v);}catch(e){end(false,null,'action_failed','The action returned a value that is not JSON-serializable.');return;}
if(json===undefined){json='null';}if(json.length+12>REPLY_MAX){end(false,null,'action_failed','The action result exceeds '+REPLY_MAX+' characters.');return;}end(true,{result:JSON.parse(json)});},
function(e){end(false,null,'action_failed',message(e));});};
})();
`;

/**
 * Section 6 — STATE (PLAN §6.5 + D13). ONE opaque state string per widget, a JSON envelope
 * `{ declared, fields, answered }`:
 *  - `declared` — what the widget saved with `MJWhiteboard.setState(obj)`; handed back once
 *    per document through `MJWhiteboard.onRestore(fn)` (on arrival, on a microtask when the
 *    restore came first, or `null` 3 s after ready when no MJ host answers);
 *  - `fields` / `answered` — AUTOMATIC form state for widgets with NO `onRestore` handler:
 *    form values (collectFields identity; password / hidden / protected never captured) and
 *    the last submit. Restored silently (recorder, auto-submit and submits muted; no state
 *    echo) by setting values and dispatching `input` + `change` so the widget re-syncs.
 *    Opt out with `data-mj-keep-live` on `<html>` / `<body>` or `configure({ autoState:false })`.
 * Field keys are the field label (placeholder for an unlabeled field); a repeated key gets
 * `#2`, `#3` in document order, and a named radio / checkbox group shares one key — the same
 * keying on capture and restore, so remounted fields land in the right place.
 * Outbound state is held until the restore was applied, debounced 500 ms, and capped at
 * 4000 chars (fields are dropped first; still oversize → console warning, not saved). Each
 * state message carries the per-document token as `doc`.
 */
const HELPER_STATE_SECTION = String.raw`(function(){
var M=window.MJWhiteboard,H=M.__h,STATE_MAX=4000,DEBOUNCE_MS=500,FALLBACK_MS=3000,FIELD_MAX=1000;
var env={declared:null,fields:null,answered:null},config={agentOperable:true,autoState:true};
var restoreFn=null,arrived=false,restoreValue=null,delivered=false,usesState=false,dirty=false,postTimer=null,fallbackTimer=null;
function warn(m){try{if(window.console&&console.warn){console.warn('[MJWhiteboard] '+m);}}catch(e){}}
function keepLive(){var d=document.documentElement,b=document.body;return !!((d&&d.hasAttribute('data-mj-keep-live'))||(b&&b.hasAttribute('data-mj-keep-live')));}
function auto(){return !restoreFn&&config.autoState!==false&&!keepLive();}
function copy(v){var s=JSON.stringify(v===undefined?null:v);return s===undefined?null:JSON.parse(s);}
H.operable=function(){return config.agentOperable!==false;};
H.usesState=function(){return usesState;};
H.stateInfo=function(){return {declared:env.declared,answered:auto()?env.answered:null};};
M.configure=function(o){try{if(o&&typeof o==='object'){if(typeof o.agentOperable==='boolean'){config.agentOperable=o.agentOperable;}if(typeof o.autoState==='boolean'){config.autoState=o.autoState;}}}catch(e){}};
function post(){postTimer=null;dirty=false;try{var e={declared:env.declared,fields:auto()?env.fields:null,answered:auto()?env.answered:null},s=JSON.stringify(e);
if(s.length>STATE_MAX&&e.fields){e.fields=null;s=JSON.stringify(e);}if(s.length>STATE_MAX){warn('widget state exceeds '+STATE_MAX+' characters; not saved');return;}var m={__mjWhiteboardState:true,state:s};if(H.doc){m.doc=H.doc;}parent.postMessage(m,'*');}catch(err){}}
function schedule(){dirty=true;if(!arrived){return;}if(postTimer){clearTimeout(postTimer);}postTimer=setTimeout(post,DEBOUNCE_MS);}
function deliver(){if(delivered||!restoreFn){return;}delivered=true;try{restoreFn(restoreValue);}catch(e){warn('onRestore handler threw: '+(e&&e.message?e.message:e));}}
M.setState=function(obj){try{env.declared=copy(obj);usesState=true;schedule();}catch(e){warn('setState: the state must be JSON-serializable');}};
M.onRestore=function(fn){try{if(typeof fn!=='function'||restoreFn){return;}restoreFn=fn;usesState=true;if(arrived){Promise.resolve().then(deliver);}}catch(e){}};
function fieldsEls(){var out=[],els=document.querySelectorAll('input,select,textarea');for(var i=0;i<els.length;i++){if(!H.isGuarded(els[i])){out.push(els[i]);}}return out;}
function baseKey(el){var l=H.fieldLabel(el),p=el.getAttribute('placeholder');return l===el.tagName.toLowerCase()&&p?H.clip(p,40):l;}
function keyed(){var out=[],seen={},groups={},els=fieldsEls();function uniq(b){var n=(seen.hasOwnProperty(b)?seen[b]:0)+1;seen[b]=n;return n===1?b:b+'#'+n;}
for(var i=0;i<els.length;i++){var el=els[i],t=String(el.type||'').toLowerCase(),nm=el.getAttribute('name'),k;if((t==='radio'||t==='checkbox')&&nm){var g=t+':'+nm;k=groups.hasOwnProperty(g)?groups[g]:(groups[g]=uniq(baseKey(el)));}else{k=uniq(baseKey(el));}out.push({el:el,key:k});}return out;}
function capture(){var out={},list=keyed();for(var i=0;i<list.length;i++){var el=list[i].el,t=String(el.type||'').toLowerCase(),name=list[i].key;
if(t==='checkbox'){var arr=Array.isArray(out[name])?out[name]:(out[name]=[]);if(el.checked){arr.push(H.checkedValue(el));}}else if(t==='radio'){if(el.checked){out[name]=H.checkedValue(el);}else if(!out.hasOwnProperty(name)){out[name]=null;}}else{out[name]=H.clip(el.value,FIELD_MAX);}}return out;}
function applyOne(el,v){var t=String(el.type||'').toLowerCase(),want;
if(t==='checkbox'){want=Array.isArray(v)&&v.indexOf(H.checkedValue(el))>=0;if(el.checked!==want){el.checked=want;H.fire(el,'input');H.fire(el,'change');}return;}
if(t==='radio'){want=v!=null&&H.checkedValue(el)===String(v);if(el.checked!==want){el.checked=want;if(want){H.fire(el,'input');H.fire(el,'change');}}return;}
if(typeof v==='string'&&el.value!==v){H.setNative(el,v);H.fire(el,'input');H.fire(el,'change');}}
function applyFields(fields){H.silence(function(){var list=keyed();for(var i=0;i<list.length;i++){var name=list[i].key;if(fields.hasOwnProperty(name)){try{applyOne(list[i].el,fields[name]);}catch(e){}}}});}
function parse(text){if(typeof text!=='string'||!text){return null;}var o=JSON.parse(text);if(o===null||typeof o!=='object'||Array.isArray(o)){return {declared:o,fields:null,answered:null};}
if(!o.hasOwnProperty('declared')&&!o.hasOwnProperty('fields')&&!o.hasOwnProperty('answered')){return {declared:o,fields:null,answered:null};}
var a=o.answered,f=o.fields;return {declared:o.declared===undefined?null:o.declared,fields:f&&typeof f==='object'&&!Array.isArray(f)?f:null,answered:a&&typeof a==='object'&&typeof a.at==='number'?{at:a.at,data:a.data===undefined?null:a.data}:null};}
H.restore=function(args){if(arrived){return;}arrived=true;if(fallbackTimer){clearTimeout(fallbackTimer);fallbackTimer=null;}var saved=null;try{saved=parse(args&&args.state);}catch(e){saved=null;}
restoreValue=saved?saved.declared:null;if(restoreValue!=null){env.declared=restoreValue;}
if(saved&&auto()){if(saved.fields){applyFields(saved.fields);env.fields=capture();}if(saved.answered){env.answered=saved.answered;}}
if(restoreFn){Promise.resolve().then(deliver);}if(!saved&&dirty){schedule();}else{dirty=false;}};
H.startRestoreFallback=function(){if(arrived||fallbackTimer){return;}fallbackTimer=setTimeout(function(){fallbackTimer=null;if(arrived){return;}arrived=true;restoreValue=null;deliver();if(dirty){schedule();}},FALLBACK_MS);};
H.recordAnswered=function(data){if(H.silent()||!auto()){return;}var d;try{d=copy(data);}catch(e){d=null;}env.answered={at:Date.now(),data:d};env.fields=capture();schedule();};
function onField(e){try{if(H.silent()||!auto()||!e.target||!H.isFieldEl(e.target)){return;}env.fields=capture();schedule();}catch(err){}}
document.addEventListener('input',onField,true);document.addEventListener('change',onField,true);
})();
`;

/**
 * Section 7 — the COMMAND channel (PLAN §6.1, §5): ready (once per document, with a random
 * document token; re-posted on `hello`), and the listener for host commands. A command is
 * accepted only when `event.source === parent` and it carries the command marker.
 */
const HELPER_COMMAND_SECTION = String.raw`(function(){
var H=window.MJWhiteboard.__h,REPLY_MAX=8000,doc=(Math.random().toString(36).slice(2,14)+Date.now().toString(36)).slice(0,32);H.doc=doc;
function reply(id,ok,result,code,error){try{var m={__mjWhiteboardReply:true,id:id,ok:!!ok};if(result!==undefined&&result!==null){m.result=result;}if(code){m.code=code;}if(error){m.error=H.clip(error,500);}
if(m.result!==undefined&&JSON.stringify(m.result).length>REPLY_MAX){delete m.result;m.ok=false;m.code=m.code||'action_failed';m.error='The widget reply exceeded '+REPLY_MAX+' characters.';}parent.postMessage(m,'*');}catch(e){}}
function ready(){try{H.readySent=true;parent.postMessage({__mjWhiteboardReady:true,doc:doc,actions:H.actionList(),hasState:H.usesState()},'*');H.startRestoreFallback();}catch(e){}}
function handle(d){var id=d.id,args=d.args&&typeof d.args==='object'?d.args:{},done=function(ok,result,code,error){reply(id,ok,result,code,error);};
switch(d.op){case 'hello':ready();done(true,null);return;case 'inspect':done(true,H.inspect());return;case 'operate':H.operate(args,done);return;case 'call':H.call(args,done);return;
case 'restoreState':H.restore(args);done(true,null);return;}done(false,null,'invalid_args','Unknown command '+JSON.stringify(String(d.op))+'.');}
window.addEventListener('message',function(e){try{if(e.source!==parent){return;}var d=e.data;if(!d||d.__mjWhiteboardCommand!==true||typeof d.id!=='string'){return;}try{handle(d);}catch(err){reply(d.id,false,null,null,'The widget helper failed: '+(err&&err.message?err.message:err));}}catch(err){}});
if(document.readyState!=='loading'){ready();}else{document.addEventListener('DOMContentLoaded',function(){ready();});}
})();`;

/**
 * The ONE helper script prepended to every widget `srcdoc` — defines `MJWhiteboard.submit`
 * (explicit input path), installs the passive ambient-interaction recorder, AND answers the
 * host's two-way commands (inspect / operate / call / restoreState / hello — see
 * `whiteboard-widget-protocol.ts`). Hand-written ES5 in seven IIFE sections (bridge, author,
 * inspect, operate, actions, state, commands) that share the helper-private
 * `MJWhiteboard.__h` namespace; every handler is try/catch-wrapped.
 * `'*'` as the target origin is acceptable here: the sandboxed frame has an opaque origin
 * (there is nothing else to address), and the HOST validates marker + `event.source`.
 *
 * The widget-facing API: `MJWhiteboard.submit(data)`, `onAction(name, handler, description?)`,
 * `offAction(name)`, `setState(obj)`, `onRestore(fn)`, and
 * `configure({ agentOperable?, autoState? })`. `data-mj-agent="off"` on a control (or an
 * ancestor) keeps the agent from operating it; `data-mj-keep-live` on `<html>` / `<body>`
 * turns off automatic form state.
 *
 * AUTHORSHIP: submit messages and interaction batches carry `by: 'agent'` when the helper
 * attributes them to an agent command (PLAN §6.6); absent means the user. It is a CLAIM —
 * the host applies its own time-window gate before trusting it.
 *
 * The recorder, in widget-side terms:
 *  - `click` — buttons / links / labels / role=button / aria-labeled elements only
 *    (body/div noise without a label is ignored); records the tag + best label
 *    (aria-label || name || id || trimmed textContent, ≤40 chars).
 *  - `change` — select / radio / checkbox / text fields: field label + new value
 *    (checkbox → 'checked'/'unchecked').
 *  - `input` — debounced per-field (800 ms): field label + current value.
 *  - `focusin` / `focusout` — field label only.
 *  - PRIVACY: `type="password"` / `type="hidden"` and protected (card / PIN / OTP / SSN /
 *    account …) fields are skipped entirely; every
 *    recorded value is truncated to 120 chars BEFORE leaving the frame.
 *  - BATCHING: events queue and flush via postMessage every 1500 ms or at 12 queued.
 *  - RESILIENCE: every handler body is try/catch-wrapped — recorder errors never leak
 *    into widget code.
 *
 * AUTO-SUBMIT FALLBACK: agent-generated widgets don't always wire
 * `MJWhiteboard.submit` — a plain `<form>` submit would NAVIGATE the sandboxed frame
 * (blanking the widget) and an inert Submit button goes nowhere. The helper therefore:
 *  - intercepts every `submit` event (preventDefault — the frame never navigates) and
 *    forwards the form's serialized fields as `{ __auto: true, fields }`;
 *  - watches clicks on submit-ish buttons (type=submit, or labeled submit/send/done/…)
 *    and, shortly after, forwards the nearest form's (or document's) fields the same way.
 *    The submit-ish test reads the type ATTRIBUTE: a typeless `<button>` reports
 *    `type === 'submit'` as a PROPERTY, which auto-submitted "Show hint" / "Play" buttons;
 *  - DEDUPES: an explicit `MJWhiteboard.submit` (or a prior auto-forward) within 600 ms
 *    suppresses the fallback, so well-built widgets never double-submit.
 *  - Serialization (`collectFields`) respects the recorder's privacy rules (password/hidden
 *    skipped, values clipped) and only checked radios/checkboxes contribute: text, select
 *    and textarea values as strings, the checked radio as a string, and every ticked
 *    checkbox of a group as an ARRAY of their values under the group's label — one stable
 *    shape whatever the count, so the agent can react to a multi-select answer. A ticked
 *    box or radio with NO `value` attribute reports its own label text (`<label>` wrapper
 *    or `for=`) instead of the native "on", so valueless agent HTML still says WHICH box;
 *    a non-blank `value` always wins (an empty or whitespace-only attribute counts as
 *    absent), and a box with neither keeps "on".
 */
export const WHITEBOARD_SUBMIT_HELPER =
  '<script>' + HELPER_BRIDGE_SECTION + HELPER_AUTHOR_SECTION + HELPER_INSPECT_SECTION + HELPER_OPERATE_SECTION
  + HELPER_ACTIONS_SECTION + HELPER_STATE_SECTION + HELPER_COMMAND_SECTION + '</script>';

/** Max serialized payload size (chars) accepted from one `MJWhiteboard.submit` call. */
export const WHITEBOARD_WIDGET_SUBMIT_MAX_CHARS = 8000;

/** One accepted widget submission, surfaced by the board/host `WidgetSubmitted` output. */
export interface WhiteboardWidgetSubmitEvent {
  /** The submitting widget's board item ID (e.g. `html-2`). */
  ItemID: string;
  /** The widget's header title ('' when untitled — consumers fall back to {@link ItemID}). */
  Title: string;
  /** The submitted payload, JSON-serialized (capped at {@link WHITEBOARD_WIDGET_SUBMIT_MAX_CHARS}). */
  DataJson: string;
  /**
   * `'agent'` when the widget helper claimed an agent command caused this submit (the wire
   * carried `by: 'agent'`); absent means the user. A CLAIM from widget-side code: the board
   * applies its own agent-window gate before trusting it.
   */
  Author?: WhiteboardAuthor;
}

/**
 * BEFORE-event args for the board/host `WidgetSubmitting` output — raised after a
 * widget's `MJWhiteboard.submit` payload passed validation (marker + tracked source +
 * size cap) but BEFORE it is surfaced through `WidgetSubmitted`. Handlers run
 * synchronously; set {@link Cancel} to `true` to drop the submission (no `WidgetSubmitted`
 * fires and nothing reaches the agent/consumer).
 */
export interface WhiteboardWidgetSubmittingEventArgs {
  /** The validated submission about to be surfaced. */
  Event: WhiteboardWidgetSubmitEvent;
  /** Set to `true` (in a synchronous handler) to drop the submission. */
  Cancel: boolean;
}

/** Why an incoming 'message' event was NOT surfaced as a widget submission. */
export type WhiteboardWidgetSubmitDropReason =
  /** Not a bridge message at all (no marker) — other postMessage traffic, ignore silently. */
  | 'not-submit'
  /** Marker present but `event.source` is not a tracked widget iframe — spoof/stale, drop. */
  | 'unknown-source'
  /** Payload serialized beyond the cap — warn + drop. */
  | 'oversize'
  /** Payload could not be JSON-serialized (e.g. `undefined` / function) — drop. */
  | 'unserializable';

/** Outcome of evaluating one window 'message' event against the bridge contract. */
export type WhiteboardWidgetSubmitOutcome =
  | { Kind: 'submit'; Event: WhiteboardWidgetSubmitEvent }
  | { Kind: 'dropped'; Reason: WhiteboardWidgetSubmitDropReason };

/**
 * Prepend the `MJWhiteboard.submit` helper to a widget's HTML source — EXACTLY once.
 * Idempotent: when the helper is already present (re-render of an injected source) the
 * input is returned unchanged, so memoized srcdocs never accumulate duplicate helpers.
 */
export function InjectWhiteboardSubmitHelper(html: string): string {
  if (html.includes(WHITEBOARD_SUBMIT_HELPER)) {
    return html;
  }
  return WHITEBOARD_SUBMIT_HELPER + html;
}

/**
 * Host-side validation of one window 'message' event:
 *
 *  1. the payload must carry the {@link WHITEBOARD_SUBMIT_MARKER} (anything else is
 *     unrelated postMessage traffic — dropped silently as `'not-submit'`);
 *  2. `sourceWidget` is the caller's resolution of `event.source` against its tracked
 *     widget iframes (window → item map) — `null` means the sender is NOT one of the
 *     board's widgets and the message is dropped (`'unknown-source'`);
 *  3. the submitted data is JSON-serialized and capped at
 *     {@link WHITEBOARD_WIDGET_SUBMIT_MAX_CHARS} (`'oversize'` beyond it).
 */
export function EvaluateWidgetSubmitMessage(
  messageData: unknown,
  sourceWidget: { ItemID: string; Title?: string } | null
): WhiteboardWidgetSubmitOutcome {
  if (messageData === null || typeof messageData !== 'object'
    || (messageData as Record<string, unknown>)[WHITEBOARD_SUBMIT_MARKER] !== true) {
    return { Kind: 'dropped', Reason: 'not-submit' };
  }
  if (!sourceWidget) {
    return { Kind: 'dropped', Reason: 'unknown-source' };
  }
  let dataJson: string | undefined;
  try {
    dataJson = JSON.stringify((messageData as Record<string, unknown>)['data']);
  }
  catch {
    dataJson = undefined; // circular payloads can't cross postMessage, but stay defensive
  }
  if (dataJson === undefined) {
    return { Kind: 'dropped', Reason: 'unserializable' };
  }
  if (dataJson.length > WHITEBOARD_WIDGET_SUBMIT_MAX_CHARS) {
    return { Kind: 'dropped', Reason: 'oversize' };
  }
  const event: WhiteboardWidgetSubmitEvent = { ItemID: sourceWidget.ItemID, Title: sourceWidget.Title ?? '', DataJson: dataJson };
  if (claimsAgentAuthor(messageData)) {
    event.Author = 'agent';
  }
  return { Kind: 'submit', Event: event };
}

/** True when a bridge message carries the helper's `by: 'agent'` authorship claim. */
function claimsAgentAuthor(messageData: object): boolean {
  return (messageData as Record<string, unknown>)['by'] === 'agent';
}

// ───────────────────────────────────────────────────────────── ambient interactions

/** Max serialized size (chars) accepted for one ambient interaction BATCH. */
export const WHITEBOARD_WIDGET_INTERACTION_MAX_CHARS = 6000;

/** Max length of one summarized interaction line (see {@link SummarizeWidgetInteractions}). */
export const WHITEBOARD_INTERACTION_SUMMARY_MAX_CHARS = 300;

/** The event kinds the in-widget recorder emits. */
export type WhiteboardWidgetInteractionKind = 'click' | 'change' | 'input' | 'focus' | 'blur';

/** One recorded in-widget interaction, as posted by the injected recorder. */
export interface WhiteboardWidgetInteractionRecord {
  /** What happened. */
  kind: WhiteboardWidgetInteractionKind;
  /** Best label of the interacted element (aria-label || name || id || text, ≤40 chars). */
  target: string;
  /** The field's value after the event (change/input only; checkbox → 'checked'/'unchecked'). */
  value?: string;
  /** The clicked element's tag name (click only). */
  tag?: string;
}

/**
 * One accepted ambient-interaction batch, surfaced by the board/host `WidgetInteraction`
 * output. `Summary` is the compact human line built by {@link SummarizeWidgetInteractions}
 * — what integration layers forward to their agent runtime.
 */
export interface WhiteboardWidgetInteractionEvent {
  /** The widget's board item ID (e.g. `html-2`). */
  ItemID: string;
  /** The widget's header title ('' when untitled — consumers fall back to {@link ItemID}). */
  Title: string;
  /** Compact human summary of the batch (≤{@link WHITEBOARD_INTERACTION_SUMMARY_MAX_CHARS} chars). */
  Summary: string;
  /**
   * `'agent'` when the helper claimed the whole batch was caused by an agent command (batches
   * are single-author); absent means the user. A CLAIM — the board applies its own gate.
   */
  Author?: WhiteboardAuthor;
}

/** Why an incoming 'message' event was NOT surfaced as an ambient interaction batch. */
export type WhiteboardWidgetInteractionDropReason =
  /** Not an interaction message at all (no marker) — other postMessage traffic, ignore silently. */
  | 'not-interaction'
  /** Marker present but `event.source` is not a tracked widget iframe — spoof/stale, drop. */
  | 'unknown-source'
  /** Serialized batch beyond {@link WHITEBOARD_WIDGET_INTERACTION_MAX_CHARS} — warn + drop. */
  | 'oversize'
  /** `events` missing / empty / not the documented record shape — warn + drop. */
  | 'bad-shape';

/** Outcome of evaluating one window 'message' event against the interaction contract. */
export type WhiteboardWidgetInteractionOutcome =
  | { Kind: 'interaction'; Event: WhiteboardWidgetInteractionEvent }
  | { Kind: 'dropped'; Reason: WhiteboardWidgetInteractionDropReason };

const INTERACTION_KINDS: ReadonlySet<string> = new Set(['click', 'change', 'input', 'focus', 'blur']);

/** Shape-check one entry of an interaction batch against {@link WhiteboardWidgetInteractionRecord}. */
function isInteractionRecord(value: unknown): value is WhiteboardWidgetInteractionRecord {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record['kind'] === 'string' && INTERACTION_KINDS.has(record['kind'])
    && typeof record['target'] === 'string'
    && (record['value'] === undefined || typeof record['value'] === 'string')
    && (record['tag'] === undefined || typeof record['tag'] === 'string');
}

/**
 * Host-side validation of one ambient-interaction 'message' event — mirrors the submit
 * path: marker required (`'not-interaction'` otherwise), `sourceWidget` must resolve to a
 * tracked widget iframe (`'unknown-source'`), the `events` array must be a non-empty list
 * of well-shaped {@link WhiteboardWidgetInteractionRecord}s (`'bad-shape'`), and the
 * serialized batch is capped at {@link WHITEBOARD_WIDGET_INTERACTION_MAX_CHARS}
 * (`'oversize'`). Accepted batches come back pre-summarized (via
 * {@link SummarizeWidgetInteractions}) as a {@link WhiteboardWidgetInteractionEvent}.
 */
export function EvaluateWidgetInteractionMessage(
  messageData: unknown,
  sourceWidget: { ItemID: string; Title?: string } | null
): WhiteboardWidgetInteractionOutcome {
  if (messageData === null || typeof messageData !== 'object'
    || (messageData as Record<string, unknown>)[WHITEBOARD_INTERACTION_MARKER] !== true) {
    return { Kind: 'dropped', Reason: 'not-interaction' };
  }
  if (!sourceWidget) {
    return { Kind: 'dropped', Reason: 'unknown-source' };
  }
  const events = (messageData as Record<string, unknown>)['events'];
  if (!Array.isArray(events) || events.length === 0 || !events.every(isInteractionRecord)) {
    return { Kind: 'dropped', Reason: 'bad-shape' };
  }
  if (JSON.stringify(events).length > WHITEBOARD_WIDGET_INTERACTION_MAX_CHARS) {
    return { Kind: 'dropped', Reason: 'oversize' };
  }
  const event: WhiteboardWidgetInteractionEvent = {
    ItemID: sourceWidget.ItemID,
    Title: sourceWidget.Title ?? '',
    Summary: SummarizeWidgetInteractions(events)
  };
  if (claimsAgentAuthor(messageData)) {
    event.Author = 'agent';
  }
  return { Kind: 'interaction', Event: event };
}

/** Defensive host-side re-clip (the recorder already truncates, but trust nothing). */
function clipValue(value: string): string {
  return value.length > WHITEBOARD_INTERACTION_VALUE_MAX_CHARS
    ? value.slice(0, WHITEBOARD_INTERACTION_VALUE_MAX_CHARS)
    : value;
}

/** Render one interaction record as a human fragment. */
function interactionPhrase(record: WhiteboardWidgetInteractionRecord): string {
  switch (record.kind) {
    case 'click':
      return record.target ? `clicked "${record.target}"` : `clicked ${record.tag ?? 'element'}`;
    case 'change':
      return record.value !== undefined
        ? `changed "${record.target}" to "${clipValue(record.value)}"`
        : `changed "${record.target}"`;
    case 'input':
      return `typing in "${record.target}"`;
    case 'focus':
      return `focused "${record.target}"`;
    case 'blur':
      return `left "${record.target}"`;
  }
}

/**
 * Compress one validated interaction batch into a compact human line, e.g.
 * `clicked "Playful pink"; changed "vibe" to "pink"; typing in "email"`.
 *
 * Pure: consecutive same-field `input` (typing) records are deduped (the LAST wins —
 * matching the recorder's latest-value semantics), values are defensively re-truncated to
 * {@link WHITEBOARD_INTERACTION_VALUE_MAX_CHARS}, and the whole line is capped at
 * {@link WHITEBOARD_INTERACTION_SUMMARY_MAX_CHARS} chars (ellipsized).
 */
export function SummarizeWidgetInteractions(events: WhiteboardWidgetInteractionRecord[]): string {
  const deduped: WhiteboardWidgetInteractionRecord[] = [];
  for (const event of events) {
    const previous = deduped[deduped.length - 1];
    if (previous && event.kind === 'input' && previous.kind === 'input' && previous.target === event.target) {
      deduped[deduped.length - 1] = event; // consecutive same-field typing — latest wins
    }
    else {
      deduped.push(event);
    }
  }
  const line = deduped.map(interactionPhrase).join('; ');
  if (line.length > WHITEBOARD_INTERACTION_SUMMARY_MAX_CHARS) {
    return line.slice(0, WHITEBOARD_INTERACTION_SUMMARY_MAX_CHARS - 1) + '…';
  }
  return line;
}
