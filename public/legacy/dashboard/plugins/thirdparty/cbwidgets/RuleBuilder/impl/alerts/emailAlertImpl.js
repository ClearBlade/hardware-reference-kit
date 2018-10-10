
var rbEmailAlertImpl = (function() {
	// Private variables
    var TEMPLATE_FILENAME = "message/emailService.txt";
    var SERVICE_DEPENDENCIES = "http";
    var template = "";
    var providerImpl = {};

    var fieldsToRender = [
        {
            fieldName: "emailFrom", 
            fieldLabel: "From E-mail",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true,
                    email: true
                },
                message: {
                    required: "Sender's email is required.",
                    email: "Please enter a valid email address"
                }
            }
        }, {
            fieldName: "emailTo", 
            fieldLabel: "To E-mail",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true,
                    email: true
                },
                message: {
                    required: "Recipient's email is required.",
                    email: "Please enter a valid email address"
                }
            }
        }, {
            fieldName: "emailSubject", 
            fieldLabel: "Subject",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: "The Email subject is required."
            }
        }, {
            fieldName: "emailBody", 
            fieldLabel: "Message",
            fieldTag: "textarea", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: "The Email body is required."
            }
        }
    ];

    var providers = [
        {
            providerName: "sendGrid", 
            providerLabel: "SendGrid",
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
            case "sendGrid":
                providerImpl = rbSendGridEmailImpl;
                break;
            default:
                providerImpl = {};
        }
    }

    function _getTokens(ruleSettings) {
        var tokens = {};
        
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.EMAIL_SUBJ] = rbTokenReplacer.parseToken(ruleSettings.alert.options.emailSubject);
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.EMAIL_BODY] = rbTokenReplacer.parseToken(ruleSettings.alert.options.emailBody);
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.EMAIL_TO] = _createRecipientArray(ruleSettings.alert.options.emailTo);
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.EMAIL_FROM] = ruleSettings.alert.options.emailFrom;   

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