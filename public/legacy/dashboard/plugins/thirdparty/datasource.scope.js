var dashboardEventPlugin = function (settings, updateCallback) {

    var self = this;

    var currentSettings = settings;
    var scope = {};

    self.sendData = function (data) {
        scope = data;
        updateCallback(scope);
    }


    self.onSettingsChanged = function (newSettings) {
        currentSettings = newSettings;
    }


    self.updateNow = function (data) {
        scope = data;
    }

    self.onDispose = function () {
    }

}


freeboard.loadDatasourcePlugin({
    "type_name": "dashboardEvent",
    "display_name": "Local Variable",
    "description": "A variable or object stored in the local portal scope",
    settings: [],
    newInstance: function (settings, newInstanceCallback, updateCallback) {
        newInstanceCallback(new dashboardEventPlugin(settings, updateCallback));
    }
});