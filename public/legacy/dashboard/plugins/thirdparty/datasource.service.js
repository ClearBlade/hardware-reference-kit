var clearbladeServiceDatasourcePlugin = function (settings, updateCallback) {
		
	var self = this;
	var currentSettings = settings;
	var codeName = currentSettings.code_name;
	var errorPopDisplayed = false;

	var refreshTimer;

	self.onDispose = function () {
		clearInterval(refreshTimer);
	}

	self.configure = function(){

		codeName = currentSettings.code_name;

		clearInterval(refreshTimer);
		if(currentSettings.refresh_interval !== undefined && currentSettings.refresh_interval > 0){
			refreshTimer = setInterval(function() {
				self.updateNow();
			}, utils.secToMs(currentSettings.refresh_interval));
		}
	}

	self.onSettingsChanged = function (newSettings) {
		currentSettings = newSettings;
		self.configure();
	}

	self.sendData = function(data){
		var def = $.Deferred();
		var code = cb.Code();

		if(data === undefined){
			data = {};
		}

		code.execute(codeName, data, function(err, resp){
			if(err){
				console.log(resp);
				if(!errorPopDisplayed) {
					alertMessage("Error calling code service: ", resp);
					errorPopDisplayed = true;
				}
				def.reject(resp);
			} else {
				updateCallback(resp);
				def.resolve(resp);
			}
		});
        return def.promise();
	}

	self.updateNow = function(){
		self.sendData(utils.parseJsonObject(currentSettings.default_payload));
	}

	// On load.. configure. Set's interval if present
	self.configure();

};

freeboard.loadDatasourcePlugin({
	"type_name": "clearblade_execute_code",
	"display_name": "Code",
	"description" : "Call a ClearBlade service with parameters. Data payload must be a valid JSON object. ex: { \"key\" : \"value\" } ",
	"settings": [
		{
			"name": "code_name",
			"display_name": "Code Name",
			"type": "text",
			"description" : "Name of the code service which you wish to execute on your system",
			"required" : true
		},
		{
			"name": "refresh_interval",
			"display_name": "Refresh Interval",
			"type": "number",
			"description" : "Send default payload every X seconds. 0 for no interval",
			"default_value" : 0
		},
		{
			"name": "default_payload",
			"display_name": "Default Payload",
			"type": "String",
			"default_value" : "{}",
			"description" : "payload must be a valid JSON object. ex: { \"parameter\" : \"value\" } "
		}
	],
	newInstance: function (settings, newInstanceCallback, updateCallback) {
		newInstanceCallback(new clearbladeServiceDatasourcePlugin(settings, updateCallback));
	}
});