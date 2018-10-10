var clearbladeCollectionRowsDatasourcePlugin = function (settings, updateCallback) {
	var self = this;
	var currentSettings = settings;
	var refreshTimer;
	var errorPopDisplayed = false;

	function createRefreshTimer(interval) {
		if(refreshTimer) {
			clearInterval(refreshTimer);
		}

		refreshTimer = setInterval(function() {
			self.updateNow();
		}, interval);
	}

	this.updateNow = function () {
		
		var data;
		var callback = function(err, data){
			if(err){
				console.log(err);
				if(!errorPopDisplayed) {
					alertMessage("Error fetching item: ", data);
					errorPopDisplayed = true;
				}
			}else{
				console.log(JSON.stringify(data));
				updateCallback(data);
			}
		}

		var q = cb.Query({collectionName: currentSettings.collection_name});
		q.equalTo(currentSettings.field_name,currentSettings.field_value);
		q.fetch(callback)
		
	}

	this.onDispose = function () {
		clearInterval(refreshTimer);
		refreshTimer = undefined;
	}

	this.onSettingsChanged = function (newSettings) {
		currentSettings = newSettings;
		self.updateNow();
	}

	createRefreshTimer(currentSettings.refresh_time);
};

freeboard.loadDatasourcePlugin({
	"type_name": "clearblade_fetch_row",
	"display_name": "Item",
	"settings": [
		{
			"name": "collection_name",
			"display_name": "Collection Name",
			"type": "text",
			"description" : "Name of the collection stored in your system",
			"required" : true
		},
		{
			"name": "field_name",
			"display_name": "Field Name",
			"type": "text",
			"description" : "Name of the column from collection on the system",
			"required" : true
		},
		{
			"name": "field_value",
			"display_name": "Field Value",
			"type": "text",
			"description" : "Name of the item value to be retrieved",
			"required" : true
		},
		{
			"name"         : "refresh_time",
			"display_name" : "Refresh Time",
			"type"         : "text",
			"description"  : "In milliseconds",
			"default_value": 5000
		}
	],
	newInstance: function (settings, newInstanceCallback, updateCallback) {
		newInstanceCallback(new clearbladeCollectionRowsDatasourcePlugin(settings, updateCallback));
	}
});