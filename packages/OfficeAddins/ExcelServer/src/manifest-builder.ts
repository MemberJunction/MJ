/**
 * @fileoverview Builds the Office add-in manifest each MJ host serves for itself.
 *
 * An add-in-only XML manifest (`TaskPaneApp`). Elements follow the schema's required order, which
 * Office validates strictly. The ribbon button's `ShowTaskpane` action uses the reserved TaskpaneId
 * `Office.AutoShowTaskpaneWithDocument`: that ID is what lets a workbook tagged by the workbook
 * builder open this pane when the file opens.
 *
 * @module @memberjunction/excel-addin-server
 */
import { TrimTrailingSlashes } from '@memberjunction/global';
import { EXCEL_ADDIN_PATHS } from './runtime';

/** What the manifest needs to know about the host. */
export interface ExcelAddinManifestOptions {
    AddinId: string;
    Version: string;
    /** Shown as the add-in's name and on its ribbon button. */
    ServerName: string;
    /** The add-in's public base URL on this host. */
    AddinUrl: string;
    /** Where MJ Explorer runs; its origin is listed as an app domain. */
    ExplorerUrl: string;
}

/** The reserved TaskpaneId that ties a workbook's web-extension part to this pane. */
export const AUTO_SHOW_TASKPANE_ID = 'Office.AutoShowTaskpaneWithDocument';

const MAX_SHORT_STRING = 125;

/** Escapes text for an XML attribute or element. */
export function EscapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** The add-in manifest XML for one host. */
export function BuildExcelAddinManifest(options: ExcelAddinManifestOptions): string {
    const base = TrimTrailingSlashes(options.AddinUrl);
    const name = options.ServerName.slice(0, MAX_SHORT_STRING);
    const description = `Load ${name} views and queries into Excel, and refresh them as you.`.slice(0, 250);
    const taskpaneUrl = `${base}${EXCEL_ADDIN_PATHS.Taskpane}`;
    const functionsScriptUrl = `${base}${EXCEL_ADDIN_PATHS.FunctionsScript}`;
    const functionsMetadataUrl = `${base}${EXCEL_ADDIN_PATHS.FunctionsJson}`;
    const icon = (size: number): string => `${base}${EXCEL_ADDIN_PATHS.Assets}/icon-${size}.png`;
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0" xmlns:ov="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="TaskPaneApp">',
        `  <Id>${EscapeXml(options.AddinId)}</Id>`,
        `  <Version>${EscapeXml(options.Version)}</Version>`,
        '  <ProviderName>MemberJunction</ProviderName>',
        '  <DefaultLocale>en-US</DefaultLocale>',
        `  <DisplayName DefaultValue="${EscapeXml(name)}"/>`,
        `  <Description DefaultValue="${EscapeXml(description)}"/>`,
        `  <IconUrl DefaultValue="${EscapeXml(icon(32))}"/>`,
        `  <HighResolutionIconUrl DefaultValue="${EscapeXml(icon(64))}"/>`,
        `  <SupportUrl DefaultValue="${EscapeXml(TrimTrailingSlashes(options.ExplorerUrl))}"/>`,
        '  <AppDomains>',
        `    <AppDomain>${EscapeXml(new URL(options.ExplorerUrl).origin)}</AppDomain>`,
        '  </AppDomains>',
        '  <Hosts>',
        '    <Host Name="Workbook"/>',
        '  </Hosts>',
        '  <Requirements>',
        '    <Sets DefaultMinVersion="1.1">',
        '      <Set Name="ExcelApi" MinVersion="1.4"/>',
        '      <Set Name="DialogApi" MinVersion="1.1"/>',
        '    </Sets>',
        '  </Requirements>',
        '  <DefaultSettings>',
        `    <SourceLocation DefaultValue="${EscapeXml(taskpaneUrl)}"/>`,
        '  </DefaultSettings>',
        '  <Permissions>ReadWriteDocument</Permissions>',
        buildVersionOverrides(name, taskpaneUrl, functionsScriptUrl, functionsMetadataUrl, icon),
        '</OfficeApp>',
        '',
    ].join('\n');
}

function buildDesktopFormFactor(indent: string, icons: string): string {
    return [
        `${indent}<DesktopFormFactor>`,
        `${indent}  <GetStarted>`,
        `${indent}    <Title resid="GetStarted.Title"/>`,
        `${indent}    <Description resid="GetStarted.Description"/>`,
        `${indent}    <LearnMoreUrl resid="Taskpane.Url"/>`,
        `${indent}  </GetStarted>`,
        `${indent}  <FunctionFile resid="Taskpane.Url"/>`,
        `${indent}  <ExtensionPoint xsi:type="PrimaryCommandSurface">`,
        `${indent}    <OfficeTab id="TabData">`,
        `${indent}      <Group id="MJ.ExcelAddin.Group">`,
        `${indent}        <Label resid="Group.Label"/>`,
        `${indent}        ${icons}`,
        `${indent}        <Control xsi:type="Button" id="MJ.ExcelAddin.TaskpaneButton">`,
        `${indent}          <Label resid="Button.Label"/>`,
        `${indent}          <Supertip><Title resid="Button.Label"/><Description resid="Button.Tooltip"/></Supertip>`,
        `${indent}          ${icons}`,
        `${indent}          <Action xsi:type="ShowTaskpane"><TaskpaneId>${AUTO_SHOW_TASKPANE_ID}</TaskpaneId><SourceLocation resid="Taskpane.Url"/></Action>`,
        `${indent}        </Control>`,
        `${indent}      </Group>`,
        `${indent}    </OfficeTab>`,
        `${indent}  </ExtensionPoint>`,
        `${indent}</DesktopFormFactor>`,
    ].join('\n');
}

