freeboard.loadWidgetPlugin({
 
	"type_name"   : "barGraph",
	"display_name": "Bar Graph",
    "description" : "A bar graph generated from input data",
    "external_scripts" : [
		"https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.5/d3.min.js"
	],
	"settings"    : [
		{
	        name         : "orientation",
	        display_name : "Orientation",
	        type         : "option",
	        options      : [
                {
                    "name" : "Vertical",
                    "value": "vertical"
                },
                {
                    "name" : "Horizontal",
                    "value": "horizontal"
                }
            ]
	    },
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
			"name"        : "sizeInBlocks",
			"display_name": "Size in Blocks",
			"description" : "Blocks are 60px, fractions are not allowed. eg: 1.5 will be cast to 2",
			"type"        : "number",
			// Fractions are allowed. Use this to set the appropriate height for the visualiation.
			// This value is in blocks (which is about 60px each).
			"default_value" : 4
		},
		{
			name        : "rangeTitle",
			display_name: "Range Title",
			type        : "text",
			"default_value" : ""
		},
		{
			name        : "domainTitle",
			display_name: "Domain Title",
			type        : "text",
			"default_value" : ""
		},
		{
			name            : "title_color",
			display_name    : "Title Color",
			type            : "text",
			"default_value" : "#5EA7CF"
		},
		{
			name            : "axis_color",
			display_name    : "Axis Color",
			type            : "text",
			"default_value" : "#CCCCCC"
		},
		{
			name            : "bar_color",
			display_name    : "Bar Color",
			type            : "text",
			"default_value" : "#5EA7CF"
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
		newInstanceCallback(new barGraph(settings, updateCallback));
	}
});


