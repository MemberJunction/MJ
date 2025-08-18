/**
 * @fileoverview Library registry for approved third-party libraries
 * Maintains a secure registry of libraries that components can use
 * @module @memberjunction/react-runtime/utilities
 */

import { UserInfo } from "@memberjunction/core";
import { ComponentLibraryEntity, ComponentMetadataEngine } from "@memberjunction/core-entities";

/**
 * Library definition in the registry
 */
export interface LibraryDefinition {
  /** Library name (e.g., "Chart.js", "lodash") */
  name: string;
  /** Global variable name when loaded (e.g., "Chart", "_") */
  globalVariable: string;
  /** Category path for organization (e.g., "charting/advanced", "utility/date") */
  category: string;
  /** Available versions with their CDN URLs */
  versions: {
    [version: string]: {
      cdnUrl: string;
      /** Optional CSS URLs for UI libraries */
      cssUrls?: string[];
    };
  };
  /** Default version to use if not specified */
  defaultVersion: string;
}

/**
 * Registry of approved libraries that components can use
 * This is the security boundary - only libraries defined here can be loaded
 */
export class LibraryRegistry {
  private static libraries: Map<string, LibraryDefinition> = new Map();
  private static _configured: boolean = false;
  public static async Config(forceRefresh: boolean = false, contextUser: UserInfo) {
    if (!this._configured || forceRefresh) {
      // config the engine class
      await ComponentMetadataEngine.Instance.Config(false, contextUser)

      // next up, we need to map the component metadata to the library definitions 
      // with two steps - first step is that we need to group the libraries in the engine
      // by name and then we'll have all the versions for that particular library we can break
      // into versions in our structure
      const libraryGroups = new Map<string, ComponentLibraryEntity[]>();
      for (const lib of ComponentMetadataEngine.Instance.ComponentLibraries) {
        if (!libraryGroups.has(lib.Name)) {
          libraryGroups.set(lib.Name, []);
        }
        libraryGroups.get(lib.Name)!.push(lib);
      }

      // now we have grouped libraries using the ComponentLibraryEntity type, and next up
      // we can map this to our internal structure of LibraryDefinition
      for (const [name, versions] of libraryGroups) {
        const libDef: LibraryDefinition = {
          name,
          globalVariable: versions[0].GlobalVariable || "",
          category: versions[0].Category || "",
          versions: {},
          defaultVersion: versions[0].Version || ""
        };
        for (const version of versions) {
          libDef.versions[version.Version!] = {
            cdnUrl: version.CDNUrl || "",
            cssUrls: version.CDNCssUrl?.split(",") || []
          };
        }
        this.libraries.set(name, libDef);
      }

      // at this point, our library registry is fully populated
      this._configured = true;
    }
  }

