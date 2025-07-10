import { RegisterClass } from '@memberjunction/global';
import { BusinessCentralBaseAction } from '../business-central-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Interface for a Sales Invoice from Business Central
 */
export interface BCSalesInvoice {
    id: string;
    number: string;
    invoiceDate: Date;
    dueDate: Date;
    customerNumber: string;
    customerName: string;
    customerId: string;
    status: string;
    totalAmountExcludingTax: number;
    totalTaxAmount: number;
    totalAmountIncludingTax: number;
    remainingAmount: number;
    currencyCode: string;
    paymentTermsId?: string;
    shipmentMethodId?: string;
    billToName: string;
    billToCustomerId: string;
    shipToName?: string;
    shipToContact?: string;
    sellToAddressLine1?: string;
    sellToAddressLine2?: string;
    sellToCity?: string;
    sellToState?: string;
    sellToCountry?: string;
    sellToPostCode?: string;
    externalDocumentNumber?: string;
    lastModifiedDateTime: Date;
    lines?: BCSalesInvoiceLine[];
}

export interface BCSalesInvoiceLine {
    id: string;
    lineNumber: number;
    lineType: string;
    itemId?: string;
    accountId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    discountPercent: number;
    netAmount: number;
    taxCode?: string;
    amountExcludingTax: number;
    taxPercent: number;
    totalTaxAmount: number;
    amountIncludingTax: number;
}

/**
 * Action to retrieve sales invoices from Microsoft Dynamics 365 Business Central
 */
@RegisterClass(BaseAction, 'GetBusinessCentralSalesInvoicesAction')
export class GetBusinessCentralSalesInvoicesAction extends BusinessCentralBaseAction {
    
    /**
     * Description of the action
     */
    public get Description(): string {
        return 'Retrieves sales invoices from Microsoft Dynamics 365 Business Central with comprehensive filtering options';
    }

