var default_start_time = -1;

freeboard.loadDatasourcePlugin({
	"type_name"   : "message_history",
	"display_name": "Message History",
	"description" : "Retrieves messaging history for a topic",

	

	"settings"    : [
		{
			name         : "topic_name",
			display_name : "Message Topic",
			type         : "text",
			default_value: "device/tool1",
			description  : "Set your message topic",
			required	 : true
		},
		{
			name         : "message_count",
			display_name : "Message Count",
			type         : "number",
			default_value: 25,
			description  : "Set your message count",
			required	 : true
		},
		{
			name         : "start_time",
			display_name : "Start Time",
			type         : "number",
			description  : "Start time in 'epoch timestamp milliseconds' format. Default to -1 in order to retrieve latest",
			default_value: default_start_time
		},
		{
			"name"         : "refresh_time",
			"display_name" : "Refresh Time",
			"type"         : "text",
			"description"  : "In milliseconds",
			"default_value": 5000
		}

	],
	newInstance   : function(settings, newInstanceCallback, updateCallback) {
		newInstanceCallback(new messageHistoryPlugin(settings, updateCallback));
	}
});

var messageHistoryPlugin = function(settings, updateCallback)
{

	var self = this;
	var currentSettings = settings;
	var refreshTimer;
	var errorPopDisplayed = false;

	var connectCallback = function(err, data) {
    	if(err) {
    		console.log("Error connecting to messaging: " + JSON.stringify(data));
    	} else {
    		console.log("Connected to messaging");
    	}
    };

    // Create a new messaging object for each topic datasource
    var messaging = cb.Messaging({"useSSL":false}, connectCallback);
    console.log("Connecting to messaging");

	function createRefreshTimer(interval) {
		if(refreshTimer) {
			clearInterval(refreshTimer);
		}

		refreshTimer = setInterval(function() {
			self.updateNow();
		}, interval);
	}



	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
		self.updateNow();
	}


	self.updateNow = function()
	{
		var topic = currentSettings.topic_name;
		var count = currentSettings.message_count;
		var time  = currentSettings.start_time === default_start_time ? new Date().getTime() : currentSettings.start_time;

		var callback = function(err, data){
			if(err){
				if(!errorPopDisplayed) {
					alertMessage("Error in retreiving messaging history: ", data);
					errorPopDisplayed = true;
				}
			}else{
				console.log("Retreived messaging history");
				updateCallback(data);
			}
		}
		messaging.getMessageHistory(topic, time, count, callback);

	}

	self.onDispose = function()
	{

		 clearInterval(refreshTimer);
		 refreshTimer = undefined;
		
	}


	createRefreshTimer(currentSettings.refresh_time);
}



