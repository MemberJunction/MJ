export declare const EmbeddingModels: {
    /**
    * Most capable embedding model for both english and non-english tasks
    * Output Dimension: 3,072
    */
    readonly Large: 'text-embedding-3-large';

    /**
     * Increased performance over 2nd generation ada embedding model
     * Output Dimension: 1,536
     */
    readonly small: 'text-embedding-3-small';

    /**
     * Most capable 2nd generation embedding model, replacing 16 first generation models
     * Output Dimension: 1,536
     */
    readonly ada: 'text-embedding-ada-002';
}