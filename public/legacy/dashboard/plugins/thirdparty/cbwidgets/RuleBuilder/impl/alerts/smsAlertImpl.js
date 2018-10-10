
var rbSmsAlertImpl = (function () {
    // Private variables
    var TEMPLATE_FILENAME = "message/smsService.txt";
    var SERVICE_DEPENDENCIES = "http";
    var template = "";
    var providerImpl = {};

    var fieldsToRender = [
        {
            fieldName: "smsFrom", 
            fieldLabel: "From Phone #",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true,
                    phoneList: true
                },
                message: {
                    required: "The SMS (From) phone number is required.",
                    phoneList: "Please enter a valid SMS (From) mobile phone number"
                }
            }
        }, {
            fieldName: "smsTo", 
            fieldLabel: "To Phone #",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true,
                    phoneList: true
                },
                message: {
                    required: "Mobile number is required.",
                    phoneList: "Please enter a valid list of mobile phone numbers"
                }
            }
        }, {
            fieldName: "smsBody", 
            fieldLabel: "Message",
            fieldTag: "textarea", 
            fieldType: "text",
            events: [],
            validationOptions: {
                 rules: {
                    required: true
                },
                message: {
                    required: "Message is required."
                }
            }
        }
    ];

    var providers = [
        {
            providerName: "twilio", 
            providerLabel: "Twilio",
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
        //Get the provider specific template
        //Replace the common email tags in the template
        var tokens = _getTokens(ruleSettings);
        
        if(providerImpl.getTemplate) {
            tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.PROVIDER] = 
            rbTokenReplacer.replaceTokens(tokens, providerImpl.getTemplate(ruleSettings));
        }
        return rbTokenReplacer.replaceTokens(tokens, template);
    }

    function _getProviders() { 
        return providers;
    }

    function _setProviderImpl(provider) { 
        switch (provider) {
            case "twilio":
                providerImpl = rbTwilioSmsImpl;
                break;
            default:
                providerImpl = {};
        }
    }

    function _getTokens(ruleSettings) {
        var tokens = {};
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.SMS_MSG] = rbTokenReplacer.parseToken(ruleSettings.alert.options.smsBody);
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.SMS_TO] = _createRecipientArray(ruleSettings.alert.options.smsTo);
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.SMS_FROM] = ruleSettings.alert.options.smsFrom;

        return tokens;         
    }

    function _getFieldsToRender() {
        if(providerImpl.getFieldsToRender) {
            return providerImpl.getFieldsToRender().concat(fieldsToRender);
        } else {
            return fieldsToRender;
        }
    }
    
    function _createRecipientArray (recipients) {
        var theArray = recipients.split(/[;,]+/);
        
        //Trim leading and trailing spaces from each array element
        for (var i = 0; i < theArray.length; i++) {
            theArray[i] = theArray[i].trim();
        }

        return JSON.stringify(theArray);
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