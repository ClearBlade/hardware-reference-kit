freeboard.loadWidgetPlugin({
 
	"type_name"   : "simple_button",
	"display_name": "Button",
    "description" : "A basic button for sending information",



	"fill_size" : false,
	"settings"    : [
		{
			name        : "buttonLabel",
			display_name: "Button Label",
			type        : "text"
		},
		{
			name: "eventTarget",
			display_name: "Event Target",
			type: "data",
			force_data: "dynamic",
			multi_input: true,
			outgoing_parser: true
		},
		{
			name        : "size",
			display_name: "Size",
			type        : "option",
			options     : [
				{
					"name" : "Regular",
					"value": "regular"
				},
				{
					"name" : "Big",
					"value": "big"
				}
			]
		},
		{
            name          : "container_width",
            display_name  : "Container width",
            type          : "integer",
            description   : "Width of your widget's container as a percentage. Useful when juxtaposing widgets.",
            default_value : "100",
            required      : true
        }
	],


	newInstance   : function(settings, newInstanceCallback, updateCallback)
	{
		newInstanceCallback(new simpleButtonPlugin(settings, updateCallback));
	}
});


var simpleButtonPlugin = function(settings, updateCallback)
{
	var self = this;
	var currentSettings = settings;

	var myButtonElement = $("<input>")
		.attr({
			type:"button",
			value: settings.buttonLabel
		})
		.addClass("widget-button")
		.wrap('<div></div>');

	var submitPayload = {};

	
	self.render = function(containerElement)
	{

		$(containerElement).append(myButtonElement);
		myButtonElement.on( "click", self.onEvent);

	}


	self.getHeight = function()
	{
		if(currentSettings.size == "big")
		{
			return utils.widget.calculateHeight(2);
		}
		else
		{
			return utils.widget.calculateHeight(1);
		}
	}


	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
		myButtonElement.val(newSettings.buttonLabel);
	}


	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		submitPayload = newValue;
	}


	self.onDispose = function()
	{
	}

	self.getValue = function()
	{
	}

	self.onEvent = function() {
		updateCallback(submitPayload);
	}
}