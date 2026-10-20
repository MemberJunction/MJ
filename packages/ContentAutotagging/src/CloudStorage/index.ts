export * from './generic/CloudStorageBase'
export * from './providers/AutotagCloudStorage'

/**
 * @deprecated Use AutotagCloudStorage instead, which works with any MJ Storage provider.
 * AutotagAzureBlob is retained for backward compatibility but will be removed in a future version.
 */
export * from './providers/AutotagAzureBlob'
