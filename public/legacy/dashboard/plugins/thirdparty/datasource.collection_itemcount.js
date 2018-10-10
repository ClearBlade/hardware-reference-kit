var clearbladeCollectionItemCountDatasourcePlugin = function (settings, updateCallback) {
    var self = this;
    var currentSettings = settings;
    var refreshTimer;
    var errorPopDisplayed = false;

    var coll = cb.Collection({collectionName: currentSettings.collection_name});

    function createRefreshTimer(interval) {
        if(refreshTimer) {
            clearInterval(refreshTimer);
        }

        refreshTimer = setInterval(function() {
            self.updateNow();
        }, interval);
    }

    this.sendData = function(){
        coll.count(undefined, function(err, body) {
            if(err) {
                alertMessage("Error getting record count in collection '" + currentSettings.collection_name + "': ", body);
            } else {
                updateCallback(body.count);
            }
        });
    }

    this.updateNow = function(){
        self.sendData();
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
    "type_name": "clearblade_collection_count",
    "display_name": "Collection Item Count",
    "settings": [
        {
            "name": "collection_name",
            "display_name": "Collection Name",
            "type": "text",
            "description" : "Name of collection",
            "required" : true
        },
        {
            "name"         : "refresh_time",
            "display_name" : "Refresh Time",
            "type"         : "text",
            "description"  : "In milliseconds",
            "required"	   : false,
            "default_value": 0
        }
    ],
    newInstance: function (settings, newInstanceCallback, updateCallback) {
        newInstanceCallback(new clearbladeCollectionItemCountDatasourcePlugin(settings, updateCallback));
    }
});