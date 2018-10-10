freeboard.loadDatasourcePlugin({
	"type_name"   : "messageTopic",
	"display_name": "Message Topic",
	"description" : "A topic streaming payloads over a websocket",

	

	"settings"    : [
		{
			name         : "topic_name",
			display_name : "Message Topic",
			type         : "text",
			default_value: "device/tool1",
			description  : "Set your message topic"
		}
	],
	newInstance   : function(settings, newInstanceCallback, updateCallback) {
		newInstanceCallback(new messageTopicPlugin(settings, updateCallback));
	}
});

var messageTopicPlugin = function(settings, updateCallback)
{

	var self = this;
	var currentSettings = settings;
	var lastMessage = {};


    var connectCallback = function(err, data) {
    	if(err) {
    		console.log("Error connecting to messaging: " + JSON.stringify(data));
    	} else {
    		console.log("Connected to messaging");
    		messaging.subscribe(currentSettings.topic_name, {}, stateMessageReceived); 
    	}   
    };

	var isSSL = window.location.protocol === "https:";
	// Create a new messaging object for each topic datasource
    var messaging = cb.Messaging({"useSSL":isSSL}, connectCallback);
    console.log("Connecting to messaging");

    var count = 1; 
    var time  = (new Date).getTime();    
    var historyCallback = function(err, data){
    	if(err){
    		if(data && data.indexOf('not authorized')) {
			    alertMessage("You need to authorize this user in 'Auth > Roles > Message History > Edit' to read the messaging history");
			} else {
			    alertMessage("Error fetching topic history for '" + currentSettings.topic_name + "'", data);
			}
    	}else{
    		if(typeof data !== 'undefined' && data.constructor === Array && data.length > 0){
    			lastMessage = data[0].message;
    		}
    		updateCallback(lastMessage);
    	}
    }

    var getMessageHistory = function () {
    	messaging.getMessageHistory(currentSettings.topic_name, time, count, historyCallback);	
    }
	
	var stateMessageReceived = function(message) {
	 	updateCallback(message);
	}

	self.sendData = function(data){
		try {
			messaging.publish(currentSettings.topic_name, data);	
		} catch(e) {
			console.log('ERROR PUBLISHING TO TOPIC');
			console.log(e);
		}
	}

	self.onSettingsChanged = function(newSettings)
	{

		messaging.unsubscribe(currentSettings.topic_name, {});
		currentSettings = newSettings;
		messaging.subscribe(currentSettings.topic_name, {}, stateMessageReceived); 
		getMessageHistory();
	}


	self.updateNow = function() {}

	self.onDispose = function()
	{
		messaging.unsubscribe(currentSettings.topic_name, {});
	}

	getMessageHistory();

}



