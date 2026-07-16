#!/usr/bin/env node
// Enumerate operations + complexTypes + elements from the MagnetMail (Higher Logic Marketing
// Enterprise) SOAP WSDL. No external deps — regex/string scan over the saved raw XML file.
import fs from 'fs';

const xml = fs.readFileSync(new URL('../sources/mmapi.wsdl.xml', import.meta.url), 'utf8');

// ---------- 1. Top-level <s:element name="X"> blocks (request/response element defs) ----------
// These appear directly under <s:schema>, each either a simple wrapper of a complexType, or
// inline complexType/sequence. Capture element name + its raw inner content up to the matching
// closing </s:element> at the same nesting depth (approx via depth counting on s:element/s:complexType).
function extractTopLevelElements(xmlStr) {
    const elements = [];
    const re = /<s:element name="([^"]+)"(\s*\/>|>)/g;
    let m;
    while ((m = re.exec(xmlStr)) !== null) {
        const name = m[1];
        const selfClosing = m[2].trim() === '/>';
        if (selfClosing) {
            elements.push({ name, body: '', selfClosing: true });
            continue;
        }
        // find matching close by depth-counting nested <s:element ...> / </s:element>
        let depth = 1;
        let idx = re.lastIndex;
        const openTagRe = /<s:element\b[^>]*?(\/>|>)/g;
        const closeTagRe = /<\/s:element>/g;
        // Manual scan char-by-char using a combined regex for speed
        let pos = idx;
        const combined = /<s:element\b[^>]*?(\/>)|<s:element\b[^>]*?>|<\/s:element>/g;
        combined.lastIndex = pos;
        let cm;
        let endIdx = -1;
        while ((cm = combined.exec(xmlStr)) !== null) {
            if (cm[0].endsWith('/>')) {
                // self-closing nested element, no depth change
                continue;
            } else if (cm[0] === '</s:element>') {
                depth--;
                if (depth === 0) { endIdx = cm.index; break; }
            } else {
                depth++;
            }
        }
        if (endIdx === -1) endIdx = xmlStr.length;
        const body = xmlStr.slice(idx, endIdx);
        elements.push({ name, body, selfClosing: false });
        re.lastIndex = endIdx;
    }
    return elements;
}

// ---------- 2. Fields within an element/complexType body ----------
// Self-closing <s:element .../> tags with attrs in ANY order (minOccurs, maxOccurs, name, type,
// nillable). Extract each attr independently rather than assuming fixed attribute order.
function extractFields(body) {
    const tagRe = /<s:element\b([^>]*?)\/>/g;
    const fields = [];
    let m;
    while ((m = tagRe.exec(body)) !== null) {
        const attrs = m[1];
        const nameM = /\bname="([^"]+)"/.exec(attrs);
        const typeM = /\btype="([^"]+)"/.exec(attrs);
        if (!nameM || !typeM) continue; // skip anonymous/complex-inline fields (rare in this WSDL)
        const minM = /\bminOccurs="(\d+)"/.exec(attrs);
        const maxM = /\bmaxOccurs="([^"]+)"/.exec(attrs);
        const nillM = /\bnillable="([^"]+)"/.exec(attrs);
        fields.push({
            minOccurs: minM ? minM[1] : '1',
            maxOccurs: maxM ? maxM[1] : '1',
            name: nameM[1],
            type: typeM[1].replace(/^(s|tns):/, ''),
            nillable: nillM ? nillM[1] === 'true' : false,
        });
    }
    return fields;
}

// ---------- 3. Named complexTypes (<s:complexType name="X">...</s:complexType>) ----------
function extractNamedComplexTypes(xmlStr) {
    const types = {};
    const re = /<s:complexType name="([^"]+)">/g;
    let m;
    while ((m = re.exec(xmlStr)) !== null) {
        const name = m[1];
        const startIdx = re.lastIndex;
        // find matching close by depth count on s:complexType
        const combined = /<s:complexType\b[^>]*?(\/>)|<s:complexType\b[^>]*?>|<\/s:complexType>/g;
        combined.lastIndex = startIdx;
        let depth = 1;
        let cm;
        let endIdx = -1;
        while ((cm = combined.exec(xmlStr)) !== null) {
            if (cm[0].endsWith('/>')) continue;
            else if (cm[0] === '</s:complexType>') { depth--; if (depth === 0) { endIdx = cm.index; break; } }
            else depth++;
        }
        if (endIdx === -1) endIdx = xmlStr.length;
        const body = xmlStr.slice(startIdx, endIdx);
        types[name] = { fields: extractFields(body), body };
        re.lastIndex = endIdx;
    }
    return types;
}

