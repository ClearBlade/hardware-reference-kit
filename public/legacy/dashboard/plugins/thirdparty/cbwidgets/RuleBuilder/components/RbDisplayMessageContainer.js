var RbDisplayMessageContainer = (function($){

    var self = this;

    function rbDisplayMessageContainer(config){
        this.config = config;

        this.element = $('<div></div>')
            .attr('class', 'rbDisplayMessageContainer');

        this.render();

        return this.element;
    }

    rbDisplayMessageContainer.prototype = {

        render: function(){

            this.renderMessageContainer(this.config);
        },

        renderMessageContainer: function(config) {
            this.element.append($("<h4>" + config.message + "</h4>"));
            this.element.append($("<h4>" + config.messageDetail + "</h4>"));
        },

        onOkClicked: function(event){
            RuleBuilderUtils.closeDialog();
        }
    };

    return rbDisplayMessageContainer;
})(jQuery);