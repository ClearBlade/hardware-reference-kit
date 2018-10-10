
var ruleBuilderTrigger = (function () {
    // Instance stores a reference to the Singleto
    var instance;
    
    function init() {
        // Singleton
        
        // Private methods and variables
        var triggerImpl;

        function _setTriggerImpl (ruleSettings) { 
            switch (ruleSettings.event.eventSource) {
                case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_DATA:
                    triggerImpl = rbDataTriggerImpl;
                    break;
                case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_DEVICE:
                    triggerImpl = rbDeviceTriggerImpl; 
                    break;
                case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_MESSAGE:
                    triggerImpl = rbMessageTriggerImpl;
                    break;
                case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_USER:
                    triggerImpl = rbUserTriggerImpl;
                    break;
            }
        }

        function _getRequestData (system_key, trigger_name, service_name, ruleSettings) { 
            var token_body = JSON.stringify({
                "system_key": system_key,
                "name": trigger_name,
                "def_module": triggerImpl.getSystemModule(),
                "def_name": triggerImpl.getTriggerAction(),
                "service_name": service_name,
                "key_value_pairs": triggerImpl.getTriggerActionData(ruleSettings)
            });
            return token_body;
        }

        function createTrigger(URI, system_key, trigger_name, service_name, ruleSettings) {
            var deferred = $.Deferred();
            var end_point = URI + "/api/v/3/code/" + system_key + "/trigger/" + trigger_name;
            
            $.ajax({
                method: 'POST',
                url: end_point,
                data: _getRequestData(system_key, trigger_name, service_name, ruleSettings),
                dataType: 'json',
                contentType: 'application/json',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader("ClearBlade-UserToken", cbsettings.authToken);
                },
                success: function(data) {
                    console.log("Got response Create Trigger : %o", data);
                    deferred.resolve(data);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log("Request failed Create Trigger: " + errorThrown);
                    deferred.reject(_createHttpError("create", jqXHR.status));
                }
            });
            return deferred.promise();
        }

        function modifyTrigger(URI, system_key, trigger_name, service_name, ruleSettings) {
            var deferred = $.Deferred();
            var end_point = URI + "/api/v/3/code/" + system_key + "/trigger/" + trigger_name;

            $.ajax({
                method: 'PUT',
                url: end_point,
                data: _getRequestData(system_key, trigger_name, service_name, ruleSettings),
                dataType: 'json',
                contentType: 'application/json',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader("ClearBlade-UserToken", cbsettings.authToken);
                },
                success: function(data) {
                    console.log("Got response Update Trigger: %o", data);
                    deferred.resolve(data);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log("Request failed Update Trigger: " + errorThrown);
                    deferred.reject(_createHttpError("modify", jqXHR.status));
                }
            });
            return deferred.promise();
        };

        function deleteTrigger(URI, system_key, trigger_name, ruleSettings) {
            var deferred = $.Deferred();
            var end_point = URI + "/api/v/3/code/" + system_key + "/trigger/" + trigger_name;

            $.ajax({
                method: 'DELETE',
                url: end_point,

                beforeSend: function(xhr) {
                    xhr.setRequestHeader("ClearBlade-UserToken", cbsettings.authToken);
                },
                success: function(data) {
                    console.log("Got response Delete Trigger: %o", data);
                    deferred.resolve(data);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log("Request failed Delete Trigger: " + errorThrown);
                    deferred.reject(_createHttpError("delete", jqXHR.status));
                }
            });
            return deferred.promise();
        };

        var publicApi = {
            setTriggerImpl: _setTriggerImpl,
            createTrigger: createTrigger,
            modifyTrigger: modifyTrigger,
            deleteTrigger: deleteTrigger
        };

        // Public methods and variables should be placed within the returned object
        return publicApi;
  };

    function _createHttpError(operation, status) {
        var error = {};
        switch(status) {
            case 400:
            case 401:
                error.msg = "You do not have the necessary permissions to " + operation + " triggers." + 
                    "You need to be granted permission in the ClearBlade developers console (Roles > System Level) to do this.";
                break;
            case 405:
                //Invalid method - this should never happen
                error.msg = "Oops, something went wrong. Please open a support ticket with ClearBlade.";
                break;
            case 500:
                switch (operation) {
                    case "create":
                        error.msg = "The trigger you are attempting to create already exists.";
                        break;
                    case "modify":
                        error.msg = "The trigger you are attempting to modify does not exist.";
                        break;
                    case "delete":
                        error.msg = "The trigger you are attempting to delete does not exist.";
                        break;
                }
                break;
        }
        error.code = status;
        return error;
    }

  return {
      // Get the Singleton instance if one exists
      // or create one if it doesn't
      getInstance: function (ruleSettings) {
          if ( !instance ) {
              instance = init();
            }

            instance.setTriggerImpl(ruleSettings);
            return instance;
        }
    }
})();