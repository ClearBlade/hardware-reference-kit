import ClearBladeAdminREST, {
  IClearBladeAdminREST,
  SystemSetupInfo,
  EdgeSetupInfo
} from "./ClearBladeAdminRESTLib";

export interface PlatformConfiguration {
  flow: FLOW;
  platformURL: string;
}

export interface DeveloperConfiguration {
  flow: FLOW;
  devEmail: string;
  devPassword: string;
  key: string;
}

export interface SystemConfiguration {
  flow: FLOW;
  systemName: string;
  systemKey: string;
  systemSecret: string;
  repoUser: string;
  repoName: string;
  entrypoint: { portal: string };
}

export interface EdgeConfiguration {
  flow: FLOW;
  edgeID: string;
  edgeToken: string;
}

export interface Configuration {
  PLATFORM: PlatformConfiguration;
  DEVELOPER: DeveloperConfiguration;
  SYSTEM: SystemConfiguration;
  EDGE: EdgeConfiguration;
}
export interface WorkflowConfig extends Configuration {
  AUTOROUTE: boolean;
  PLATFORM: Configuration["PLATFORM"] & {
    route: boolean;
  };
  DEVELOPER: Configuration["DEVELOPER"] & {
    route: boolean;
  };
  SYSTEM: Configuration["SYSTEM"] & {
    route: boolean;
  };
  EDGE: Configuration["EDGE"] & {
    route: boolean;
  };
}

export enum FLOW {
  NEW = "NEW",
  EXISTING = "EXISTING",
  IPM = "IPM",
  PRECONFIGURED = "PRECONFIGURED"
}

export const TARGET_CONFIGURATION = {
  URL: "https://dev.clearblade.com",
  REGISTRATION_KEY: "AMDBlade",
  IPM_REPO_USER: "aalcott14",
  IPM_REPO_NAME: "dev-smart-monitoring",
  IPM_ENTRYPOINT: { portal: "smart_monitoring" },
  PROVISIONER_USER_EMAIL: "provisioner@clearblade.com"
};

const PORTAL_CONFIGURATION = {
  AUTOROUTE: false
};

const WORKFLOW_CONFIGURATION: WorkflowConfig = {
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

interface TemplateOption {
  ID: string;
  LABEL: string;
  IPM_REPO_USER: string;
  IPM_REPO_NAME: string;
  IPM_ENTRYPOINT: { portal: string };
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    ID: "aalcott14_dev-smart-monitoring",
    LABEL: "Smart Monitoring",
    IPM_REPO_USER: "aalcott14",
    IPM_REPO_NAME: "dev-smart-monitoring",
    IPM_ENTRYPOINT: { portal: "smart_monitoring" }
  },
  {
    ID: "rreinold_anomaly-detection-template",
    LABEL: "Anomaly Detection",
    IPM_REPO_USER: "rreinold",
    IPM_REPO_NAME: "anomaly-detection-template",
    IPM_ENTRYPOINT: { portal: "AnomalyDetection" }
  }
];

/**
 *
 * TODO Append uid to email to allow multiple provisioners per system
 */
const CONFIGURATION = {
  TARGET: TARGET_CONFIGURATION,
  PORTAL: PORTAL_CONFIGURATION,
  WORKFLOW: WORKFLOW_CONFIGURATION,
  TEMPLATE_OPTIONS,
  WORKFLOW_MAP: {
    PLATFORM: {
      [FLOW.PRECONFIGURED]: function(
        config: WorkflowConfig
      ): Q.Promise<IClearBladeAdminREST> {
        // needs nothing
        const platformURL = config.PLATFORM.platformURL;
        log("platform");
        log({ platformURL });
        const deferred = Q.defer<IClearBladeAdminREST>();
        const rest = ClearBladeAdminREST(platformURL);
        deferred.resolve(rest);
        return deferred.promise;
      }
    },
    DEVELOPER: {
      [FLOW.NEW]: function(
        rest: IClearBladeAdminREST,
        config: WorkflowConfig
      ): Q.Promise<IClearBladeAdminREST> {
        const devAttributes = config.DEVELOPER;

        const devEmail = devAttributes.devEmail;
        const devPassword = devAttributes.devPassword;
        const registrationKey = devAttributes.key;

        log("dev");
        log({ devEmail, devPassword });
        const deferred = Q.defer<IClearBladeAdminREST>();
        rest.registerDeveloper(devEmail, devPassword, registrationKey).then(
          () => deferred.resolve(rest),
          err => {
            deferred.reject(err);
          }
        );
        return deferred.promise;
      },
      [FLOW.EXISTING]: function(
        rest: IClearBladeAdminREST,
        config: WorkflowConfig
      ): Q.Promise<IClearBladeAdminREST> {
        const devAttributes = config.DEVELOPER;

        const devEmail = devAttributes.devEmail;
        const devPassword = devAttributes.devPassword;

        log("dev");
        log({ devEmail, devPassword });
        const deferred = Q.defer<IClearBladeAdminREST>();
        rest
          .initWithCreds(devEmail, devPassword)
          .then(() => deferred.resolve(rest), err => deferred.reject(err));
        return deferred.promise;
      }
    },
    SYSTEM: {
      [FLOW.IPM]: function(
        rest: IClearBladeAdminREST,
        config: WorkflowConfig
      ): Q.Promise<SystemSetupInfo> {
        const repoUser = config.SYSTEM.repoUser;
        const repoName = config.SYSTEM.repoName;
        // RR: Not willing to implement devEmail
        const devEmail = "notprovided@gmail.com";
        log("sys");
        log({ repoUser, repoName, devEmail });
        const deferred = Q.defer<SystemSetupInfo>();
        // Warning: systemDetails contains camelCase and snake_case system keys/secrets.
        // ...the camelCase are the newly created system
        rest.installIPMIntoNewSystem(repoUser, repoName, devEmail).then(
          systemDetails => {
            deferred.resolve({ rest, systemDetails, config });
          },
          err => deferred.reject(err)
        );
        return deferred.promise;
      },
      [FLOW.EXISTING]: function(
        rest: IClearBladeAdminREST,
        config: WorkflowConfig
      ): Q.Promise<SystemSetupInfo> {
        return Q.resolve({
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
        response: SystemSetupInfo,
        config: WorkflowConfig
      ): Q.Promise<EdgeSetupInfo> {
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
        const deferred = Q.defer<EdgeSetupInfo>();
        const rest = response.rest;
        rest
          .createEdge(edgeID, systemKey, systemSecret, edgeToken, description)
          .then(
            edgeDetailsRaw => {
              // Relying on promise catch
              const edgeDetails = JSON.parse(edgeDetailsRaw);
              // append platformURL to edge details
              edgeDetails.platformURL = config.PLATFORM.platformURL;
              deferred.resolve({ rest, systemDetails, edgeDetails });
            },
            err => deferred.reject(err)
          );
        return deferred.promise;
      }
    }
  }
};

export default CONFIGURATION;
