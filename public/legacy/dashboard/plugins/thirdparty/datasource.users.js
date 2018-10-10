var clearbladeUsersDatasourcePlugin = function (settings, updateCallback) {
		var self = this;
		var currentSettings = settings;
		var query = currentSettings.query_object;
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
						alertMessage("Error fetching users: ", data);
						errorPopDisplayed = true;
					}
				}else{
					//console.log(JSON.stringify(data));
					console.log('updatecallback bout to fire')
					updateCallback(data);
				}
			}

			var user = cb.User();
			user.allUsers('',callback);
			
			if (currentSettings.refresh_time > 0){
				createRefreshTimer(currentSettings.refresh_time);
			}
			else {
				clearInterval(refreshTimer);
				refreshTimer = undefined;
			}

		}

		this.onDispose = function () {
			clearInterval(refreshTimer);
		    refreshTimer = undefined;
		}

		this.onSettingsChanged = function (newSettings) {
			currentSettings = newSettings;
			self.updateNow();
		}
	};

	freeboard.loadDatasourcePlugin({
		"type_name": "clearblade_users",
		"display_name": "Users",
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
			newInstanceCallback(new clearbladeUsersDatasourcePlugin(settings, updateCallback));
		}
	});