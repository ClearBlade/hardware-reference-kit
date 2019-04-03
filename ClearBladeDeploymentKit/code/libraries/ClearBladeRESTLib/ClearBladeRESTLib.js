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
function ClearBladeREST(url, systemKey, systemSecret){
    var http = Requests()
    var userToken = ""

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
    function register(email, password, anonToken){
        var headers = {
            "ClearBlade-SystemKey":systemKey,
            "ClearBlade-SystemSecret":systemSecret,
            "ClearBlade-UserToken": anonToken
        }
        var body = {
            email,
            password
        }
        var uri = url + "/api/v/1/user/reg"
        var options = {
            uri,
            headers,
            body
        }
        var deferred = Q.defer();
        http.post(options, snagTokenPromise.bind({deferred}));
        return deferred.promise;
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
    function initWithCreds(email, password){
        var headers = {
            "ClearBlade-SystemKey":systemKey,
            "ClearBlade-SystemSecret":systemSecret
        }
        var body = {
            email,
            password
        }
        var uri = url + "/api/v/1/user/auth"
        var options = {
            uri,
            headers,
            body
        }

        var deferred = Q.defer();
        http.post(options, snagTokenPromise.bind({deferred}));
        return deferred.promise;

    }

    /**
     * @memberof ClearBladeREST
     * @param {string} t User Token
     */
    function initWithToken(t){
        userToken = t
    }

    /**
     * Execute code service in a targetted system
     */
    function executeCode(serviceName, params){
        var headers = {
            "ClearBlade-UserToken": userToken
        }
        var options = {
            body:params,
            headers
        }
        var uri = url + "/api/v/1/code/" + systemKey + "/" + serviceName;
        log("#executeCode")
        options.uri = uri
        log({options})
        var deferred = Q.defer();
        http.post(options, function(err, data){
            if(err){
                deferred.reject(err);
            }
            deferred.resolve(data);
        });
        return deferred.promise;

    }
    
    // TODO Remove callback, remove snagToken
    /**
     * Creates an Edge within the targetted system
     * 
     * @memberof ClearBladeREST
     * @param {string} instance - which instance to make API request to e.g. staging, nxp, platform, ...
     * @param {string} name - Edge name
     * @param {string} description - Edge description
     * @param {string} userToken - User's token used to authorize the request 
     * @param {string} edgeToken - the new token used to authenticate this new edge
     * @param {callback} callback - called after request to create the edge
     */
    function createEdge(instance, name, description, edgeToken, callback){
        var headers = {
            "ClearBlade-UserToken": userToken
        }
        var options = {
            body:{
                description,
                token:edgeToken,
                "system_key":systemKey,
                "system_secret":systemSecret
            },
            headers
        }
        var uri = instance + "/api/v/3/edges/" + systemKey + "/" + name;
        options.uri = uri
        log({options})

        var deferred = Q.defer();
        http.post(options, snagTokenPromise.bind({deferred}));
        return deferred.promise;
    }

    /**
     * @memberof ClearBladeREST
     * 
     */
    function authAnon(){
        var headers = {
            "ClearBlade-SystemKey":systemKey,
            "ClearBlade-SystemSecret":systemSecret
        }
        var body = {}
        var uri = url + "/api/v/1/user/anon"
        var options = {
            uri,
            headers,
            body
        }
        
        var deferred = Q.defer();
        http.post(options, snagTokenPromise.bind({deferred}));
        return deferred.promise;
    }

    

    /**
     * Helper method for retrieving user token from auth requests
     */
    function snagToken(err, data){
        log("snagging token")
        log({err, data})
        try{
            if(err){ this.deferred.reject(new Error("Unable to auth: " + JSON.stringify(err)))}
            var parsed = JSON.parse(data)
            userToken = parsed.user_token
            this.callback(false, parsed);
            
        }
        catch(e){
            var msg = "Failed to auth: " + JSON.stringify(e)
            log(msg); this.callback(true, msg)
        }

    }

    function snagTokenPromise(err, data){
            log({ err, data });
            try {
                if(err) throw new Error("POST Failed"+ err);
                var parsed = JSON.parse(data)
                log("snagging token");
                userToken = parsed.user_token
                log({ userToken });
                this.deferred.resolve(parsed);
            }
            catch (e) {
                var msg = "POST Failed: " + JSON.stringify(err);
                log(msg); 
                this.deferred.reject(msg);
            }
        }

    return {
        executeCode,
        authAnon,
        register,
        initWithCreds,
        initWithToken,
        createEdge,
        retarget
    }
    
}

