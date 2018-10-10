var RbRuleContainer = (function($){

    var self = this;

    function rbRuleContainer(config){
        this.config = config;
        this.rule = this.config.rule || {};

        this.element = $('<div></div>')
            .attr('class', 'RbRuleContainer');

        this.render();
        return this.element;
    }

    rbRuleContainer.prototype = {

        render: function(){

            //This function is invoked when the dialog is displayed.
            //The dialog is only displayed when either the "Add Rule"
            //link is clicked in the ruleList widget or an existing rule is
            //clicked in the ruleList widget. We therefore need to inspect the
            //contents of the rule to determine how to display the
            //containers.
            if(!this.rule.rulename || this.rule.rulename == "") {
                //If the rule name is not present, render the
                //event container in "edit" mode
                this.renderEventContainer(false);
            } else {
                //Render both containers in readOnly mode
                this.renderEventContainer(true);
                this.renderAlertContainer(true);

                //We need to wait to ensure the dialog has been rendered
                setTimeout($.proxy(this.showOrHideButtons, this), 500);
            }

            this.bindEvents();
        },

        bindEvents: function(){
            //Bind custom events
            this.element.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.SAVE_EVENT, this.config.widgetId), $.proxy(this.onEventSaved, this));
            this.element.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.SAVE_ALERT, this.config.widgetId), $.proxy(this.onAlertSaved, this));
            this.element.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.EDIT_RULE, this.config.widgetId), $.proxy(this.showOrHideButtons, this));
            this.element.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.CLOSE_DIALOG, this.config.widgetId), $.proxy(this.onRuleDone, this));
        },

        renderEventContainer: function(isReadOnly) {
            //Remove any containers that were previously added
            this.element.empty();
            this.element.append(new RbRuleEventContainer({
                rule: this.rule,
                widgetId: this.config.widgetId,
                readOnly: isReadOnly,
                allowEdit: this.config.allowEdit
            }));
        },

        renderAlertContainer: function(isReadOnly) {
            //Remove any containers that were previously added
            this.element.find(".RbRuleAlertContainer").remove();
            this.element.find(".rule-btn-container").remove();
            this.element.append(new RbRuleAlertContainer({
                rule: this.rule,
                widgetId: this.config.widgetId,
                readOnly: isReadOnly,
                allowEdit: this.config.allowEdit
            }));
        },

        showOrHideButtons: function(event) {
            //Determine whether or not to display the Done button in the dialog
            if(event || !this.rule.event.eventSource || this.rule.alerts.length === 0) {
                $("#dialog-ok").hide();
            } else {
                $("#dialog-ok").show();
            }            
        },

        onRuleDone: function(event){
            if (this.config.allowEdit) {
                //Publish the save rule event so that the back-end logic can be invoked
                $('#' + this.config.widgetId + '> .rbRuleListContainer').trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.SAVE_RULE, this.config.widgetId), [{rule:this.rule, ruleIndex:this.config.ruleIndex}]);
            }
        },

        onEventSaved: function(event, data){
            this.rule.rulename = data.rulename;
            this.rule.event = data.event;

            //Render the event container as read only
            this.renderEventContainer(true);
            this.renderAlertContainer(!!this.rule.alerts && this.rule.alerts.length > 0);
            this.showOrHideButtons();
        },

        onAlertSaved: function(event, data){
            //We need to reconcile the alerts against what we already have so that
            //we dont lose the isCreated, serviceName, and triggerName properties
            var newAlerts = data;

            for(var i=0; i<newAlerts.length; i++) {
                //loop through the existing alerts to match them up by type
                for(var j=0; j<this.rule.alerts.length; j++) {
                    if(newAlerts[i].type === this.rule.alerts[j].type) {
                        if(this.rule.alerts[j].isCreated){
                            newAlerts[i].isCreated = this.rule.alerts[j].isCreated;
                        }
                        if(this.rule.alerts[j].serviceName){
                            newAlerts[i].serviceName = this.rule.alerts[j].serviceName;
                        }
                        if(this.rule.alerts[j].isCreated){
                            newAlerts[i].triggerName = this.rule.alerts[j].triggerName;
                        }

                        this.rule.alerts.splice(j, 1); //delete this entry so that we don't process it again 
                        break;
                    }
                }
                //Initialize the isCreated attribute
                if(!newAlerts[i].isCreated) {
                    newAlerts[i].isCreated = false;
                }
            }

            this.rule.alerts = newAlerts;
            //Render the alert container as read only
            this.renderAlertContainer(true);
            this.showOrHideButtons();
        }
    };

    return rbRuleContainer;
})(jQuery);