var clearbladeCollectionColumnsDatasourcePlugin = function (settings, updateCallback) {
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

    this.sendData = function(){

        //let's instantiate the collection object here so that we always use the current setting for collection_name
        var coll = cb.Collection({collectionName: currentSettings.collection_name});

        var callback = function(err, data){
            if(err){
                console.log(err);
                if(!errorPopDisplayed) {
                    alertMessage("Error fetching collection datasource: ", data);
                    errorPopDisplayed = true;
                }
            }else{
                updateCallback(data);
            }
        }

        coll.columns(callback);

        if (currentSettings.refresh_time > 0){
            createRefreshTimer(currentSettings.refresh_time);
        }
        else {
            clearInterval(refreshTimer);
            refreshTimer = undefined;
        }
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
    "type_name": "clearblade_collection_columns",
    "display_name": "Collection Columns",
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
            "required"		: false,
            "default_value": 0
        }

    ],
    newInstance: function (settings, newInstanceCallback, updateCallback) {
        newInstanceCallback(new clearbladeCollectionColumnsDatasourcePlugin(settings, updateCallback));
    }
});