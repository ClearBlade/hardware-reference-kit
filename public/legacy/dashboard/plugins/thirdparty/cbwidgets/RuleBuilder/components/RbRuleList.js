var RbRuleList = (function($){

    var self = this;

    function rbRuleList(config){
        //Make a clone of the rules list so that modifications made
        //do not affect the original rules
        this.config = JSON.parse(JSON.stringify(config)) || {};

        if(!config.rules) {
            config.rules = [];
        }

        this.element = $("<div></div>")
            .attr('class', 'rbRuleListContainer');

        this.render();
        return this.element;
    }

    rbRuleList.prototype = {

        render: function(){
            this.element.empty();
            this.element.off();

            //Create the fieldset
            var fieldSet = $("<fieldset></fieldset>")
                .append($("<legend>" + this.config.widgetName + "</legend>"))

            //Append the rules
            if(this.config.rules.length > 0) {
                var scrollContainer = $("<div class='rbRuleListScroll'></div>");
                var list = $("<ul></ul>")
                    .attr("class", "rbRuleList"); 

                for(var i=0; i<this.config.rules.length; i++) {
                    //Clone the config object
                    var itemConfig = JSON.parse(JSON.stringify(this.config));

                    itemConfig.rule = this.config.rules[i];
                    itemConfig.ruleIndex = i;
                    delete itemConfig.rules;

                    list.append(new RbRuleListItem(itemConfig));
                }

                scrollContainer.append(list);
                fieldSet.append(scrollContainer);
            } else {
                fieldSet.append($('<div class="NoRulesContainer"></div>')
                    .append($('<h4>No Rules</h4>').attr('class', 'rbRuleListItem')));
            }


            if(this.config.allowCreate) {
                fieldSet.append($("<div></div>")
                    .append($("<i class='icon-plus'></i>"))
                    .attr("id", "addNewRuleLink_" + this.config.widgetId)
                    .attr("class", "addNewRuleLink clickable")
                    .append("<span>Add New Rule</span>")
                );
            }

            //Append the fieldset
            this.element.append(fieldSet);
            this.bindEvents();
        },

        bindEvents: function(){
            this.element.find("#addNewRuleLink_" + this.config.widgetId).on('click', $.proxy(this.addNewRule, this));

            //Bind custom events
            this.element.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.DELETE_RULE, this.config.widgetId), $.proxy(this.onRuleDeleted, this));
            this.element.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.SAVE_RULE, this.config.widgetId), $.proxy(this.onRuleSaved, this));
        },

        addNewRule: function() {
            var ruleNdx = -1;
            RuleBuilderUtils.openRuleDialog({
                    widgetId: this.config.widgetId, 
                    ruleIndex: ruleNdx,
                    allowEdit: this.config.allowEdit
            });
        },

        onRuleSaved: function(event, data) {
            //We need to determine if the rule is a new rule or a modified rule
            if(data.ruleIndex !== -1 /*&& data.ruleIndex + 1 <= this.config.rules.length*/) {
                this.config.rules[data.ruleIndex] = data.rule;

                //Publish the event to update the back-end rule
                this.element.trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.MODIFY_RULE, this.config.widgetId), 
                    [{rule: data.rule, ruleIndex: data.ruleIndex}]);
            } else {
                this.config.rules.push(data.rule);

                //Publish the event to add a new back-end rule
                this.element.trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.CREATE_RULE, this.config.widgetId), 
                    [{rule: data.rule, ruleIndex: data.ruleIndex + 1}]);
            }

            this.render();
        },

        onRuleDeleted: function(event, data) {
            //Delete the rule from the internal array
            this.config.rules.splice(data.ruleIndex, 1);
            this.render();
        }
    };

    return rbRuleList;
})(jQuery);