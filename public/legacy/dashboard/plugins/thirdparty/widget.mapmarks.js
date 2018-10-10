freeboard.addStyle('.gm-style-cc a', "text-shadow:none;");

var googleMapWidget1 = function (settings, updateCallback) {
    var self = this;
    var currentSettings = settings;
    var map;
    var apiKey = currentSettings.apiKey;
    var ele;
    var locReturn = {};
    var url = "";
    var locationSource;

    self.getValue = function(){
        return locReturn;
    }

    self.initializeMap = function() { 

        var locationData = {};
        var heatmapData = [];
        var bounds = new google.maps.LatLngBounds();

        if(locationSource === undefined){
            // If a source has not been set return ... if dynamic must wait for onCalculatedValue
            return;
        }

        // Parse location source... expecting  { "markers" : [ { "lat": 11.11 , "lng": -33.33 }, { lat/lng } , { lat/lng }, ... ] }
        try{
            locationData = JSON.parse(locationSource);
        } catch (e){
            locationData = locationSource;
        }

        // Some validation
        if(locationData === undefined || locationData.markers === undefined){
            console.warn("Map source invalid");
            return;
        }

        if(locationData.markers[0] === undefined){
            console.warn("Map source invalid. Must provide at least one marker");
            return;
        }

        var defaultZoom = (locationData.zoom !== undefined) ? locationData.zoom : 16;

        // Initialize the map element using the first coordinate
        var mapOptions = {
            zoom: defaultZoom,
            center: locationData.markers[0],
            mapTypeId: google.maps.MapTypeId.ROADMAPX
        }
        map = new google.maps.Map(ele, mapOptions);

        // For each coordinate, extends map bounds
        for(var i = 0, len = locationData.markers.length; i < len; i++){
            // If a standard map, add marker to map
            if(currentSettings.map_type === "standardMap"){
                var marker = new google.maps.Marker({
                  position: locationData.markers[i],
                  map: map
                });
            }
            // Gather google Lat/Lng for heatmap points
            heatmapData.push(new google.maps.LatLng(locationData.markers[i].lat, locationData.markers[i].lng));
            // Extend bounds to include marker
            bounds.extend(locationData.markers[i]);
        }

        // Re-position map to contain all markers ... unless zoom specified by user
        if(locationData.zoom === undefined) {
            map.fitBounds(bounds);
        }

        // If heatmap, render layer with gathered heatmap data
        if(currentSettings.map_type === "heatMap"){
            var heatmap = new google.maps.visualization.HeatmapLayer({
              data: heatmapData,
              map: map
            });
            heatmap.setMap(map);
        }

        // Add map click listener to add marker and callback position to DS
        map.addListener('click', function(event){
            var latLng = event.latLng;
            new google.maps.Marker({
                position: latLng,
                map: map
            });
            locReturn = {"lat":latLng.lat(), "lng":latLng.lng() };
            updateCallback(locReturn, 'location_source')
        });
    }

    self.render = function (element) {
        ele = element;
        url = "https://maps.googleapis.com/maps/api/js?v=3.exp&key=" + apiKey + "&libraries=visualization";
        mapLoader(url, self.initializeMap);
    }

    self.onSettingsChanged = function (newSettings) {

        // Workaround for source being reset for static datatype
        if((newSettings.location_source === undefined || newSettings.location_source === "") && (currentSettings.location_source !== undefined && currentSettings.location_source !== "")){
            newSettings.location_source = currentSettings.location_source;
        }
        
        currentSettings = newSettings;
        
        if(currentSettings._datatype == "static"){
            locationSource = currentSettings.location_source;
        } 
        
        // Attempt map draw
        if(map !== undefined){
            mapLoader(url, self.initializeMap);
        }
    }

    self.onCalculatedValueChanged = function (settingName, newValue) {

        if(newValue === locationSource){
            // No new location data, no need to redraw map
            return;
        }

        locationSource = newValue;
        mapLoader(url, self.initializeMap);
    }

    self.onDispose = function () {
    }

    self.getHeight = function () {
        return utils.widget.calculateHeight(4);
    }

    this.onSettingsChanged(settings);
};

freeboard.loadWidgetPlugin({
    type_name: "google_map1",
    display_name: "Google Map",
    fill_size: true,
    settings: [
        {
        name        : "map_name",
        display_name: "Map Name",
        type        : "text",
        required    : true
        },
        {
        name         : "map_type",
        display_name : "Map Type",
        type         : "option",
        options      : [
                {
                    "name" : "Simple Map",
                    "value": "standardMap"
                },
                {
                    "name" : "Heat Map",
                    "value": "heatMap"
                }
            ]
        },
        {
            name: "location_source",
            display_name: "Location Source",
            type: "data",
            multi_input: true,
            incoming_parser: true,
            outgoing_parser: true
        },
        {
            name: "apiKey",
            display_name: "API Key",
            type: "text",
            required: true
        },
        {
            name          : "container_width",
            display_name  : "Container width",
            type          : "integer",
            description   : "Width of your widget's container as a percentage. Useful when juxtaposing widgets.",
            default_value : "100",
            required      : true
        }
    ],
    newInstance: function (settings, newInstanceCallback) {
        newInstanceCallback(new googleMapWidget1(settings));
    }
});