    /**
     * Main execution method
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                return {
                    Success: false,
                    ResultCode: 'ERROR',
                    Message: 'Context user is required for Business Central API calls'
                };
            }

            // Store params for base class methods
            this.params = params.Params;

            // Build filters based on parameters
            const filters: string[] = [];
            
            // Customer filter
            const customerNumber = this.getParamValue(params.Params, 'CustomerNumber');
            if (customerNumber) {
                filters.push(`customerNumber eq '${customerNumber}'`);
            }

            // Status filter
            const status = this.getParamValue(params.Params, 'Status');
            if (status) {
                filters.push(`status eq '${status}'`);
            }

            // Date range filters
            const startDate = this.getParamValue(params.Params, 'StartDate');
            if (startDate) {
                filters.push(`invoiceDate ge ${this.formatBCDate(new Date(startDate))}`);
            }

            const endDate = this.getParamValue(params.Params, 'EndDate');
            if (endDate) {
                filters.push(`invoiceDate le ${this.formatBCDate(new Date(endDate))}`);
            }

            // Due date filters
            const dueStartDate = this.getParamValue(params.Params, 'DueStartDate');
            if (dueStartDate) {
                filters.push(`dueDate ge ${this.formatBCDate(new Date(dueStartDate))}`);
            }

            const dueEndDate = this.getParamValue(params.Params, 'DueEndDate');
            if (dueEndDate) {
                filters.push(`dueDate le ${this.formatBCDate(new Date(dueEndDate))}`);
            }

            // Amount filters
            const minAmount = this.getParamValue(params.Params, 'MinAmount');
            if (minAmount !== undefined) {
                filters.push(`totalAmountIncludingTax ge ${minAmount}`);
            }

            const maxAmount = this.getParamValue(params.Params, 'MaxAmount');
            if (maxAmount !== undefined) {
                filters.push(`totalAmountIncludingTax le ${maxAmount}`);
            }

            // Only unpaid filter
            const onlyUnpaid = this.getParamValue(params.Params, 'OnlyUnpaid');
            if (onlyUnpaid) {
                filters.push('remainingAmount gt 0');
            }

            // Select fields to retrieve
            const select = [
                'id',
                'number',
                'invoiceDate',
                'dueDate',
                'customerNumber',
                'customerName',
                'customerId',
                'status',
                'totalAmountExcludingTax',
                'totalTaxAmount',
                'totalAmountIncludingTax',
                'remainingAmount',
                'currencyCode',
                'paymentTermsId',
                'shipmentMethodId',
                'billToName',
                'billToCustomerId',
                'shipToName',
                'shipToContact',
                'sellToAddressLine1',
                'sellToAddressLine2',
                'sellToCity',
                'sellToState',
                'sellToCountry',
                'sellToPostCode',
                'externalDocumentNumber',
                'lastModifiedDateTime'
            ];

            // Expand lines if requested
            const expand = [];
            const includeLines = this.getParamValue(params.Params, 'IncludeLines');
            if (includeLines) {
                expand.push('salesInvoiceLines');
            }

            // Order by
            const orderBy = 'invoiceDate desc,number desc';

            // Max results
            const maxResults = this.getParamValue(params.Params, 'MaxResults') || 100;

            // Execute the query
            const response = await this.queryBC<{ value: any[] }>(
                'salesInvoices',
                filters,
                select,
                expand,
                orderBy,
                maxResults,
                contextUser
            );

            const bcInvoices = response.value || [];
            const invoices: BCSalesInvoice[] = bcInvoices.map(invoice => this.mapBCSalesInvoice(invoice));

            // Calculate summary
            const summary = this.calculateInvoiceSummary(invoices);

            // Create output parameters
            if (!params.Params.find(p => p.Name === 'Invoices')) {
                params.Params.push({
                    Name: 'Invoices',
                    Type: 'Output',
                    Value: invoices
                });
            } else {
                params.Params.find(p => p.Name === 'Invoices')!.Value = invoices;
            }

            if (!params.Params.find(p => p.Name === 'TotalCount')) {
                params.Params.push({
                    Name: 'TotalCount',
                    Type: 'Output',
                    Value: invoices.length
                });
            } else {
                params.Params.find(p => p.Name === 'TotalCount')!.Value = invoices.length;
            }

            if (!params.Params.find(p => p.Name === 'Summary')) {
                params.Params.push({
                    Name: 'Summary',
                    Type: 'Output',
                    Value: summary
                });
            } else {
                params.Params.find(p => p.Name === 'Summary')!.Value = summary;
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved ${invoices.length} sales invoices from Business Central`
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: errorMessage
            };
        }
    }

    /**
     * Map Business Central sales invoice to standard format
     */
    private mapBCSalesInvoice(bcInvoice: any): BCSalesInvoice {
        return {
            id: bcInvoice.id,
            number: bcInvoice.number,
            invoiceDate: this.parseBCDate(bcInvoice.invoiceDate),
            dueDate: this.parseBCDate(bcInvoice.dueDate),
            customerNumber: bcInvoice.customerNumber,
            customerName: bcInvoice.customerName,
            customerId: bcInvoice.customerId,
            status: bcInvoice.status,
            totalAmountExcludingTax: bcInvoice.totalAmountExcludingTax || 0,
            totalTaxAmount: bcInvoice.totalTaxAmount || 0,
            totalAmountIncludingTax: bcInvoice.totalAmountIncludingTax || 0,
            remainingAmount: bcInvoice.remainingAmount || 0,
            currencyCode: bcInvoice.currencyCode || 'USD',
            paymentTermsId: bcInvoice.paymentTermsId,
            shipmentMethodId: bcInvoice.shipmentMethodId,
            billToName: bcInvoice.billToName,
            billToCustomerId: bcInvoice.billToCustomerId,
            shipToName: bcInvoice.shipToName,
            shipToContact: bcInvoice.shipToContact,
            sellToAddressLine1: bcInvoice.sellToAddressLine1,
            sellToAddressLine2: bcInvoice.sellToAddressLine2,
            sellToCity: bcInvoice.sellToCity,
            sellToState: bcInvoice.sellToState,
            sellToCountry: bcInvoice.sellToCountry,
            sellToPostCode: bcInvoice.sellToPostCode,
            externalDocumentNumber: bcInvoice.externalDocumentNumber,
            lastModifiedDateTime: this.parseBCDate(bcInvoice.lastModifiedDateTime),
            lines: bcInvoice.salesInvoiceLines ? this.mapInvoiceLines(bcInvoice.salesInvoiceLines) : undefined
        };
    }

