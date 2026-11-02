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
        buildVersionOverrides(name, taskpaneUrl, icon),
        '</OfficeApp>',
        '',
    ].join('\n');
}

function buildVersionOverrides(name: string, taskpaneUrl: string, icon: (size: number) => string): string {
    const icons = '<Icon><bt:Image size="16" resid="Icon.16x16"/><bt:Image size="32" resid="Icon.32x32"/><bt:Image size="80" resid="Icon.80x80"/></Icon>';
    return [
        '  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="VersionOverridesV1_0">',
        '    <Hosts>',
        '      <Host xsi:type="Workbook">',
        '        <DesktopFormFactor>',
        '          <GetStarted>',
        '            <Title resid="GetStarted.Title"/>',
        '            <Description resid="GetStarted.Description"/>',
        '            <LearnMoreUrl resid="Taskpane.Url"/>',
        '          </GetStarted>',
        // Required by the schema; the pane page is a valid function file and no ExecuteFunction action uses it.
        '          <FunctionFile resid="Taskpane.Url"/>',
        '          <ExtensionPoint xsi:type="PrimaryCommandSurface">',
        '            <OfficeTab id="TabData">',
        '              <Group id="MJ.ExcelAddin.Group">',
        '                <Label resid="Group.Label"/>',
        `                ${icons}`,
        '                <Control xsi:type="Button" id="MJ.ExcelAddin.TaskpaneButton">',
        '                  <Label resid="Button.Label"/>',
        '                  <Supertip><Title resid="Button.Label"/><Description resid="Button.Tooltip"/></Supertip>',
        `                  ${icons}`,
        `                  <Action xsi:type="ShowTaskpane"><TaskpaneId>${AUTO_SHOW_TASKPANE_ID}</TaskpaneId><SourceLocation resid="Taskpane.Url"/></Action>`,
        '                </Control>',
        '              </Group>',
        '            </OfficeTab>',
        '          </ExtensionPoint>',
        '        </DesktopFormFactor>',
        '      </Host>',
        '    </Hosts>',
        buildResources(name, taskpaneUrl, icon),
        '  </VersionOverrides>',
    ].join('\n');
}

function buildResources(name: string, taskpaneUrl: string, icon: (size: number) => string): string {
    const image = (size: number): string => `        <bt:Image id="Icon.${size}x${size}" DefaultValue="${EscapeXml(icon(size))}"/>`;
    const short = (id: string, text: string): string => `        <bt:String id="${id}" DefaultValue="${EscapeXml(text.slice(0, MAX_SHORT_STRING))}"/>`;
    const long = (id: string, text: string): string => `        <bt:String id="${id}" DefaultValue="${EscapeXml(text)}"/>`;
    return [
        '    <Resources>',
        '      <bt:Images>',
        image(16),
        image(32),
        image(80),
        '      </bt:Images>',
        '      <bt:Urls>',
        `        <bt:Url id="Taskpane.Url" DefaultValue="${EscapeXml(taskpaneUrl)}"/>`,
        '      </bt:Urls>',
        '      <bt:ShortStrings>',
        short('GetStarted.Title', `Get ${name} data in Excel`),
        short('Group.Label', name),
        short('Button.Label', name),
        '      </bt:ShortStrings>',
        '      <bt:LongStrings>',
        long('GetStarted.Description', `Open a view or query in ${name} and choose Open in Excel. Sign in here to fill it, and refresh any time.`),
        long('Button.Tooltip', `Open the ${name} pane to sign in and refresh this workbook's data.`),
        '      </bt:LongStrings>',
        '    </Resources>',
    ].join('\n');
}
