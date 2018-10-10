freeboard.loadWidgetPlugin({
 
	"type_name"   : "message_feed",
	"display_name": "Message Feed",

	"fill_size" : false,
	"settings"    : [
		{
			"name"        : "feed_name",
			"display_name": "Feed Name",
			"type"        : "text"
		},
		{
			name: "feedSource",
			display_name: "Feed Source",
			type: "data",
			multi_input: true,
			incoming_parser: true
		},
		{
			"name"        : "size",
			"display_name": "Size",
			"type"        : "option",
			"options"     : [
				{
					"name" : "Small",
					"value": "sm"
				},
				{
					"name" : "Medium",
					"value": "md"
				},
				{
					"name" : "Large",
					"value": "lg"
				},
				{
					"name" : "XL",
					"value": "xl"
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
		newInstanceCallback(new feedWidgetPlugin(settings, updateCallback));
	}
});



 
var feedWidgetPlugin = function(settings, updateCallback)
{
	var self = this;
	//replace spaces with dash so we can retrieve by id later
	settings.formName = settings.feed_name.replace(/\s+/g, '-');
	var currentSettings = settings;
	var mesHis = [];
	var $displayListFrame = $("<div>")
			.attr("id", settings.feed_name)
			.addClass("widget-list-frame");

	var $listTitle = $("<span>")
			.addClass("widget-list-heading")
			.text(settings.feed_name);

	var $displayList = $("<ul>").addClass("lw-list");

	var message = currentSettings.topic_name;

	self.render = function(containerElement)
	{
		$(containerElement).append([$listTitle, $displayListFrame]);
	}


	self.getHeight = function()
	{
		switch(currentSettings.size){
			case "sm": return 1; 
			case "md": return 2; 
			case "lg": return 4; 
			case "xl": return 8; 
		}
	}


	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;

		$displayListFrame.attr("id", currentSettings.feed_name);
		$listTitle.text(currentSettings.feed_name);
	}

	self.populateList = function(){
		$displayList.html('');
		for (var i = mesHis.length-1; i >= 0; i--) {
			var row = $('<li>');
			var val = mesHis[i];
			var col_value = $('<a>')
					.text(val);
			
			row.append(col_value);
			$displayList.append(row);
		}

		$displayListFrame.append($displayList);
	}


	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		mesHis.push(JSON.stringify(newValue));
		if (mesHis.length > 100){
			mesHis.shift();
		}
		self.populateList();
	}

	self.getValue = function()
	{
	}


	self.onDispose = function()
	{
	}
}

freeboard.addStyle('.lw-list li a', "text-color: white; text-size:14px;padding: 5px 30px 5px 10px; display: block;");