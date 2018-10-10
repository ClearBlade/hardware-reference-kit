var clearbladeDeviceDataPlugin = function (settings, updateCallback) {
	var self = this;
	var currentSettings = settings;
	var refreshTimer;
	var errorPopDisplayed = false;
	var device = {};

	function createRefreshTimer(interval) {
		if(refreshTimer) {
			clearInterval(refreshTimer);
		}

		refreshTimer = setInterval(function() {
			self.updateNow();
		}, interval);
	}

	this.updateNow = function() {
		var dev = cb.Device();
		dev.getDeviceByName(currentSettings.device_name, function(err, body){
			if (err){
				if(!errorPopDisplayed) {
					alertMessage("Error getting device: ", body);
					errorPopDisplayed = true;
				}
			} else {
				device = body;
				updateCallback(device);
			}
		});
	}

	this.onDispose = function (){
		clearInterval(refreshTimer);
		refreshTimer = undefined;
	}

	this.onSettingsChanged = function(newSettings) {
		currentSettings = newSettings;
		self.updateNow();
	}

	this.sendData = function(data){
		
		if (typeof data != "object"){
			data = JSON.parse(data);
		}
		var dev = cb.Device();
		dev.updateDevice(currentSettings.device_name, data, true, function(err, body){
			if (err){
				console.log("Error updating device " + currentSettings.device_name);
				console.log(JSON.stringify(body));
				alertMessage("Error updating device: ", body);
			}
		});

	}

	createRefreshTimer(currentSettings.refresh_time);

};

freeboard.loadDatasourcePlugin({
	"type_name"    : "clearblade_device",
	"display_name" : "ClearBlade Device",
	"description"  : "Access a ClearBlade Device",
	"settings": [
		{
			"name" 			: "device_name",
			"display_name"  : "Device Name",
			"type" 			: "text",
			"description" 	: "Name of ClearBlade Device you would like to access",
			"required" 		: true
		},
		{
			"name" 			: "refresh_time",
			"display_name" 	: "Refresh Time",
			"description" 	: "Data refresh time in milliseconds",
			"required"		: false,
			"default_value"	: 1000
		}
	],
	newInstance: function (settings, newInstanceCallback, updateCallback){
		newInstanceCallback(new clearbladeDeviceDataPlugin(settings, updateCallback));
	}
});