
var rbServiceAlertImpl = (function() {
	// Private variables
    var TEMPLATE_FILENAME = "message/serviceService.txt";
    var SERVICE_DEPENDENCIES = "clearblade, log";
    var template = "";
    var providerImpl = {};

    var fieldsToRender = [
        {
            fieldName: "serviceName", 
            fieldLabel: "Service Name",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Service name is required."
                }
            }
        }, {
            fieldName: "addServiceParm", 
            fieldLabel: "Add Parameter",
            fieldTag: "input", 
            fieldType: "button",
            events: [
            ],
            validationOptions: {
                rules: {},
                message: {}
            }
        }
    ];

    var providers = [];

    function _retrieveTemplate() {
        var def = $.Deferred();
        if(template !== "") {
            def.resolve(template);
        } else {
            $.get("templates/" + TEMPLATE_FILENAME)
            .done(function(data) {
                template = data;
                def.resolve(data);
            }).fail(function(error) {
                def.reject(error);
            });
        }

        return def.promise();
    }

    function _getTemplate(ruleSettings) {
        //Replace the tags in the template
        var tokens = _getTokens(ruleSettings);

        return rbTokenReplacer.replaceTokens(tokens, template);
    }

    function _getProviders() { 
        return providers;
    }

    function _setProviderImpl(provider) { 
        providerImpl = {};
    }

    function _getTokens(ruleSettings) {
        var tokens = {};
        var params = {};

        //Service parameters are comprised of 2 options in the settings object
        //We need to group the param name and param value options together.
        //Since we aren't guaranteed to order of the options in the object, we need to
        //make sure the param name is correctly matched to its value

        //Get all the keys that begin with parmName
        var paramNames = Object.keys(ruleSettings.alert.options).filter(function( key ){
            return key.indexOf("parmName") > -1;
        })
        
        //For each paramName, get its associated value 
        for(var i=0; i< paramNames.length; i+=1){
            params[ruleSettings.alert.options[paramNames[i]]] = 
                ruleSettings.alert.options["parmValue_" + paramNames[i].split("_")[1]];
        }

        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.SVC_SERVICE] = ruleSettings.alert.options.serviceName;
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.SVC_PARAMS] = JSON.stringify(params);

        return tokens;         
    }

    function _getFieldsToRender() {
        if(providerImpl.getFieldsToRender) {
            return providerImpl.getFieldsToRender().concat(fieldsToRender);
        } else {
            return fieldsToRender;
        }
    }

    function _getServiceDependencies () {
        return SERVICE_DEPENDENCIES;
    }

    _retrieveTemplate();

	return {
        getTemplate: _getTemplate,
        getTokens: _getTokens,
        getFieldsToRender: _getFieldsToRender,
        setProvider: _setProviderImpl,
        getProviders: _getProviders,
        getServiceDependencies: _getServiceDependencies
    };
})();