
var conditionBuilder = (function () {
    // Instance stores a reference to the Singleton
    var instance;

    function init() {
        // Singleton

        function createCondition (conditions) {

            var condition = "";

            for (var i=0; i< conditions.length; i++) {

                if(conditions[i].logical && conditions[i].logical !== "") {
                    switch (conditions[i].logical) {
                    case RULE_BUILDER_CONSTANTS.LOGICAL_OPERATORS.AND:
                        condition += " && ";
                        break;
                    case RULE_BUILDER_CONSTANTS.LOGICAL_OPERATORS.OR:
                        condition += " || ";
                        break;
                    default:
                        console.error("Logical operator not supported: " + conditions[i].operator);
                        break;
                    }

                }

                condition += "messageObject." + conditions[i].variable + " " + 
                    RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS[conditions[i].operator] + " " + 
                    JSON.stringify(conditions[i].value);
            }
            return condition;
        }

        var publicApi = {
            createCondition: createCondition
        };

        // Public methods and variables should be placed within the returned object
        return publicApi;
    };

    return {
        // Get the Singleton instance if one exists
        // or create one if it doesn't
        getInstance: function () {
            if ( !instance ) {
                instance = init();
            }
            return instance;
        }
    }
})();