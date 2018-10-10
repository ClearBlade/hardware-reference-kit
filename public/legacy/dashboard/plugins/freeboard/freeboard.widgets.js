// ┌────────────────────────────────────────────────────────────────────┐ \\
// │ F R E E B O A R D                                                  │ \\
// ├────────────────────────────────────────────────────────────────────┤ \\
// │ Copyright © 2013 Jim Heising (https://github.com/jheising)         │ \\
// │ Copyright © 2013 Bug Labs, Inc. (http://buglabs.net)               │ \\
// ├────────────────────────────────────────────────────────────────────┤ \\
// │ Licensed under the MIT license.                                    │ \\
// └────────────────────────────────────────────────────────────────────┘ \\

(function () {
	var SPARKLINE_HISTORY_LENGTH = 100;
	var SPARKLINE_COLORS = ["#FF9933", "#FF0000", "#B3B4B4", "#6B6B6B", "#28DE28", "#13F7F9", "#E6EE18", "#C41204", "#CA3CB8", "#0B1CFB"];

    function easeTransitionText(newValue, textElement, duration) {

		var currentValue = $(textElement).text();

        if (currentValue == newValue)
            return;

        if ($.isNumeric(newValue) && $.isNumeric(currentValue)) {
            var numParts = newValue.toString().split('.');
            var endingPrecision = 0;

            if (numParts.length > 1) {
                endingPrecision = numParts[1].length;
            }

            numParts = currentValue.toString().split('.');
            var startingPrecision = 0;

            if (numParts.length > 1) {
                startingPrecision = numParts[1].length;
            }

            jQuery({transitionValue: Number(currentValue), precisionValue: startingPrecision}).animate({transitionValue: Number(newValue), precisionValue: endingPrecision}, {
                duration: duration,
                step: function () {
                    $(textElement).text(this.transitionValue.toFixed(this.precisionValue));
                },
                done: function () {
                    $(textElement).text(newValue);
                }
            });
        }
        else {
            $(textElement).text(newValue);
        }
    }

	function addSparklineLegend(element, legend) {
		var legendElt = $("<div class='sparkline-legend'></div>");
		for(var i=0; i<legend.length; i++) {
			var color = SPARKLINE_COLORS[i % SPARKLINE_COLORS.length];
			var label = legend[i];
			legendElt.append("<div class='sparkline-legend-value'><span style='color:" +
							 color + "'>&#9679;</span>" + label + "</div>");
		}
		element.empty().append(legendElt);

		freeboard.addStyle('.sparkline-legend', "margin:5px;");
		freeboard.addStyle('.sparkline-legend-value',
			'color:white; font:10px arial,san serif; float:left; overflow:hidden; width:50%;');
		freeboard.addStyle('.sparkline-legend-value span',
			'font-weight:bold; padding-right:5px;');
	}

	function addValueToSparkline(element, value, legend) {
		var values = $(element).data().values;
		var valueMin = $(element).data().valueMin;
		var valueMax = $(element).data().valueMax;
		if (!values) {
			values = [];
			valueMin = undefined;
			valueMax = undefined;
		}

		var collateValues = function(val, plotIndex) {
			if(!values[plotIndex]) {
				values[plotIndex] = [];
			}
			if (values[plotIndex].length >= SPARKLINE_HISTORY_LENGTH) {
				values[plotIndex].shift();
			}
			values[plotIndex].push(Number(val));

			if(valueMin === undefined || val < valueMin) {
				valueMin = val;
			}
			if(valueMax === undefined || val > valueMax) {
				valueMax = val;
			}
		}

		if(_.isArray(value)) {
			_.each(value, collateValues);
		} else {
			collateValues(value, 0);
		}
		$(element).data().values = values;
		$(element).data().valueMin = valueMin;
		$(element).data().valueMax = valueMax;

		var tooltipHTML = '<span style="color: {{color}}">&#9679;</span> {{y}}';

		var composite = false;
		_.each(values, function(valueArray, valueIndex) {
			$(element).sparkline(valueArray, {
				type: "line",
				composite: composite,
				height: "100%",
				width: "100%",
				fillColor: false,
				lineColor: SPARKLINE_COLORS[valueIndex % SPARKLINE_COLORS.length],
				lineWidth: 2,
				spotRadius: 3,
				spotColor: false,
				minSpotColor: "#78AB49",
				maxSpotColor: "#78AB49",
				highlightSpotColor: "#9D3926",
				highlightLineColor: "#9D3926",
				chartRangeMin: valueMin,
				chartRangeMax: valueMax,
				tooltipFormat: (legend && legend[valueIndex])?tooltipHTML + ' (' + legend[valueIndex] + ')':tooltipHTML
			});
			composite = true;
		});
	}

	var valueStyle = freeboard.getStyleString("values");

	freeboard.addStyle('.widget-big-text', valueStyle + "font-size:75px;");

	freeboard.addStyle('.tw-display', 'width: 100%; height:100%; display:table; table-layout:fixed;');

	freeboard.addStyle('.tw-tr',
		'display:table-row;');

	freeboard.addStyle('.tw-tg',
		'display:table-row-group;');

	freeboard.addStyle('.tw-tc',
		'display:table-caption;');

	freeboard.addStyle('.tw-td',
		'display:table-cell;');

	freeboard.addStyle('.tw-value',
		valueStyle +
		'overflow: hidden;' +
		'display: inline-block;' +
		'text-overflow: ellipsis;');

	freeboard.addStyle('.tw-unit',
		'display: inline-block;' +
		'padding-left: 10px;' +
		'padding-bottom: 1.1em;' +
		'vertical-align: bottom;');

	freeboard.addStyle('.tw-value-wrapper',
		'position: relative;' +
		'vertical-align: middle;' +
		'height:100%;');

	freeboard.addStyle('.tw-sparkline',
		'height:20px;');

    var textWidget = function (settings) {

        var self = this;

        var currentSettings = settings;
        var displayElement = $('<div class="tw-display"></div>');
        var titleElement = $('<h2 class="section-title tw-title tw-td"></h2>');
        var valueWrapperElement = $('<div class="tw-value-wrapper tw-td"></div>');
        var valueElement = $('<div class="tw-value"></div>');
        var unitsElement = $('<div class="tw-unit"></div>');
        var sparklineElement = $('<div class="tw-sparkline tw-td"></div>');

        function updateValueSizing()
        {
            if(!_.isUndefined(currentSettings.units) && currentSettings.units != "") // If we're displaying our units
            {
                valueElement.css("max-width", (displayElement.innerWidth() - unitsElement.outerWidth(true)) + "px");
            }
            else
            {
                valueElement.css("max-width", "100%");
            }
        }

        this.render = function (element) {
            $(element).empty();

            updateValueSizing();

            $(displayElement)
                .append($('<div class="tw-tr"></div>').append(titleElement))
                .append($('<div class="tw-tr"></div>').append(valueWrapperElement.append(valueElement).append(unitsElement)))
                .append($('<div class="tw-tr"></div>').append(sparklineElement));

            $(element).append(displayElement);

            updateValueSizing();
        }

        this.onSettingsChanged = function (newSettings) {
            currentSettings = newSettings;

            var shouldDisplayTitle = (!_.isUndefined(newSettings.title) && newSettings.title != "");
            var shouldDisplayUnits = (!_.isUndefined(newSettings.units) && newSettings.units != "");

            if(newSettings.sparkline)
            {
                sparklineElement.attr("style", null);
            }
            else
            {
                delete sparklineElement.data().values;
                sparklineElement.empty();
                sparklineElement.hide();
            }

            if(shouldDisplayTitle)
            {
                titleElement.html((_.isUndefined(newSettings.title) ? "" : newSettings.title));
                titleElement.attr("style", null);
            }
            else
            {
                titleElement.empty();
                titleElement.hide();
            }   

            if(shouldDisplayUnits)
            {
                unitsElement.html((_.isUndefined(newSettings.units) ? "" : newSettings.units));
                unitsElement.attr("style", null);
            }
            else
            {
                unitsElement.empty();
                unitsElement.hide();
            }

            var valueFontSize = newSettings.size;

            if(newSettings.sparkline)
            {
                valueFontSize -= 15;
            }

            var fontStyle;
            var fontWeight;
            if (currentSettings.italic){
                fontStyle = "italic";
            } 
            else {
                fontStyle = "normal";
            }
            if (currentSettings.bold){
                fontWeight = "bold";
            }
            else {
                fontWeight = "normal"
            }

            valueWrapperElement.css({"text-align": newSettings.text_alignment, "white-space": "normal"});
            valueElement.css({"font-size" : valueFontSize + "px", "font-family" : currentSettings.disp_font, "font-weight" : fontWeight, "font-style" : fontStyle, "color" : newSettings.font_color});

            updateValueSizing();
        }

        this.onSizeChanged = function()
        {
            updateValueSizing();
        }

        this.onCalculatedValueChanged = function (settingName, newValue) {

            if (currentSettings.animate) {
                easeTransitionText(newValue, valueElement, 500);
            }
            else {
                valueElement.text(newValue);
            }

            if (currentSettings.sparkline) {
                addValueToSparkline(sparklineElement, newValue);
            }

        }

        this.onDispose = function () {

        }

        self.getValue = function(){
        
        }

        this.getHeight = function () {
            return utils.widget.calculateHeight(currentSettings.sizeInBlocks);

        }

        this.onSettingsChanged(settings);
    };

    freeboard.loadWidgetPlugin({
        type_name: "text_widget",
        display_name: "Text",
        "external_scripts" : [
            "plugins/thirdparty/jquery.sparkline.min.js"
        ],
        settings: [
            {
                name: "title",
                display_name: "Title",
                type: "text"
            },
            {
                name: "size",
                display_name: "Font size",
                type: "number",
                default_value: 30
            },
            {
                name : "disp_font",
                display_name : "Font",
                type: "option",
                options: [
                    {
                        name: "Georgia",
                        value: '"Georgia",serif'
                    },
                    {
                        name: "Palatino Linotype",
                        value: '"Palatino Linotype", "Book Antiqua", Palatino, serif'
                    },
                    {
                        name: "Time New Roman",
                        value: '"Times New Roman", Times, serif'
                    },
                    {
                        name: "Helvetica Neue",
                        value: "\"Helvetica Neue\",Helvetica,Arial,sans-serif"
                    },
                    {
                        name: "Arial",
                        value: 'Arial, Helvetica, sans-serif'
                    },
                    {
                        name: "Arial Black",
                        value: '"Arial Black", Gadget, sans-serif'
                    },
                    {
                        name: "Comic Sans MS",
                        value: '"Comic Sans MS", cursive, sans-serif'
                    },
                    {
                        name: "Impact",
                        value: 'Impact, Charcoal, sans-serif'
                    },
                    {
                        name: "Lucida Sans Unicode",
                        value: '"Lucida Sans Unicode", "Lucida Grande", sans-serif'
                    },
                    {
                        name: "Tahoma",
                        value: 'Tahoma, Geneva, sans-serif'
                    },
                    {
                        name: "Trebuchet MS",
                        value: '"Trebuchet MS", Helvetica, sans-serif'
                    },
                    {
                        name: "Verdana",
                        value: 'Verdana, Geneva, sans-serif'
                    },
                    {
                        name: "Courier New",
                        value: '"Courier New", Courier, monospace'
                    },
                    {
                        name: "Lucida Console",
                        value: '"Lucida Console", Monaco, monospace'
                    }
                ]
            },
            {
                name: "font_color",
                display_name: "Font color",
                type: "text",
                default_value: "inherit"
            },
            {
                name: "text_alignment",
                display_name: "Alignment",
                type: "text",
                default_value: "left"
            },
            {
                name: "italic",
                display_name : "italic",
                type : "boolean",
                default_value : false
            },
            {
                name : "bold",
                display_name : "Bold",
                type : "boolean",
                default_value : false
            },
            {
                name: "textContent",
                display_name: "Content",
                type: "data",
                multi_input: true,
                incoming_parser: true
            },
            {
                "name"        : "sizeInBlocks",
                "display_name": "Size in Blocks",
                "description" : "Blocks are 60px, fractions are not allowed. eg: 1.5 will be cast to 2",
                "type"        : "number",
                "default_value" : 1
            },
            {
                name: "sparkline",
                display_name: "Include Sparkline",
                type: "boolean"
            },
            {
                name: "animate",
                display_name: "Animate Value Changes",
                type: "boolean",
                default_value: true
            },
            {
                name: "units",
                display_name: "Units",
                type: "text"
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
            newInstanceCallback(new textWidget(settings));
        }
    });

	freeboard.addStyle('.sparkline', "width:100%;height: 75px;");
    var sparklineWidget = function (settings) {
        var self = this;

        var titleElement = $('<h2 class="section-title"></h2>').css("text-align", "center");
        var sparklineElement = $('<div class="sparkline"></div>');
		var sparklineLegend = $('<div></div>');
		var currentSettings = settings;

        this.render = function (element) {
            $(element).append(titleElement).append(sparklineElement).append(sparklineLegend);
        }

        this.onSettingsChanged = function (newSettings) {
			currentSettings = newSettings;
            titleElement.html((_.isUndefined(newSettings.title) ? "" : newSettings.title));

			if(newSettings.include_legend) {
				addSparklineLegend(sparklineLegend,  newSettings.legend.split(","));
			}
        }

        this.onCalculatedValueChanged = function (settingName, newValue) {
			if (currentSettings.legend) {
				addValueToSparkline(sparklineElement, newValue, currentSettings.legend.split(","));
			} else {
				addValueToSparkline(sparklineElement, newValue);
			}
        }

        this.onDispose = function () {
        }

        self.getValue = function(){
        
        }

        this.getHeight = function () {
			var legendHeight = 0;
			if (currentSettings.include_legend && currentSettings.legend) {
				var legendLength = currentSettings.legend.split(",").length;
				if (legendLength > 4) {
					legendHeight = Math.floor((legendLength-1) / 4) * 0.5;
				} else if (legendLength) {
					legendHeight = 0.5;
				}
			}

            return utils.widget.calculateHeight((2 + legendHeight));
        }

        this.onSettingsChanged(settings);
    };

    freeboard.loadWidgetPlugin({
        type_name: "sparkline",
        display_name: "Sparkline",
        "external_scripts" : [
            "plugins/thirdparty/jquery.sparkline.min.js"
        ],
        settings: [
            {
                name: "title",
                display_name: "Title",
                type: "text"
            },
            {
                name: "sources",
                display_name: "Sources",
                type: "data",
                multi_input: true,
                incoming_parser: true
            },
			{
				name: "include_legend",
				display_name: "Include Legend",
				type: "boolean"
			},
			{
				name: "legend",
				display_name: "Legend",
				type: "text",
				description: "Comma-separated for multiple sparklines"
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
            newInstanceCallback(new sparklineWidget(settings));
        }
    });

	freeboard.addStyle('div.pointer-value', "position:absolute;height:95px;margin: auto;top: 0px;bottom: 0px;width: 100%;text-align:center;");
    var pointerWidget = function (settings) {
        var self = this;
        var paper;
        var strokeWidth = 3;
        var triangle;
        var width, height;
        var currentValue = 0;
        var valueDiv = $('<div class="widget-big-text"></div>');
        var unitsDiv = $('<div></div>');

        function polygonPath(points) {
            if (!points || points.length < 2)
                return [];
            var path = []; //will use path object type
            path.push(['m', points[0], points[1]]);
            for (var i = 2; i < points.length; i += 2) {
                path.push(['l', points[i], points[i + 1]]);
            }
            path.push(['z']);
            return path;
        }

        this.render = function (element) {
            width = $(element).width();
            height = $(element).height();

            var radius = Math.min(width, height) / 2 - strokeWidth * 2;

            paper = Raphael($(element).get()[0], width, height);
            var circle = paper.circle(width / 2, height / 2, radius);
            circle.attr("stroke", "#FF9900");
            circle.attr("stroke-width", strokeWidth);

            triangle = paper.path(polygonPath([width / 2, (height / 2) - radius + strokeWidth, 15, 20, -30, 0]));
            triangle.attr("stroke-width", 0);
            triangle.attr("fill", "#fff");

            $(element).append($('<div class="pointer-value"></div>').append(valueDiv).append(unitsDiv));
        }

        this.onSettingsChanged = function (newSettings) {
            unitsDiv.html(newSettings.units);
        }

        this.onCalculatedValueChanged = function (settingName, newValue) {
            if (settingName == "direction") {
                if (!_.isUndefined(triangle)) {
                    var direction = "r";

                    var oppositeCurrent = currentValue + 180;

                    if (oppositeCurrent < newValue) {
                        //direction = "l";
                    }

                    triangle.animate({transform: "r" + newValue + "," + (width / 2) + "," + (height / 2)}, 250, "bounce");
                }

                currentValue = newValue;
            }
            else if (settingName == "value_text") {
                valueDiv.html(newValue);
            }
        }

        this.onDispose = function () {
        }

        self.getValue = function(){
        
        }
        this.getHeight = function () {
            return utils.widget.calculateHeight(4);
        }

        this.onSettingsChanged(settings);
    };

    freeboard.loadWidgetPlugin({
        type_name: "pointer",
        display_name: "Pointer",
        "external_scripts" : [
            "plugins/thirdparty/raphael.2.1.0.min.js"
        ],
        settings: [
            {
                name: "direction",
                display_name: "Direction",
                type: "calculated",
                description: "In degrees"
            },
            {
                name: "value_text",
                display_name: "Value Text",
                type: "calculated"
            },
            {
                name: "units",
                display_name: "Units",
                type: "text"
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
            newInstanceCallback(new pointerWidget(settings));
        }
    });

    var pictureWidget = function(settings)
    {
        var self = this;
        var currentSettings = settings;
        var widgetElement;
        var timer;
        var imageURL;

        function stopTimer()
        {
            if(timer)
            {
                clearInterval(timer);
                timer = null;
            }
        }

        function updateImage()
        {
            if(widgetElement && imageURL)
            {
                var cacheBreakerURL = imageURL + (imageURL.indexOf("?") == -1 ? "?" : "&") + Date.now();
                $(widgetElement).css({
                    "background-image" :  "url(" + cacheBreakerURL + ")"
                });
            }
        }

        this.render = function(element)
        {
            $(element).css({
                width : "100%",
                height: "100%",
                "background-size" : currentSettings.format_type,
                "background-position" : "center",
                "background-repeat": "no-repeat"
            });
            widgetElement = element;
        }

        this.onSettingsChanged = function(newSettings)
        {
            stopTimer();
            currentSettings = newSettings;
            if(newSettings.refresh && newSettings.refresh > 0)
            {
                timer = setInterval(updateImage, Number(newSettings.refresh) * 1000);
            }
            this.render(widgetElement);
        }

        this.onCalculatedValueChanged = function(settingName, newValue)
        {
            imageURL = newValue;
            updateImage();
        }

        this.onDispose = function()
        {
            stopTimer();
        }

        this.getHeight = function()
        {
            return utils.widget.calculateHeight(currentSettings.blockHeight);
        }

        this.getValue = function()
        {
            return imageURL;
        }

        this.onSizeChanged = function()
        {
            // Fit/Fill css property should scale background
        }

        this.onSettingsChanged(settings);
    };

    freeboard.loadWidgetPlugin({
        type_name: "picture",
        display_name: "Picture",
        fill_size: true,
        settings: [
            {
                name: "imgUrl",
                display_name: "Image URL",
                type: "data",
                multi_input: true,
                incoming_parser: true
            },
            {
                name : "format_type",
                display_name : "Format View",
                type : "option",
                options: [
                    {
                        name: "Fit",
                        value: "contain"
                    },
                    {
                        name: "Fill",
                        value: "cover"
                    }
                ]
            },
            {
                "type": "number",
                "display_name": "Block Height",
                "name": "blockHeight",
                "suffix": "blocks",
                "default_value": 4
            },
            {
                "type": "number",
                "display_name": "Refresh every",
                "name": "refresh",
                "suffix": "seconds",
                "description":"Set to zero if the image doesn't need to be refreshed",
                "default_value": 0
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
            newInstanceCallback(new pictureWidget(settings));
        }
    });

	freeboard.addStyle('.indicator-light', "border-radius:50%;width:22px;height:22px;border:2px solid #3d3d3d;margin-top:5px;float:left;background-color:#222;margin-right:10px;");
	freeboard.addStyle('.indicator-light.on', "background-color:#FFC773;box-shadow: 0px 0px 15px #FF9900;border-color:#FDF1DF;");
	freeboard.addStyle('.indicator-text', "margin-top:10px;");
    var indicatorWidget = function (settings) {
        var self = this;
        var titleElement = $('<h2 class="section-title"></h2>');
        var stateElement = $('<div class="indicator-text"></div>');
        var indicatorElement = $('<div class="indicator-light"></div>');
        var currentSettings = settings;
        var isOn = false;
        var onText;
        var offText;

        function updateState() {
            indicatorElement.toggleClass("on", isOn);

            if (isOn) {
                stateElement.text(currentSettings.indicatorTextOn);
            }
            else {
                stateElement.text(currentSettings.indicatorTextOff);
            }
        }

        this.render = function (element) {
            $(element).append(titleElement).append(indicatorElement).append(stateElement);
        }
        this.getValue = function(){

          return isOn;
        }
        this.onSettingsChanged = function (newSettings) {
            onText=currentSettings.indicatorTextOn
            offText=currentSettings.indicatorTextOff
            currentSettings = newSettings;
            currentSettings.indicatorTextOn=onText
            currentSettings.indicatorTextOff=offText
            titleElement.html((_.isUndefined(newSettings.title) ? "" : newSettings.title));
            updateState();
        }

        this.onCalculatedValueChanged = function (settingName, newValue) {
            if(newValue=='true' || newValue==true){

                
                isOn=true
            }
            if(newValue=='false' || newValue==false){
                
                isOn=false
            }    

            updateState();
        }

        this.onDispose = function () {
        }

        this.getHeight = function () {
            return utils.widget.calculateHeight(utils.widget.minBlocks);
        }

        this.onSettingsChanged(settings);
    };

    freeboard.loadWidgetPlugin({
        type_name: "indicator",
        display_name: "Indicator Light",
        settings: [
	        {
	            name: "title",
	            display_name: "Title",
	            type: "text"
	        },
            {
                name: "indicatorTextOff",
                display_name: "Indicator Text Off",
                type: "data",
                force_data: "static", 
            },
            {
                name: "indicatorTextOn",
                display_name: "Indicator Text On",
                type: "data",
                force_data: "static",
            },
	        {
                name: "lightStatus",
                display_name: "Light Status",
                type: "data",
                multi_input: true,
                incoming_parser: true
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
            newInstanceCallback(new indicatorWidget(settings));
        }
    });

    freeboard.addStyle('.html-widget', "white-space:normal;width:100%;height:100%");

    var htmlWidget = function (settings) {
        var self = this;
        var htmlElement = $('<div class="html-widget"></div>');
        var currentSettings = settings;

        this.render = function (element) {
            $(element).append(htmlElement);
        }

        this.onSettingsChanged = function (newSettings) {
            currentSettings = newSettings;
            currentSettings.height = utils.widget.calculateHeight(currentSettings.height);
        }

        this.onCalculatedValueChanged = function (settingName, newValue) {
            htmlElement.html(newValue);
        }

        this.onDispose = function () {
        }

        this.getHeight = function () {
            return utils.widget.calculateHeight(currentSettings.height);
        }
        self.getValue = function(){
        
        }

        this.onSettingsChanged(settings);
    };

    freeboard.loadWidgetPlugin({
        "type_name": "html",
        "display_name": "HTML",
        "fill_size": true,
        "settings": [
            {
                name: "widgetContent",
                display_name: "Content",
                type: "data",
                multi_input: true,
                incoming_parser: true,
            },
            {
                "name": "height",
                "display_name": "Height Blocks",
                "type": "number",
                "default_value": 4,
                "description": "A height block is around 60 pixels"
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
            newInstanceCallback(new htmlWidget(settings));
        }
    });

}());
