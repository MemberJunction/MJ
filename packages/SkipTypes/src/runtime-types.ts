import { CompositeKey } from "@memberjunction/core";
import { SimpleDataContext } from "./shared";
import { SimpleMetadata, SimpleRunQuery, SimpleRunView } from "./shared";

/**
 * This interface defines the available callback functions that a Skip component might call in the parent.
 */
export interface SkipComponentCallbacks {
    /**
     * The component can invoke this method in the callbacks object, when provided, to refresh the data context 
     * and that will in turn result in the component's init function being called again with the new data context.
     * @returns 
     */
    RefreshData: () => void;

    /**
     * If an action occurs inside a component where it would be desirable for the containing UI to open a specific 
     * record, if supported, this event can be listened to and the container UI can then open the record.
     * @param entityName - this is the Entity NAME from the Entity metadata, not the table name or base view name. Use Entity Metadata to provide the entity name here
     * @param key - this is an array of key/value pairs representing the primary key. The format of a Composite Key is an array of KeyValuePair objects and KeyValuePair objects simply have FieldName and Value properties. In most cases entities have single-valued primary keys but this structure is here for complex entity types that have composite primary keys
     * @returns 
     */
    OpenEntityRecord: (entityName: string, key: CompositeKey) => void;

    /**
     * This event should be raised by the HTML component whenever something changes within the component that should be tracked as a change in state
     * that will persist. userState is any valid, simple JavaScript object, meaning it can have scalars, arrays, objects, etc, it must be an object that 
     * can be serialized to JSON, but otherwise has no special requirements. The parent component will be responsible for tracking the user-specific states
     * and passing them back to the HTML component each time it is loaded or if the user changes via the init function.
     * @param userState 
     * @returns 
     */
    UpdateUserState: (userState: any) => void;

    /**
     * Used for any other type of event notification that a component might want to send to the parent component.
     * @param eventName 
     * @param eventData 
     * @returns 
     */
    NotifyEvent: (eventName: string, eventData: any) => void;
}

/**
 * This is the function signature for the initialization function provided by each Skip component via the SkipComponentObject so that a container can interact with it.
 * This function is called when the component is loaded by its container. The function receives the data context, an optional userState property, and a set of callbacks that can be used to interact with the parent component.
 * userState is an optional parameter that can be used to pass in any state information that the parent component wants to provide to the component that is specific
 * to the CURRENT user. If the component modifies the userState, it should notify the parent component via the UserStateChanged event in the callbacks object so that the parent component can handle storage.
 */
export type SkipComponentInitFunction = (params: SkipComponentInitParams) => void;

/**
 * This is the function signature for the print function that is provided by the component via the SkipComponentObject
 */
export type SkipComponentPrintFunction = () => void;
/**
 * This is the function signature for the refresh function that is provided by the component via the SkipComponentObject
 */
export type SkipComponentRefreshFunction = () => void;

/**
 * Parameters that are passed to the SkipComponentInitFunction when it is called by the parent component.
 */
export interface SkipComponentInitParams {
    /**
     * Contains the static data specified by the root component specification. This data is pre-loaded and passed to 
     * the component during initialization and anytime the component is refreshed.
     */
    staticData: SimpleDataContext;
    /**
     * Contains the dynamic data utilities that the component can use to access MemberJunction data. This includes
     * the metadata, run view, and run query utilities that the component can use to access data dynamically at runtime.
     * The component can use these utilities to fetch data at runtime based on the user's interactions with the component.
     */
    utilities?: SkipComponentUtilities;
    /**
     * Any valid serializable JavaScript object that represents the user-specific state for the component.
     */
    userState?: any;
    /**
     * Callbacks that the component can use to interact with the parent component. These callbacks allow the component to refresh data, open records, update user state, and send custom events.
     */
    callbacks?: SkipComponentCallbacks;
    /**
     * The default styles the component should use as specified by its parent (the container in the case of a root component, or a parent component in the case 
     * of a child component). The component can alter these styles based on the requirements specified by the user in its design documentation. 
     */
    styles?: SkipComponentStyles;
}

/**
 * This interface defines styles that can be applied to the component. The container can provide
 * styles to the top level component. The top level component can alter these styles based on
 * the prompting of the user, learned notes, etc, and adjust the styles of the component accordingly. In addition
 * the top level component will pass in its computed styles to each sub-component so that the sub-components
 * can do the same recursively down to any level of depth. This allows sub-components to inherit styles but
 * also make adjustments as required based on functional needs and user input.
 */
