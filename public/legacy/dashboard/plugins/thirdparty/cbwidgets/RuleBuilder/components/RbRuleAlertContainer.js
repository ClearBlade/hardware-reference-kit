var RbRuleAlertContainer = (function($){
    //      alerts: [
    //          {
    //              type: "sms", {sms|email}
    //              provider: "twilio",
    //              options: {      --See email section below for valid email options
    //                  smsApiKey: "",
    //                  smsApiSecret: "",
    //                  smsFrom: "",
    //                  smsTo: "",
    //                  smsBody: ""
    //              }
    //          }
    //      ]

    var self = this;

    function rbRuleAlertContainer(config){
        this.rule = !!config.rule.rulename ? config.rule : {};
        this.widgetId = config.widgetId;
        this.allowEdit = config.allowEdit;

        if(!this.rule.alerts) {
            this.rule.alerts = [];
        }

        this.readOnly = config.readOnly || false;

        this.element = $('<div></div>')
            .attr('class', 'RbRuleAlertContainer');

        this.render();

        return this.element;
    }

    rbRuleAlertContainer.prototype = {
        render: function(){
            this.element.empty();
            this.element.append(this.constructThenContainer());
        },

        getAlertText: function() {
            var alertsText = [];

            for(var i=0; i<this.rule.alerts.length; i++){
                
                switch(this.rule.alerts[i].type) {
                    case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SMS:
                        alertsText.push(this.getSMSAlertText(this.rule.alerts[i]));
                        break;
                    case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_EMAIL:
                        alertsText.push(this.getEmailAlertText(this.rule.alerts[i]));
                        break;
                    case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE:
                        alertsText.push(this.getServiceAlertText(this.rule.alerts[i]));
                        break;
                }
            }
            return alertsText;
        },

        getSMSAlertText: function(alert) {
            var alertText = alert.provider[0].toUpperCase() + alert.provider.substring(1) + " ";
            alertText += alert.type.toUpperCase() + " FROM ";
            alertText += alert.options["smsFrom"];

            return alertText;
        },

        getEmailAlertText: function(alert) {
            var alertText = alert.provider[0].toUpperCase() + alert.provider.substring(1) + " ";
            alertText += alert.type[0].toUpperCase() + alert.type.substring(1) + " FROM ";
            alertText += alert.options["emailFrom"];

            return alertText;
        },

        getServiceAlertText: function(alert) {
            var alertText = "Invoke " + alert.type[0].toUpperCase() + alert.type.substring(1) + " ";
            alertText += alert.options["serviceName"];

            return alertText;
        },

        constructThenContainer: function() {
            var ifContainer = $('<div></div>')
                .attr('class', '.RbRuleThenContainer');

            var fieldSet = $('<fieldset><legend>Then</legend></fieldset>');

            if(this.readOnly) {
                fieldSet.append(this.constructReadOnlyAlerts());
            } else {
                if(this.rule.alerts.length === 0) {
                    fieldSet.append(this.getNewAlert(0));
                } else {
                    //Append the alerts to the fieldset
                    for(var i=0; i<this.rule.alerts.length; i++) {
                        fieldSet.append(this.getNewAlert(i));
                    }
                }

                //Append button container to the fieldset
                fieldSet.append(this.constructThenButtonContainer());
            }

            //Append the fieldset to the container
            ifContainer.append(fieldSet);
            return ifContainer;
        },

        constructReadOnlyAlerts: function() {
            var readOnlyContainer = $('<div></div>')
                .attr('class', '.RbRuleAlertReadOnly');
            var ruleAlertsText = this.getAlertText();

            //Add text blocks for each condition
            var list = $('<ul></ul>')
                .attr('class', '.RbRuleAlertList');
            for(var i=0; i<ruleAlertsText.length; i++){
                list.append($('<li>' + ruleAlertsText[i] + '</li>')
                    .attr('class', '.RbRuleAlertReadOnly'))
            }
            readOnlyContainer.append(list);

            if(this.allowEdit) {
                //Add edit button
                readOnlyContainer.append($("<button>Edit</button>")
                    .attr("class", "editLink clickable")
                    .on("click", $.proxy(this.onEditClick, this))
                );
            }

            return readOnlyContainer;
        },

        constructThenButtonContainer: function () {
            var container = $('<div></div>')
                    .attr('class', 'then-btn-container btn-container ')
                    //Append the add THEN button
                    .append($('<input type= "button" value="+ Add THEN">')
                        .attr('class', 'addConditionBtn btn')
                        .on("click", $.proxy(this.onAddThen, this))
                    )
                    //Append the Next button
                    .append($('<input type= "button" value="Next">')
                        .attr('class', 'nextBtn btn')
                        .on("click", $.proxy(this.onNextClick, this))
                    );

            return container;
        },

        onAddThen: function(event) {
            if (this.displayedFormsAreValid()){
                //Insert a new alert item before the button container
                this.getNewAlert().insertBefore(this.element.find('.then-btn-container'));
                $('body').trigger(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.RESIZE_DIALOG);
            } 
        },

        onNextClick: function(event) {
            if (this.displayedFormsAreValid()){
                //If all forms are valid, save the event data and display the alert container
                this.saveRuleAlerts();
            } 
        },

        getNewAlert: function(ndx) {
            var ndx = ndx || this.element.find('.RbRuleAlertForm').length;

            var container = $('<div class ="RbRuleAlertItemContainer"></div>');
            var deleteIcon = $('<div class ="icon-container"><i class ="icon-trash"></i></div>')
                .on("click", $.proxy(this.deleteAlert, this));

            var alert = new RbRuleAlertItem({
                alert: this.rule.alerts[ndx] || {},
                readOnly: this.readOnly
            });
            
            //Append the delete icon to the condition item
            container.append(alert);
            container.append(deleteIcon);
            return container;
        },

        deleteAlert: function(event) {
            $(event.currentTarget.parentElement).remove();
        },

        displayedFormsAreValid: function() {
            //Loop over each alert form and validate each form individually
            var alertForms = this.element.find('.RbRuleAlertForm');
            for (var i=0; i< alertForms.length; i++) {

                var form = $(alertForms[i]);

                //Reset validation data. The jquery validator doesn't
                //play nice when fields are added to a form dynamically
                form.removeData('validator');
                form.removeData('unobtrusiveValidation');

                //Retrieve the alert value
                var alertValue = form.find('.alert-select').val();
                var providerValue = form.find('.provider-select').val();
                var fields = RuleBuilderUtils.getAlertFields(alertValue, providerValue);

                if(alertValue === RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE) {
                    fields = fields.concat(this.buildServiceFieldsForValidation(alertForms[i]));
                }

                var validationOptions = RuleBuilderUtils.getFormValidationOptions(fields);
                
                form.validate(validationOptions);
                if (!form.valid()) {
                    return false;
                }
            }; 
            return true;
        },

        saveRuleAlerts: function() {
            //Retrieve all of the alert data
            var alerts = this.extractAlertsFromDOM();

            //Emit the saved data
            this.element.closest($('.RbRuleContainer')).trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.SAVE_ALERT, this.widgetId), [alerts]);
        },

        extractAlertsFromDOM: function() {
            var alerts = [];
            
            var alertForms = this.element.find('.RbRuleAlertForm');
            for (var i=0; i< alertForms.length; i++) {
                alerts.push(this.extractAlertFromDOM(alertForms[i]))
            }
            return alerts;
        },

        extractAlertFromDOM: function(form) {
            //Build a json object representing all of the event settings.
            //
            // alerts: [
            //     {
            //         type: "sms", {sms|email}
            //         provider: "twilio",
            //         options: {      --See email section below for valid email options
            //             smsApiKey: "",
            //             smsApiSecret: "",
            //             smsFrom: "",
            //             smsTo: "",
            //             smsBody: ""
            //         }
            //     }
            // ]
            var alert = {}, formElement = $(form);
            alert.options = {};

            alert.type = formElement.find('.alert-select').val();
            alert.provider = formElement.find('.provider-select').val() || "";

            //Extract the form fields and populate the alert object
            var alertFields = formElement.find(":text, textarea");
            for (var i=0; i< alertFields.length; i++) {
                alert.options[alertFields[i].name] = alertFields[i].value;
            };

            return alert;
        },

        onEditClick: function() {
            this.readOnly = false;
            this.render();

            this.element.closest(".RbRuleContainer").trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.EDIT_RULE, this.widgetId));
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
        
            var parms = this.getServiceParmDOMFields(form);
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

        getServiceParmDOMFields: function(form) {
            var fields = [];
        
            var containers = $(form).find('.svcparm-container', form);
            for(var i=0; i<containers.length; i++) {
                var parms = $(containers[i]).find('input', containers[i]);
                for(var j=0; j<parms.length; j++) {
                    fields.push(parms[j]);
                }
            }
            return fields;
        }
    };

    return rbRuleAlertContainer;
})(jQuery);