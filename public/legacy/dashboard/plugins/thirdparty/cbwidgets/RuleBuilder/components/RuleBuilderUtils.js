var RuleBuilderUtils = {
    createEventName: function(event, widgetId){

        //Get the parent element whose class is rbwidget. Append its 
        //id attribute value to the custom event
        return widgetId + ":" + event;
    },

    displayMessage: function(config) {
        freeboard.showDialog(new RbDisplayMessageContainer(config), "Error", "OK", null, function() {});
    },

    openRuleDialog: function(config) {
        // onDoneClick() is the inner function, a closure so we can access the config object when the showDialog
        // is closed
        function onDoneClick() { 
            //Publish the save rule event so that the back-end logic can be invoked
            $('.modal .RbRuleContainer').trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.CLOSE_DIALOG, 
            config.widgetId)); 
        }

        freeboard.showDialog(new RbRuleContainer(config), 
            !!config.rule && !!config.rule.rulename ? config.rule.rulename : "New Rule", "Done", "Cancel", onDoneClick);

        //Hide the done button if the rule is not ready to be created
        if(!config.rule || !config.rule.event || config.rule.event.eventSource || config.rule.alerts.length === 0) {
            $("#dialog-ok").hide();
        }          
    },

    closeDialog: function() {
        $('body').trigger(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.CLOSE_DIALOG);
    },

    buildServiceFieldsForValidation: function(form) {
        //Since service fields are entered dynamically in the UI
        //We need to build the validation options dynamically
        
        // {
        //     fieldName: "emailFrom", 
        //     fieldLabel: "origin email address",
        //     fieldTag: "input", 
        //     fieldType: "text",
        //     events: [],
        //     validationOptions: {
        //         rules: {
        //             required: true,
        //             email: true
        //         },
        //         message: {
        //             required: "Sender's email is required.",
        //             email: "Please enter valid email address"
        //         }
        //     }
        // }
        var fields = [];
        
        var parms = self._getServiceParmDOMFields(form);
        for(var i=0; i<parms.length; i++) {
            var field = {};
            field.fieldName = parms[i].name;
            field.fieldLabel = parms[i].placeholder;

            field.validationOptions = {};
            field.validationOptions.rules = {};
            field.validationOptions.rules.required = true;

            field.validationOptions.message = {};
            field.validationOptions.message.required = field.fieldLabel + " is required"

            fields.push(field);
        }
        return fields;
    },

    getFormValidationOptions: function(fields) {
        //We start off with the rule name and alert options since they are common
        var validationOptions = {
            rules: {
                rulename: {
                    required: true
                },
                operator: {
                    required: true
                },
                alerttype: {
                    required: true
                },
                providers: {
                    required: true
                },
            },
            messages: {
                rulename: "Rule Name is required",
                operator: "Operator type is required.",
                alerttype: "Alert type is required",
                providers: "Provider is required"
            },
            errorPlacement: function(label, element) {
                label.addClass('validation-error');
                label.insertAfter(element);
            },
            wrapper: 'div'
        };

        for (var i=0; i< fields.length; i++) {
            if(fields[i].fieldName !== "operator") {
                validationOptions.rules[fields[i].fieldName] = fields[i].validationOptions.rules;
                validationOptions.messages[fields[i].fieldName] = fields[i].validationOptions.message;
            }
        }

        return validationOptions;
    },

    //Create an html field
    createFormFields: function (field, createFieldLabel, initialValue) {

        var fieldContainer = $('<div class="form-field-container"></div>');
        var jfield = {};

        if(!!createFieldLabel) {
            var label = $('<label class="form-field-label" for="' + field.fieldName + '">' + field.fieldLabel + '</label>');
            fieldContainer.append(label);
        }

        switch(field.fieldType) {
            case 'button':
                jfield =  $('<' + field.fieldTag + ' type="' + field.fieldType + 
                    '" name="' + field.fieldName + '" value="' + field.fieldLabel + '"/>');
                jfield.attr('class', field.fieldName + ' form-field ' + field.fieldTag);
                break;
            default:
                jfield = $('<' + field.fieldTag + ' type="' + field.fieldType + 
                    '" placeholder="' + field.fieldLabel + '" name="' + field.fieldName + '"/>');
                jfield.attr('class', field.fieldName + ' form-field ' + field.fieldTag)
                jfield.val(initialValue || "");
                break;
        };

        if(field.events && field.events.length > 0){
            for(var i=0; i<field.events.length; i++) {
                jfield.on(field.events[i].eventName, self[field.events[i].eventValue]);
            };
        }
        fieldContainer.append(jfield);
        return fieldContainer;
    },

    //Retrieve the displayable fields for the event source type
    getEventSpecificFields: function(event) {
        switch(event) {
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_DATA:
                return rbDataSourceImpl.getFieldsToRender();
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_DEVICE:
                return rbDeviceSourceImpl.getFieldsToRender();
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_MESSAGE:
                return rbMessageSourceImpl.getFieldsToRender();
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_USER:
                return rbUserSourceImpl.getFieldsToRender();
        }
    },

    //Retrieve the displayable fields for the alert type and provider
    getAlertFields: function(alertValue, provider) {
        var fields = [];

        //setTheProviderImpl so that the correct fields are rendered
        switch(alertValue) {
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_EMAIL:
                rbEmailAlertImpl.setProvider(provider);
                return fields.concat(rbEmailAlertImpl.getFieldsToRender());
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SMS:
                rbSmsAlertImpl.setProvider(provider);
                return fields.concat(rbSmsAlertImpl.getFieldsToRender());
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE:
                return fields.concat(rbServiceAlertImpl.getFieldsToRender());
            default:
                return fields;
        }
    },

    createTrigger: function(URI, system_key, triggerName, serviceName, serviceSettings) {
        var deferred = $.Deferred();

        ruleBuilderTrigger.getInstance(serviceSettings).createTrigger(URI, system_key, 
            triggerName, serviceName, serviceSettings).then(function() {

            deferred.resolve();
        }, function(err) {
            console.log("RuleBuilderUtils.createTrigger - Failed to create trigger: ", err.msg);
            deferred.reject(err.msg);
        });

        return deferred.promise();
    },

    deleteTrigger: function(URI, system_key, triggerName, serviceSettings) {
        var deferred = $.Deferred();

        ruleBuilderTrigger.getInstance(serviceSettings).deleteTrigger(URI, system_key, 
            triggerName, serviceSettings).then(function() {

            deferred.resolve();
        }, function(err) {
            if(!err.code === 500) {
                console.log("RuleBuilderUtils.deleteTrigger - Failed to delete trigger: ", err.msg);
                deferred.reject(err.msg);
            } else {
                deferred.resolve();
            }
        });
        return deferred.promise();
    }
}