var speedometerWidgetPlugin = function(settings) {
	var self = this;
	var currentSettings = settings;
	var speedometer;
	var speedometerID = Date.now() + '-speedometer';
	var titleElement = $('<h2 style="text-align: center; font-weight: bold; font-size: 20px; padding-top: 6%;">' + settings.speedometerName + '</h2>');
	var speedometerElement = $('<div id="' + speedometerID + '" style="width: 200px; height: 200px; padding-left: 15%; padding-top: 3%;"></div>');
	var unitElement;
	if(currentSettings.speedometerName==undefined){titleElement.html("")}
	if(settings.unit !== undefined) {
		unitElement = $('<div style="text-align: center; font-weight: bold; padding-top: 2%;">' + settings.unit + '</div>');
	} else {
		unitElement = $('<div style="text-align: center; font-weight: bold; padding-top: 2%;"></div>');
	}

	self.render = function(containerElement) {
		$(containerElement).append(titleElement).append(speedometerElement).append(unitElement);
		speedometer = new Speedometer (speedometerID, {theme: 'default', max: parseInt(currentSettings.maxValue)});
    	speedometer.draw();
	}

	self.getHeight = function() {
		return utils.widget.calculateHeight(5);
	}

	self.onSettingsChanged = function(newSettings) {
		currentSettings = newSettings;
		speedometer.rescale(parseInt(currentSettings.maxValue));
		unitElement.html((_.isUndefined(currentSettings.unit) ? "" : currentSettings.unit));
		titleElement.html((_.isUndefined(currentSettings.speedometerName) ? "" : currentSettings.speedometerName));
		if(currentSettings.speedometerName==undefined){titleElement.html("")}
	}

	self.onCalculatedValueChanged = function(settingName, newValue) {
		speedometer.update(parseInt(newValue));
	}

	self.onDispose = function() {
	}

	self.getValue = function(){
		
	}
	//this.onSettingsChanged(settings);
};

freeboard.loadWidgetPlugin({
	"type_name"   : "speedometer_widget",
	"display_name": "Speedometer",
    "description" : "A speedometer widget for displaying speed",
	"external_scripts": [			
		"plugins/thirdparty/controls.js",
		"plugins/thirdparty/digitaldisplay.js",
		"plugins/thirdparty/example.js",
		"plugins/thirdparty/speedometer.js",
		"plugins/thirdparty/tbe.js",
		"plugins/thirdparty/xcanvas.js",
		"plugins/thirdparty/themes/default.js"
	],
	"fill_size" : true,
	"settings" : [
		{
			"name"        : "speedometerName",
			"display_name": "Speedometer Name",
			"type"        : "text",
			"required"	  : false
		},
		{
			"name"			: "maxValue",
			"display_name"  : "Maximum Value",
			"type"			: "text",
			"default_value"	: "100",
			"description"	: "Maximum speed on the speedometer"
		},
		{
			"name"			: "unit",
			"display_name"	: "Unit",
			"type"			: "text"
		},
		{
			name: "speedVal",
			display_name: "Speed Source",
			type: "data",
			multi_input: true,
			incoming_parser: true,
			default_value: 0
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
	newInstance : function(settings, newInstanceCallback)
	{
		newInstanceCallback(new speedometerWidgetPlugin(settings));
	}
});