var barGraph = function(settings, updateCallback)
{

	var self = this;
	var currentSettings = settings;
	var blockSize = 60;
	var formattedData = [];

	var $graphContainer = $("<div>").addClass("barGraphContainer");
	var $titleElement = $("<h2>")
		.addClass("section-title")
		.css("text-align", "center");

	var svg = d3.select($graphContainer[0]).append("svg");

	var graphData;

	var loadGraph = function(){

		$graphContainer.html("");
		svg.remove();

		// set the dimensions of the canvas
		var margin = {top: 20, right: 25, bottom: 70, left: 55},
		    width = $graphContainer.width() - margin.left - margin.right,
		    height = $graphContainer.height() - margin.top - margin.bottom;

		// add the SVG element
		svg = d3.select($graphContainer[0]).append("svg")
		    .attr("width", width + margin.left + margin.right)
		    .attr("height", height + margin.top + margin.bottom)
		  	.append("g")
		    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

		var data = utils.graph.formatInput(graphData);

		if(currentSettings.orientation === "vertical"){

			// set the ranges
			var x = d3.scale.ordinal().rangeRoundBands([0, width], .05);
			var y = d3.scale.linear().range([height, 0]);

			// define the axis
			var xAxis = d3.svg.axis()
			    .scale(x)
			    .orient("bottom")

			var yAxis = d3.svg.axis()
			    .scale(y)
			    .orient("left")
			    .ticks(10);

			// scale the range of the data
			x.domain(data.map(function(d) { return d.x; }));
			y.domain([0, d3.max(data, function(d) { return d.y; })]);

			// add axis
			svg.append("g")
			  .attr("class", "x axis")
			  .attr("transform", "translate(0," + height + ")")
			  .call(xAxis)
			.selectAll("text")
			  .style("text-anchor", "middle")
			  .attr("y", "15");

			svg.append("text")      // text label for the x axis
				.attr("class", "axisLabel")
		        .attr("x", (width / 2) )
		        .attr("y", (height + 35) )
		        .style("text-anchor", "middle")
		        .text(currentSettings.domainTitle);

			svg.append("g")
			  .attr("class", "y axis")
			  .call(yAxis)
			.append("text")
				.attr("class", "axisLabel")
				.attr("transform", "rotate(-90)")
				.attr("y", 5)
				.attr("dy", ".71em")
				.style("text-anchor", "end")
				.text(currentSettings.rangeTitle);

			// Add bar chart
			svg.selectAll("bar")
			  .data(data)
			.enter().append("rect")
			  .attr("class", "bar")
			  .attr("x", function(d) { return x(d.x); })
			  .attr("width", x.rangeBand())
			  .attr("y", function(d) { return y(d.y); })
			  .attr("height", function(d) { return height - y(d.y); });

		}

		if(currentSettings.orientation === "horizontal"){

			// set the range
			var x = d3.scale.ordinal().rangeRoundBands([0, height], .05);
			var y = d3.scale.linear().range([0, width]);

			// define the axis
			var xAxis = d3.svg.axis()
			    .scale(x)
			    .orient("left")

			var yAxis = d3.svg.axis()
			    .scale(y)
			    .orient("bottom")
			    .ticks(10);

			// scale the range of the data
			x.domain(data.map(function(d) { return d.x; }));
			y.domain([0, d3.max(data, function(d) { return d.y; })]);

			// add axis
			svg.append("g")
			  .attr("class", "x axis")
			  .attr("transform", "translate(0," + height + ")")
			  .call(yAxis)
			.selectAll("text")
			  .style("text-anchor", "middle")
			  .attr("y", "15");

			svg.append("g")
			  .attr("class", "y axis")
			  .call(xAxis);

			var max_n = 0;
			for (var d in data) {
				max_n = Math.max(data[d].y, max_n);
			}
		
			var dx = width / max_n;
			var dy = height / data.length;
	
			// bars
			var bars = svg.selectAll("bar")
				.data(data)
				.enter()
				.append("rect")
				.attr("class", function(d, i) {return "bar " + d.x;})
				.attr("x", function(d, i) {return 0;})
				.attr("y", function(d, i) {return (dy*i + 1);})
				.attr("width", function(d, i) {return dx*d.y})
				.attr("height", (dy - 2))
	
			// labels
			var text = svg.selectAll("text")
				.data(data)
				.enter()
				.append("text")
				.attr("class", function(d, i) {return "label " + d.x;})
				.attr("x", 5)
				.attr("y", function(d, i) {return dy*i + 15;})
				.text( function(d) {return d.x + " (" + d.y  + ")";})
				.attr("font-size", "15px")
				.style("font-weight", "bold");

			svg.append("text")      // text label for the x axis
				.attr("class", "axisLabel")
		        .attr("x", (width / 2) )
		        .attr("y", (height + 35) )
		        .style("text-anchor", "middle")
		        .text(currentSettings.rangeTitle);

		    svg.append("text")
				.attr("class", "axisLabel")
				.attr("transform", "rotate(-90)")
				.attr("y", -55)
				.attr("x", -(height / 2))
				.attr("dy", 10)
				.style("text-anchor", "middle")
				.text(currentSettings.domainTitle);
		}

		// Apply custom styles

		svg.selectAll(".bar").style({ "fill": currentSettings.bar_color });
		svg.selectAll(".axis , .axis text").style({ "fill": currentSettings.axis_color });
		svg.selectAll(".axis line, .axis path").style({"stroke": currentSettings.axis_color})
		svg.selectAll("text.axisLabel").style({ "fill": currentSettings.title_color });
		$titleElement.css("color", currentSettings.title_color);
	}

	self.render = function(containerElement)
	{
		$(containerElement).html("");
		$titleElement.text(currentSettings.graphTitle);
		$graphContainer.css({
			"width" : "100%",
			"height": (blockSize * currentSettings.sizeInBlocks) + "px"
		});

		$(containerElement).append([$titleElement, $graphContainer]);

		// Give time for dom to render graph container div
		setTimeout(function(){
			loadGraph();
			freeboard.resize();
		}, 300);
		
	}

	self.getHeight = function()
	{
		var blocks = currentSettings.sizeInBlocks ? currentSettings.sizeInBlocks : 4.0;
		return utils.widget.calculateHeight(blocks);
	}


	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
		currentSettings.sizeInBlocks = utils.widget.calculateHeight(currentSettings.sizeInBlocks);
		self.render();
	}


	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		graphData = newValue;
		self.render();
	}

	self.getValue = function(){
        return graphData;
    }

	self.onDispose = function()
	{

	}
}