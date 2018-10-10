var RbRuleEventConditionItem = (function($){

    var self = this;

    function rbRuleEventConditionItem(config){
        this.condition = config.condition || {};
        this.eventType = config.eventType;
        this.readOnly = config.readOnly || false;
        this.conditionIndex = config.conditionIndex;

        this.element = $('<form></form>')
            .attr('class', 'rbForm RbRuleEventConditionForm');

        this.render();

        return this.element;
    }

    rbRuleEventConditionItem.prototype = {

        render: function(){
            if(!this.readOnly) {
                if(this.conditionIndex > 0) {
                    this.element.append(this.constructLogicalCondition());
                }
                
                this.element.append(this.constructFormFields());
            } else {
                this.element.append(this.constructReadOnlyInterface());
            }

            this.bindEvents();
        },

        bindEvents: function(){
        },

        constructLogicalCondition: function() {
            return cond = $('<div class="form-field-container logical-condition-container"></div>')
                .append($('<label class="form-field-label" for="logical">Operator</label>'))
                .append($('<select name="logical"></select>')
                    .attr('class', 'styled-select logical-condition-select form-field')
                    //Append the options to the select element
                    .append('<option value="AND" default>AND</option>')
                    .append('<option value="OR">OR</option>')
                    .val(this.condition.logical || "AND")
                    .on('change', $.proxy(this.onSelectChange, this)))
        },

        onSelectChange: function(event) {
            //Set the value in the condition
            this.condition.logical = event.currentTarget.value;
        },

        constructFormFields: function() {
            var fieldsContainer = $('<div class=""></div>')
                .attr("class", "condition-fields")

            var fields = RuleBuilderUtils.getEventSpecificFields(this.eventType);

            for (var i=0; i<fields.length;i++) {
                var fieldContainer = $('<div class=""></div>')
                    .attr("class", "condition-field")

                if(fields[i].fieldName === "operator") {
                    fieldContainer.append(this.constructOperator());
                    fieldsContainer.append(fieldContainer);
                } else {
                    if(fields[i].isConditionField === true) {
                        fieldContainer.append(RuleBuilderUtils.createFormFields(fields[i], true, this.condition[fields[i].fieldName]));
                        fieldsContainer.append(fieldContainer);
                    }
                }
            }
            return fieldsContainer;
        },

        //Render the operator field used to build conditions
        constructOperator: function() {

            var container = $('<div class="form-field-container"></div>');
            container.append($('<label class="form-field-label" for="operator">Operator</label>'));
            container.append($('<select name="operator"></select>')
                .attr('class', 'styled-select form-field condition-operator')
                .append($('<option value="" default selected>Select Operator Type</option>'))
                .append($('<option value="GREATER_THAN">' + RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS.GREATER_THAN +'</option>'))
                .append($('<option value="LESS_THAN">' + RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS.LESS_THAN + '</option>'))
                .append($('<option value="GREATER_THAN_EQUAL_TO">' + RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS.GREATER_THAN_EQUAL_TO + '</option>'))
                .append($('<option value="LESS_THAN_EQUAL_TO">' + RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS.LESS_THAN_EQUAL_TO + '</option>'))
                .append($('<option value="EQUAL_TO">' + RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS.EQUAL_TO + '</option>'))
                .append($('<option value="NOT_EQUAL_TO">' + RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS.NOT_EQUAL_TO + '</option>'))
                .val(this.condition.operator || ""));

            return container;
        }
    };

    return rbRuleEventConditionItem;
})(jQuery);