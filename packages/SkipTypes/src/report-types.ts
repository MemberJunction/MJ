/**
 * @fileoverview Report and HTML-specific types for Skip API
 * 
 * This file contains types related to report generation and HTML report functionality
 * within the Skip API system. These types define the structure for:
 * 
 * - Simple data context for reports (SimpleDataContext)
 * - HTML report options and configurations (SkipHTMLReportOption)
 * 
 * These types support Skip's ability to generate interactive HTML reports that can
 * be embedded within client applications. HTML reports can access data statically
 * (provided during initialization) or dynamically (through runtime API calls),
 * and can be ranked and rated by both AI systems and users for quality assessment.
 * 
 * The SimpleDataContext provides a flexible structure for passing data to HTML
 * reports, while SkipHTMLReportOption defines the complete metadata and content
 * for generated HTML reports including their data access patterns and quality rankings.
 * 
 * @author MemberJunction
 * @since 2.0.0
 */

/**
 * This is a simple data context object that is passed into the SkipHTMLReportInitFunction, it contains a property for each of the data context items and typically are named
 * data_item_1, data_item_2, etc. The data context is a simple JavaScript object that contains properties that are in turn data objects which are typically arrays of things, but can be anything.
 */
export type SimpleDataContext = {
    [key: string]: any;
}

/**
 * Defines a given option for an HTML report that the user can choose. The htmlReport/htmlReportObjectName properties are used to render the HTML report in the UI.
 */
export type SkipHTMLReportOption = {
    /**
     * This code is typically a combination of HTML, CSS and JavaScript all contained within a single DIV tag and 
     * designed to be embedded within the container application's UI in the desired location
     * as chosen by the container application.
     */
    reportCode: string;

    /**
     * For HTML Reports, the generation process must return not only the HTML itself stored in htmlReport, but also a globally unique
     * object name that is used to communicate with the HTML Report. This name will be a globally unique name that is used to identify the object
     * agains the global memory of the browser (e.g. the window object) and is used to communicate with the HTML report. The object will comply with the
     * @interface SkipHTMLReportObject interface and will be used to communicate with the HTML report.
     * 
     * Generally speaking, this object name will be provided to the AI system generating the code and use a UUIDv4 or similar approach that is 
     * modified to be a valid JavaScript function name. The AI generates the object within its HTML with this name. 
     * The object name is provided here in this property so that the container application for the custom HTML report can invoke it as needed.
     */
    reportObjectName: string;

    /**
     * The type of data access this report uses, static means that the data is provided to the report as static data during the initialization
     * process described in the @interface SkipHTMLReportObject interface, dynamic means that the report will use capabilities provided by 
     * the SkipHTMLReportObject interface to dynamically access data from the MemberJunction instance that it is running within. 'both' means
     * that the report can use both static and dynamic data access methods, and 'none' means that the report does not use any data (rare, but possible for example if
     * a report does something other than show data or if it is uses 3rd party data sources via API that are not related to the MJ instance it is running within).
     */
    dataAccessType: 'static' | 'dynamic' | 'both' | 'none';

    /**
     * If multiple report options are provided for a given @interface SkipAPIAnalysisCompleteResponse, a "judge" AI will evaluate all the functional
     * responses and will rank order them with an explanation of why they were each ranked that way. Rankings are not absolute, they are relative to the
     * # of reports contained within an array of SkipHTMLReportOption types.  
     */
    AIRank: number | undefined;
    /**
     * The AI's explanation of why it ranked the report the way it did. This is useful for understanding the AI's reasoning and can be used to improve future reports 
     * as well as provide context to the user about why a particular report was chosen as the best option.
     */
    AIRankExplanation: string | undefined;
    /**
     * The user's provided feedback on the report option. Unlike the AIRank, this is a subjective rating provided by the user and is 
     * a number between 1 and 10, where 1 is the lowest rating and 10 is the highest rating.
     */
    UserRank: number | undefined;
    /**
     * If the host application provides a way for the user to provide feedback on the report option, 
     * this is the explanation of why the user rated the report the way they did if they provided feedback.
     */
    UserRankExplanation: string | undefined;
}