function buildVersionOverrides(
    name: string,
    taskpaneUrl: string,
    functionsScriptUrl: string,
    functionsMetadataUrl: string,
    icon: (size: number) => string,
): string {
    const icons = '<Icon><bt:Image size="16" resid="Icon.16x16"/><bt:Image size="32" resid="Icon.32x32"/><bt:Image size="80" resid="Icon.80x80"/></Icon>';
    return [
        '  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="VersionOverridesV1_0">',
        '    <Hosts>',
        '      <Host xsi:type="Workbook">',
        buildDesktopFormFactor('        ', icons),
        '      </Host>',
        '    </Hosts>',
        buildResources('    ', name, taskpaneUrl, icon),
        '    <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides/1.1" xsi:type="VersionOverridesV1_1">',
        '      <Requirements>',
        '        <bt:Sets DefaultMinVersion="1.1">',
        '          <bt:Set Name="CustomFunctionsRuntime" MinVersion="1.1"/>',
        '        </bt:Sets>',
        '      </Requirements>',
        '      <Hosts>',
        '        <Host xsi:type="Workbook">',
        '          <AllFormFactors>',
        '            <ExtensionPoint xsi:type="CustomFunctions">',
        '              <Script>',
        '                <SourceLocation resid="Functions.Script.Url"/>',
        '              </Script>',
        '              <Page>',
        '                <SourceLocation resid="Taskpane.Url"/>',
        '              </Page>',
        '              <Metadata>',
        '                <SourceLocation resid="Functions.Metadata.Url"/>',
        '              </Metadata>',
        '              <Namespace resid="Functions.Namespace"/>',
        '            </ExtensionPoint>',
        '          </AllFormFactors>',
        buildDesktopFormFactor('          ', icons),
        '        </Host>',
        '      </Hosts>',
        buildResources('      ', name, taskpaneUrl, icon, { functionsScriptUrl, functionsMetadataUrl }),
        '    </VersionOverrides>',
        '  </VersionOverrides>',
    ].join('\n');
}

function buildResources(
    indent: string,
    name: string,
    taskpaneUrl: string,
    icon: (size: number) => string,
    customFunctions?: { functionsScriptUrl: string; functionsMetadataUrl: string },
): string {
    const image = (size: number): string => `${indent}    <bt:Image id="Icon.${size}x${size}" DefaultValue="${EscapeXml(icon(size))}"/>`;
    const short = (id: string, text: string): string => `${indent}    <bt:String id="${id}" DefaultValue="${EscapeXml(text.slice(0, MAX_SHORT_STRING))}"/>`;
    const long = (id: string, text: string): string => `${indent}    <bt:String id="${id}" DefaultValue="${EscapeXml(text)}"/>`;
    const extraUrls = customFunctions
        ? [
              `${indent}    <bt:Url id="Functions.Script.Url" DefaultValue="${EscapeXml(customFunctions.functionsScriptUrl)}"/>`,
              `${indent}    <bt:Url id="Functions.Metadata.Url" DefaultValue="${EscapeXml(customFunctions.functionsMetadataUrl)}"/>`,
          ]
        : [];
    const extraShorts = customFunctions ? [short('Functions.Namespace', 'MJ')] : [];
    return [
        `${indent}<Resources>`,
        `${indent}  <bt:Images>`,
        image(16),
        image(32),
        image(80),
        `${indent}  </bt:Images>`,
        `${indent}  <bt:Urls>`,
        `${indent}    <bt:Url id="Taskpane.Url" DefaultValue="${EscapeXml(taskpaneUrl)}"/>`,
        ...extraUrls,
        `${indent}  </bt:Urls>`,
        `${indent}  <bt:ShortStrings>`,
        ...extraShorts,
        short('GetStarted.Title', `Get ${name} data in Excel`),
        short('Group.Label', name),
        short('Button.Label', name),
        `${indent}  </bt:ShortStrings>`,
        `${indent}  <bt:LongStrings>`,
        long('GetStarted.Description', `Open a view or query in ${name} and choose Open in Excel. Sign in here to fill it, and refresh any time.`),
        long('Button.Tooltip', `Open the ${name} pane to sign in and refresh this workbook's data.`),
        `${indent}  </bt:LongStrings>`,
        `${indent}</Resources>`,
    ].join('\n');
}
