import "@babel/polyfill";
import CONFIGURATION, { WorkflowConfig } from "lib/backend/Configuration";
import {
  IClearBladeAdminREST,
  SystemDetails,
  SystemSetupInfo,
  EdgeSetupInfo
} from "lib/backend/ClearBladeAdminRESTLib";

const DEBUG = {
  enabled: false,
  payload: {
    PLATFORM: {
      flow: "PRECONFIGURED",
      platformURL: "https://amd.clearblade.com"
    },
    DEVELOPER: {
      devEmail: new String(+new Date()) + "@gmail.com",
      devPassword: "a",
      flow: "NEW",
      key: "AMDBlade"
    },
    SYSTEM: {
      system: "smart-monitoring",
      flow: "IPM",
      entrypoint: { portal: "smart-monitoring" }
    },
    EDGE: {
      edgeID: "abc",
      flow: "NEW"
    }
  }
};
/**
 * This does a lot
 *
 * Desired Flow: { PLATFORM: PRECONFIGURED, DEVELOPER:NEW, SYSTEM:IPM, EDGE:NEW }
 *
 * @param {ProvisionConfig}
 *
 */
function SetupPlatformSystemForEdge(
  req: CbServer.BasicReq,
  resp: CbServer.Resp
) {
  if (DEBUG.enabled) {
    log("Warning: DEBUG Enabled");
    req.params = DEBUG.payload;
  }

  const provisionConfig: WorkflowConfig = req.params;
  log(provisionConfig);
  const flowMap = CONFIGURATION.WORKFLOW_MAP;

  setupPlatform()
    .then(setupDeveloper)
    .then(setupSystem)
    .then(getEntrypointURL)
    .then(setupEdge)
    .then(retarget)
    .then(finish)
    .catch(badThings);

  function setupPlatform() {
    const flow = provisionConfig.PLATFORM.flow;
    return flowMap.PLATFORM[flow as keyof typeof flowMap.PLATFORM](
      provisionConfig
    );
  }

  function setupDeveloper(rest: IClearBladeAdminREST) {
    const flow = provisionConfig.DEVELOPER.flow;
    return flowMap.DEVELOPER[flow as keyof typeof flowMap.DEVELOPER](
      rest,
      provisionConfig
    );
  }

  function setupSystem(rest: IClearBladeAdminREST) {
    const flow = provisionConfig.SYSTEM.flow;
    return flowMap.SYSTEM[flow as keyof typeof flowMap.SYSTEM](
      rest,
      provisionConfig
    );
  }

  function getEntrypointURL(
    response: SystemSetupInfo
  ): Q.Promise<SystemSetupInfo> {
    const deferred = Q.defer<SystemSetupInfo>();
    deferred.resolve(response);
    return deferred.promise;
    // log("a");
    // const rest = response.rest;
    // log("a");
    // const systemDetails = response.systemDetails;
    // log("a");
    // const systemKey = systemDetails.systemKey;
    // log("a");
    // const systemSecret = systemDetails.systemSecret;
    // log("a");
    // const portalName = provisionConfig.SYSTEM.entrypoint.portal;
    // log("a");
    // const deferred = Q.defer();
    // rest
    //   .getEncodedPortalURL(systemKey, systemSecret, portalName)
    //   .then(function(raw) {
    //     try {
    //       json = JSON.parse(raw);
    //       log("got url: " + json.url);
    //       response.systemDetails.entrypoint = { portal: json.url };
    //       deferred.resolve(response);
    //     } catch (e) {
    //       log("Unable to parse portal url response: " + raw);
    //       deferred.reject(e);
    //     }
    //   });
    // return deferred.promise;
  }
  function setupEdge(edgeRetargetCreds: SystemSetupInfo) {
    const flow = provisionConfig.EDGE.flow;
    return flowMap.EDGE[flow as keyof typeof flowMap.EDGE](
      edgeRetargetCreds,
      provisionConfig
    );
  }

  function retarget(
    edgeRetargetCreds: EdgeSetupInfo
  ): Q.Promise<SystemDetails> {
    log({ edgeRetargetCreds });
    const rest = edgeRetargetCreds.rest;
    const edgeDetails = edgeRetargetCreds.edgeDetails;
    const systemDetails = edgeRetargetCreds.systemDetails;
    const systemKeyOverride = edgeDetails.system_key;
    const edgeID = edgeDetails.name;
    const edgeToken = edgeDetails.token;
    const platformIPOverride = edgeDetails.platformURL;
    log("About to retarget");
    log("A");
    log(typeof rest.retarget);
    log("A");
    const deferred = Q.defer<SystemDetails>();
    log("A");
    ClearBlade.init({ request: req });
    log("A");
    if (!ClearBlade.isEdge()) {
      log("A");
      log("Skipping retarget on platform");
      deferred.resolve(systemDetails);
      return deferred.promise;
    }
    log("A");
    log("Proceeding as Edge");
    rest
      .retarget(platformIPOverride, systemKeyOverride, edgeID, edgeToken)
      .then(function() {
        deferred.resolve(systemDetails);
      })
      .catch(function() {
        deferred.reject("Failed to retarget");
      });
    return deferred.promise;
  }

  function finish(systemDetails: SystemDetails) {
    log({ systemDetails });
    log("Completed");
    resp.success(systemDetails);
  }

  function badThings(handsUpInTheAir: any) {
    const msg = "Caught Promise Error: " + JSON.stringify(handsUpInTheAir);
    log(msg);
    resp.error(handsUpInTheAir);
  }
}

// @ts-ignore
global.SetupPlatformSystemForEdge = SetupPlatformSystemForEdge;
