import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import xml2js from "xml2js";
import xpath from "xpath";
import { DOMParser } from "@xmldom/xmldom";
import { JSONParamHelper } from "../utilities/json-param-helper";
import { BaseAction } from '@memberjunction/actions';

/**
 * Action that parses XML data and extracts content using XPath expressions
 * Supports namespaces, various return types, and multiple input sources
 * 
 * @example
 * ```typescript
 * // Parse XML and extract with XPath
 * await runAction({
 *   ActionName: 'XML Parser',
 *   Params: [{
 *     Name: 'XMLData',
 *     Value: '<users><user id="1"><name>John</name></user><user id="2"><name>Jane</name></user></users>'
 *   }, {
 *     Name: 'XPathExpression',
 *     Value: '//user[@id="1"]/name/text()'
 *   }]
 * });
 * 
 * // Parse XML with namespaces
 * await runAction({
 *   ActionName: 'XML Parser',
 *   Params: [{
 *     Name: 'XMLData',
 *     Value: '<ns:root xmlns:ns="http://example.com"><ns:value>Test</ns:value></ns:root>'
 *   }, {
 *     Name: 'XPathExpression',
 *     Value: '//ns:value/text()'
 *   }, {
 *     Name: 'NamespaceMap',
 *     Value: { ns: 'http://example.com' }
 *   }]
 * });
 * 
 * // Convert entire XML to JSON
 * await runAction({
 *   ActionName: 'XML Parser',
 *   Params: [{
 *     Name: 'XMLData',
 *     Value: '<root><item>Value 1</item><item>Value 2</item></root>'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "XML Parser")
export class XMLParserAction extends BaseFileHandlerAction {
    
    /**
     * Parses XML and extracts data using XPath expressions
     * 
     * @param params - The action parameters containing:
     *   - XMLData: String containing XML data (direct input)
     *   - FileID: UUID of MJ Storage file (alternative)
     *   - FileURL: URL of XML file (alternative)
     *   - XPathExpression: XPath query to extract data (optional - if not provided, converts entire XML to JSON)
     *   - NamespaceMap: Object mapping namespace prefixes to URIs
     *   - ReturnType: "string" | "number" | "boolean" | "node" | "nodes" | "json" (default: "string")
     *   - PreserveAttributes: Boolean - include attributes in JSON conversion (default: true)
     *   - ExplicitArray: Boolean - always put child nodes in array (default: false)
     *   - IgnoreAttributes: Boolean - ignore attributes in conversion (default: false)
     * 
     * @returns Extracted data based on XPath or full JSON conversion
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Get file content from various sources
            const fileContent = await this.getFileContent(params, 'xmldata');
            
            // Get parameters
            const xpathExpression = this.getParamValue(params, 'xpathexpression');
            const namespaceMap = JSONParamHelper.getJSONParam(params, 'namespacemap') || {};
            const returnType = (this.getParamValue(params, 'returntype') || 'string').toLowerCase();
            const preserveAttributes = this.getBooleanParam(params, 'preserveattributes', true);
            const explicitArray = this.getBooleanParam(params, 'explicitarray', false);
            const ignoreAttributes = this.getBooleanParam(params, 'ignoreattributes', false);

            // Convert Buffer to string if necessary
            const xmlString = typeof fileContent.content === 'string' 
                ? fileContent.content 
                : fileContent.content.toString();

            // Validate XML
            if (!xmlString.trim()) {
                return {
                    Success: false,
                    Message: "XML data is empty",
                    ResultCode: "EMPTY_DATA"
                };
            }

            let result: any;

            if (xpathExpression) {
                // Use XPath to extract specific data
                result = await this.extractWithXPath(xmlString, xpathExpression, namespaceMap, returnType);
            } else {
                // Convert entire XML to JSON
                result = await this.convertToJSON(xmlString, {
                    preserveAttributes,
                    explicitArray,
                    ignoreAttributes
                });
            }

            // Prepare output
            const output = {
                result: result,
                source: fileContent.source,
                fileName: fileContent.fileName,
                extractionMethod: xpathExpression ? 'xpath' : 'full-conversion'
            };

            if (xpathExpression) {
                output['xpath'] = xpathExpression;
                output['returnType'] = returnType;
                if (Object.keys(namespaceMap).length > 0) {
                    output['namespaces'] = namespaceMap;
                }
            }

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(output, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to parse XML: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }

    /**
     * Extract data using XPath
     */
    private async extractWithXPath(
        xmlString: string, 
        xpathExpression: string, 
        namespaceMap: Record<string, string>,
        returnType: string
    ): Promise<any> {
        try {
            const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
            
            // Check for parsing errors
            const parseError = doc.getElementsByTagName('parsererror');
            if (parseError.length > 0) {
                throw new Error('XML parsing error: ' + parseError[0].textContent);
            }

            let nodes: any;
            
            if (Object.keys(namespaceMap).length > 0) {
                // Use namespace resolver
                const select = xpath.useNamespaces(namespaceMap);
                nodes = select(xpathExpression, doc);
            } else {
                // No namespaces
                nodes = xpath.select(xpathExpression, doc);
            }

            // Process results based on return type
            switch (returnType) {
                case 'string':
                    if (Array.isArray(nodes)) {
                        return nodes.map(n => this.nodeToString(n));
                    }
                    return this.nodeToString(nodes);
                    
                case 'number':
                    const numResult = Array.isArray(nodes) ? nodes[0] : nodes;
                    return Number(this.nodeToString(numResult));
                    
                case 'boolean':
                    return Boolean(nodes && (Array.isArray(nodes) ? nodes.length > 0 : true));
                    
                case 'node':
                    if (Array.isArray(nodes) && nodes.length > 0) {
                        return this.nodeToJSON(nodes[0]);
                    }
                    return nodes ? this.nodeToJSON(nodes) : null;
                    
                case 'nodes':
                    if (Array.isArray(nodes)) {
                        return nodes.map(n => this.nodeToJSON(n));
                    }
                    return nodes ? [this.nodeToJSON(nodes)] : [];
                    
                case 'json':
                default:
                    if (Array.isArray(nodes)) {
                        return nodes.map(n => this.nodeToJSON(n));
                    }
                    return nodes ? this.nodeToJSON(nodes) : null;
            }
        } catch (error) {
            throw new Error(`XPath extraction failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Convert node to string
     */
    private nodeToString(node: any): string {
        if (!node) return '';
        if (typeof node === 'string') return node;
        if (node.nodeValue !== undefined) return node.nodeValue;
        if (node.textContent !== undefined) return node.textContent;
        if (node.data !== undefined) return node.data;
        return node.toString();
    }

    /**
     * Convert node to JSON representation
     */
    private nodeToJSON(node: any): any {
        if (!node) return null;
        
        // Text node
        if (node.nodeType === 3) {
            return node.nodeValue;
        }
        
        // Attribute node
        if (node.nodeType === 2) {
            return node.nodeValue;
        }
        
        // Element node
        if (node.nodeType === 1) {
            const result: any = {};
            
            // Add attributes
            if (node.attributes && node.attributes.length > 0) {
                result['@attributes'] = {};
                for (let i = 0; i < node.attributes.length; i++) {
                    const attr = node.attributes[i];
                    result['@attributes'][attr.nodeName] = attr.nodeValue;
                }
            }
            
            // Add child nodes
            if (node.childNodes && node.childNodes.length > 0) {
                for (let i = 0; i < node.childNodes.length; i++) {
                    const child = node.childNodes[i];
                    if (child.nodeType === 1) { // Element
                        const childName = child.nodeName;
                        const childValue = this.nodeToJSON(child);
                        
                        if (result[childName]) {
                            // Convert to array if multiple children with same name
                            if (!Array.isArray(result[childName])) {
                                result[childName] = [result[childName]];
                            }
                            result[childName].push(childValue);
                        } else {
                            result[childName] = childValue;
                        }
                    } else if (child.nodeType === 3 && child.nodeValue.trim()) { // Text
                        result['@text'] = child.nodeValue;
                    }
                }
            }
            
            // If only text content, return it directly
            if (Object.keys(result).length === 1 && result['@text']) {
                return result['@text'];
            }
            
            return result;
        }
        
        return null;
    }

    /**
     * Convert entire XML to JSON using xml2js
     */
    private async convertToJSON(xmlString: string, options: any): Promise<any> {
        const parser = new xml2js.Parser({
            explicitArray: options.explicitArray,
            ignoreAttrs: options.ignoreAttributes,
            preserveChildrenOrder: true,
            explicitCharkey: true,
            trim: true,
            normalize: true,
            normalizeTags: false
        });

        return new Promise((resolve, reject) => {
            parser.parseString(xmlString, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    }
}