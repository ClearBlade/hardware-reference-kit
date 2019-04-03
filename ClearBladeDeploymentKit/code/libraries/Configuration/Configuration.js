const FLOW = {
    NEW: "NEW",
    EXISTING: "EXISTING",
    IPM: "IPM",
    PRECONFIGURED: "PRECONFIGURED"
}

/**
 * @typedef EdgeRetargetCreds
 * @property {string}
 * @property {string}
 * @property {string}
 * @property {string} entryPointURL
 */

/**
 * @typedef CONFIGURATION
 * @property {string} TARGET_URL Target System's Platform URL
 * @property {string} IPM_REPO IPM Package Repo to install into new system
 * @property {string} PROVISIONER_USER_EMAIL New user account o use on new system
 * 
 * TODO Append uid to email to allow multiple provisioners per system
 */
const CONFIGURATION = {
    TARGET: {
        URL:"https://amd.clearblade.com",
        REGISTRATION_KEY: "AMDBlade",
        IPM_REPO_USER: "aalcott14",
        IPM_REPO_NAME: "dev-smart-monitoring",
        IPM_ENTRYPOINT:{portal:"smart_monitoring"},
        PROVISIONER_USER_EMAIL: "provisioner@clearblade.com"
    },
    PORTAL:{
        AUTOROUTE: false
    }
}
CONFIGURATION.WORKFLOW = {
    AUTOROUTE: CONFIGURATION.PORTAL.AUTOROUTE,
    PLATFORM: {
        route:(true && CONFIGURATION.PORTAL.AUTOROUTE),
        flow: FLOW.PRECONFIGURED,
        platformURL: CONFIGURATION.TARGET.URL,
    },
    DEVELOPER: {
        route:(false && CONFIGURATION.PORTAL.AUTOROUTE),
        flow: FLOW.NEW,
        devEmail: "",
        devPassword: "",
        key:CONFIGURATION.TARGET.REGISTRATION_KEY
    },
    SYSTEM: {
        route:(true && CONFIGURATION.PORTAL.AUTOROUTE),
        flow: FLOW.IPM,
        systemName: "",
        systemKey: "",
        systemSecret: "",
        provEmail: "provisioner@clearblade.com",
        provPassword: "clearblade",
        repoUser: CONFIGURATION.TARGET.IPM_REPO_USER,
        repoName: CONFIGURATION.TARGET.IPM_REPO_NAME,
        entrypoint:CONFIGURATION.TARGET.IPM_ENTRYPOINT,
    },
    EDGE: {
        route:(true && CONFIGURATION.PORTAL.AUTOROUTE),
        flow: FLOW.NEW,
        edgeID: "",
        edgeToken: "",
    }
};
CONFIGURATION.WORKFLOW_MAP = {
    PLATFORM: {
        [FLOW.PRECONFIGURED]: function (config) {
            // needs nothing
            var platformURL = config.PLATFORM.platformURL
            log("platform")
            log({ platformURL })
            var p = Q.defer()
            rest = ClearBladeAdminREST(platformURL);
            p.resolve(rest);
            return p.promise
        }
    },
    DEVELOPER: {
        [FLOW.NEW]: function (rest, config) {
            var devAttributes = config.DEVELOPER

            var devEmail = devAttributes.devEmail
            var devPassword = devAttributes.devPassword
            var registrationKey = devAttributes.key;

            log("dev")
            log({ devEmail, devPassword })
            var d = Q.defer()
            rest.registerDeveloper(devEmail, devPassword, registrationKey).then(function () {
                d.resolve(rest)
            })
            return d.promise
        },
        [FLOW.EXISTING]: function (rest, config){
            var devAttributes = config.DEVELOPER

            var devEmail = devAttributes.devEmail
            var devPassword = devAttributes.devPassword

            log("dev")
            log({ devEmail, devPassword })
            var d = Q.defer()
            rest.initWithCreds(devEmail, devPassword).then(function () {
                d.resolve(rest)
            })
            return d.promise
        }
    },
    SYSTEM: {
        [FLOW.IPM]: function (rest, config) {
            var systemAttributes = config.SYSTEM
            var repoUser = CONFIGURATION.TARGET.IPM_REPO_USER;
            var repoName = CONFIGURATION.TARGET.IPM_REPO_NAME;
            // RR: Not willing to implement devEmail
            var devEmail = "notprovided@gmail.com"
            log("sys")
            log({ repoUser, repoName, devEmail })
            var d = Q.defer()
            // Warning: systemDetails contains camelCase and snake_case system keys/secrets. 
            // ...the camelCase are the newly created system
            rest.installIPMIntoNewSystem(repoUser, repoName, devEmail).then(function (systemDetails) {
                d.resolve({ rest, systemDetails, config })
            })
            return d.promise

        },
        [FLOW.EXISTING]: function(rest, config) {
            var d = Q.defer();
            d.resolve({ rest, config, systemDetails: {systemKey: config.SYSTEM.systemKey, systemSecret: config.SYSTEM.systemSecret} });
            return d.promise;
        }
    },
    EDGE: {
        [FLOW.NEW]: function(response, config) {
            var edgeID = config.EDGE.edgeID
            log("edge")

            // TODO Implemented
            var systemDetails = response.systemDetails
            var systemKey = systemDetails.systemKey
            var systemSecret = systemDetails.systemSecret

            log(systemDetails)
            log(typeof systemDetails)
            var edgeToken = edgeID
            var description = "no desc"
            log({ edgeID, systemKey, systemSecret, edgeToken, description })
            var d = Q.defer()
            var rest = response.rest
            rest.createEdge(edgeID, systemKey, systemSecret, edgeToken, description).then(function (edgeDetailsRaw) {
                
                // Relying on promise catch
                var edgeDetails = JSON.parse(edgeDetailsRaw)
                // append platformURL to edge details
                edgeDetails.platformURL = config.PLATFORM.platformURL
                d.resolve({ rest, systemDetails, edgeDetails })
            })
            return d.promise
        }
    }
};

/**
 * @param {ProvisionConfig}
 * @returns {ClearBladeAdminREST} 
 */

/**
 * @param {ProvisionConfig}
 * @returns {ClearBladeAdminREST} 
 */

/**
 * @typedef ProvisionConfig
 * @property {PlatformConfig} PLATFORM
 * @property {DeveloperConfig} DEVELOPER
 * @property {SystemConfig} SYSTEM
 * @property {EdgeConfig} EDGE
 */

/**
 * @typedef PlatformConfig
 * @property {Flow} Flow
 * @property {string} PlatformURL
 */

/**
 * @typedef DeveloperConfig
 * @property {Flow} Flow
 * @property {string} devEmail
 * @property {string} devPassword
 */

/**
 * @typedef SystemConfig
 * @property {Flow} Flow
 * @property {string} Name
 * @property {string} IPM
 * @property {string} SystemKey
 * @property {string} SystemSecret
 * @property {string} UserEmail
 * @property {string} UserPassword
 */

/**
 * @typedef EdgeConfig
 * @property {Flow} Flow
 * @property {string} EdgeId
 * @property {string} EdgeToken
 */



/**
 * @typedef Promise
 */
