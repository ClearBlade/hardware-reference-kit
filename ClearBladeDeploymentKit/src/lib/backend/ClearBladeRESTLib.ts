/**
 * @typedef ClearBladeREST
 *
 * REST Client for System Users, essentially OpenAPI in a Library
 *
 * Create an Edge within a system via {@link https://docs.clearblade.com/v/3/static/restapi/index.html#/Edge/CreateNewEdge REST Endpoint}
 * @param {string} url url of the clearblade platform, ex. "https://platform.clearblade.com" or "http://localhost:9000"
 * @param {string} systemKey - system key for the system
 * @param {string} systemSecret - system secret for the system
 */
function ClearBladeREST(url: string, systemKey: string, systemSecret: string) {
  const http = Requests();
  let userToken = "";

  /**
   * memberof ClearBladeREST
   *
   * Register a new user account
   *
   * @param {string} email
   * @param {string} password
   * @param {string} anonToken Required for registering
   * @param {callback} callback TODO Remove
   */
  function register(email: string, password: string, anonToken: string) {
    const headers = {
      "ClearBlade-SystemKey": systemKey,
      "ClearBlade-SystemSecret": systemSecret,
      "ClearBlade-UserToken": anonToken
    };
    const body = {
      email,
      password
    };
    const uri = url + "/api/v/1/user/reg";
    const options = {
      uri,
      headers,
      body
    };
    return new Promise((resolve, reject) => {
      http.post(options, snagTokenPromise.bind({ resolve, reject }));
    });
  }
  /**
   * @memberof ClearBladeREST
   *
   * Initialize client by logging in with credentials
   *
   * @param {string} email
   * @param {string} password
   *
   */
  function initWithCreds(email: string, password: string) {
    const headers = {
      "ClearBlade-SystemKey": systemKey,
      "ClearBlade-SystemSecret": systemSecret
    };
    const body = {
      email,
      password
    };
    const uri = url + "/api/v/1/user/auth";
    const options = {
      uri,
      headers,
      body
    };

    return new Promise((resolve, reject) => {
      http.post(options, snagTokenPromise.bind({ resolve, reject }));
    });
  }

  function initWithToken(t: string) {
    userToken = t;
  }

  /**
   * Execute code service in a targetted system
   */
  function executeCode(serviceName: string, params: object) {
    const headers = {
      "ClearBlade-UserToken": userToken
    };
    const options = {
      body: params,
      headers,
      uri: url + "/api/v/1/code/" + systemKey + "/" + serviceName
    };
    log("#executeCode");
    log({ options });
    return new Promise((resolve, reject) => {
      http.post(options, function(err, data) {
        if (err) {
          reject(err);
        }
        resolve(data);
      });
    });
  }

  // TODO Remove callback, remove snagToken
  /**
   * Creates an Edge within the targetted system
   */
  function createEdge(
    instance: string,
    name: string,
    description: string,
    edgeToken: string
  ) {
    const headers = {
      "ClearBlade-UserToken": userToken
    };
    const options = {
      body: {
        description,
        token: edgeToken,
        system_key: systemKey,
        system_secret: systemSecret
      },
      headers,
      uri: instance + "/api/v/3/edges/" + systemKey + "/" + name
    };
    log({ options });

    return new Promise((resolve, reject) => {
      http.post(options, snagTokenPromise.bind({ resolve, reject }));
    });
  }

  /**
   * @memberof ClearBladeREST
   *
   */
  function authAnon() {
    const headers = {
      "ClearBlade-SystemKey": systemKey,
      "ClearBlade-SystemSecret": systemSecret
    };
    const body = {};
    const uri = url + "/api/v/1/user/anon";
    const options = {
      uri,
      headers,
      body
    };

    return new Promise((resolve, reject) => {
      http.post(options, snagTokenPromise.bind({ resolve, reject }));
    });
  }

  /**
   * Helper method for retrieving user token from auth requests
   */
  function snagTokenPromise(
    this: { resolve: (data: object) => void; reject: (msg: string) => void },
    err: any,
    data: string
  ) {
    log({ err, data });
    try {
      if (err) throw new Error("POST Failed" + err);
      const parsed = JSON.parse(data);
      log("snagging token");
      userToken = parsed.user_token;
      log({ userToken });
      this.resolve(parsed);
    } catch (e) {
      const msg = "POST Failed: " + JSON.stringify(err);
      log(msg);
      this.reject(msg);
    }
  }

  return {
    executeCode,
    authAnon,
    register,
    initWithCreds,
    initWithToken,
    createEdge
  };
}
