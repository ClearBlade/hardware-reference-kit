
freeboard.loadWidgetPlugin({
 
	"type_name"   : "flipswitch",
	"display_name": "Flip Switch",
    "description" : "A basic switch for setting on or off states",

	"fill_size" : false,
	"settings"    : [
		{
			name        : "sectionTitle",
			display_name: "Title",
			type        : "text",
			default_value	: "Switch"
		},
		{
			name        : "trueLabel",
			display_name: "True Label",
			type        : "text",
			default_value	: "on"
		},
		{
			name        : "falseLabel",
			display_name: "False Label",
			type        : "text",
			default_value	: "off"
		},
		{
			name: "switchVal",
			display_name: "Switch Value",
			type: "data",
			multi_input: true,
			incoming_parser: true,
			outgoing_parser: true
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
		newInstanceCallback(new flipSwitchPlugin(settings, updateCallback));
	}
});
	

var flipSwitchPlugin = function(settings, updateCallback)
{
	var self = this;
	var ON_CONSTANT = true;
	var OFF_CONSTANT = false;
	var currentSettings = settings;
	var $titleElement = $("<h4>").addClass("widget-heading").text(settings.sectionTitle);
	var currentState = false;
	// Isolate interaction to single switch. Note: this will remain the id if user edits flipswitch title (hash added in event of duplicate titles)
	var hash = Math.floor((Math.random() * 50) + 1) + "";
	var uniqueFlipKey = "flipswitch-"+settings.sectionTitle+hash;

	var $divToggle = $("<div>").addClass("flipswitch");

		var $inputToggle = $("<input>")
							.attr({
								"type":"checkbox",
								"id": uniqueFlipKey,
								"name":"flipswitch"
							})
							.addClass("flipswitch-checkbox");

		var $labelToggle = $("<label>")
							.attr("for", uniqueFlipKey)
							.addClass("flipswitch-label");
			var $innerToggle = $("<div>").addClass("flipswitch-inner");	
				var $spanOnToggle = $("<span>").addClass("on").text(currentSettings.trueLabel);
				var $spanOffToggle = $("<span>").addClass("off").text(currentSettings.falseLabel);     
			$innerToggle.append([$spanOnToggle, $spanOffToggle]);

			var $switchToggle = $( "<div>").addClass("flipswitch-switch");
		
		$labelToggle.append([$innerToggle, $switchToggle]);
	$divToggle.append([$inputToggle, $labelToggle]);

	var submitPayload = {
		"true": currentSettings.truePayload,
		"false": currentSettings.falsePayload
	};

	var toggleFlip = function(){
		$inputToggle.toggleClass("flipped");
		currentState = !currentState;
	}

	self.render = function(containerElement)
	{
		$(containerElement).append([$titleElement, $divToggle]);
		$inputToggle.on("change", self.onToggle);
	}


	self.getHeight = function()
	{
		if(currentSettings.size == "big")
		{
			return 3;
		}
		else
		{
			return 2;
		}
	}

	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
		$titleElement.text(newSettings.sectionTitle);
		$spanOnToggle.text(newSettings.trueLabel);
		$spanOffToggle.text(newSettings.falseLabel);   
		submitPayload = {
			"true": newSettings.truePayload,
			"false": newSettings.falsePayload
		};
		self.currentState = newSettings.currentState;
		self.targetDataSource = newSettings.targetDataSource;
	}

	self.getValue = function() {
		if($inputToggle.hasClass("flipped")) {
			return ON_CONSTANT;
		} else {
			return OFF_CONSTANT;
		}
	}

	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		var isFlipped = $inputToggle.hasClass("flipped");
		if((newValue === "true" || newValue === true) && !isFlipped ){
			toggleFlip();
		} else if((newValue === "false" || newValue === false) && isFlipped ){
			toggleFlip();
		}
	}

	self.onDispose = function()
	{
	}

	self.onToggle = function() {
		if(currentState === "true" || currentState === true){
			toggleFlip();
			updateCallback(OFF_CONSTANT);
		} else {
			toggleFlip();
			updateCallback(ON_CONSTANT);
		}
	}
}


