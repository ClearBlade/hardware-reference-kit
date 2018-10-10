var edgeMetricsDatasourcePlugin = function (settings, updateCallback) {
    var self = this;
    var currentSettings = settings;
    var refreshTimer;
    var errorPopDisplayed = false;
    this.edgeName = "";

    var someObj = {};

    if (typeof currentSettings.edge_name === "string") {
        this.edgeName = currentSettings.edge_name;
    }


    function createRefreshTimer(interval) {
        if (refreshTimer) {
            clearInterval(refreshTimer);
        }
        refreshTimer = setInterval(function () {
            self.updateNow();
        }, interval);
    }

    this.updateNow = function () {

        if (this.edgeName === "") {
            //no edge set, let's not do anything
            console.log('edge_name doesn\'t seem to be set, not doing anything');
            return;
        }

        var metrics = cb.Metrics();
        var query = cb.Query();
        query.equalTo('name', this.edgeName);
        metrics.setQuery(query);

        function getStats () {
            var promise = jQuery.Deferred();

            metrics.getStatistics(function (err, data) {
                if (err) {
                    promise.reject(err);
                } else {
                    promise.resolve(data.DATA);
                }
            });

            return promise.promise();
        }

        function getStatsHistory () {
            var promise = jQuery.Deferred();

            metrics.getStatisticsHistory(function (err, data) {
                if (err) {
                    promise.reject(err);
                } else {
                    promise.resolve(data.DATA);
                }
            });

            return promise.promise();
        }

        function getDBConns () {
            var promise = jQuery.Deferred();

            metrics.getDBConnections(function (err, data) {
                if (err) {
                    promise.reject(err);
                } else {
                    promise.resolve(data.DATA);
                }
            });

            return promise.promise();
        }

        function getLogs () {
            var promise = jQuery.Deferred();

            metrics.getLogs(function (err, data) {
                if (err) {
                    promise.reject(err);
                } else {
                    promise.resolve(data.DATA);
                }
            });

            return promise.promise();
        }

        $.when(getStats(), getStatsHistory(), getDBConns(), getLogs()).then(
            function(stats, history, dbconns, logs) {
                var edgeKey = cb.systemKey + ":" + this.edgeName;
                var returnObj = {
                    stats: stats[edgeKey],
                    history: history[edgeKey],
                    dbconns: dbconns[edgeKey],
                    logs: logs[edgeKey]
                };
                updateCallback(returnObj);
            }.bind(self), function (err) {
                if(!errorPopDisplayed) {
                    alertMessage("Error getting metrics: ", err);
                    errorPopDisplayed = true;
                }
            }
        );

    };

    this.onDispose = function () {
        clearInterval(refreshTimer);
        refreshTimer = undefined;
    };

    this.onSettingsChanged = function (newSettings) {
        currentSettings = newSettings;
        if (typeof currentSettings.edge_name === "string") {
            this.edgeName = currentSettings.edge_name;
        } else {
            //reset edge name, means this setting was changed to a data source, so it should get set somewhere else
            this.edgeName = "";
        }
        self.updateNow();
    };

    this.onCalculatedValueChanged = function (settingName, newValue) {
        this.edgeName = newValue;
        self.updateNow();
    };

    createRefreshTimer(currentSettings.refresh_time);
};

freeboard.loadDatasourcePlugin({
   "type_name": "edge_metrics",
    "display_name": "Edge Metrics",
    "settings": [
        {
            "name": "refresh_time",
            "display_name": "Refresh Time",
            "type": "text",
            "description": "In milliseconds",
            "default_value": 5000
        }, {
            "name": "edge_name",
            "display_name": "Edge Name",
            "type": "data",
            "description": "Name of the edge you would like to access",
            "incoming_parser": true
        }
    ],
    newInstance: function (settings, newInstanceCallback, updateCallback) {
       newInstanceCallback(new edgeMetricsDatasourcePlugin(settings, updateCallback));
    }
});