  // private static initializeLibraries(): void {
  //   const libs: LibraryDefinition[] = [
  //     // Charting Libraries
  //     {
  //       name: 'Chart.js',
  //       globalVariable: 'Chart',
  //       category: 'charting/basic',
  //       versions: {
  //         '4.4.0': { cdnUrl: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js' },
  //         '4.3.0': { cdnUrl: 'https://cdn.jsdelivr.net/npm/chart.js@4.3.0/dist/chart.umd.min.js' }
  //       },
  //       defaultVersion: '4.4.0'
  //     },
  //     {
  //       name: 'Recharts',
  //       globalVariable: 'Recharts',
  //       category: 'charting/react',
  //       versions: {
  //         '2.10.4': { cdnUrl: 'https://cdn.jsdelivr.net/npm/recharts@2.10.4/dist/Recharts.js' }
  //       },
  //       defaultVersion: '2.10.4'
  //     },
  //     {
  //       name: 'Plotly',
  //       globalVariable: 'Plotly',
  //       category: 'charting/scientific',
  //       versions: {
  //         '2.27.1': { cdnUrl: 'https://cdn.plot.ly/plotly-2.27.1.min.js' }
  //       },
  //       defaultVersion: '2.27.1'
  //     },
  //     {
  //       name: 'ApexCharts',
  //       globalVariable: 'ApexCharts',
  //       category: 'charting/interactive',
  //       versions: {
  //         '3.45.1': { 
  //           cdnUrl: 'https://cdn.jsdelivr.net/npm/apexcharts@3.45.1/dist/apexcharts.min.js',
  //           cssUrls: ['https://cdn.jsdelivr.net/npm/apexcharts@3.45.1/dist/apexcharts.css']
  //         }
  //       },
  //       defaultVersion: '3.45.1'
  //     },
  //     {
  //       name: 'ECharts',
  //       globalVariable: 'echarts',
  //       category: 'charting/advanced',
  //       versions: {
  //         '5.4.3': { cdnUrl: 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js' }
  //       },
  //       defaultVersion: '5.4.3'
  //     },
  //     {
  //       name: 'Highcharts',
  //       globalVariable: 'Highcharts',
  //       category: 'charting/enterprise',
  //       versions: {
  //         '11.2.0': { cdnUrl: 'https://code.highcharts.com/11.2.0/highcharts.js' }
  //       },
  //       defaultVersion: '11.2.0'
  //     },
  //     {
  //       name: 'Victory',
  //       globalVariable: 'Victory',
  //       category: 'charting/react',
  //       versions: {
  //         '36.9.1': { cdnUrl: 'https://cdn.jsdelivr.net/npm/victory@36.9.1/dist/victory.min.js' }
  //       },
  //       defaultVersion: '36.9.1'
  //     },
  //     {
  //       name: 'd3',
  //       globalVariable: 'd3',
  //       category: 'charting/low-level',
  //       versions: {
  //         '7.8.5': { cdnUrl: 'https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js' }
  //       },
  //       defaultVersion: '7.8.5'
  //     },
  //     {
  //       name: 'topojson-client',
  //       globalVariable: 'topojson',
  //       category: 'maps/topology',
  //       versions: {
  //         '3.1.0': { cdnUrl: 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js' }
  //       },
  //       defaultVersion: '3.1.0'
  //     },

  //     // Date/Time Libraries
  //     {
  //       name: 'dayjs',
  //       globalVariable: 'dayjs',
  //       category: 'utility/date',
  //       versions: {
  //         '1.11.10': { cdnUrl: 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js' }
  //       },
  //       defaultVersion: '1.11.10'
  //     },
  //     {
  //       name: 'moment',
  //       globalVariable: 'moment',
  //       category: 'utility/date',
  //       versions: {
  //         '2.29.4': { cdnUrl: 'https://cdn.jsdelivr.net/npm/moment@2.29.4/moment.min.js' }
  //       },
  //       defaultVersion: '2.29.4'
  //     },
  //     {
  //       name: 'date-fns',
  //       globalVariable: 'dateFns',
  //       category: 'utility/date',
  //       versions: {
  //         '3.0.6': { cdnUrl: 'https://cdn.jsdelivr.net/npm/date-fns@3.0.6/index.js' }
  //       },
  //       defaultVersion: '3.0.6'
  //     },

  //     // Utility Libraries
  //     {
  //       name: 'lodash',
  //       globalVariable: '_',
  //       category: 'utility/general',
  //       versions: {
  //         '4.17.21': { cdnUrl: 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js' }
  //       },
  //       defaultVersion: '4.17.21'
  //     },
  //     {
  //       name: 'axios',
  //       globalVariable: 'axios',
  //       category: 'utility/http',
  //       versions: {
  //         '1.6.5': { cdnUrl: 'https://cdn.jsdelivr.net/npm/axios@1.6.5/dist/axios.min.js' }
  //       },
  //       defaultVersion: '1.6.5'
  //     },
  //     {
  //       name: 'uuid',
  //       globalVariable: 'uuid',
  //       category: 'utility/general',
  //       versions: {
  //         '9.0.1': { cdnUrl: 'https://cdn.jsdelivr.net/npm/uuid@9.0.1/dist/umd/uuid.min.js' }
  //       },
  //       defaultVersion: '9.0.1'
  //     },
  //     {
  //       name: 'classnames',
  //       globalVariable: 'classNames',
  //       category: 'utility/css',
  //       versions: {
  //         '2.5.1': { cdnUrl: 'https://cdn.jsdelivr.net/npm/classnames@2.5.1/index.js' }
  //       },
  //       defaultVersion: '2.5.1'
  //     },
  //     {
  //       name: 'DOMPurify',
  //       globalVariable: 'DOMPurify',
  //       category: 'utility/security',
  //       versions: {
  //         '3.0.8': { cdnUrl: 'https://cdn.jsdelivr.net/npm/dompurify@3.0.8/dist/purify.min.js' }
  //       },
  //       defaultVersion: '3.0.8'
  //     },
  //     {
  //       name: 'numeral',
  //       globalVariable: 'numeral',
  //       category: 'utility/formatting',
  //       versions: {
  //         '2.0.6': { cdnUrl: 'https://cdn.jsdelivr.net/npm/numeral@2.0.6/numeral.min.js' }
  //       },
  //       defaultVersion: '2.0.6'
  //     },
  //     {
  //       name: 'accounting',
  //       globalVariable: 'accounting',
  //       category: 'utility/formatting',
  //       versions: {
  //         '0.4.1': { cdnUrl: 'https://cdn.jsdelivr.net/npm/accounting@0.4.1/accounting.min.js' }
  //       },
  //       defaultVersion: '0.4.1'
  //     },

