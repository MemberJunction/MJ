# PropFuel — Data Export Integration (user-provided context, 2026-06-08)

> SCOPE NOTE: This describes the PropFuel **data-export file-feed slice** only. It is the
> client's actual consumption surface, NOT a statement of PropFuel's full product nature.
> The pipeline must independently study PropFuel's full API surface and reconcile.

The data export integration will run approximately once per hour and generate `.json` files
containing your PropFuel activity.

You can use the API endpoints below to retrieve these files and import them into your own systems.

Files will be generated on the same schedule regardless of whether you have downloaded the
previous files or not.

## File Format
The naming convention for the files is `[microtime]-[data type].json`

Files can be sorted in chronological order by the microtime value.

The files are in JSON format and contain an array of objects, each representing a record of the
specified data type.

## Authentication
In order to use the data export endpoints, you should authenticate your request by including the
bearer token value:

    Authorization: Bearer <token>

## Headers
Make sure you have the following content type header set on every request:

    Content-Type: <content-type>

## Get File List
HTTP GET request to:

    https://app.propfuel.com/dataexport/2019/list

## Download File
Once you have your list of files, make an HTTP GET request, passing the filename to the download
endpoint to retrieve the data:

    https://app.propfuel.com/dataexport/2019/download/{file}

## Acknowledge File
Once you have downloaded and processed a file, make an HTTP POST request to acknowledge receipt
and remove it from your file list:

    https://app.propfuel.com/dataexport/2019/ack/{file}

## Notes observed from context
- Account ID appears in the path: `2019`.
- Three endpoints: list, download/{file}, ack/{file}.
- Auth: Bearer token.
- Data types are encoded in the filename suffix (`[microtime]-[data type].json`).
