
var rbDeviceSourceImpl = (function () {
    var alertImpl;

    var fieldsToRender = [
        {
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