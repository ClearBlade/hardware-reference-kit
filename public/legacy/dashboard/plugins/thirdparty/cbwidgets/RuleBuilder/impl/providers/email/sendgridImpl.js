
var rbSendGridEmailImpl = (function() {
	// Private variables
    var API_KEY_TOKEN = "SENDGRID_APIKEY";
    var TEMPLATE_FILENAME = "providers/email/sendgrid.txt";
    var template = "";

    var fieldsToRender = [
        {
            fieldName: "sendGridApiKey", 
            fieldLabel: "Key",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "sendGrid key is required."
                }
            }
        }
    ];

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
        //Replace the provider specific tags in the template
        return rbTokenReplacer.replaceTokens(_getTokens(ruleSettings), template);
    }

    function _getTokens(ruleSettings) {
        var tokens = {};
        tokens[API_KEY_TOKEN] = ruleSettings.alert.options.sendGridApiKey;  

        return tokens;         
    }

    function _getFieldsToRender() {
        return fieldsToRender;
    }
    
    _retrieveTemplate();

	return {
        getTemplate: _getTemplate,
        getFieldsToRender: _getFieldsToRender
    };
})();