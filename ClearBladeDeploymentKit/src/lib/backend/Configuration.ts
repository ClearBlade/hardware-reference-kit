import ClearBladeAdminREST, {
  IClearBladeAdminREST,
  SystemDetails
} from "./ClearBladeAdminRESTLib";

export type WorkflowConfig = typeof WORKFLOW_CONFIGURATION;

enum FLOW {
  NEW = "NEW",
  EXISTING = "EXISTING",
  IPM = "IPM",
  PRECONFIGURED = "PRECONFIGURED"
}

const TARGET_CONFIGURATION = {
  URL: "https://amd.clearblade.com",
  REGISTRATION_KEY: "AMDBlade",
  IPM_REPO_USER: "aalcott14",
  IPM_REPO_NAME: "dev-smart-monitoring",
  IPM_ENTRYPOINT: { portal: "smart_monitoring" },
  PROVISIONER_USER_EMAIL: "provisioner@clearblade.com"
};

const PORTAL_CONFIGURATION = {
  AUTOROUTE: false
};

const WORKFLOW_CONFIGURATION = {
  AUTOROUTE: PORTAL_CONFIGURATION.AUTOROUTE,
  PLATFORM: {
    route: true && PORTAL_CONFIGURATION.AUTOROUTE,
    flow: FLOW.PRECONFIGURED,
    platformURL: TARGET_CONFIGURATION.URL
  },
  DEVELOPER: {
    route: false && PORTAL_CONFIGURATION.AUTOROUTE,
    flow: FLOW.NEW,
    devEmail: "",
    devPassword: "",
    key: TARGET_CONFIGURATION.REGISTRATION_KEY
  },
  SYSTEM: {
    route: true && PORTAL_CONFIGURATION.AUTOROUTE,
    flow: FLOW.IPM,
    systemName: "",
    systemKey: "",
    systemSecret: "",
    provEmail: "provisioner@clearblade.com",
    provPassword: "clearblade",
    repoUser: TARGET_CONFIGURATION.IPM_REPO_USER,
    repoName: TARGET_CONFIGURATION.IPM_REPO_NAME,
    entrypoint: TARGET_CONFIGURATION.IPM_ENTRYPOINT
  },
  EDGE: {
    route: true && PORTAL_CONFIGURATION.AUTOROUTE,
    flow: FLOW.NEW,
    edgeID: "",
    edgeToken: ""
  }
};

/**
 *
 * TODO Append uid to email to allow multiple provisioners per system
 */
const CONFIGURATION = {
  TARGET: TARGET_CONFIGURATION,
  PORTAL: PORTAL_CONFIGURATION,
  WORKFLOW: WORKFLOW_CONFIGURATION,
  WORKFLOW_MAP: {
    PLATFORM: {
      [FLOW.PRECONFIGURED]: function(
        config: WorkflowConfig,
        resp: CbServer.Resp
      ): Promise<IClearBladeAdminREST> {
        // needs nothing
        const platformURL = config.PLATFORM.platformURL;
        log("platform");
        log({ platformURL });
        return new Promise(resolve => {
          const rest = ClearBladeAdminREST(platformURL);
          resolve(rest);
        });
      }
    },
    DEVELOPER: {
      [FLOW.NEW]: function(
        rest: IClearBladeAdminREST,
        config: WorkflowConfig
      ): Promise<IClearBladeAdminREST> {
        const devAttributes = config.DEVELOPER;

        const devEmail = devAttributes.devEmail;
        const devPassword = devAttributes.devPassword;
        const registrationKey = devAttributes.key;

        log("dev");
        log({ devEmail, devPassword });
        return new Promise(resolve => {
          rest
            .registerDeveloper(devEmail, devPassword, registrationKey)
            .then(function() {
              resolve(rest);
            });
        });
      },
      [FLOW.EXISTING]: function(
        rest: IClearBladeAdminREST,
        config: WorkflowConfig
      ): Promise<IClearBladeAdminREST> {
        const devAttributes = config.DEVELOPER;

        const devEmail = devAttributes.devEmail;
        const devPassword = devAttributes.devPassword;

        log("dev");
        log({ devEmail, devPassword });
        return new Promise(resolve => {
          rest.initWithCreds(devEmail, devPassword).then(function() {
            resolve(rest);
          });
        });
      }
    },
    SYSTEM: {
      [FLOW.IPM]: function(rest: IClearBladeAdminREST, config: WorkflowConfig) {
        const systemAttributes = config.SYSTEM;
        const repoUser = CONFIGURATION.TARGET.IPM_REPO_USER;
        const repoName = CONFIGURATION.TARGET.IPM_REPO_NAME;
        // RR: Not willing to implement devEmail
        const devEmail = "notprovided@gmail.com";
        log("sys");
        log({ repoUser, repoName, devEmail });
        return new Promise(resolve => {
          // Warning: systemDetails contains camelCase and snake_case system keys/secrets.
          // ...the camelCase are the newly created system
          rest
            .installIPMIntoNewSystem(repoUser, repoName, devEmail)
            .then(function(systemDetails) {
              resolve({ rest, systemDetails, config });
            });
        });
      },
      [FLOW.EXISTING]: function(
        rest: IClearBladeAdminREST,
        config: WorkflowConfig
      ) {
        return Promise.resolve({
          rest,
          config,
          systemDetails: {
            systemKey: config.SYSTEM.systemKey,
            systemSecret: config.SYSTEM.systemSecret
          }
        });
      }
    },
    EDGE: {
      [FLOW.NEW]: function(
        response: { systemDetails: SystemDetails; rest: IClearBladeAdminREST },
        config: WorkflowConfig
      ) {
        const edgeID = config.EDGE.edgeID;
        log("edge");

        // TODO Implemented
        const systemDetails = response.systemDetails;
        const systemKey = systemDetails.systemKey;
        const systemSecret = systemDetails.systemSecret;

        log(systemDetails);
        log(typeof systemDetails);
        const edgeToken = edgeID;
        const description = "no desc";
        log({ edgeID, systemKey, systemSecret, edgeToken, description });
        return new Promise(resolve => {
          const rest = response.rest;
          rest
            .createEdge(edgeID, systemKey, systemSecret, edgeToken, description)
            .then(function(edgeDetailsRaw) {
              // Relying on promise catch
              const edgeDetails = JSON.parse(edgeDetailsRaw);
              // append platformURL to edge details
              edgeDetails.platformURL = config.PLATFORM.platformURL;
              resolve({ rest, systemDetails, edgeDetails });
            });
        });
      }
    }
  }
};

export default CONFIGURATION;
