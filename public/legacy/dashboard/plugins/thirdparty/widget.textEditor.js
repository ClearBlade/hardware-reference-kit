freeboard.loadWidgetPlugin({
 
	"type_name"   : "text_editor",
	"display_name": "Text Editor",
    "description" : "Wire text to a datasource for updates/publishes",
    "external_scripts" : [
		"lib/js/thirdparty/ckeditor/ckeditor.js"
		],
	"fill_size" : false,
	"settings"    : [
		{
			name        : "sectionTitle",
			display_name: "Title",
			type        : "text"
		},
		{
			name: "inputVal",
			display_name: "Value",
			type: "data",
			multi_input: true,
			incoming_parser: true,
			outgoing_parser: true
		},
		{
			name        : "size",
			display_name: "Size",
			type        : "option",
			options     : [
				{
					name : "Big",
					value: "big"
				}
			]
		}
	],

	newInstance   : function(settings, newInstanceCallback, updateCallback)
	{
		newInstanceCallback(new TextEditorWidgetPlugin(settings, updateCallback));
	}
});

 
var TextEditorWidgetPlugin = function(settings, updateCallback)
{
	var self = this;
	//replace spaces with dash so we can retrieve by id later
	if (settings.sectionTitle === undefined){
		settings.inputName = "";
	}
	else{
		settings.inputName = settings.sectionTitle.replace(/\s+/g, '-');
	}
	var currentSettings = settings;
	var displayElement = $('<div class="tw-display"></div>');
	var titleElement = $('<h2 class="section-title tw-title tw-td">'+settings.sectionTitle+'</h2>');
    // var valueElement = $('<div class="tw-value"></div>');
    var inputElement = $("<textarea id='"+settings.inputName+"'></textarea>");
    var script = document.createElement( 'script' );
	script.type = 'text/javascript';
	//script.src = "plugins/thirdparty/ckeditor/index.js";
	script.text = "var editor = CKEDITOR.replace('"+settings.inputName+"');"
	var sendButton = $('<input id="send" type="button" value="Save">');
	self.render = function(containerElement)
	{
		var editor = CKEDITOR.instances[settings.inputName];
		if (editor) 
		{ 
			editor.destroy(true); 
		}
		$(containerElement).empty();
		$(displayElement)
			.append($('<div class="tw-tr"></div>')
			.append(titleElement))
				.append($('<div class="tw-tr"></div>')
					.append($('<div class="tw-value-wrapper tw-td"></div>').append(inputElement)).append(script))
				.append($('<div class="tw-tr"></div>')
				.append(sendButton));
		sendButton.on( "click", self.onEvent);
		$(containerElement).append(displayElement);
	}
	self.getHeight = function()
	{
		if(currentSettings.size == "big")
		{
			return 8;
		}
	}


	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
	}


	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		CKEDITOR.instances[currentSettings.inputName].setData(newValue);
	}


	self.onDispose = function()
	{
	}

	self.getValue = function() {
		try {
			var data = CKEDITOR.instances[settings.inputName].getData().replace(/<[^>]*>/g, " ");
    		//console.log(data);
			return data;
		} catch(e) {
			console.log('unable to get value from the textarea ' + currentSettings.inputName);
			console.log(e);
			return {};
		}
	}

	self.onEvent = function() {
		updateCallback(self.getValue());
	}
};