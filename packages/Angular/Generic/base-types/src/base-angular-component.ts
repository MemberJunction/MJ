import { Directive, Input } from "@angular/core";
import { IMetadataProvider, IRunQueryProvider, IRunReportProvider, IRunViewProvider, Metadata } from "@memberjunction/core";

/**
 * Base class for all Angular components in the MemberJunction system.
 */
@Directive() // using a directive here becuase this is an abstract base class that will later be subclassed and decorated as @Component
export abstract class BaseAngularComponent {
  /**
   * If specified, this provider will be used for communication and for all metadata purposes. By default, if not provided, the Metadata and RunView classes
   * are used for this and the default GraphQLDataProvider is used which is connected to the same back-end MJAPI instance as the Metadata and RunView classes.
   * If you want to have this component connect to a different MJAPI back-end, create an instance of a ProviderBase sub-class like GraphQLDataProvider/etc, and
   * configure it as appropriate to connect to the MJAPI back-end you want to use, and then pass it in here.
   */
  @Input() Provider: IMetadataProvider | null = null;

  /**
   * Returns either the default Metadata provider or the one specified in the Provider property, if it was specified
   */
  public get ProviderToUse(): IMetadataProvider {
    return this.Provider || Metadata.Provider;
  }  

  /**
   * Returns either the default RunView provider or the one specified in the Provider property, if it was specified
   */
  public get RunViewToUse(): IRunViewProvider {
    return <IRunViewProvider><any>this.ProviderToUse;
  }

  /**
   * Returns either the default RunQuery provider or the one specified in the Provider property, if it was specified
   */
  public get RunQueryToUse(): IRunQueryProvider {
    return <IRunQueryProvider><any>this
  }

  /**
   * Returns either the default RunReport provider or the one specified in the Provider property, if it was specified
   */
  public get RunReportToUse(): IRunReportProvider {
    return <IRunReportProvider><any>this
  }
}