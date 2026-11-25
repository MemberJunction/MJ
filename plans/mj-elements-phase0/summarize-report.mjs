#!/usr/bin/env node
/** Prints the parts of a saved report that FINDINGS.md cites. `node summarize-report.mjs reports/<file>.json` */
import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(`page: ${r.page}\ncsp: ${r.csp}   support: ${r.supportVariant}   order: ${r.order}\nsummary: ${JSON.stringify(r.summary)}`);
for (const s of r.steps) {
    console.log(`\n[${s.step}] ${s.label}`);
    console.log(`  singletons ${s.singletons.count}, BaseSingleton copies ${s.singletons.baseSingletonCopies}; added: ${s.singletons.addedByThisStep.join(', ') || 'none'}; identity changed: ${s.singletons.identityChanged.join(', ') || 'none'}`);
    console.log(`  entries: ${s.singletons.entries.map((e) => `${e.key}[ctor ${e.ctor}, id ${e.identity}, copy ${e.baseCopy}${e.classRegistrations != null ? `, ${e.classRegistrations} class registrations, base classes registered under two copies: ${(e.baseClassesWithTwoCopies || []).join(' ') || 'none'}` : ''}]`).join(' ')}`);
    console.log(`  instanceof: ${JSON.stringify(s.singletons.instanceof)}`);
    console.log(`  zone: ${s.zone.present ? 'present' : 'absent'} ${s.zone.firstSeen ? `(first set at step ${s.zone.firstSeen.step + 1} by ${s.zone.firstSeen.stack.split('|')[0].trim()})` : ''}`);
    console.log(`  fonts: ${s.fonts.fontFaceRules.length} @font-face [${s.fonts.fontFaceRules.map((f) => `${f.where}: ${f.family} ${f.weight}`).join('; ')}], document.fonts [${s.fonts.documentFonts.map((f) => `${f.family} ${f.weight} ${f.status}`).join('; ')}], duplicates ${JSON.stringify(s.fonts.duplicates)}`);
    const st = s.styles;
    const pick = (o) => (o ? `font ${o['font-family'].split(',')[0]}, color ${o.color}, bg ${o['background-color']}, border ${o['border-style']}, letter-spacing ${o['letter-spacing']}, text-transform ${o['text-transform']}` : 'n/a');
    console.log(`  host probe: ${pick(st.hostProbe)}\n  host button: ${pick(st.hostButton)}\n  host --mj-brand-primary: ${st.hostTokenBrandPrimary}`);
    console.log(`  realtime A button: ${pick(st.realtimeA_anyButton)}\n  realtime B button: ${pick(st.realtimeB_anyButton)}`);
    console.log(`  support launcher (shadow): ${pick(st.supportShadow_launcher)}\n  support host element: ${pick(st.supportShadow_hostElement)}\n  support shadow <style>: ${JSON.stringify(st.supportShadow_styleElements)}`);
    console.log(`  mj-form: ${pick(st.form)} | button ${pick(st.form_anyButton)}\n  orders: ${pick(st.orders)} | button ${pick(st.orders_anyButton)}\n  caliber: ${pick(st.caliber)} | button ${pick(st.caliber_anyButton)} | text ${pick(st.caliber_firstText)}`);
    console.log(`  layout: ${JSON.stringify(s.layout)}`);
    console.log(`  nonces: head styles ${s.nonces.headStyleCount} (with nonce ${s.nonces.headStylesWithNonce}, without: ${JSON.stringify(s.nonces.headStylesWithoutNonce)}), nonces used ${JSON.stringify(s.nonces.headStyleNonces)}, shell: ${JSON.stringify(s.nonces.realtimeShellStyleElement)}, adopted ${s.nonces.documentAdoptedStyleSheets}, preload links ${JSON.stringify(s.nonces.preloadLinks)}`);
    console.log(`  color-scheme: ${JSON.stringify(s.colorScheme)}`);
    console.log(`  defined: ${s.customElementsDefined.join(', ')}; body children ${s.bodyChildren}, head children ${s.headChildren}`);
    if (s.fetched) console.log(`  fetched so far: ${s.fetched.files} bundle files, ${(s.fetched.bytes / 1024).toFixed(0)} KB raw: ${s.fetched.list.map((f) => `${f.file} (${(f.bytes / 1024).toFixed(0)} KB)`).join(', ')}`);
    if (s.realtimePhases) console.log(`  realtime phases: ${s.realtimePhases.join(' > ')}`);
    if (s.newErrors.length) console.log(`  errors: ${JSON.stringify(s.newErrors)}`);
    if (s.newCspViolations.length) console.log(`  CSP violations: ${JSON.stringify(s.newCspViolations)}`);
}