// ---------- 4. wsdl:operation -> input/output message names ----------
function extractPortTypeOperations(xmlStr) {
    const ops = [];
    const ptRe = /<wsdl:portType name="MagnetMail_x0020_Web_x0020_ServiceSoap">([\s\S]*?)<\/wsdl:portType>/;
    const ptMatch = ptRe.exec(xmlStr);
    if (!ptMatch) return ops;
    const ptBody = ptMatch[1];
    const opRe = /<wsdl:operation name="([^"]+)">\s*<wsdl:documentation[^>]*>([\s\S]*?)<\/wsdl:documentation>\s*<wsdl:input message="tns:([^"]+)"\s*\/>\s*<wsdl:output message="tns:([^"]+)"\s*\/>/g;
    let m;
    while ((m = opRe.exec(ptBody)) !== null) {
        ops.push({ name: m[1], documentation: m[2].trim(), inputMessage: m[3], outputMessage: m[4] });
    }
    // fallback for ops without documentation tag
    const opRe2 = /<wsdl:operation name="([^"]+)">\s*<wsdl:input message="tns:([^"]+)"\s*\/>\s*<wsdl:output message="tns:([^"]+)"\s*\/>/g;
    let m2;
    while ((m2 = opRe2.exec(ptBody)) !== null) {
        if (!ops.find(o => o.name === m2[1])) {
            ops.push({ name: m2[1], documentation: '', inputMessage: m2[2], outputMessage: m2[3] });
        }
    }
    return ops;
}

// ---------- 5. wsdl:message -> part element name ----------
function extractMessages(xmlStr) {
    const messages = {};
    const re = /<wsdl:message name="([^"]+)">\s*<wsdl:part name="parameters" element="tns:([^"]+)"\s*\/>\s*<\/wsdl:message>/g;
    let m;
    while ((m = re.exec(xmlStr)) !== null) {
        messages[m[1]] = m[2];
    }
    return messages;
}

// ---------- 6. soap12 binding operation -> soapAction ----------
function extractSoapActions(xmlStr) {
    const actions = {};
    const bindRe = /<wsdl:binding name="MagnetMail_x0020_Web_x0020_ServiceSoap12"[\s\S]*?<\/wsdl:binding>/;
    const bindMatch = bindRe.exec(xmlStr);
    if (!bindMatch) return actions;
    const bindBody = bindMatch[0];
    const opRe = /<wsdl:operation name="([^"]+)">\s*<soap12:operation soapAction="([^"]*)"/g;
    let m;
    while ((m = opRe.exec(bindBody)) !== null) {
        actions[m[1]] = m[2];
    }
    return actions;
}

const topElements = extractTopLevelElements(xml);
const namedTypes = extractNamedComplexTypes(xml);
const portOps = extractPortTypeOperations(xml);
const messages = extractMessages(xml);
const soapActions = extractSoapActions(xml);

// Build a map: element name -> fields (either inline complexType fields, or fields via named type ref)
const elementFieldMap = {};
for (const el of topElements) {
    let fields = extractFields(el.body);
    // check if it references a named complexType via <s:complexType><s:complexContent>... not common here;
    // MagnetMail WSDL inlines sequences directly in most request/response elements.
    elementFieldMap[el.name] = fields;
}

// Also capture ArrayOf* wrapper types (named complexTypes) to know list-item shapes
const arrayOfTypes = Object.keys(namedTypes).filter(n => n.startsWith('ArrayOf'));

// Assemble operations with full detail
const operations = portOps.map(op => {
    const reqElementName = messages[op.inputMessage] || op.inputMessage;
    const respElementName = messages[op.outputMessage] || op.outputMessage;
    const reqFields = elementFieldMap[reqElementName] || [];
    const respFields = elementFieldMap[respElementName] || [];
    return {
        name: op.name,
        documentation: op.documentation,
        soapAction: soapActions[op.name] || null,
        requestElement: reqElementName,
        responseElement: respElementName,
        requestFields: reqFields,
        responseFields: respFields,
        hasPageNumber: reqFields.some(f => /page.?number/i.test(f.name)),
        hasPageCount: reqFields.some(f => /page.?count/i.test(f.name)),
        hasUTC: /utc/i.test(op.name),
        idFields: reqFields.filter(f => /_id$/i.test(f.name)).map(f => f.name),
        respIdFields: respFields.filter(f => /_id$/i.test(f.name)).map(f => f.name),
    };
});

// Independent cross-check signals
const opCountFromAsmx = 55; // counted earlier via grep on the .asmx service description page
const opCountFromWsdlOperationTag = (xml.match(/<wsdl:operation name="/g) || []).length / 2; // appears in portType + binding(s) -> divide
const namedComplexTypeCount = Object.keys(namedTypes).length;
const topElementCount = topElements.length;

const summary = {
    operationCount: operations.length,
    opCountFromAsmxPage: opCountFromAsmx,
    namedComplexTypeCount,
    arrayOfTypeCount: arrayOfTypes.length,
    topElementCount,
    operations: operations.map(o => ({
        name: o.name,
        soapAction: o.soapAction,
        requestElement: o.requestElement,
        responseElement: o.responseElement,
        requestFieldCount: o.requestFields.length,
        responseFieldCount: o.responseFields.length,
        hasPageNumber: o.hasPageNumber,
        hasPageCount: o.hasPageCount,
        hasUTC: o.hasUTC,
        idFields: o.idFields,
        respIdFields: o.respIdFields,
    })),
};

fs.writeFileSync(new URL('./output/enumerated-operations.json', import.meta.url), JSON.stringify({ operations, namedTypes: Object.fromEntries(Object.entries(namedTypes).map(([k,v]) => [k, v.fields])) }, null, 2));
console.log(JSON.stringify(summary, null, 2));