  //     // UI Component Libraries
  //     {
  //       name: 'antd',
  //       globalVariable: 'antd',
  //       category: 'ui/components',
  //       versions: {
  //         '5.11.0': { 
  //           cdnUrl: 'https://cdn.jsdelivr.net/npm/antd@5.11.0/dist/antd.min.js',
  //           cssUrls: ['https://cdn.jsdelivr.net/npm/antd@5.11.0/dist/reset.css']
  //         }
  //       },
  //       defaultVersion: '5.11.0'
  //     },
  //     {
  //       name: '@mui/material',
  //       globalVariable: 'MaterialUI',
  //       category: 'ui/components',
  //       versions: {
  //         '5.15.2': { cdnUrl: 'https://cdn.jsdelivr.net/npm/@mui/material@5.15.2/umd/material-ui.production.min.js' }
  //       },
  //       defaultVersion: '5.15.2'
  //     },
  //     {
  //       name: 'bootstrap',
  //       globalVariable: 'bootstrap',
  //       category: 'ui/framework',
  //       versions: {
  //         '5.3.2': { 
  //           cdnUrl: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  //           cssUrls: ['https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css']
  //         }
  //       },
  //       defaultVersion: '5.3.2'
  //     },
  //     {
  //       name: 'semantic-ui',
  //       globalVariable: 'semanticUI',
  //       category: 'ui/framework',
  //       versions: {
  //         '2.5.0': { 
  //           cdnUrl: 'https://cdn.jsdelivr.net/npm/semantic-ui@2.5.0/dist/semantic.min.js',
  //           cssUrls: ['https://cdn.jsdelivr.net/npm/semantic-ui@2.5.0/dist/semantic.min.css']
  //         }
  //       },
  //       defaultVersion: '2.5.0'
  //     },

  //     // Data Grid/Table Libraries
  //     {
  //       name: 'ag-grid',
  //       globalVariable: 'agGrid',
  //       category: 'grid/enterprise',
  //       versions: {
  //         '31.0.1': { 
  //           cdnUrl: 'https://cdn.jsdelivr.net/npm/ag-grid-community@31.0.1/dist/ag-grid-community.min.js',
  //           cssUrls: [
  //             'https://cdn.jsdelivr.net/npm/ag-grid-community@31.0.1/dist/styles/ag-grid.css',
  //             'https://cdn.jsdelivr.net/npm/ag-grid-community@31.0.1/dist/styles/ag-theme-alpine.css'
  //           ]
  //         }
  //       },
  //       defaultVersion: '31.0.1'
  //     },
  //     {
  //       name: 'react-table',
  //       globalVariable: 'ReactTable',
  //       category: 'grid/lightweight',
  //       versions: {
  //         '7.8.0': { cdnUrl: 'https://cdn.jsdelivr.net/npm/react-table@7.8.0/dist/react-table.production.min.js' }
  //       },
  //       defaultVersion: '7.8.0'
  //     },
  //     {
  //       name: 'material-table',
  //       globalVariable: 'MaterialTable',
  //       category: 'grid/material',
  //       versions: {
  //         '2.0.5': { cdnUrl: 'https://cdn.jsdelivr.net/npm/material-table@2.0.5/dist/material-table.min.js' }
  //       },
  //       defaultVersion: '2.0.5'
  //     },