export interface SkipComponentStyles {
    colors: {
        // Primary palette
        primary: string // '#5B4FE9',
        primaryHover: string // '#4940D4',
        primaryLight?: string // '#E8E6FF',
        
        // Secondary palette
        secondary: string // '#64748B',
        secondaryHover?: string // '#475569',
        
        // Status colors
        success: string // '#10B981',
        successLight?: string // '#D1FAE5',
        warning?: string // '#F59E0B',
        warningLight?: string // '#FEF3C7',
        error?: string // '#EF4444',
        errorLight?: string // '#FEE2E2',
        info?: string // '#3B82F6',
        infoLight?: string // '#DBEAFE',
        
        // Base colors
        background: string // '#FFFFFF',
        surface: string // '#F8FAFC',
        surfaceHover?: string // '#F1F5F9',
        
        // Text colors
        text: string // '#1E293B',
        textSecondary: string // '#64748B',
        textTertiary?: string // '#94A3B8',
        textInverse?: string // '#FFFFFF',
        
        // Border colors
        border: string // '#E2E8F0',
        borderLight?: string // '#F1F5F9',
        borderFocus?: string // '#5B4FE9',
        
        // Shadow colors
        shadow?: string // 'rgba(0, 0, 0, 0.05)',
        shadowMedium?: string // 'rgba(0, 0, 0, 0.1)',
        shadowLarge?: string // 'rgba(0, 0, 0, 0.15)',
        
        // Allow additional custom colors
        [key: string]: string | undefined;
    };
    spacing: {
        xs: string // '4px',
        sm: string // '8px',
        md: string // '16px',
        lg: string // '24px',
        xl: string // '32px',
        xxl?: string // '48px',
        xxxl?: string // '64px',
        
        // Allow additional custom spacing
        [key: string]: string | undefined;
    };
    typography: {
        fontFamily: string //'-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
        fontSize: {
          xs?: string // '12px',
          sm: string // '14px',
          md: string // '16px',
          lg: string // '18px',
          xl: string // '24px',
          xxl?: string // '32px',
          xxxl?: string // '40px',
          
          // Allow additional custom sizes
          [key: string]: string | undefined;
        },
        fontWeight?: {
          light?: string // '300',
          regular?: string // '400',
          medium?: string // '500',
          semibold?: string // '600',
          bold?: string // '700',
          
          // Allow additional custom weights
          [key: string]: string | undefined;
        },
        lineHeight?: {
          tight?: string // '1.25',
          normal?: string // '1.5',
          relaxed?: string // '1.75',
          
          // Allow additional custom line heights
          [key: string]: string | undefined;
        }
    };
    borders: {
        radius: string | { // Allow either a single string or an object with multiple radius options
          sm?: string // '6px',
          md?: string // '8px',
          lg?: string // '12px',
          xl?: string // '16px',
          full?: string // '9999px',
          
          // Allow additional custom radii
          [key: string]: string | undefined;
        };
        width: string | { // Allow either a single string or an object with multiple width options
          thin?: string // '1px',
          medium?: string // '2px',
          thick?: string // '3px',
          
          // Allow additional custom widths
          [key: string]: string | undefined;
        };
    }
    shadows?: {
        sm?: string // '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        md?: string // '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        lg?: string // '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        xl?: string // '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        inner?: string // 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
        
        // Allow additional custom shadows
        [key: string]: string | undefined;
    }
    transitions?: {
        fast?: string // '150ms ease-in-out',
        normal?: string // '250ms ease-in-out',
        slow?: string // '350ms ease-in-out',
        
        // Allow additional custom transitions
        [key: string]: string | undefined;
    }
    overflow: string
}

/**
 * This is the interface that each Skip component will expose to the parent component and assign it a name globally on the window object so that the parent component can call it.
 * The component will create this object and it will include the members defined in this interface.
 */
export interface SkipComponentObject {
    /**
     * The React component that Angular will render directly using ReactDOM.
     * This component receives props including data, userState, callbacks, utilities, and styles.
     */
    component: any; // really a React.ComponentType<RootComponentProps>;

    /**
     * The optional print function that is called when the user clicks on the print button in the parent of the component. This function will never be called by the parent before the init function so the print function
     * can assume the component has been initialized;
     */
    print?: SkipComponentPrintFunction;

    /**
     * The optional refresh function that is called when the user clicks on the refresh button in the parent of the component. This function will never be called by the parent before the init function so the refresh function
     */
    refresh?: SkipComponentRefreshFunction;
}

/**
 * This interface defines the utilities that are available to the Skip component. These utilities are used to interact with the host MemberJunction system to 
 * retrieve metadata, run views, and run queries. The utilities are passed into the SkipComponentInitFunction by the container.
 */
export interface SkipComponentUtilities {
    md: SimpleMetadata,
    rv: SimpleRunView,
    rq: SimpleRunQuery
}
