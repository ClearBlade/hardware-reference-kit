
var rbTwilioSmsImpl = (function() {
	// Private variables
    var API_KEY_TOKEN = "TWILIO_APIKEY";
    var API_SECRET_TOKEN = "TWILIO_APISECRET";
    var TEMPLATE_FILENAME = "providers/sms/twilio.txt";
    var template = "";

    var fieldsToRender = [
        {
            fieldName: "twilioApiKey", 
            fieldLabel: "Key",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Twilio API key is required."
                }
            }
        }, {
            fieldName: "twilioApiSecret", 
            fieldLabel: "Secret",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Twilio API secret is required."
                }
            }
        }, 
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
        tokens[API_KEY_TOKEN] = ruleSettings.alert.options.twilioApiKey;
        tokens[API_SECRET_TOKEN] = ruleSettings.alert.options.twilioApiSecret; 

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