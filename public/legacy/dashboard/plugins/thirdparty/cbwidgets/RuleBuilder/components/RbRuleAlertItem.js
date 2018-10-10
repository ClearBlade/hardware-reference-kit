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
var RbRuleAlertItem = (function($){
    var self = this;

    function rbRuleAlertItem(config){
        this.alert = config.alert || {};

        if(!this.alert.options) {
            this.alert.options = {};
        }

        this.element = $('<form></form>')
            .attr('class', 'rbForm RbRuleAlertForm');

        this.render();
        return this.element;
    }

    rbRuleAlertItem.prototype = {

        render: function(){
            this.element.append(this.constructAlertSelect());
            this.element.append(this.constructProviderSelect());

            if(!!this.alert.provider || this.alert.type === RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE) {
                this.element.append(this.constructFormFields());
            }
        },

        constructAlertSelect: function() {
            var fieldContainer = $('<div class=""></div>')
                .attr("class", "form-field-container alert-select-container");

            //Append the label and alert select to the container
            fieldContainer.append($('<label class="form-field-label" for="alerttype">Trigger</label>'))
                .append($('<select name="alerttype"></select>')
                    .attr('class', 'styled-select form-field alert-select')
                    //Append the options to the select element
                    .append('<option value="">Select Alert Type</option>')
                    .append('<option value="sms">SMS</option>')
                    .append('<option value="email">E-Mail</option>')
                    .append('<option value="service">Service</option>')
                        .val(this.alert.type || "")
                    .on('change', $.proxy(this.onAlertChange, this))
                );
            return fieldContainer;
        },

        constructProviderSelect: function() {
            var fieldContainer = $('<div class="form-field-container provider-select-container"></div>')
                .append($('<label class="form-field-label" for="alerttype">Service</label>'));
        
            //Append the "event source" select element to the fields container
            var providerSelect = $('<select name="providers"></select>')
                    .attr('class', 'styled-select form-field provider-select')
                    .on('change', $.proxy(this.onProviderChange, this));
            fieldContainer.append(providerSelect);

            this.setProviderOptions(providerSelect);

            if(this.alert.type !== RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE) {
                fieldContainer.hide();
            }

            return fieldContainer;
        },

        setProviderOptions: function(parent){
            //Remove any options that were previously present
            parent.find('option').remove();

            //Append the options to the select element
            parent.append('<option value="" default selected>Select Alert Service</option>');

            var providers = this.getProviders(this.alert.type);

            //Display the options in the select
            for (var i=0; i< providers.length; i++) {
                parent.append('<option value="' + providers[i].providerName + '">' + providers[i].providerLabel + '</option>');
            }
            if(providers.length === 0) {
                parent.parent().hide();
            } else {
                if(providers.length === 1) {
                    parent.val(providers[0].providerName);
                    this.alert.provider = providers[0].providerName;
                    this.constructFormFields();
                }
            }
        },

        onAlertChange: function(event) {
            var providerSelect = this.element.find(".provider-select-container");

            //Store the selected alert type value
            this.alert.type = event.currentTarget.value;

            //Retrieve the providers for the selected alert type and render the provider select
            if(this.alert.type !== RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE && this.alert.type !== "") {
                providerSelect.show();
                this.setProviderOptions(this.element.find(".provider-select"));
            } else {
                this.alert.provider = "";
                providerSelect.hide();
                this.constructFormFields();
            }
        },

        onProviderChange: function(event) {
            //Store the selected provider value
            this.alert.provider = event.currentTarget.value;
            this.constructFormFields();
        },

        constructFormFields: function() {
            //Remove any previously defined fields
            this.element.find(".alert-fields").remove();
            
            if(this.alert.type !== ""){
                this.element.append(this.constructAlertFields());

                if(this.alert.type === RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE) {
                    this.renderServiceAlertFields();
                }
            }
        },

        constructAlertFields: function() {
            var fieldsContainer = $('<div class=""></div>')
                .attr("class", "alert-fields");

            var fields = RuleBuilderUtils.getAlertFields(this.alert.type, this.alert.provider);

            for (var i=0; i<fields.length;i++) {
                var fieldContainer = $('<div class=""></div>').attr("class", "alert-field");

                fieldContainer.append(RuleBuilderUtils.createFormFields(fields[i], true, this.alert.options[fields[i].fieldName] || ""));
                fieldsContainer.append(fieldContainer);
            }

            //Bind the addParameter button event for services
            if(this.alert.type === RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE) {
                //Hide the "Add Parameter" label that was automatically created
                var btnContainer = fieldsContainer.find("label[for='addServiceParm']").parent();
                btnContainer.addClass("addServiceParmContainer");

                fieldsContainer.find("label[for='addServiceParm']").hide();
                fieldsContainer.find(".addServiceParm").on("click", $.proxy(this.addServiceParm, this));
            }

            return fieldsContainer;
        },

        //Retrieve the list of providers for a particular alert
        getProviders: function(alertValue) {
            switch(alertValue) {
                case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_EMAIL:
                    return rbEmailAlertImpl.getProviders();
                case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SMS:
                    return rbSmsAlertImpl.getProviders();
                case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE:
                    return rbServiceAlertImpl.getProviders();
                default:
                    return [];
            }
        },

        renderServiceAlertFields: function(div, ndx) {
            //Service parameters are comprised of 2 fields (options in settings).
            //We need to group the param name and param value options together
            //Since we aren't guaranteed to order of the options in the object, we need to
            //make sure the param name is correctly matched to its value

            //Get all the keys that begin with parmName
            var paramNames = Object.keys(this.alert.options).filter(function( key ){
                return key.indexOf("serviceParmName") > -1;
            })

            for(var i=0; i< paramNames.length; i+=1){
                var fields = [
                    {
                        fieldName: paramNames[i], 
                        fieldLabel: "Parameter Name",
                        fieldTag: "input", 
                        fieldType: "text"
                    }, {
                        fieldName: "serviceParmValue_" + paramNames[i].split("_")[1],
                        fieldLabel: "Parameter Value",
                        fieldTag: "input", 
                        fieldType: "text"
                    }
                ];

                //Create the html structure for the service parm
                this.renderServiceParm(div, fields);
            }
        },

        addServiceParm: function(event) {
            //Each field needs to have a unique "name" attribute in order for form
            //validation to work correctly
            var fieldID = new Date().getUTCMilliseconds()

            fields = [
                {
                    fieldName: "serviceParmName_" + fieldID, 
                    fieldLabel: "Parameter Name",
                    fieldTag: "input", 
                    fieldType: "text"
                }, {
                    fieldName: "serviceParmValue_" + fieldID, 
                    fieldLabel: "Parameter Value",
                    fieldTag: "input", 
                    fieldType: "text"
                }
            ];

            this.renderServiceParm(event.target.parentNode, fields);
        },

        renderServiceParm: function(div, fields) {
            //A service parm will always consist of a field for the parm name
            //and a field for the parm value. This function, therefore, assumes
            //the incoming fields array has two elements in it.
            var fieldDiv = $('<div class="svcparm-container"></div>');
            var parmNameField = RuleBuilderUtils.createFormFields(fields[0], true, this.alert.options[fields[0].fieldName] || "");
            var parmValueField = RuleBuilderUtils.createFormFields(fields[1], true, this.alert.options[fields[1].fieldName] || "");
            
            $(parmNameField).find('.form-field').addClass('serviceParmNameValue');
            $(parmValueField).find('.form-field').addClass('serviceParmValueValue');
            fieldDiv.append(parmNameField, parmValueField);

            fieldDiv.append($('<div class="icon-container"></div>')
                .append($('<i class ="icon-trash"></i>'))
                .on('click', $.proxy(this.deleteServiceParm, this)));

//TODO - Add the right class
            this.element.find(".addServiceParmContainer").before(fieldDiv);
        },

        deleteServiceParm: function(event) {
            event.target.parentNode.parentNode.remove();
        }
    };

    return rbRuleAlertItem;
})(jQuery);