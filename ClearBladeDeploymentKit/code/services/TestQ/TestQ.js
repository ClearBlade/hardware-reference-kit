/**
 * This is a sample service to show how to use Q.defer() in the Q Promise library
 * http://documentup.com/kriskowal/q#the-beginning 
 * 
 */
function TestQ(req, resp){
  
    requestPopulationData()
        .then(function (value) {
                extractYearlyData(value);
            }, function (reason) {
                resp.error("promise failed because: "+reason);
            }
        );
    
    function requestPopulationData() {
        var request = Requests();
        var options = {
            "uri":"https://api.datausa.io/api/?show=geo&sumlevel=nation&required=pop",
        }
        var deferred = Q.defer();
     
        request.get(options, function(err,resp){
            if(err){
                //the error is a JSON value of the error in question, shaped like {"error":"message"}
                deferred.reject(new Error("Status code was " + JSON.stringify(err)));
            }else{
                //resp is JSON of the response
                log('call resolve');
                deferred.resolve(resp);
            }
        } );
        log('return promise');
        return deferred.promise;
    }
    
    function extractYearlyData(raw){
        try{
            var json = JSON.parse(raw);
            resp.success(json.data)
        }
        catch(e){
            resp.error("Failed to parse population data: " + JSON.stringify(e))
        }
    }
}
