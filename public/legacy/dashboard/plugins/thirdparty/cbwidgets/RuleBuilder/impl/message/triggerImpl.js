
var rbMessageTriggerImpl = (function () {
    // Private variables
    var eventSrcImpl;
        
    function _getSystemModule() {
        return RULE_BUILDER_CONSTANTS.TRIGGERS.MODULES.MESSAGE.MODULE_NAME;
    }

    /*  *
        * This method should return the action associated with the trigger.
        * Publish is the only action currently supported for messaging.
    */
    function _getTriggerAction() {
        return RULE_BUILDER_CONSTANTS.TRIGGERS.MODULES.MESSAGE.ACTIONS.PUBLISH;
    }

    /*  *
        * This method should return the key-value pairs needed for the api call
        *
    */
    function _getTriggerActionData(ruleSettings) {
        return { "topic": ruleSettings.event.options.topic };
    }

    // Singleton
    var publicApi = {
        getSystemModule: _getSystemModule,
        getTriggerAction: _getTriggerAction,
        getTriggerActionData: _getTriggerActionData
    };

    // Public methods and variables should be placed within the returned object
    return publicApi;
})();