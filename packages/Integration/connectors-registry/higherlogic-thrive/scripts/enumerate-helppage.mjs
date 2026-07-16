#!/usr/bin/env node
// Parses the saved Higher Logic Community API v2.0 HelpPage index HTML into a
// structured operation catalog: controller -> [{ method, path, description, helpUrl }]
import fs from 'node:fs';

const file = process.argv[2] || 'helppage.index.html';
const html = fs.readFileSync(file, 'utf8');

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// Split into per-controller <h2 id="X">X</h2> [optional <p>...</p> controller-level description] <table>...</table> blocks
const controllerRe = /<h2 id="([A-Za-z0-9]+)">[^<]*<\/h2>\s*(?:<p>([\s\S]*?)<\/p>\s*)?<table class="help-page-table">([\s\S]*?)<\/table>/g;
const rowRe = /<a href="([^"]+)">([A-Z]+)\s+([^<]+)<\/a><\/td>\s*<td class="api-documentation">\s*<p>([\s\S]*?)<\/p>/g;

const catalog = {};
const controllerDescriptions = {};
let m;
while ((m = controllerRe.exec(html))) {
    const [, controller, controllerDesc, tableBody] = m;
    if (controllerDesc) controllerDescriptions[controller] = decode(controllerDesc.replace(/\s+/g, ' ').trim());
    const ops = [];
    let rm;
    rowRe.lastIndex = 0;
    while ((rm = rowRe.exec(tableBody))) {
        const [, href, method, rawPath, rawDesc] = rm;
        const path = decode(rawPath.trim());
        const desc = decode(rawDesc.replace(/\s+/g, ' ').trim());
        ops.push({ method, path, description: desc, helpUrl: 'https://api.connectedcommunity.org' + href });
    }
    catalog[controller] = ops;
}

const controllers = Object.keys(catalog);
const totalOps = controllers.reduce((sum, c) => sum + catalog[c].length, 0);

const summary = {
    controllerCount: controllers.length,
    controllers,
    totalOperations: totalOps,
    perController: Object.fromEntries(controllers.map(c => [c, catalog[c].length])),
    controllerDescriptions,
};

fs.writeFileSync('helppage.catalog.json', JSON.stringify(catalog, null, 2));
fs.writeFileSync('helppage.catalog.summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