    /**
     * Map invoice lines
     */
    private mapInvoiceLines(lines: any[]): BCSalesInvoiceLine[] {
        return lines.map(line => ({
            id: line.id,
            lineNumber: line.lineNumber || line.sequence,
            lineType: line.lineType,
            itemId: line.itemId,
            accountId: line.accountId,
            description: line.description || '',
            quantity: line.quantity || 0,
            unitPrice: line.unitPrice || 0,
            discountAmount: line.discountAmount || 0,
            discountPercent: line.discountPercent || 0,
            netAmount: line.netAmount || 0,
            taxCode: line.taxCode,
            amountExcludingTax: line.amountExcludingTax || 0,
            taxPercent: line.taxPercent || 0,
            totalTaxAmount: line.totalTaxAmount || 0,
            amountIncludingTax: line.amountIncludingTax || 0
        }));
    }

    /**
     * Calculate invoice summary statistics
     */
    private calculateInvoiceSummary(invoices: BCSalesInvoice[]): any {
        const summary = {
            totalInvoices: invoices.length,
            totalAmountExcludingTax: 0,
            totalTaxAmount: 0,
            totalAmountIncludingTax: 0,
            totalRemainingAmount: 0,
            totalPaidAmount: 0,
            averageInvoiceAmount: 0,
            invoicesByStatus: {} as Record<string, number>,
            overdueInvoices: 0,
            overdueAmount: 0,
            oldestUnpaidDate: null as Date | null,
            largestUnpaidAmount: 0
        };

        const today = new Date();

        invoices.forEach(invoice => {
            // Sum totals
            summary.totalAmountExcludingTax += invoice.totalAmountExcludingTax;
            summary.totalTaxAmount += invoice.totalTaxAmount;
            summary.totalAmountIncludingTax += invoice.totalAmountIncludingTax;
            summary.totalRemainingAmount += invoice.remainingAmount;
            summary.totalPaidAmount += (invoice.totalAmountIncludingTax - invoice.remainingAmount);

            // Count by status
            summary.invoicesByStatus[invoice.status] = (summary.invoicesByStatus[invoice.status] || 0) + 1;

            // Track overdue
            if (invoice.remainingAmount > 0 && invoice.dueDate < today) {
                summary.overdueInvoices++;
                summary.overdueAmount += invoice.remainingAmount;
            }

            // Track oldest unpaid
            if (invoice.remainingAmount > 0) {
                if (!summary.oldestUnpaidDate || invoice.invoiceDate < summary.oldestUnpaidDate) {
                    summary.oldestUnpaidDate = invoice.invoiceDate;
                }
                if (invoice.remainingAmount > summary.largestUnpaidAmount) {
                    summary.largestUnpaidAmount = invoice.remainingAmount;
                }
            }
        });

        summary.averageInvoiceAmount = invoices.length > 0 
            ? summary.totalAmountIncludingTax / invoices.length 
            : 0;

        return summary;
    }

    /**
     * Define the parameters for this action
     */
    public get Params(): ActionParam[] {
        const baseParams = this.getCommonAccountingParams();
        
        const specificParams: ActionParam[] = [
            {
                Name: 'CustomerNumber',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Status',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'StartDate',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'EndDate',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DueStartDate',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DueEndDate',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MinAmount',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxAmount',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'OnlyUnpaid',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'IncludeLines',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'MaxResults',
                Type: 'Input',
                Value: 100
            }
        ];

        return [...baseParams, ...specificParams];
    }
}