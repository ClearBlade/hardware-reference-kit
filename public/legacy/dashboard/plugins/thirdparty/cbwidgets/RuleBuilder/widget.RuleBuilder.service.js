
var ruleBuilderService = (function () {
    // Instance stores a reference to the Singleton
    var instance;
    var eventSrcImpl;
    var alertSrcImpl;
        
    // Private methods and variables
    function _getEventSourceImpl (ruleSettings) { 
        return eventSrcImpl;
    }

    function _setEventSourceImpl (eventSource) { 
        switch (eventSource) {
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_DATA:
                eventSrcImpl = rbDataSourceImpl;
                break;
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_DEVICE:
                eventSrcImpl = rbDeviceSourceImpl; 
                break;
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_MESSAGE:
                eventSrcImpl = rbMessageSourceImpl;
                break;
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_USER:
                eventSrcImpl = rbUserSourceImpl;
                break;
            default:
                eventSrcImpl = {};
        }
    }

    function _createService(URI, system_key, service_name, ruleSettings) {
        var deferred = $.Deferred();
        var end_point = URI + "/api/v/3/code/" + system_key + "/service/" + service_name;
            
        //Replace all the tokens in the template
        $.when(eventSrcImpl.getServiceTemplate(service_name, ruleSettings)).then(function(template) {
            var service_body = JSON.stringify({
                "code": template,
                "parameters": [],
                "systemID": system_key,
                "name": service_name,
                "dependencies": eventSrcImpl.getServiceDependencies(),
                "run_user": ""
            });
            
            $.ajax({
                method: 'POST',
                url: end_point,
                data: service_body,
                dataType: 'json',
                contentType: 'application/json',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader("ClearBlade-UserToken", cbsettings.authToken);
                },
                success: function(data) {
                    console.log("Got response Create Service: %o", data);
                    deferred.resolve(data);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log("Request failed Create Service: " + errorThrown);
                    deferred.reject(_createHttpError("create", jqXHR.status));
                }
            });
        });
            
        return deferred.promise();
    };

    function _deleteService(URI, system_key, service_name) {
        var deferred = $.Deferred();
        var end_point = URI + "/api/v/3/code/" + system_key + "/service/" + service_name;
            
        $.ajax({
            method: 'DELETE',
            url: end_point,
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader("ClearBlade-UserToken", cbsettings.authToken);
            },
            success: function(data) {
                console.log("Got response Delete Service: %o", data);
                deferred.resolve(data);
            },
            error: function(jqXHR, textStatus, errorThrown) {
                console.log("Request failed Delete Service : " + errorThrown);
                deferred.reject(_createHttpError("delete", jqXHR.status));
            }
        });
        return deferred.promise();
    };
        
    function _modifyService(URI, system_key, service_name, ruleSettings) {
        var deferred = $.Deferred();
        var end_point = URI + "/api/v/3/code/" + system_key + "/service/" + service_name;
            
        //Replace all the tokens in the template
        $.when(eventSrcImpl.getServiceTemplate(service_name, ruleSettings)).then(function(template) {
            var service_body = JSON.stringify({
                "code": template,
                "parameters": [],
                "systemID": system_key,
                "name": service_name,
                "dependencies": eventSrcImpl.getServiceDependencies(),
                "run_user": ""
            });
            
            $.ajax({
                method: 'PUT',
                url: end_point,
                data: service_body,
                dataType: 'json',
                contentType: 'application/json',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader("ClearBlade-UserToken", cbsettings.authToken);
                },
                success: function(data) {
                    console.log("Got response Update Service: %o", data);
                    deferred.resolve(data);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log("Request failed Update Service: " + errorThrown);
                    deferred.reject(_createHttpError("modify", jqXHR.status));
                }
            });
        });

        return deferred.promise();
    };

    function _createHttpError(operation, status) {
        var error = {};
        switch(status) {
            case 400:
            case 401:
                error.msg = "You do not have the necessary permissions to " + operation + " services." + 
                    "You need to be granted permission in the ClearBlade developers console (Roles > System Level) to do this.";
                break;
            case 404:
                switch (operation) {
                    case "delete":
                        error.msg = "The service you are attempting to delete does not exist.";
                        break;
                    case "modify":
                        error.msg = "The service you are attempting to modify does not exist.";
                        break;
                }
                break;
            case 405:
                //Invalid method - this should never happen
                error.msg = "Oops, something went wrong. Please open a support ticket with ClearBlade.";
                break;
            case 500:
                switch (operation) {
                    case "create":
                        error.msg = "The service you are attempting to create already exists.";
                        break;
                    case "delete":
                        error.msg = "The service you are attempting to delete does not exist.";
                        break;
                }
                break;
        }
        error.code = status;
        return error;
    }

    return {
        createService: _createService,
        modifyService: _modifyService,
        deleteService: _deleteService,
        setEventSource: _setEventSourceImpl,
        getEventSource: _getEventSourceImpl
    };
})();