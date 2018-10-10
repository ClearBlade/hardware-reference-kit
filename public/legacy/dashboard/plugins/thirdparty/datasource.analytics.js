var clearbladeAnalyticsDatasourcePlugin = function (settings, updateCallback) {
var self = this;
		var currentSettings = settings;

		this.updateNow = function () {
			var devToken = JSON.parse(localStorage["ngStorage-cb_novi_dev_token"]);
			var platformUrl = JSON.parse(localStorage["ngStorage-cb_platformURL"]);
			var devInfo = JSON.parse(localStorage["ngStorage-dev_info"]);
			var devEmail = devInfo.email;
			var req_url = platformUrl+'/api/v/2/analytics/eventtotals?'+'query={"scope":{"developer":"'+devEmail+'"},"filter":{"module":"'+currentSettings.module_name+'","action":"'+currentSettings.action+'","id":"'+currentSettings.id+'","interval":'+currentSettings.interval+'}}';
			
			if(window.XMLHttpRequest)
		    {
		        client=new XMLHttpRequest();
		        //alert("request Obj");
		    }
		    else
		    {
		        client=new ActiveXObject("Microsoft.XMLHTTP");
		        //alert("request Obj2");
		    }
		    client.onreadystatechange=function()
		    {
		        if(client.readyState==4){
		            if (client.status==200)
		            {
		                updateCallback(client.responseText);
		            }else{
		                console.log(client.responseText);
		                alert("error");
		            }
		        }
		    };
		    client.open("GET",req_url,true);
		    client.setRequestHeader("Content-type", "application/json");
		    client.setRequestHeader("ClearBlade-DevToken", devToken);
		    client.send(null);
		}

		this.onDispose = function () {
			
		}

		this.onSettingsChanged = function (newSettings) {
			currentSettings = newSettings;
			self.updateNow();
		}
	};
	
	
	freeboard.loadDatasourcePlugin({
		"type_name": "clearblade_analytics_event_totals",
		"display_name": "Analytics: Event Totals",
		"settings": [
			{
				"name": "module_name",
				"display_name": "Module",
				"type": "text",
				"description" : "module: user | collection | messaging | service | push ",
				"required" : true
			},
			{
				"name": "id",
				"display_name": "ID",
				"type": "text",
				"description" : "id: collectionid|userid|topicid|service name| blank if push",
				"required" : false
			},
			{
				"name": "action",
				"display_name": "Action",
				"type": "text",
				"description" : "action: create|password reset|update|dev alter|dev password reset|dev delete|dev read|dev update|read|delete|dev create|execute|dev save|publish|recieve|ios|android|connection|login|logout|disconnect|sent ",
				"required" : true
			},
			{
				"name": "interval",
				"display_name": "Time Interval",
				"type": "text",
				"description" : "A time specified in seconds",
				"required" : false
			}
		],
		newInstance: function (settings, newInstanceCallback, updateCallback) {
			newInstanceCallback(new clearbladeAnalyticsDatasourcePlugin(settings, updateCallback));
		}
	});