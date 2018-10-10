freeboard.loadWidgetPlugin({

    "type_name": "clearblade_RuleBuilder",
    "display_name": "RuleBuilder",
    "description": "Rule Builder Widget, which will allow users to create simple conditional statements, which will trigger other services such as SMS, Email etc.",
    "external_scripts": [
        "https://ajax.aspnetcdn.com/ajax/jquery.validate/1.15.0/jquery.validate.min.js"
    ],
    "fill_size": false,
    "settings": [{
        name: "widgetName",
        display_name: "Name",
        type: "text",
        required: true
    }, {
        name: "allowCreate",
        display_name: "Allow Create",
        type: "boolean",
        required: false
    }, {
        name: "allowDelete",
        display_name: "Allow Delete",
        type: "boolean",
        required: false
    }, {
        name: "allowEdit",
        display_name: "Allow Edit",
        type: "boolean",
        required: false
        
    }, {
        name: "allowOnOff",
        display_name: "Allow On/Off",
        type: "boolean",
        required: false
    }, {
        "name": "blockHeight",
        "display_name": "Block Height",
        "type": "number",
        default_value: 3,
    }, {
        name: "container_width",
        display_name: "Container width",
        type: "integer",
        description: "Width of your widget's container as a percentage. Useful when juxtaposing widgets.",
        default_value: "100",
        required: true
    }],

    newInstance: function(settings, newInstanceCallback) {
        newInstanceCallback(new RuleBuilderWidgetPlugin(settings));
    }
});

