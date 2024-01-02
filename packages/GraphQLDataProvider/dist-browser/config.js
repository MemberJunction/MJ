(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "@memberjunction/core", "./graphQLDataProvider", "@memberjunction/global"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.setupGraphQLClient = void 0;
    const core_1 = require("@memberjunction/core");
    const graphQLDataProvider_1 = require("./graphQLDataProvider");
    const global_1 = require("@memberjunction/global");
    async function setupGraphQLClient(config) {
        // Set the provider for all entities to be GraphQL in this project, can use a different provider in other situations....
        const provider = new graphQLDataProvider_1.GraphQLDataProvider();
        // BaseEntity + Metadata share the same GraphQLDataProvider instance
        core_1.BaseEntity.Provider = provider;
        core_1.Metadata.Provider = provider;
        core_1.RunView.Provider = provider;
        core_1.RunReport.Provider = provider;
        await provider.Config(config);
        // fire off the logged in event if we get here
        global_1.MJGlobal.Instance.RaiseEvent({ event: global_1.MJEventType.LoggedIn, eventCode: null, component: this, args: null });
        return provider;
    }
    exports.setupGraphQLClient = setupGraphQLClient;
});
//# sourceMappingURL=config.js.map