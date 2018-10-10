
var rbMessageSourceImpl = (function () {
    var alertImpl;

    var fieldsToRender = [
        {
            fieldName: "topic", 
            fieldLabel: "Topic",
            fieldTag: "input", 
            fieldType: "text",
            isConditionField: false,
            events: [
                {eventName: "onfocus", eventValue: "this.placeholder=\'\'"},
                {eventName: "onblur", eventValue: "this.placeholder=\'Topic (Required)\'"}
            ],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Topic name is required."
                }
            }
        }, {
            fieldName: "variable", 
            fieldLabel: "Variable",
            fieldTag: "input", 
            fieldType: "text",
            isConditionField: true,
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Variable name is required."
                }
            }

        }, {
            fieldName: "operator"
        }, {
            fieldName: "value", 
            fieldLabel: "value",
            fieldTag: "input", 
            fieldType: "text",
            isConditionField: true,
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Variable value is required."
                }
            }
        }
    ];

    function _getTemplate(serviceName, ruleSettings) {

        //Get the template specific to the alert type
        //Replace the common message tags in the template
        return rbTokenReplacer.replaceTokens(_getTokens(serviceName, ruleSettings), alertImpl.getTemplate(ruleSettings));
    }

    function _getTokens(serviceName, ruleSettings) {
        var tokens = {};
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.SVC_NAME] = serviceName;

        //Construct the textual description of the conditions
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.CONDITION_TEXT] = "";
        for(var i=0; i<ruleSettings.event.conditions.length; i++) {
            if(ruleSettings.event.conditions[i].logical) {
                tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.CONDITION_TEXT] += 
                    " " + ruleSettings.event.conditions[i].logical + " ";
            }
            tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.CONDITION_TEXT] += ruleSettings.event.conditions[i].variable + " " +
                ruleSettings.event.conditions[i].operator + " " + ruleSettings.event.conditions[i].value;
        }

        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.CONDITION] = 
			conditionBuilder.getInstance().createCondition(ruleSettings.event.conditions);
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.MSG_TOPIC] = ruleSettings.event.options.topic;  

        return tokens;  
    }

    function _setAlertImpl(alertType) { 
        switch (alertType) {
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_EMAIL:
                alertImpl = rbEmailAlertImpl;
                break;
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SMS:
                alertImpl = rbSmsAlertImpl;
                break;
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE:
                alertImpl = rbServiceAlertImpl;
                break;
            default:
                alertImpl = {};
        }
    }

    function _getAlertImpl() { 
        return alertImpl;
    }

    function _getFieldsToRender() {
        return fieldsToRender;
    }

    function _getServiceDependencies() {
        return alertImpl.getServiceDependencies();
    }

    return {
        getAlert: _getAlertImpl,
        setAlert: _setAlertImpl,
        getServiceTemplate: _getTemplate,
        getServiceTokens: _getTokens,
        getFieldsToRender: _getFieldsToRender,
        getServiceDependencies: _getServiceDependencies
    };
})();