var RuleBuilderWidgetPlugin = function(settings) {
    var self = this;
    var URI = platformConfig.url;
    var currentSettings = settings;

    var system_key;
    var containerElement;

    //replace spaces with dashes so we can retrieve by id or class later
    if (currentSettings.widgetName === undefined) {
        currentSettings.widgetId = "";
    } else {
        currentSettings.widgetId = currentSettings.widgetName.replace(/\s+/g, '_');
    }

    self._getParameterByName = function(name, url) {
        var paramValue = ""

        if (!url) {
            //Default the url if it was not specified
            url = window.location.href;  
        }  
        name = name.replace(/[\[\]]/g, "\\$&");

        //Create a regular expression to match the query param
        var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)");
        var results = regex.exec(url);
        
        if (!!results && !!results[2]){
            //Decrypt the system key
            if(name === "systemKey") {
                paramValue = (CryptoJS.AES.decrypt(decodeURIComponent(results[2]), "ClearBladeDashboards2016")).toString(CryptoJS.enc.Utf8);
            } else {
                paramValue = results[2];
            }
        }
        return paramValue;
    }
    system_key = self._getParameterByName('systemKey');

    self._saveDashboard = function() { 
        saveDashboard(function(data, status) {
            //Whenever the dashboard is saved, we need to re-render the rules list
            self.renderContent();
        });
    }

    /* 
     * Required public function. Called when freeboard wants to render the widget.
     */
    self.render = function(containerElement) {
        self.addCustomValidators();

        self.containerElement = containerElement;

        var displayElement = $('<div class="tw-display rbwidget"></div>')
            .attr('id', currentSettings.widgetId);
        
        if(!currentSettings.rules) {
            currentSettings.rules = [];
        }

        $(containerElement).append(displayElement);
        self.bindEvents();
        self.renderContent();
    }

    self.addCustomValidators = function() {
        //Add a custom e-mail validator to the jquery form validator so that we can support multiple
        //recipients
        $.validator.methods.email = function(value, element) {
            var regex = /([a-zA-Z0-9_\-\.]+@[a-zA-Z0-9_\-\.]+\.[a-zA-Z]{2,5}[;,]?)+/g;
            return this.optional(element) || regex.test(value);
        };

        //Add a custom validator for the phone number list
        $.validator.addMethod("phoneList", function(value, element) {
            return this.optional(element) || /^(?:(?:\s*(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})(?:\s*[;,]\s*)?)+$/.test(value);
        }, "Invalid phone number(s) specified");
    }

    self.renderContent = function() {
        //Create a new instance of RbRuleList and attach it to the container element
        var ruleList = new RbRuleList({
            widgetId: currentSettings.widgetId,
            widgetName: currentSettings.widgetName,
            allowCreate: currentSettings.allowCreate,
            allowDelete: currentSettings.allowDelete,
            allowEdit: currentSettings.allowEdit,
            allowOnOff: currentSettings.allowOnOff,
            rules: currentSettings.rules
        });
        
        var widget = $('#' + currentSettings.widgetId);

        //Set the height of the fieldset to the number of blocks minus the widget top and bottom padding
        var fieldSetHeight = utils.widget.blocksToPixels(currentSettings.blockHeight) - 
            parseInt(widget.css("padding-top")) - parseInt(widget.css("padding-bottom"));

        $(ruleList.children()[0]).height(fieldSetHeight + 'px');
        var availableHeight = fieldSetHeight - (utils.widget.blockSize * .75);

        ruleList.find('.rbRuleListScroll').height(availableHeight + 'px');
        widget.empty().append(ruleList);
    }

    self.bindEvents = function() {
        var rbWidget = $(this.containerElement).find(".rbwidget");
        rbWidget.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.CREATE_RULE, rbWidget.attr("id")), $.proxy(self._onCreateRule, self));
        rbWidget.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.MODIFY_RULE, rbWidget.attr("id")), $.proxy(self._onModifyRule, self));
        rbWidget.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.DELETE_RULE, rbWidget.attr("id")), $.proxy(self._onDeleteRule, self));
        rbWidget.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.ENABLE_RULE, rbWidget.attr("id")), $.proxy(self._onRuleEnabled, self));
        rbWidget.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.DISABLE_RULE, rbWidget.attr("id")), $.proxy(self._onRuleDisabled, self));
    }

    /*
     * Create the back-end service and trigger.
     * Save the rule settings so that they are rendered the next time the dashboard is displayed.
     */
    self._onCreateRule = function(event, data){
        $.when(self._saveRule(data.rule, data.ruleIndex)).then(function() {
            //Save the rule to the current settings
            data.rule.enabled = true;
            currentSettings.rules.push(data.rule);
            self._saveDashboard();
        });
    }

    /*
     * Modify the back-end service and trigger.
     * Save the rule settings so that they are rendered the next time the dashboard is displayed.
     */
    self._onModifyRule = function(event, data) {
        //Compare the existing rule against the modified rule to find alerts
        //that have been deleted. We need to process deletes first so that
        //the alerts array in the currentSettings rule is up to date prior to
        //processing modified rules
        var deletedRules = [];
        for(var j=currentSettings.rules[data.ruleIndex].alerts.length; j>0; j--) {
            if(self._findAlert(currentSettings.rules[data.ruleIndex].alerts[j-1], data.rule) === -1) {
                //Delete the alert
                deletedRules.push(self._deleteSingleAlert(currentSettings.rules[data.ruleIndex], j-1));
            }
        }

        $.when.apply(undefined, deletedRules).then(function(){
            //Invoke the back-end logic to update modified rules
            $.when(self._saveRule(data.rule, data.ruleIndex)).then(function() {
                //Update the rule contents in the current settings
                currentSettings.rules[data.ruleIndex] = data.rule;
                self._saveDashboard();
            });
        });
    }

    /*
     * Delete the back-end service and trigger.
     * Save the rule settings so that the rule is not rendered the next time the dashboard is displayed.
     */
    self._onDeleteRule = function(event, data){
        $.when(self._deleteRule(data.rule)).then(function() {
            currentSettings.rules.splice(data.ruleIndex, 1);
            self._saveDashboard();
        })
    }

    self._onRuleEnabled = function(event, data){
        $.when(self.enableRule(data.ruleIndex)).then(function (){
            console.log("Rule enabled");
            currentSettings.rules[data.ruleIndex].enabled = true;
            self._saveDashboard();
        }, function(err){
            console.log("Rule not enabled");
            currentSettings.rules[data.ruleIndex].enabled = false;
            self.displayError({
                message: "Unable to enable rule " + currentSettings.rules[data.ruleIndex].ruleName +
                    ". Please try again later.",
                messageDetail: ""
            });
            self._saveDashboard();
        });
    }

    self._onRuleDisabled = function(event, data){
        $.when(self.disableRule(data.ruleIndex)).then(function (){
            console.log("Rule disabled");
            currentSettings.rules[data.ruleIndex].enabled = false;
            self._saveDashboard();
        }, function(err){
            console.log("Rule not disabled");
            currentSettings.rules[data.ruleIndex].enabled = true;
            self.displayError({
                message: "Unable to disable rule " + currentSettings.rules[data.ruleIndex].ruleName +
                    ". Please try again later.",
                messageDetail: ""
            });
            self._saveDashboard();  
        });
    }

    self._objectsAreEqual = function(obj1, obj2) {
        if (JSON.stringify(obj1) === JSON.stringify(obj2)) {
            return true;
        } else {
            return false;
        }
    }

    self._saveRule = function(rule, ruleIndex) {
        var promises = [];

        //Add a loop here to support chaining of alerts
        for (var i=0; i<rule.alerts.length; i++) {
            if(currentSettings.rules.length === 0 || ruleIndex > currentSettings.rules.length - 1 ||
                rule.alerts[i].isCreated === false) {

                //Create any new rules
                promises.push(self._createAlert(rule, i));
            } else {
                var existingRuleNdx = self._findAlert(rule.alerts[i], currentSettings.rules[ruleIndex]);
                if(existingRuleNdx !== -1) {
                    //The alert exists in the modified rule. Make sure it was actually modified
                    if(!self._objectsAreEqual(rule.alerts[i], currentSettings.rules[ruleIndex].alerts[existingRuleNdx]) ||
                        !self._objectsAreEqual(rule.event, currentSettings.rules[ruleIndex].event)) {
                        promises.push(self._modifyAlert(rule, i));
                    }
                }
            }
        }

        return $.when.apply(undefined, promises).promise();
    }

    self._findAlert = function(alert, sourceRule) {
        for(var i=0; i<sourceRule.alerts.length; i++) {
            if(sourceRule.alerts[i].serviceName === alert.serviceName) {
                return i;
            }
        }
        return -1;
    }

    self._setService = function(rule, alertNdx) {
        //We need to ensure everything on the back-end is setup correctly one last time
        //The singletons get botched up when there is more than one of these widgets
        //being displayed and worked with.
        ruleBuilderService.setEventSource(rule.event.eventSource);
        ruleBuilderService.getEventSource().setAlert(rule.alerts[alertNdx].type);

        if(ruleBuilderService.getEventSource().getAlert().setProvider) {
            ruleBuilderService.getEventSource().getAlert().setProvider(rule.alerts[alertNdx].provider);
        }
    }

    self._createServiceName = function(rule, alertNdx) {
        //Since we support chaining alerts, we need to ensure the service name is unique
        //Append the alert type and index to the service name
        var svcName = "RB_Service_" + currentSettings.widgetId + "_" + 
            rule.rulename.replace(/\s+/g, '') + "_" + rule.alert.type + "_" + alertNdx;
        return svcName
    }

    self._createTriggerName = function(rule, alertNdx) {
        //Since we support chaining alerts, we need to ensure the service name is unique
        //Append the alert type and index to the service name
        var trigger = "RB_Trigger_" + currentSettings.widgetId + "_" + 
            rule.rulename + "_" + rule.alert.type + "_" + alertNdx;
        return trigger
    }

    self._createSettingsForService = function(rule, alertNdx) {
        //Make a clone of the rule so we can modify its structure
        //without affecting the original rule
        var ruleSettings = JSON.parse(JSON.stringify(rule));
        ruleSettings.alert = ruleSettings.alerts[alertNdx];
        delete ruleSettings.alerts;
        return ruleSettings;
    }

    self._createAlert = function(rule, alertNdx) {
        var deferred = $.Deferred();

        self._setService(rule, alertNdx);
        var serviceSettings = self._createSettingsForService(rule, alertNdx);
        var svcName = self._createServiceName(serviceSettings, alertNdx);

        ruleBuilderService.createService(URI, system_key, svcName, 
            serviceSettings).then(function() {
            
            rule.alerts[alertNdx].isCreated = true;
            rule.alerts[alertNdx].serviceName = svcName;
            
            var triggerName = self._createTriggerName(serviceSettings, alertNdx);
            RuleBuilderUtils.createTrigger(URI, system_key, triggerName, svcName, 
                serviceSettings).then(function() {

                rule.alerts[alertNdx].triggerName = triggerName;
                deferred.resolve();
            }, function(err) {
                console.log("Failed to create Trigger: ", err.msg);
                
                //If the trigger could not be created, delete the service
                //that was already created
                self._deleteSingleAlert(rule, alertNdx).then(function() {
                    deferred.reject();
                    self.displayError({
                        message: "Unable to create trigger " + triggerName,
                        messageDetail: err.msg
                    });
                }, function(err2) { 
                    //Not much we can do here
                    self.displayError({
                        message: "Unable to create trigger " + triggerName + ".\n" + 
                        "An error occured while attempting to delete the created service.",
                        messageDetail: err.msg + "\n" + err2.msg
                    });
                });

            });
        }, function(err) {
            console.log("Failed to create Service: ", err.msg);
            deferred.reject(err.msg);
            self.displayError({
                message: "Unable to create service " + svcName,
                messageDetail: err.msg
            });
            rule.alerts[alertNdx].isCreated = false;
        });

        return deferred.promise();
    }

    self._modifyAlert = function(rule, alertNdx) {
        var deferred = $.Deferred();

        self._setService(rule, alertNdx);
        var serviceSettings = self._createSettingsForService(rule, alertNdx);
                
        //Since we support chaining alerts, we need to ensure the service name is unique
        //Append the alert type and index to the service name
        ruleBuilderService.modifyService(URI, system_key, rule.alerts[alertNdx].serviceName, 
            serviceSettings).then(function() {

            //Rather than attempt to figure out what to do, we will blindly delete the trigger 
            //and recreate it. Modifying triggers does not work if the event source or event action
            //have been changed.
            RuleBuilderUtils.deleteTrigger(URI, system_key, rule.alerts[alertNdx].triggerName, 
                serviceSettings).then(function() {

                RuleBuilderUtils.createTrigger(URI, system_key, rule.alerts[alertNdx].triggerName, 
                    rule.alerts[alertNdx].serviceName, serviceSettings).then(function() {

                    deferred.resolve();
                }, function(err) {
                    console.log("Failed to create trigger when updating service: ", err.msg);
                    deferred.reject(err.msg);
                    self.displayError({
                        message: "Unable to create trigger " + rule.alerts[alertNdx].triggerName,
                        messageDetail: err.msg
                    });
                })
            }, function(err) {
                console.log("Failed to delete trigger when updating service: ", err.msg);
                deferred.reject(err.msg);
                self.displayError({
                    message: "Unable to delete trigger " + rule.alerts[alertNdx].triggerName,
                    messageDetail: err.msg
                });
            });
        }, function(err) {
            console.log("Failed to update Service: ", err.msg);
            deferred.reject(err.msg);
            self.displayError({
                message: "Unable to update service " + rule.alerts[alertNdx].serviceName,
                messageDetail: err.msg
            });
        });

        return deferred.promise();
    }

    self._deleteRule = function(rule, alertNdx) {
        //We need to find out if we are deleting a specific alert or all alerts in a rule
        //If alertNdx is present, we know we are deleting a specific alert
        if(!!alertNdx) {
            return self._deleteSingleAlert(rule, alertNdx);
        } else {
            return self._deleteAllAlerts(rule);
        }
    }

    self._deleteSingleAlert = function(rule, alertNdx) {
        var deferred = $.Deferred();

        if(rule.alerts && rule.alerts[alertNdx]) {
            
            //Delete a specific alert
            if(rule.alerts[alertNdx].isCreated === true) {
                var serviceSettings = self._createSettingsForService(rule, alertNdx);
                ruleBuilderService.deleteService(URI, system_key, rule.alerts[alertNdx].serviceName).then(function() {
                    RuleBuilderUtils.deleteTrigger(URI, system_key, rule.alerts[alertNdx].triggerName, 
                        serviceSettings).then(function() {

                        //Delete the alert from the rule
                        rule.alerts.splice(alertNdx, 1);
                        deferred.resolve();
                    }, function(err) {
                        console.log("Failed to delete Trigger: ", err.msg);
                        self.displayError({
                            message: "Unable to delete trigger " + rule.alerts[alertNdx].triggerName,
                            messageDetail: err.msg
                        });
                        deferred.reject(err.msg);
                    });
                }, function(err) {
                    if(!err.code === 500) {
                        console.log("Failed to delete Service: ", err.msg);
                        self.displayError({
                            message: "Unable to delete service " + rule.alerts[alertNdx].serviceName,
                            messageDetail: err.msg
                        });
                        deferred.reject(err.msg);
                    } else {
                        //Delete the alert from the current settings
                        rule.alerts.splice(alertNdx, 1);
                        deferred.resolve();
                    }
                });

                return deferred.promise();
            } else {
                //Delete the alert from the current settings
                rule.alerts.splice(alertNdx, 1);
                return;
            }
        } else {
            return;
        }
    }

    self._deleteAllAlerts = function(rule) {
        var promises = [];

        if(rule.alerts && rule.alerts.length > 0) {
                
            //Delete all alerts within the rule
            for(var i=rule.alerts.length; i>0; i--) {
                promises.push(self._deleteSingleAlert(rule, i-1));
            }
        }

        return $.when.apply(undefined, promises).promise();
    }

    self.displayError = function(msg) {
        RuleBuilderUtils.displayMessage(msg)
    }

    self.enableRule = function(ruleIndex) {
        var promises = [], rule = currentSettings.rules[ruleIndex];

        //Create all triggers for the rule
        for(var i=0; i<rule.alerts.length; i++) {
            promises.push(
                RuleBuilderUtils.createTrigger(URI, system_key, rule.alerts[i].triggerName, rule.alerts[i].serviceName, 
                self._createSettingsForService(rule, i))
            );
        }

        return $.when.apply(undefined, promises).promise();
    }

    self.disableRule = function(ruleIndex) {
        var promises = [], rule = currentSettings.rules[ruleIndex];

        //Delete all triggers for a rule
        for(var i=0; i<rule.alerts.length; i++) {
            promises.push(
                RuleBuilderUtils.deleteTrigger(URI, system_key, rule.alerts[i].triggerName, 
                self._createSettingsForService(rule, i))
            );
        }

        return $.when.apply(undefined, promises).promise();
    }

    /* 
     * Required public function. Called when freeboard wants to know how big we expect to be when 
     * we render, and returns a height. Called any time a user updates their settings (including 
     * the first time they create the widget).
     */
    self.getHeight = function() {
        if(!currentSettings.rules || currentSettings.rules.length === 0) {
            //If there are no rules, the minimum block size to display the UI is 3
            currentSettings.blockHeight = 2;
        } else {
            //If there are rules, the minimum block size is 2
            currentSettings.blockHeight = currentSettings.blockHeight >= 2 ? 
                currentSettings.blockHeight : 2;
        }
        
        return utils.widget.calculateHeight(currentSettings.blockHeight);
    }

    /* 
     * Required public function. Called when a user makes a change to the settings
     */
    self.onSettingsChanged = function(newSettings) {
        //Persist the current rules in the settings object
        newSettings.rules = currentSettings.rules;
        newSettings.widgetId = currentSettings.widgetId;
        currentSettings = newSettings;

        freeboard.resize();

        self._saveDashboard();
    }

    /* 
     * Required public function. Called when a calculated value changes
     */
    self.onCalculatedValueChanged = function(settingName, newValue) {
    }

    /* 
     * Required public function. Called when this instance is no longer needed.
     * Do anything you need to cleanup after yourself here.
     */
    self.onDispose = function() {
    }
}