  //     // Map Libraries
  //     {
  //       name: 'leaflet',
  //       globalVariable: 'L',
  //       category: 'maps/opensource',
  //       versions: {
  //         '1.9.4': { 
  //           cdnUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
  //           cssUrls: ['https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css']
  //         }
  //       },
  //       defaultVersion: '1.9.4'
  //     },
  //     {
  //       name: 'mapbox-gl',
  //       globalVariable: 'mapboxgl',
  //       category: 'maps/vector',
  //       versions: {
  //         '3.0.1': { 
  //           cdnUrl: 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js',
  //           cssUrls: ['https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css']
  //         }
  //       },
  //       defaultVersion: '3.0.1'
  //     },

  //     // Animation Libraries
  //     {
  //       name: 'framer-motion',
  //       globalVariable: 'FramerMotion',
  //       category: 'animation/react',
  //       versions: {
  //         '10.16.16': { cdnUrl: 'https://cdn.jsdelivr.net/npm/framer-motion@10.16.16/dist/framer-motion.js' }
  //       },
  //       defaultVersion: '10.16.16'
  //     },
  //     {
  //       name: 'gsap',
  //       globalVariable: 'gsap',
  //       category: 'animation/general',
  //       versions: {
  //         '3.12.4': { cdnUrl: 'https://cdn.jsdelivr.net/npm/gsap@3.12.4/dist/gsap.min.js' }
  //       },
  //       defaultVersion: '3.12.4'
  //     },
  //     {
  //       name: 'lottie-web',
  //       globalVariable: 'lottie',
  //       category: 'animation/svg',
  //       versions: {
  //         '5.12.2': { cdnUrl: 'https://cdn.jsdelivr.net/npm/lottie-web@5.12.2/build/player/lottie.min.js' }
  //       },
  //       defaultVersion: '5.12.2'
  //     },

  //     // Form Libraries
  //     {
  //       name: 'react-hook-form',
  //       globalVariable: 'ReactHookForm',
  //       category: 'forms/react',
  //       versions: {
  //         '7.48.2': { cdnUrl: 'https://cdn.jsdelivr.net/npm/react-hook-form@7.48.2/dist/index.umd.production.min.js' }
  //       },
  //       defaultVersion: '7.48.2'
  //     },
  //     {
  //       name: 'formik',
  //       globalVariable: 'Formik',
  //       category: 'forms/react',
  //       versions: {
  //         '2.4.5': { cdnUrl: 'https://cdn.jsdelivr.net/npm/formik@2.4.5/dist/formik.umd.production.min.js' }
  //       },
  //       defaultVersion: '2.4.5'
  //     },
  //     {
  //       name: 'react-select',
  //       globalVariable: 'ReactSelect',
  //       category: 'forms/select',
  //       versions: {
  //         '5.8.0': { cdnUrl: 'https://cdn.jsdelivr.net/npm/react-select@5.8.0/dist/react-select.min.js' }
  //       },
  //       defaultVersion: '5.8.0'
  //     },

  //     // Validation Libraries
  //     {
  //       name: 'joi',
  //       globalVariable: 'Joi',
  //       category: 'validation/schema',
  //       versions: {
  //         '17.11.0': { cdnUrl: 'https://cdn.jsdelivr.net/npm/joi-browser@13.4.0/dist/joi-browser.min.js' }
  //       },
  //       defaultVersion: '17.11.0'
  //     },
  //     {
  //       name: 'yup',
  //       globalVariable: 'yup',
  //       category: 'validation/schema',
  //       versions: {
  //         '1.3.3': { cdnUrl: 'https://cdn.jsdelivr.net/npm/yup@1.3.3/lib/index.umd.js' }
  //       },
  //       defaultVersion: '1.3.3'
  //     },

