(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./config", "./graphQLDataProvider"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.GraphQLProviderConfigData = exports.GraphQLDataProvider = exports.setupGraphQLClient = void 0;
    var config_1 = require("./config");
    Object.defineProperty(exports, "setupGraphQLClient", { enumerable: true, get: function () { return config_1.setupGraphQLClient; } });
    var graphQLDataProvider_1 = require("./graphQLDataProvider");
    Object.defineProperty(exports, "GraphQLDataProvider", { enumerable: true, get: function () { return graphQLDataProvider_1.GraphQLDataProvider; } });
    Object.defineProperty(exports, "GraphQLProviderConfigData", { enumerable: true, get: function () { return graphQLDataProvider_1.GraphQLProviderConfigData; } });
});
//# sourceMappingURL=index.js.map