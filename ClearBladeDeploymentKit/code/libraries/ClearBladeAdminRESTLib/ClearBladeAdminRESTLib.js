/**
 * @typedef ClearBladeAdminREST
 * Administrate a Developer Account on ClearBlade Platform
 * @param {string} url URL of a ClearBlade Platform, ex "https://platform.clearblade.com"
 */
function ClearBladeAdminREST(url) {
    var http = Requests()
    var token = ""

    /**
     * memberof ClearBladeAdminREST
     * Create a System on behalf of the developer
     * @param {string} systemName Name of new system
     * @returns {Promise} promise
     */
    function createSystem(systemName) {
        log({ systemName })
        var headers = {
            "ClearBlade-DevToken": token
        }
        var name = new String(+new Date())
        var description = ""
        var body = {
            name,
            description,
        }

        var uri = url + "/admin/systemmanagement"
        var options = {
            uri,
            headers,
            body
        }
        log(options)
        var deferred = Q.defer();
        http.post(options, function (err, data) {
            try {
                if (err) throw new Error("POST failed: " + err)
                var json = JSON.parse(data)
                deferred.resolve(json.appID)
            } catch (e) {
                deferred.reject(data)
            }
        })
        return deferred.promise
    }


    /**
     * memberof ClearBladeAdminREST
     * @param {string} email Developer email
     * @param {string} password Developer password
     * @param {string} key Registration key for platform
     * @returns {Promise} promise
     */
    function registerDeveloper(email, password, key) {
        var headers = {}

        var fname = "self";
        var lname = "self";
        var org = "self";

        var body = {
            email,
            password,
            fname,
            lname,
            org,
            key
        }
        var uri = url + "/admin/reg"
        var options = {
            uri,
            headers,
            body
        }
        log({ options })
        var deferred = Q.defer();
        http.post(options, function(err, data) {
            log("snagging token")
            log({ err, data })
            try {
                if (err) { log("err block hit: " + JSON.stringify(err)); throw new Error("Error while auth'ing: " + JSON.stringify(err)) }
                var parsed = JSON.parse(data)
                log(parsed)
                token = parsed.dev_token
                log({ token })
                deferred.resolve({});
            }
            catch (e) {
                var msg = "Failed to auth: " + JSON.stringify(e)
                log(msg)
                throw new Error(msg)
                log(msg); deferred.reject(msg)
            }
        })
        return deferred.promise;
    }

    /**
     * @typedef SystemDetails
     * @property {string} name Name of new system
     * @property {string} systemKey System Key for new system
     * @property {string} systemSecret System Secret for new system
     */

    /**
     * Install an IPM Package into a new system
     * 
     * @memberof ClearBladeAdminREST
     * @param {string} repoUser Github username, ex "clearblade, representing the user github.com/clearblade
     * @param {string} repoName Github repo name, ex "smart-monitoring" representing github.com/clearblade/smart-monitoring
     * @returns {SystemDetails} newSystemDetails
     */
    function installIPMIntoNewSystem(repoUser, repoName, developerEmail){
        log("#installIPMIntoNewSystem")
        var masterDeferred = Q.defer()
        prepareInstall(repoUser, repoName).then(function(listOfFilesToImport){
            log("Succeeded #prepareInstall")
            return executeInstall(repoUser,repoName, developerEmail,listOfFilesToImport)
        }).then(function(newSystemDetails){
            log("Suceeded #executeInstall")
            masterDeferred.resolve(newSystemDetails)
        }).catch(function(e){
            var msg ="Unable to complete IPM Install: " + JSON.stringify(e)
            log(msg)
            masterDeferred.reject(msg)
        })
        return masterDeferred.promise
        
    }

    /**
     * Prepare IPM Install, step 1 of 2
     * 
     * @param {string} repoUser Github username, ex "clearblade, representing the user github.com/clearblade
     * @param {string} repoName Github repo name, ex "smart-monitoring" representing github.com/clearblade/smart-monitoring
     * @return {string[]} listOfFilesToImport list of assets to import, ex ["REPO_NAME-master/code/services/serviceA/serviceA.js",...]
     */
    function prepareInstall(repoUser,repoName){
        log("#prepareInstall")
        var headers = {
            "ClearBlade-DevToken": token
        }

        var body = {}

        var uri = url+"/console-api/systemStructureFromGithub?branch=master&systemRepoName=" + repoName + "&username=" + repoUser;
        var options = {
            uri,
            headers,
            body
        }
        log({options})
        var deferred = Q.defer();
        http.get(options, function (err, data) {
            try {
                if (err) throw new Error("#prepareInstall Failed: " + err)
                var json = JSON.parse(data)
                var rawFiles = json.tree
                files = formatFiles(repoName, rawFiles)
                log({files})
                deferred.resolve(files)
            } catch (e) {
                log("Error Encountered while preparing ipm install: " + JSON.stringify(e))
                log({data})
                deferred.reject(data)
            }
        })
        return deferred.promise
    }

    /**
     * Execute IPM Package install, step 2 of 2
     * @param {string} repoUser Github username, ex "clearblade, representing the user github.com/clearblade
     * @param {string} repoName Github repo name, ex "smart-monitoring" representing github.com/clearblade/smart-monitoring
     * @param {string} developerEmail Developer email for analytics
     * @param {string[]} listOfFilesToImport list of assets to import, ex ["REPO_NAME-master/code/services/serviceA/serviceA.js",...]
     */
    function executeInstall(repoUser, repoName, developerEmail,listOfFilesToImport){
        log("#executeInstall")
        var headers = {
            "ClearBlade-DevToken": token
        }

        const repoDownloadURL = ["https://github.com", repoUser, repoName, "archive/master.zip"].join('/');

        var body = {
            repoURL:repoDownloadURL,
            developerEmail,
            listOfFilesToImport,
            systemName: repoName,
            importFullSystem: false,
            importIntoExistingSystem: false,
        }

        var uri = url+"/console-api/importAssetsIntoNewSystem"

        var options = {
            uri,
            headers,
            body
        }
        log(options)
        var deferred = Q.defer();
        http.post(options, function (err, data) {
            try {
                if (err) throw new Error("#executeInstall failed: " + err)
                var json = JSON.parse(data)
                deferred.resolve(json)
            } catch (e) {
                log(err)
                log(data)
                deferred.reject(data)
            }
        })
        return deferred.promise
    }

/**
     * Creates an Edge within the targetted system
     * 
     * @memberof ClearBladeREST
     * @param {string} instance - which instance to make API request to e.g. "https://staging.clearblade.com"
     * @param {string} name - Edge name
     * @param {string} description - Edge description
     * @param {string} edgeToken - the new token used for edge auth
     */
    function createEdge(instance, name, description, edgeToken){
        var headers = {
            "ClearBlade-DevToken": token
        }
        var options = {
            body:{
                description,
                token:edgeToken,
                system_key:systemKey,
                system_secret:systemSecret
            },
            headers
        }
        var uri = [instance,"api/v/3/edges", systemKey, "/",name].join('/');
        options.uri = uri
        log({options})

        var deferred = Q.defer();
        http.post(options, function(err, data){
            if(err){ log(err);deferred.reject(err)}
            else{
                log("Create Edge Response:"+JSON.stringify(data))
                deferred.resolve(data)
            }
        });
        return deferred.promise;
    }
    /**
     * Create Edge entry in system
     * 
     * @memberof ClearBladeAdminREST
     * @param {string} name Edge Name
     * @param {string} systemKey System Key
     * @param {string} systemSecret System Secret
     * @param {string} edgeToken Edge Token
     * @param {string} description Edge description
     * 
     */
    function createEdge(name,systemKey, systemSecret, edgeToken, description){

        var headers = {
            "ClearBlade-DevToken": token
        }
        var body = {
                description,
                token:edgeToken,
                system_key:systemKey,
                system_secret:systemSecret
        }
        var uri = [url,"admin/edges",systemKey,name].join('/')
        var options = {
            uri,
            headers,
            body
        }
        var deferred = Q.defer();
        log({options})
        http.post(options, function(err, data){
            if(err){ log(err);deferred.reject(err)}
            else{
                log({"edge response":data})
                deferred.resolve(data)
            }
        })
        return deferred.promise


    }


    /**
     * @memberof ClearBladeAdminREST
     * 
     * Initialize admin developer client with credentials
     * 
     * @param {string} email developer's email
     * @param {string} password developer's password
     * 
     * @returns {Promise} promise Promise for async call
     */
    function initWithCreds(email, password) {
        var headers = {}
        var body = {
            email,
            password
        }
        var uri = url + "/admin/auth"
        var options = {
            uri,
            headers,
            body
        }
        var deferred = Q.defer();
        http.post(options,  function(err, data) {
            log("snagging token")
            log({ err, data })
            try {
                if (err) { log("err block hit: " + JSON.stringify(err)); throw new Error("Error while auth'ing: " + JSON.stringify(err)) }
                var parsed = JSON.parse(data)
                log(parsed)
                token = parsed.dev_token
                log({ token })
                deferred.resolve({});
            }
            catch (e) {
                var msg = "Failed to auth: " + JSON.stringify(e)
                log(msg)
                throw new Error(msg)
                log(msg); deferred.reject(msg)
            }
        })
        return deferred.promise
    }

    /**
     * @memberof ClearBladeAdminREST
     * 
     * Initialize session with token
     * 
     * @param {string} t developer token
     */
    function initWithToken(t) {
        token = t
    }
    
    function formatFiles(repoName, rawFiles){
        var rootFolder = repoName + "-master"
        output = []
        rawFiles.forEach(function (entity) {
            if (entity.type == "blob") {
                const absPath = [rootFolder, entity.path].join('/');
                output.push(absPath);
            }
        });

        return output;

    }

    /** 
     * @memberof ClearBladeREST
     * 
     * @param {string} platformIPOverride Platform IP of target system
     * @param {string} systemKeyOverride target system key
     * @param {string} edgeName Edge name in target system
     * @param {string} edgeCookie Edge cookie in target system
     * @param {string} adaptersRootDir TODO Unused
     * @param {string} mqttPort TODO Unused
     * 
    */
    function retarget(platformIPOverride, systemKeyOverride, edgeName, edgeCookie, adaptersRootDir, mqttPort){
        // platformIPOverride must omit protocol
        platformIPOverride = platformIPOverride.replace(/(^\w+:|^)\/\//, '');
        var options = {
            body:
                {
                    platformIP:platformIPOverride,
                    systemKey:systemKeyOverride,
                    edgeName,
                    edgeCookie,
                    adaptersRootDir:"./"
                }
        }

        // MQTT Port needs to be omitted or else it fails. This is a bug mkay. 
        // JIRA https://clearblade.atlassian.net/browse/MONSOON-4240
        //delete options.body.mqttPort
        log({options})

        var uri = ["http://localhost:9000","admin/edgemode/runtime"].join('/')
        options.uri = uri
        log(options)
        var deferred = Q.defer();
        http.post(options, function(err, data){
            log({err,data})
            if(err){
                deferred.reject(err);
                log("proceeding to unknown")
            }
            else{
                deferred.resolve(data);
            }
        });
        return deferred.promise;
    }
    /**
     * Note: Asking platform to encode, rather than edge
     * Asking edge leads to uncertainty about cb_console's local port
     */
    function getEncodedPortalURL(systemKey, systemSecret, portalName){
        var headers = {}
        var body = {}
        var qs = ["?systemKey=",systemKey,"&systemSecret=",systemSecret,"&name=",portalName].join('')
        var uri = [url, "console-api/portal/createURL", qs].join('/')
        var options = {
            uri,
            headers,
            body
        }
        log(options)
        var deferred = Q.defer();
        // Note: GET
        http.get(options,  function(err, data) {
            if(err){
                deferred.reject(err)
            }
            else{
                deferred.resolve(data)
            }
        })
        return deferred.promise
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
    }

}


