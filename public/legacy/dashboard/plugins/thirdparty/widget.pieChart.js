freeboard.loadWidgetPlugin({
 
	"type_name"   : "pieChart",
	"display_name": "Pie Chart",
    "description" : "A pie chart generated from input data",
    "external_scripts" : [
		"https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.5/d3.min.js"
	],
	"settings"    : [
		{
			name        : "graphTitle",
			display_name: "Graph Title",
			type        : "text"
		},
		{
			name: "data",
			display_name: "Data",
			type: "data",
			//force_data: "dynamic",
			multi_input: true,
			incoming_parser: true,
			description: "expected format: [ { \"x\": 1, \"y\": 2 }, { \"x\": 2, \"y\": 4 }, { \"x\": 3, \"y\": 8 } ] "
		},
		{
			name: "include_legend",
			display_name: "Include Legend",
			type: "boolean",
			default_value : true
		},
		{
			"name"        : "sizeInBlocks",
			"display_name": "Size in Blocks",
			"description" : "Blocks are 60px, fractions are not allowed. eg: 1.5 will be cast to 2",
			"type"        : "number",
			// Fractions are allowed. Use this to set the appropriate height for the visualiation.
			// This value is in blocks (which is about 60px each).
			"default_value" : 4
		},
		{
			"name" : "colors",
			display_name : "Slice Colors",
			type : "text",
			description : "Array of slice colors: [\"#FFFFFF\", \"white\"]  Note: If more slices than colors, colors will be reused. (leave blank for 20 random colors)"
		},
		{
			"name" : "label_color",
			display_name : "Label Color",
			default_value : "#000000",
			type : "text"
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


	newInstance   : function(settings, newInstanceCallback, updateCallback)
	{
		newInstanceCallback(new pieChart(settings, updateCallback));
	}
});


var pieChart = function(settings, updateCallback)
{
	var currentSettings = settings;
	var formattedData = [];

	var $graphContainer = $("<div>").addClass("pieChartContainer");
	var $titleElement = $("<h2>")
		.addClass("section-title")
		.css("text-align", "center");
	var $keyTable = $("<div>").css({"display":"block", "position": "absolute", "bottom": "20px", "overflow": "auto", "padding": "5px", "background": "rgba(0,0,0,0.30)"});


	var graphData;
	var svg = d3.select($graphContainer[0]).append("svg");
	var loadGraph = function(){

		$graphContainer.html("");
		svg.remove();

		svg = d3.select($graphContainer[0]).append("svg");

		var r, parsedColors, color, data, vis, pie, arc, shift, width;

		parsedColors = utils.parseJsonArray(currentSettings.colors);
		color = parsedColors.length ? d3.scale.ordinal().range(parsedColors) : d3.scale.category20c();
		data = utils.graph.formatInput(graphData);
		width = $graphContainer.width();
		svg
			.attr("width", width)
			.attr("height", width);
		r = (0.35)*(width);	
		shift = r + (0.10)*(width);

		vis = svg.data([data]).append("svg:g").attr("transform", "translate(" + shift + "," + r + ")");
		pie = d3.layout.pie().value(function(d){return d.y;});
		arc = d3.svg.arc().outerRadius(r);

		$keyTable.html("");
		if(currentSettings.include_legend)
			var displayedKeys = [];
		// select paths, use arc generator to draw
		var arcs = vis.selectAll("g.slice").data(pie).enter()
			.append("svg:g")
				.attr("class", "slice");
				arcs.append("svg:path")
		    		.attr("fill", function(d, i){
				        return color(i);
				    })
			    .attr("d", function (d) {
			        return arc(d);
			    });

		// add the text
		arcs.append("svg:text").attr("transform", function(d){
					d.innerRadius = 0;
					d.outerRadius = r;
		    return "translate(" + arc.centroid(d) + ")";}).attr("text-anchor", "middle").text( function(d, i) {
		    	if(currentSettings.include_legend){
			    	if(displayedKeys.indexOf(data[i].x) == -1){
			    		var $key = $("<li>")
				    	var $colorSwatch = $("<span>").css({"display":"inline-block", "width":"20px", "height":"20px", "background": color(i)});
				    	var $label = $("<span>").text(data[i].x).css({"color": currentSettings.label_color,"display": "inline-block", "vertical-align": "top", "margin-left":"5px","line-height":"20px"});
				    	$key.append([$colorSwatch, $label]);
				    	$keyTable.css({
				    		"max-height": $graphContainer.height() * 0.60, 
				    		"right": width * 0.30
				    		})
				    		.append($key);
				    	displayedKeys.push(data[i].x);
			    	}
			    	return;
			    } else {
			    	$keyTable.css("display","none");
					return data[i].x;
			    }
			});
		
		svg.selectAll(".slice text").style({ "fill": currentSettings.label_color });
		$titleElement.css("color", currentSettings.label_color);  	
	}

	this.render = function(containerElement)
	{
		$(containerElement).html("");
		$titleElement.html(currentSettings.graphTitle);
		$graphContainer.css({
			"width" : "100%"
		});

		$keyTable.html("");
		$(containerElement).append([$titleElement, $graphContainer, $keyTable]);

		// Give time for dom to render graph container div
		setTimeout(function(){
			loadGraph();
		}, 300);
		
	}


	this.getHeight = function()
	{
		var blocks =  currentSettings.sizeInBlocks ? currentSettings.sizeInBlocks : 4.0;
		return utils.widget.calculateHeight(blocks);
	}

	this.getValue = function()
	{
		return graphData;
	}

	this.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
		currentSettings.sizeInBlocks = utils.widget.calculateHeight(currentSettings.sizeInBlocks);
		this.render();
	}


	this.onCalculatedValueChanged = function(settingName, newValue)
	{
		graphData = newValue;
		this.render();
	}


	this.onDispose = function()
	{

	}
	
	loadGraph();
}