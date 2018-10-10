var RbRuleListItem = (function($){

    function rbRuleListItem(config){

        this.config = config;
        this.element = $("<li></li>")
            .attr('class', 'rbRuleListItem');

        this.render();
        this.bindEvents();

        return this.element;
    }

    rbRuleListItem.prototype = {

        render: function(){

            if(this.config.allowDelete) {
                //Append the delete icon
                this.element.append($('<div class ="icon-container"><i class ="icon-trash"></i></div>'));
            }
            
            //Append the rule editing button
            //TODO: Add last run logic
            this.element.append($("<div></div>")
                .attr("class", "rbRuleListItemNameContainer")
                .append($('<button>' + this.config.rule.rulename + '</button>')
                    .attr("class", "rbRuleListItemName"))
                // TODO - Uncomment when API is exposed
                // .append($('<span>Last run: </span>')
                //     .attr("class", "rbRuleListItemLastRun")
                //     .append($('<span>Mar 3, 2017 10:34:12 AM</span>')
                //         .attr("class", "rbRuleListItemLastRunDate")))
                );

            if (this.config.allowOnOff) {
                //Append the on/off slider
                this.element.append($('<div></div>')
                    .attr("class", "onoffswitch-container")
                    .append($('<div></div>')
                        .attr("class", "onoffswitch")
                        .append($("<input>")
                            .attr("class", "onoffswitch-checkbox")
                            .attr("id", this.config.rule.rulename + "-onoff")
                            .attr("type", "checkbox")
                            .attr("name", "onoffswitch")
                            .attr("checked", this.config.rule.enabled))
                        .append($("<label>")
                            .attr("class", "onoffswitch-label")
                            .attr("for", this.config.rule.rulename + "-onoff")
                            .append($('<div></div>')
                                .attr("class", "onoffswitch-inner")
                                .append($('<span class="on">on</span>'))
                                .append($('<span class="off">off</span>'))
                            .append($('<div></div>')
                                .attr("class", "onoffswitch-switch"))
                        ))
                    )
                );
            }
        },

        bindEvents: function(){
            this.element.find(".onoffswitch-checkbox").on("change", $.proxy(this.onToggle, this));
            this.element.find(".icon-trash").on("click", $.proxy(this.deleteRule, this));
            this.element.find(".rbRuleListItemName").on("click", $.proxy(this.editRule, this));
        },

        //TODO - Implement this when API is available
        getLastRun: function() {

        },

        onToggle: function(event){
            var enableRule = event.currentTarget.checked;

            if(enableRule) {
                this.element.trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.ENABLE_RULE, this.config.widgetId), 
                    [{ruleIndex: this.config.ruleIndex}]);
            } else {
                this.element.trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.DISABLE_RULE, this.config.widgetId), 
                    [{ruleIndex: this.config.ruleIndex}]);
            }
        },

        deleteRule: function(event) {
            this.element.trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.DELETE_RULE, this.config.widgetId), 
                [{rule:this.config.rule, ruleIndex: this.config.ruleIndex}]);
        },

        editRule: function(event) {
            RuleBuilderUtils.openRuleDialog(this.config);
        }
    };

    return rbRuleListItem;
})(jQuery);