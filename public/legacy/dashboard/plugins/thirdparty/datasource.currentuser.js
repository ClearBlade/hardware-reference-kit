var clearbladeCurrentUserDatasourcePlugin = function (settings, updateCallback) {
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
	
		var callback = function(err, data){
			if(err){
				console.log(err);
				if(!errorPopDisplayed) {
					alertMessage("Error fetching current user: ", data);
					errorPopDisplayed = true;
				}
			}else{
				//console.log(JSON.stringify(data));
				updateCallback(data);
			}
		}

		var user = cb.User();
		user.getUser(callback);
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
	"type_name": "clearblade_user",
	"display_name": "Current User",
	"settings": [
		{
			"name"         : "refresh_time",
			"display_name" : "Refresh Time",
			"type"         : "text",
			"description"  : "In milliseconds",
			"default_value": 5000
		}
	],
	newInstance: function (settings, newInstanceCallback, updateCallback) {
		newInstanceCallback(new clearbladeCurrentUserDatasourcePlugin(settings, updateCallback));
	}
});