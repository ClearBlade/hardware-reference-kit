var clearbladeCollectionDatasourcePlugin = function (settings, updateCallback) {
	var self = this;

	// Validate settings
	var currentSettings = settings;
	var refreshTimer;
	var errorPopDisplayed = false;
	var currentQuery = generateQuery();

	// Generate a default query to the target collection
	function generateQuery(){
    	return cb.Query({collectionName: currentSettings.collection_name});  
	}

	function createRefreshTimer(interval) {
		if(refreshTimer) {
			clearInterval(refreshTimer);
		}
		refreshTimer = setInterval(function() {
			self.updateNow();
		}, interval);
	}

	var fetchData = function (data) {
		var def = $.Deferred();
		// If no query is specified, use default collection query
		var query = (data === undefined || data.query === undefined) ? generateQuery() : data.query;
		var coll = cb.Collection({collectionName: currentSettings.collection_name});
        coll.fetch(query, function(err, body) {
        	if(err){
                if(!errorPopDisplayed) {
                    alertMessage("Error fetching collection datasource", body);
                    errorPopDisplayed = true;
                }
                def.reject(body);
            }else{
                updateCallback(body);
                def.resolve(body);
            }
        });
        return def.promise();
	}


	var insertData = function (data) {
		var def = $.Deferred();
		var fmtPayload = self.formatPayload(data.data, data.options.schema);
        var coll = cb.Collection({collectionName: currentSettings.collection_name});
        coll.create(fmtPayload, function(err, body) {
            if(err) {
                alertMessage("Error inserting into collection datasource with name '" + currentSettings.collection_name + "': ", body);
                def.reject(body);
            } else {
            	delete data.query; //we don't want to pass the query to our fetch call
            	fetchData(data); // Update with existing options.. eg: selected page
                def.resolve();
            }
        });
		return def.promise();
	}

	var updateData = function (data) {
		var def = $.Deferred();
		var fmtPayload = self.formatPayload(data.data, data.options.schema);
        if(data.query) {
            try {
                var coll = cb.Collection({collectionName: currentSettings.collection_name});
                coll.update(data.query, fmtPayload, function(err, body) {
                    if(err) {
                        alertMessage("Error updating collection datasource with name '" + currentSettings.collection_name + "': ", body);
                        def.reject(body);
                    } else {
                    	delete data.query; //we don't want to pass the query to our fetch call
                    	fetchData(data); // Update with existing options.. eg: selected page
                        def.resolve();
                    }
                });
            } catch(e) {
                console.error("Error: Unable to update collection. Please check the outgoing parser for " + currentSettings.collection_name);
                console.error(e);
                def.reject(e);
            }
        } else {
            console.warn("No query parameter supplied for updating a collection. Please check the outgoing parser for " + currentSettings.collection_name);
            def.reject();
        }

        return def.promise();
	}

	var deleteData = function (data) {
		var def = $.Deferred();
        if(data.query) {
            try {
                var coll = cb.Collection({collectionName: currentSettings.collection_name});
                coll.remove(data.query, function(err, body) {
                    if(err) {
                        alertMessage("Error deleting record in collection datasource with name '" + currentSettings.collection_name + "': ", body);
                        def.reject(body);
                    } else {
                    	delete data.query; //we don't want to pass the query to our fetch call
                    	fetchData(data); // Update with existing options.. eg: selected page (NOTE: js grid defaults to page 1 after delete. Need workaround)
                        def.resolve();
                    }
                });
            } catch(e) {
                console.error("Error: Unable to remove item from collection. Please check the outgoing parser for " + currentSettings.collection_name);
                console.error(e);
                def.reject(e);
            }
        } else {
            console.warn("No query parameter supplied for deleting a row in a collection. Please check the outgoing parser for " + currentSettings.collection_name);
            def.reject();
        }

		return def.promise();
	}

	this.clearQuery = function(){
		currentQuery = generateQuery()
	}

	this.formatPayload = function(data, schema){
		var fmtData = {};
		// Remove uneditable attributes
		if(data.item_id !== undefined){delete data.item_id;}
		// Convert attributes to match column schema
		for(var i = 0, len = schema.length; i < len; i++){
			if(data[schema[i].name] !== undefined && data[schema[i].name] !== ""){
				fmtData[schema[i].name] = utils.convertString(data[schema[i].name], schema[i].type);
			}
		}
		return fmtData;
	}

	this.sendData = function(data){
		//NOTE: data should only come from an outgoing parser or widgets targeting collection
		if (data) {
			if(data.method) {
				switch(data.method) {
					case utils.constants.INSERT_METHOD:
						return $.when(insertData(data));
					case utils.constants.UPDATE_METHOD:
						return $.when(updateData(data));
					case utils.constants.DELETE_METHOD:
                        return $.when(deleteData(data));
                    case utils.constants.PAGE_METHOD:
                        return $.when(fetchData(data));
				}
			}
		} else {
            if (currentSettings.refresh_time > 0){
                createRefreshTimer(currentSettings.refresh_time);
            }
            else {
                clearInterval(refreshTimer);
                refreshTimer = undefined;
            }

            return $.when(fetchData());
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
	"type_name": "clearblade_collection",
	"display_name": "Collection",
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
			"default_value": 5000
		}
	],
	newInstance: function (settings, newInstanceCallback, updateCallback) {
		newInstanceCallback(new clearbladeCollectionDatasourcePlugin(settings, updateCallback));
	}
});