  //     // State Management
  //     {
  //       name: 'zustand',
  //       globalVariable: 'zustand',
  //       category: 'state/lightweight',
  //       versions: {
  //         '4.4.7': { cdnUrl: 'https://cdn.jsdelivr.net/npm/zustand@4.4.7/dist/umd.production.js' }
  //       },
  //       defaultVersion: '4.4.7'
  //     },
  //     {
  //       name: 'valtio',
  //       globalVariable: 'valtio',
  //       category: 'state/proxy',
  //       versions: {
  //         '1.12.1': { cdnUrl: 'https://cdn.jsdelivr.net/npm/valtio@1.12.1/dist/index.umd.js' }
  //       },
  //       defaultVersion: '1.12.1'
  //     },

  //     // Math & Statistics
  //     {
  //       name: 'simple-statistics',
  //       globalVariable: 'ss',
  //       category: 'math/statistics',
  //       versions: {
  //         '7.8.3': { cdnUrl: 'https://cdn.jsdelivr.net/npm/simple-statistics@7.8.3/dist/simple-statistics.min.js' }
  //       },
  //       defaultVersion: '7.8.3'
  //     },
  //     {
  //       name: 'mathjs',
  //       globalVariable: 'math',
  //       category: 'math/general',
  //       versions: {
  //         '12.2.1': { cdnUrl: 'https://cdn.jsdelivr.net/npm/mathjs@12.2.1/lib/browser/math.js' }
  //       },
  //       defaultVersion: '12.2.1'
  //     },

  //     // Color Manipulation
  //     {
  //       name: 'chroma-js',
  //       globalVariable: 'chroma',
  //       category: 'color/manipulation',
  //       versions: {
  //         '2.4.2': { cdnUrl: 'https://cdn.jsdelivr.net/npm/chroma-js@2.4.2/chroma.min.js' }
  //       },
  //       defaultVersion: '2.4.2'
  //     },
  //     {
  //       name: 'tinycolor2',
  //       globalVariable: 'tinycolor',
  //       category: 'color/manipulation',
  //       versions: {
  //         '1.6.0': { cdnUrl: 'https://cdn.jsdelivr.net/npm/tinycolor2@1.6.0/dist/tinycolor-min.js' }
  //       },
  //       defaultVersion: '1.6.0'
  //     },

  //     // Rich Text Editors
  //     {
  //       name: 'quill',
  //       globalVariable: 'Quill',
  //       category: 'editor/rich-text',
  //       versions: {
  //         '1.3.7': { 
  //           cdnUrl: 'https://cdn.quilljs.com/1.3.7/quill.min.js',
  //           cssUrls: ['https://cdn.quilljs.com/1.3.7/quill.snow.css']
  //         }
  //       },
  //       defaultVersion: '1.3.7'
  //     },
  //     {
  //       name: 'tinymce',
  //       globalVariable: 'tinymce',
  //       category: 'editor/rich-text',
  //       versions: {
  //         '6.7.3': { cdnUrl: 'https://cdn.tiny.cloud/1/no-api-key/tinymce/6/tinymce.min.js' }
  //       },
  //       defaultVersion: '6.7.3'
  //     },

  //     // File Upload
  //     {
  //       name: 'dropzone',
  //       globalVariable: 'Dropzone',
  //       category: 'file/upload',
  //       versions: {
  //         '6.0.0-beta.2': { 
  //           cdnUrl: 'https://cdn.jsdelivr.net/npm/dropzone@6.0.0-beta.2/dist/dropzone-min.js',
  //           cssUrls: ['https://cdn.jsdelivr.net/npm/dropzone@6.0.0-beta.2/dist/dropzone.css']
  //         }
  //       },
  //       defaultVersion: '6.0.0-beta.2'
  //     },
  //     {
  //       name: 'filepond',
  //       globalVariable: 'FilePond',
  //       category: 'file/upload',
  //       versions: {
  //         '4.30.6': { 
  //           cdnUrl: 'https://cdn.jsdelivr.net/npm/filepond@4.30.6/dist/filepond.min.js',
  //           cssUrls: ['https://cdn.jsdelivr.net/npm/filepond@4.30.6/dist/filepond.min.css']
  //         }
  //       },
  //       defaultVersion: '4.30.6'
  //     },

