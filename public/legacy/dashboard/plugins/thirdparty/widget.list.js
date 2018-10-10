freeboard.loadWidgetPlugin({
 
	"type_name"   : "collection_list",
	"display_name": "List",
	"fill_size" : false,
	"description" : "Expects an array of items in the format [ {\"label\": \"String\", \"value\" : AnyObject } ] where value is sent to the local_var on item click.",
	"settings"    : [
		{
			"name"        : "list_name",
			"display_name": "List Name",
			"type"        : "text"
		},
		{
			name: "listData",
			display_name: "List Source",
			type: "data",
			incoming_parser: true,
			multi_input: true
		},
		{
			name			: "local_var",
			display_name	: "Local Variable",
			type			: "data",
			force_data		: "dynamic",
			outgoing_parser	: true,
			multi_input		: true
		},
		{
			name 			: "track_attribute",
			display_name	: "Tracking Column Name",
			type 			: "text",
			description		: "Attribute used to identify active item."
		},
		{
			"name"        : "blockHeight",
			"display_name": "Block Height",
			"type"        : "number",
			default_value : 4,
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
	"default_parsers" : {
        clearblade_collection : {
            incoming : "// Defualt incoming parser for use with a ClearBlade Collection datasource. Generates a list using \"item_id\" as a label and the row data as the value, then sorts by alphanumeric order.\n" +
"if(this.datasource === undefined){return;}\n"+
"var fmtData = [];\n"+
"var len = this.datasource.length;\n"+
"for(var i = 0; i < len; i++){\n"+
    "fmtData.push({\"label\": this.datasource[i].data.item_id , \"value\": this.datasource[i].data});\n"+
"}\n" +
"fmtData.sort(function(a,b) {return (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0);} );\n"+
"return fmtData;"		
		}
	}
	,
	newInstance   : function(settings, newInstanceCallback, updateCallback)
	{
		newInstanceCallback(new listWidgetPlugin(settings, updateCallback));
	}
});

 
var listWidgetPlugin = function(settings, updateCallback)
{
	var self = this;
	
	var currentSettings = settings;
	var activeValue;

	var $titleElement = $("<h2>")
			.addClass("section-title")
			.text(settings.list_name)
			.css("margin-bottom","3px");

	var $activeList = $("<ul>");

	var buildList = function(listData){
		var $list = $("<ul>").css({"padding":"0px"}).addClass("list-widget");
		var data = utils.parseJsonArray(listData);
		var len = data.length;
		if(len){
			for(var i = 0; i < len; i++){
				var $listItem = $("<li>")
					.text(data[i].label)
					.addClass("list-widget-item")
					.on("click", { idx: i, item: data[i].value }, function(event){
						activeValue = event.data.item;
						$(this).siblings(".list-widget-item").removeClass("active");
						$(this).toggleClass("active");
						updateCallback(event.data.item, currentSettings.local_var);
					});
				
				if(activeValue !== undefined && currentSettings.track_attribute !== undefined && activeValue[currentSettings.track_attribute] === data[i].value[currentSettings.track_attribute]){
					$listItem.addClass("active");
				}
				
				$list.append($listItem);
			}
		} else console.error("List missing data");
		return $list;
	}

	self.render = function(containerElement)
	{
		$activeList = buildList(currentSettings.listData);
		$(containerElement)
			.css("overflow","auto")
			.append([$titleElement, $activeList]);
	}


	self.getHeight = function()
	{
		return utils.widget.calculateHeight(currentSettings.blockHeight);
	}

	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
		var $newList = buildList(currentSettings.listData);
		$activeList.replaceWith($newList);
		$activeList = $newList;
		$titleElement.text(currentSettings.list_name);
	}

	self.getValue = function(){
		return activeValue;
	}

	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		var $newList = buildList(newValue);
		$activeList.replaceWith($newList);
		$activeList = $newList;
	}

	self.onDispose = function()
	{

	}
}