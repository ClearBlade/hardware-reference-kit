var dialWidgetPlugin = function(settings, updateCallback)
{
	var self = this;
	self.lastMove;
	var currentSettings = settings;
	var controlState;
	var start = {x:0,y:0};
	var offset = {x: 0, y:0};

	var tickArray = [];
	var angle = {
		"min": 0,
		"max": 270,
		"current": 0
	}

	var sensitivity = 10;
	var minLabel = "Low";
	var maxLabel = "High";

	// Widget heading
	var $widgetHeading = $("<h4>").addClass("widget-heading").text(settings.dial_name).css("margin-bottom", "-35px");

	// Knob frame
	var $displayElement = $("<div>").addClass("knob-surround");

		var $knob = $("<div>").addClass("knob")
				.bind("touchstart", function(event){
					start.x = event.originalEvent.touches[0].pageX;
					start.y = event.originalEvent.touches[0].pageY;
				})
				.bind('mousewheel DOMMouseScroll touchmove scroll', function(event){

					var scrollTo = null;
				    if (event.type == 'mousewheel') {
				        scrollTo = (event.originalEvent.wheelDelta * -1);
				    }
				    else if (event.type == 'DOMMouseScroll') {
				        scrollTo = 40 * event.originalEvent.detail;
				    } else if (event.type == 'touchmove'){
				    	offset = {x: 0, y:0};
						offset.x = start.x - event.originalEvent.touches[0].pageX;
						offset.y = start.y - event.originalEvent.touches[0].pageY;
						scrollTo = offset.y;
				    }

				    if (scrollTo) {
				        event.preventDefault();
				        $(this).scrollTop(scrollTo + $(this).scrollTop());
				    }

					if (event.originalEvent.wheelDelta > 0 || event.originalEvent.detail < 0 || offset.y > 0) { self.moveKnob('up');} 
					else { self.moveKnob('down');}
				});
		var $minIndicator = $("<span>").addClass("min").text(minLabel).css("color","green");
		var $maxIndicator = $("<span>").addClass("max").text(maxLabel).css("color","red");
		var $ticks = $("<div>").addClass("ticks");
		for(var i = 0; i < sensitivity; i++){
			var $tick = $("<div>").addClass("widget-tick");
			$ticks.append($tick);
			tickArray.push($tick);
		}

	$displayElement.append([$knob, $minIndicator, $maxIndicator, $ticks]);

	// Value Indicator
	var $valueIndicator = $("<span>")
			.css({
				"display" : "block",
				"margin-top": "-35px",
				"text-align": "center"
			}).text("loading...");


	self.updateSpeed = function(speed) {
		controlState = speed;
		if(settings._datatype !== undefined){
			updateCallback(controlState);
		}
	}

	self.getValue = function() {
		return controlState;
	}

	self.moveKnob = function(direction){
	  self.lastMove = Date.now();
	  if(direction == 'up') {
	    if((angle.current + 2) <= angle.max) {
	      angle.current += 2;
	      self.setAngle();
	    }
	  }
	  
	  else if(direction == 'down') {
	    if((angle.current - 2) >= angle.min) {
	      angle.current -= 2;
	      self.setAngle();
	    }
	  }
	}

	self.setAngle = function(supressCallback) {

		// rotate knob
		$knob.css({
			'-moz-transform':'rotate('+angle.current+'deg)',
			'-webkit-transform':'rotate('+angle.current+'deg)',
			'-o-transform':'rotate('+angle.current+'deg)',
			'-ms-transform':'rotate('+angle.current+'deg)',
			'transform':'rotate('+angle.current+'deg)'
			});

		// highlight ticks
		var activeTicks = (Math.round(angle.current / 30) + 1);
		var i = 0;
		for(i; i < activeTicks; i++){
			tickArray[i].addClass("activetick");
		}
		for(i; i < sensitivity; i++){
			tickArray[i].removeClass("activetick");
		}

		// update % value in text
		var pc = Math.round( (angle.current / angle.max) * 100);
		$valueIndicator.text(pc+'%');
		if(!supressCallback){
			self.updateSpeed(pc);
		}
	}

	self.render = function(containerElement)
	{
		$(containerElement).append([$widgetHeading, $displayElement, $valueIndicator]);
	}

	self.getHeight = function()
	{
		return utils.widget.calculateHeight(8);
	}

	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
		$widgetHeading.text(settings.dial_name);
	}

	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		//only update if it's been half a second this the last time we touched the dial
		//we do this to avoid updating the dial while we are still moving it which results in a jerky dial
		if(Date.now() - 500 >= self.lastMove || !self.lastMove) {
			if(newValue !== undefined){
				angle.current = Math.round( (newValue / 100) * angle.max);
				if(isNaN(angle.current)) {
					console.warn("Received a value that wasn't a number for dial with name of '" + currentSettings.dial_name + "'; Resetting to 0");
					angle.current = 0;
				}
				self.setAngle(true);
			}		
		}
	}

	// **onDispose()** (required) : Same as with datasource plugins.
	self.onDispose = function()
	{
	}
}

freeboard.loadWidgetPlugin({
	// Same stuff here as with datasource plugin.
	"type_name"   : "dial_widget",
	"display_name": "Dial",
    "description" : "A dial that connects to a message topic",
	// **external_scripts** : Any external scripts that should be loaded before the plugin instance is created.
	"external_scripts": [			
		"lib/js/thirdparty/dial.js"
	],
	// **fill_size** : If this is set to true, the widget will fill be allowed to fill the entire space given it, otherwise it will contain an automatic padding of around 10 pixels around it.
	"fill_size" : false,
	"settings"    : [
		{
			"name"        : "dial_name",
			"display_name": "Dial Name",
			"type"        : "text",
			"required"	  : true
		},
		{
			name: "dialVal",
			display_name: "Dial Value",
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
		newInstanceCallback(new dialWidgetPlugin(settings, updateCallback));
	}
});