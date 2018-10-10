var RbRuleEventContainer = (function($){

    var self = this;

    function rbRuleEventContainer(config){
        this.rule = !!config.rule.rulename ? config.rule : {event: {conditions: [], options: {}}};
        this.widgetId = config.widgetId;
        this.readOnly = config.readOnly || false;
        this.allowEdit = config.allowEdit;

        this.element = $('<div></div>')
            .attr('class', 'RbRuleEventContainer');

        this.render();

        return this.element;
    }

    rbRuleEventContainer.prototype = {

        render: function(){

            this.element.empty();

            this.element.append(this.constructRuleName());
            this.element.append(this.constructIfContainer());
        },

        getRuleText: function() {
            var ruleConditionsText = [];

            for(var i=0; i<this.rule.event.conditions.length; i++){
                var ruleText = "";

                if(i>0) {
                    ruleText += this.rule.event.conditions[i].logical + " ";
                }
                ruleText += this.rule.event.eventSource[0].toUpperCase() + this.rule.event.eventSource.substring(1) + " ";
                ruleText += this.rule.event.conditions[i].variable + " ";
                ruleText += RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS[this.rule.event.conditions[i].operator] + " ";
                ruleText += isNaN(this.rule.event.conditions[i].value) ? 
                    "\"" + this.rule.event.conditions[i].value + "\" " : this.rule.event.conditions[i].value;
                
                ruleConditionsText.push(ruleText);
            }
            return ruleConditionsText;
        },

        constructRuleName: function() {
            if(!this.rule.rulename) {
                var nameField = RuleBuilderUtils.createFormFields({
                    fieldName: "rulename", 
                    fieldLabel: "Rule Name",
                    fieldTag: "input", 
                    fieldType: "text",
                    isConditionField: false,
                    renderLabelField: false,
                    events: [
                        {eventName: "onfocus", eventValue: "this.placeholder=\'\'"},
                        {eventName: "onblur", eventValue: "this.placeholder=\'Rule Name (Required)\'"}
                    ]
                }, false, this.rule.rulename || "");
            }

            return form = $('<form method="post"></form>')
                .attr('class', 'rbForm rulename-form')
                .append(nameField);
        },

        constructIfContainer: function() {
            var ifContainer = $('<div></div>')
                .attr('class', '.RbRuleIfContainer');

            var fieldSet = $('<fieldset><legend>IF</legend></fieldset>');

            if(this.readOnly) {
                fieldSet.append(this.constructReadOnlyEvent());
            } else {
                //Append the select form to the fieldset
                fieldSet.append(this.constructEditableEvent());

                //Append the conditions to the fieldset
                for(var i=0; i<this.rule.event.conditions.length; i++) {
                    fieldSet.append(this.getNewCondition(i));
                }

                //Append button container to the fieldset
                fieldSet.append(this.constructIfButtonContainer());
            }

            //Append the fieldset to the container
            ifContainer.append(fieldSet);
            return ifContainer;
        },

        constructReadOnlyEvent: function() {
            var readOnlyContainer = $('<div></div>')
                .attr('class', '.RbRuleEventReadOnly');
            var ruleConditionsText = this.getRuleText();

            //Add text blocks for each condition
            var list = $('<ul></ul>')
                .attr('class', '.RbRuleEventList');
            for(var i=0; i<ruleConditionsText.length; i++){
                list.append($('<li>' + ruleConditionsText[i] + '</li>')
                    .attr('class', '.RbRuleConditionReadOnly'))
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

        constructEditableEvent: function() {
            var fieldContainer = $('<div class=""></div>')
                .attr("class", "event-fields-container")
            var evtForm = $('<form method="post"></form>')
                .attr('class', 'rbForm select-form');

            //Append the "event source" select element to the fields container

            fieldContainer.append($('<div class="form-field-container"></div>')
                .append($('<label class="form-field-label" for="eventsource">Datasource</label>'))
                    .append($('<select name="eventsource"></select>')
                        .attr('class', 'styled-select form-field source-select')
                        //Append the options to the select element
                        //Uncomment commented options when the event sources have been
                        //implemented.
                        .append('<option value="" default>Select Source Type</option>')
                        // .append('<option value="user">user</option>')
                        .append('<option value="message">message</option>')
                        // .append('<option value="data">data</option>')
                        // .append('<option value="device">device</option>')
                        .val(this.rule.event.eventSource || "")
                        .on('change', $.proxy(this.onSelectChange, this))
                    ));

            //Append the event specific fields to the container
            fieldContainer.append(this.renderEventSpecificFields());

            //Append the field container to the form
            evtForm.append(fieldContainer);

            return evtForm;
        },

        constructIfButtonContainer: function () {
            var container = $('<div></div>')
                    .attr('class', 'if-btn-container btn-container ')
                    //Append the Create Rule button
                    .append($('<input type= "button" value="+ Add Condition">')
                        .attr('class', 'addConditionBtn btn')
                        .on("click", $.proxy(this.onAddCondition, this))
                    )
                    //Append the Update Rule button
                    .append($('<input type= "button" value="Next">')
                        .attr('class', 'nextBtn btn')
                        .on("click", $.proxy(this.validateForms, this))
                    );

            //Render the container as hidden
            if(!this.rule.event.eventSource) {
                container.hide();
            }
            return container;
        },

        renderEventSpecificFields: function() {
            var eventFields = $('<div></div>').attr("class", "event-fields");

            if(!!this.rule.event.eventSource) {
                var fields = RuleBuilderUtils.getEventSpecificFields(this.rule.event.eventSource);
                var eventFields = $('<div></div>').attr("class", "event-fields");

                for (var i=0; i<fields.length;i++) {
                    if(fields[i].isConditionField === false) {
                        eventFields.append(RuleBuilderUtils.createFormFields(fields[i], true, 
                            this.rule.event.options[fields[i].fieldName] || ""));
                    }
                }
            }
            return eventFields;
        },

        onAddCondition: function(event) {
            //Insert a new condition item before the button container
            this.getNewCondition().insertBefore(this.element.find('.if-btn-container'));

            $('body').trigger(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.RESIZE_DIALOG);
        },

        getNewCondition: function(ndx) {
            var ndx = ndx || this.element.find('.RbRuleEventConditionForm').length

            var deleteIcon = $('<div class ="icon-container"><i class ="icon-trash"></i></div>')
                .on("click", $.proxy(this.deleteCondition, this))

            var condition = new RbRuleEventConditionItem({
                condition: this.rule.event.conditions[ndx] || {},
                eventType: this.rule.event.eventSource,
                readOnly: this.readOnly,
                conditionIndex: ndx
            });
            
            //Append the delete icon to the condition item
            condition.append(deleteIcon);
            return condition;
        },

        deleteCondition: function(event) {
            $(event.currentTarget.parentElement).remove();

            //Remove the condition select on the first condition
            var conditions = this.element.find('.RbRuleEventConditionForm');
            if(conditions.length > 0) {
                $(conditions[0]).find('.logical-condition-container').remove();
            }
        },

        validateForms: function(event) {
            var formsAreValid = true;

            var validationOptions = RuleBuilderUtils.getFormValidationOptions(
                this.rule.event.eventSource !== "" ? RuleBuilderUtils.getEventSpecificFields(this.rule.event.eventSource) : []);

            if(!this.rule.rulename) {
                //Verify a rule name was specified in the rulename form
                var nameForm = $(this.element.find('.rulename-form'));
                if(nameForm.length > 0) {
                    nameForm.validate(validationOptions);
                    if(!nameForm.valid()) {
                        formsAreValid = false;
                    }
                }
            }

            //Verify the select form
            var selectForm = $(this.element.find('.select-form'));
            selectForm.validate(validationOptions);
            if(!selectForm.valid()) {
                formsAreValid = false;
            }

            //Loop over each condition form and validate each form individually
            var condForms = this.element.find('.RbRuleEventConditionForm');
            for (var i=0; i< condForms.length; i++) {
                var form = $(condForms[i]);
                form.validate(validationOptions);
                if (!form.valid()) {
                    formsAreValid = false;
                }
            };  

            if(!formsAreValid) {
                return;
            } else {
                //If all forms are valid, save the event data and display the alert container
                this.saveRuleEvent();
            }
        },

        onSelectChange: function(event) {
            this.rule.event.eventSource = event.currentTarget.value;
            this.rule.event.conditions = [];
            
            var btnContainer = this.element.find(".if-btn-container")

            //Remove non-condition fields that were previously added to the UI
            this.element.find(".event-fields").remove();

            //Remove any condition forms that were previously added to the UI 
            this.element.find(".RbRuleEventConditionForm").remove();

            //
            var eventFields = 
            this.element.find('.event-fields-container').append(this.renderEventSpecificFields());
            if(this.rule.event.eventSource != "") {

                this.onAddCondition(event);

                //Display the button container
                btnContainer.show();
            } else {
                btnContainer.hide();
            }
        },

        saveRuleEvent: function() {
            //Retrieve all of the rule data
            var rule = this.extractEventFromDOM();

            //Set the dialog title to be the rule name
            $(".modal .title").text(rule.rulename);

            //Emit the saved data
            this.element.closest($('.RbRuleContainer')).trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.SAVE_EVENT, this.widgetId), [rule]);
        },

        extractEventFromDOM: function() {
            //Build a json object representing all of the event settings.
            //
            // {
            //      rulename: xxxx,
            //      event: {
            //          eventSource: "message", {user|message|data|device}
            //          options: {
            //              topic: ""
            //          }, {
            //          conditions: [
            //              logical: "AND|OR"
            //              variable: "", 
            //              operator: "",
            //              value: ""
            //          ]
            //      }

            //Make a clone of the rule being edited so that changes made in this widget
            //do not affect the original rule
            var rule = this.rule, event = {}, options = {}, conditions = [];
            
            if(!this.rule.rulename) {
                rule.rulename = this.element.find($(".rulename"))[0].value;
            }
            event.eventSource = this.rule.event.eventSource;
            
            //Store the event specific data
            var eventFields = this.element.find($('.event-fields .form-field'));
            for (var i=0; i< eventFields.length; i++) {
                options[eventFields[i].name] = eventFields[i].value;
            };
            
            //Store all of the condition specific data
            var conditionForms = this.element.find($('.RbRuleEventConditionForm'));
            for (var j=0; j< conditionForms.length; j++) {
                var conditionFields = $(conditionForms[j]).find($('.form-field'));
                var condition = {};
                for (var k=0; k< conditionFields.length; k++) {
                    

                    switch (conditionFields[k].name) {
                        case 'value':
                            if(!isNaN(conditionFields[k].value)) {
                                condition[conditionFields[k].name] = Number(conditionFields[k].value);
                            } else {
                                condition[conditionFields[k].name] = conditionFields[k].value;
                            }
                            break;
                        case 'logical':
                            //We dont' want to store the logical operator for the first condition
                            if(j>0) {
                                condition[conditionFields[k].name] = conditionFields[k].value;
                            } else {
                                condition[conditionFields[k].name] = "";
                            }
                            break;
                        default:
                            condition[conditionFields[k].name] = conditionFields[k].value;
                    }
                }
                conditions.push(condition);
            };

            event.options = options;
            event.conditions = conditions;
            rule.event = event;

            return rule;
        },

        onEditClick: function() {
            this.readOnly = false;
            this.render();

            this.element.closest(".RbRuleContainer").trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.EDIT_RULE, this.widgetId));
        }
    };

    return rbRuleEventContainer;
})(jQuery);