  //     // Notification/Toast Libraries
  //     {
  //       name: 'toastify-js',
  //       globalVariable: 'Toastify',
  //       category: 'notification/toast',
  //       versions: {
  //         '1.12.0': { 
  //           cdnUrl: 'https://cdn.jsdelivr.net/npm/toastify-js@1.12.0/src/toastify.min.js',
  //           cssUrls: ['https://cdn.jsdelivr.net/npm/toastify-js@1.12.0/src/toastify.min.css']
  //         }
  //       },
  //       defaultVersion: '1.12.0'
  //     },
  //     {
  //       name: 'sweetalert2',
  //       globalVariable: 'Swal',
  //       category: 'notification/modal',
  //       versions: {
  //         '11.10.1': { cdnUrl: 'https://cdn.jsdelivr.net/npm/sweetalert2@11.10.1/dist/sweetalert2.all.min.js' }
  //       },
  //       defaultVersion: '11.10.1'
  //     },

  //     // PDF Generation
  //     {
  //       name: 'jspdf',
  //       globalVariable: 'jsPDF',
  //       category: 'document/pdf',
  //       versions: {
  //         '2.5.1': { cdnUrl: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js' }
  //       },
  //       defaultVersion: '2.5.1'
  //     },
  //     {
  //       name: 'pdfmake',
  //       globalVariable: 'pdfMake',
  //       category: 'document/pdf',
  //       versions: {
  //         '0.2.9': { cdnUrl: 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.9/build/pdfmake.min.js' }
  //       },
  //       defaultVersion: '0.2.9'
  //     },

  //     // Excel/CSV Libraries
  //     {
  //       name: 'xlsx',
  //       globalVariable: 'XLSX',
  //       category: 'document/spreadsheet',
  //       versions: {
  //         '0.20.1': { cdnUrl: 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js' }
  //       },
  //       defaultVersion: '0.20.1'
  //     },
  //     {
  //       name: 'papaparse',
  //       globalVariable: 'Papa',
  //       category: 'document/csv',
  //       versions: {
  //         '5.4.1': { cdnUrl: 'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js' }
  //       },
  //       defaultVersion: '5.4.1'
  //     }
  //   ];

  //   // Register all libraries
  //   libs.forEach(lib => this.libraries.set(lib.name, lib));
  // }

  /**
   * Get library definition by name
   */
  static getLibrary(name: string): LibraryDefinition | undefined {
    if (!this._configured)
      throw new Error("LibraryRegistry is not configured, call LibraryRegistry.Config() before using!");

    return this.libraries.get(name);
  }

  /**
   * Get CDN URL for a library
   * @param name Library name
   * @param version Optional version (uses default if not specified)
   * @returns CDN URL or undefined if library/version not found
   */
  static getCdnUrl(name: string, version?: string): string | undefined {
    if (!this._configured)
      throw new Error("LibraryRegistry is not configured, call LibraryRegistry.Config() before using!");

    const library = this.libraries.get(name);
    if (!library) return undefined;

    const targetVersion = version || library.defaultVersion;
    return library.versions[targetVersion]?.cdnUrl;
  }

  /**
   * Check if a library is approved
   */
  static isApproved(name: string): boolean {
    if (!this._configured)
      throw new Error("LibraryRegistry is not configured, call LibraryRegistry.Config() before using!");

    return this.libraries.has(name);
  }

  /**
   * Resolve library version based on semver-like pattern
   * For now, just returns exact match or default
   * TODO: Implement proper semver resolution
   */
  static resolveVersion(name: string, versionPattern?: string): string | undefined {
    if (!this._configured)
      throw new Error("LibraryRegistry is not configured, call LibraryRegistry.Config() before using!");

    const library = this.libraries.get(name);
    if (!library) return undefined;

    if (!versionPattern) return library.defaultVersion;

    // For now, just check exact match
    // TODO: Implement proper semver resolution for patterns like "^4.0.0"
    if (library.versions[versionPattern]) {
      return versionPattern;
    }

    // If no exact match, return default
    return library.defaultVersion;
  }

  /**
   * Add a library to the registry (for future extensibility)
   * This would typically be called during app initialization
   * with libraries loaded from a database
   */
  static registerLibrary(definition: LibraryDefinition): void {
    if (!this._configured)
      throw new Error("LibraryRegistry is not configured, call LibraryRegistry.Config() before using!");

    this.libraries.set(definition.name, definition);
  }
}