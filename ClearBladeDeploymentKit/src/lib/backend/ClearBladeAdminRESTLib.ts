import { WorkflowConfig } from "./Configuration";

export interface SystemDetails {
  name?: string;
  systemKey: string;
  systemSecret: string;
}

export interface EdgeDetails {
  description: string;
  edge_key: string;
  name: string;
  novi_system_key: string;
  system_key: string;
  system_secret: string;
  token: string;
  platformURL: string;
}

export interface SystemSetupInfo {
  rest: IClearBladeAdminREST;
  systemDetails: SystemDetails;
  config: WorkflowConfig;
}

export type EdgeSetupInfo = SystemSetupInfo & {
  edgeDetails: EdgeDetails;
};

export type IClearBladeAdminREST = ReturnType<typeof ClearBladeAdminREST>;

function ClearBladeAdminREST(url: string) {
  const http = Requests();
  let token = "";

  /**
   * Create a System on behalf of the developer
   */
  function createSystem(systemName: string): Q.Promise<string> {
    log({ systemName });
    const headers = {
      "ClearBlade-DevToken": token
    };
    const name = new String(+new Date());
    const description = "";
    const body = {
      name,
      description
    };

    const uri = url + "/admin/systemmanagement";
    const options = {
      uri,
      headers,
      body
    };
    log(options);
    const deferred = Q.defer<string>();
    http.post(options, function(err, data) {
      try {
        if (err) throw new Error("POST failed: " + err);
        const json = JSON.parse(data);
        deferred.resolve(json.appID);
      } catch (e) {
        deferred.reject(data);
      }
    });
    return deferred.promise;
  }

  function registerDeveloper(
    email: string,
    password: string,
    key: string
  ): Q.Promise<object> {
    const headers = {};

    const fname = "self";
    const lname = "self";
    const org = "self";

    const body = {
      email,
      password,
      fname,
      lname,
      org,
      key
    };
    const uri = url + "/admin/reg";
    const options = {
      uri,
      headers,
      body
    };
    log({ options });
    const deferred = Q.defer();
    http.post(options, function(err, data) {
      log("snagging token");
      log({ err, data });
      try {
        if (err) {
          log("err block hit: " + JSON.stringify(err));
          throw new Error("Error while auth'ing: " + JSON.stringify(err));
        }
        const parsed = JSON.parse(data);
        log(parsed);
        token = parsed.dev_token;
        log({ token });
        deferred.resolve({});
      } catch (e) {
        const msg = "Failed to auth: " + JSON.stringify(e);
        log(msg);
        throw new Error(msg);
        log(msg);
        deferred.reject(msg);
      }
    });
    return deferred.promise;
  }

  /**
   * Install an IPM Package into a new system
   */
  function installIPMIntoNewSystem(
    repoUser: string,
    repoName: string,
    developerEmail: string
  ): Q.Promise<SystemDetails> {
    log("#installIPMIntoNewSystem");
    const deferred = Q.defer<SystemDetails>();
    prepareInstall(repoUser, repoName)
      .then(function(listOfFilesToImport: string[]) {
        log("Succeeded #prepareInstall");
        return executeInstall(
          repoUser,
          repoName,
          developerEmail,
          listOfFilesToImport
        );
      })
      .then(function(newSystemDetails: SystemDetails) {
        log("Suceeded #executeInstall");
        deferred.resolve(newSystemDetails);
      })
      .catch(function(e) {
        const msg = "Unable to complete IPM Install: " + JSON.stringify(e);
        log(msg);
        deferred.reject(msg);
      });
    return deferred.promise;
  }

  /**
   * Prepare IPM Install, step 1 of 2
   *
   * @param {string} repoUser Github username, ex "clearblade, representing the user github.com/clearblade
   * @param {string} repoName Github repo name, ex "smart-monitoring" representing github.com/clearblade/smart-monitoring
   * @return {string[]} listOfFilesToImport list of assets to import, ex ["REPO_NAME-master/code/services/serviceA/serviceA.js",...]
   */
  function prepareInstall(
    repoUser: string,
    repoName: string
  ): Q.Promise<string[]> {
    log("#prepareInstall");
    const headers = {
      "ClearBlade-DevToken": token
    };

    const body = {};

    const uri =
      url +
      "/console-api/systemStructureFromGithub?branch=master&systemRepoName=" +
      repoName +
      "&username=" +
      repoUser;
    const options = {
      uri,
      headers,
      body
    };
    log({ options });
    const deferred = Q.defer<string[]>();
    http.get(options, function(err, data) {
      try {
        if (err) throw new Error("#prepareInstall Failed: " + err);
        const json = JSON.parse(data);
        const rawFiles = json.tree;
        const files = formatFiles(repoName, rawFiles);
        log({ files });
        deferred.resolve(files);
      } catch (e) {
        log(
          "Error Encountered while preparing ipm install: " + JSON.stringify(e)
        );
        log({ data });
        deferred.reject(data);
      }
    });
    return deferred.promise;
  }

  /**
   * Execute IPM Package install, step 2 of 2
   */
  function executeInstall(
    repoUser: string,
    repoName: string,
    developerEmail: string,
    listOfFilesToImport: string[]
  ): Q.Promise<SystemDetails> {
    log("#executeInstall");
    const headers = {
      "ClearBlade-DevToken": token
    };

    const repoDownloadURL = [
      "https://github.com",
      repoUser,
      repoName,
      "archive/master.zip"
    ].join("/");

    const body = {
      repoURL: repoDownloadURL,
      developerEmail,
      listOfFilesToImport,
      systemName: repoName,
      importFullSystem: false,
      importIntoExistingSystem: false
    };

    const uri = url + "/console-api/importAssetsIntoNewSystem";

    const options = {
      uri,
      headers,
      body
    };
    log(options);
    const deferred = Q.defer<SystemDetails>();
    http.post(options, function(err, data) {
      try {
        if (err) throw new Error("#executeInstall failed: " + err);
        const json = JSON.parse(data);
        deferred.resolve(json);
      } catch (e) {
        log(err);
        log(data);
        deferred.reject(data);
      }
    });
    return deferred.promise;
  }

  /**
   * Create Edge entry in system
   */
  function createEdge(
    name: string,
    systemKey: string,
    systemSecret: string,
    edgeToken: string,
    description: string
  ): Q.Promise<string> {
    const headers = {
      "ClearBlade-DevToken": token
    };
    const body = {
      description,
      token: edgeToken,
      system_key: systemKey,
      system_secret: systemSecret
    };
    const uri = [url, "admin/edges", systemKey, name].join("/");
    const options = {
      uri,
      headers,
      body
    };

    log({ options });
    const deferred = Q.defer<string>();
    http.post(options, function(err, data) {
      if (err) {
        log(err);
        deferred.reject(err);
      } else {
        log({ "edge response": data });
        deferred.resolve(data);
      }
    });
    return deferred.promise;
  }

  /**
   * Initialize admin developer client with credentials
   */
  function initWithCreds(email: string, password: string): Q.Promise<object> {
    const headers = {};
    const body = {
      email,
      password
    };
    const uri = url + "/admin/auth";
    const options = {
      uri,
      headers,
      body
    };
    const deferred = Q.defer();
    http.post(options, function(err, data) {
      log("snagging token");
      log({ err, data });
      try {
        if (err) {
          log("err block hit: " + JSON.stringify(err));
          throw new Error("Error while auth'ing: " + JSON.stringify(err));
        }
        const parsed = JSON.parse(data);
        log(parsed);
        token = parsed.dev_token;
        log({ token });
        deferred.resolve({});
      } catch (e) {
        const msg = "Failed to auth: " + JSON.stringify(e);
        log(msg);
        throw new Error(msg);
      }
    });
    return deferred.promise;
  }

  /**
   * Initialize session with token
   */
  function initWithToken(t: string) {
    token = t;
  }

  function formatFiles(
    repoName: string,
    rawFiles: { type: string; path: string }[]
  ) {
    const rootFolder = repoName + "-master";
    const output: string[] = [];
    rawFiles.forEach(function(entity) {
      if (entity.type == "blob") {
        output.push(`${rootFolder}/${entity.path}`);
      }
    });

    return output;
  }

  function retarget(
    platformIPOverride: string,
    systemKeyOverride: string,
    edgeName: string,
    edgeCookie: string
  ): Q.Promise<object> {
    // platformIPOverride must omit protocol
    platformIPOverride = platformIPOverride.replace(/(^\w+:|^)\/\//, "");
    const options = {
      body: {
        platformIP: platformIPOverride,
        systemKey: systemKeyOverride,
        edgeName,
        edgeCookie,
        adaptersRootDir: "./"
      },
      uri: ["http://localhost:9000", "admin/edgemode/runtime"].join("/")
    };

    // MQTT Port needs to be omitted or else it fails. This is a bug mkay.
    // JIRA https://clearblade.atlassian.net/browse/MONSOON-4240
    //delete options.body.mqttPort
    log({ options });

    const deferred = Q.defer();
    http.post(options, function(err, data) {
      log({ err, data });
      if (err) {
        deferred.reject(err);
        log("proceeding to unknown");
      } else {
        deferred.resolve(data);
      }
    });
    return deferred.promise;
  }
  /**
   * Note: Asking platform to encode, rather than edge
   * Asking edge leads to uncertainty about cb_console's local port
   */
  function getEncodedPortalURL(
    systemKey: string,
    systemSecret: string,
    portalName: string
  ): Q.Promise<string> {
    const headers = {};
    const body = {};
    const qs = [
      "?systemKey=",
      systemKey,
      "&systemSecret=",
      systemSecret,
      "&name=",
      portalName
    ].join("");
    const uri = [url, "console-api/portal/createURL", qs].join("/");
    const options = {
      uri,
      headers,
      body
    };
    log(options);
    const deferred = Q.defer<string>();
    http.get(options, function(err, data) {
      if (err) {
        deferred.reject(err);
      } else {
        deferred.resolve(data);
      }
    });
    return deferred.promise;
  }

  return {
    registerDeveloper,
    initWithToken,
    initWithCreds,
    createSystem,
    installIPMIntoNewSystem,
    getEncodedPortalURL,
    createEdge,
    retarget
  };
}

export default ClearBladeAdminREST;
