
var gaugeWidget = function (settings) {

  var self = this;
  var currentSettings = settings;

  var container;
  var $gaugeContainer = $("<div>");
  var $titleElement = $("<h2>")
        .addClass("section-title")
        .css("text-align", "center");

  var gaugeCanvas = d3.select($gaugeContainer[0]).append("svg"); // svg
  var widgetCanvas = {
    width  : 0,
    height : 0,
    padding : {
      top   : 0,
      right : 0,
      bottom: 0,
      left  : 0
    }
  }
  var labelSize = {
    width : 50,
    height : 20
  }

  var gaugeAttributes = {
    gauge : {},
    needleCanvas: {},
    minLabel: {},
    maxLabel: {},
    indicator: {},
    segments : [],
    radius : 0,
    chartInset :0,
    barWidth: 50,
    padRad: 0.025,
    currentVal : 50
  }

  var Needle = (function() {

    var recalcPointerPos = function(perc) {
      var centerX, centerY, leftX, leftY, rightX, rightY, thetaRad, topX, topY;
      thetaRad = utils.percToRad(perc / 2);
      centerX = 0;
      centerY = 0;
      topX = centerX - this.len * Math.cos(thetaRad);
      topY = centerY - this.len * Math.sin(thetaRad);
      leftX = centerX - this.radius * Math.cos(thetaRad - Math.PI / 2);
      leftY = centerY - this.radius * Math.sin(thetaRad - Math.PI / 2);
      rightX = centerX - this.radius * Math.cos(thetaRad + Math.PI / 2);
      rightY = centerY - this.radius * Math.sin(thetaRad + Math.PI / 2);

      return "M " + leftX + " " + leftY + " L " + topX + " " + topY + " L " + rightX + " " + rightY;
    };

    function Needle(el) {
      this.el = el;
      this.len = widgetCanvas.width / 3;
      this.radius = this.len / 6;
    }



    Needle.prototype.render = function() {

      var needleR = (20 * (widgetCanvas.width / 278));
      if(needleR < 20){
        needleR = 20;
      }
      this.el.append('circle')
        .attr('class', 'needle-center')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', needleR)
        .style({ "fill": currentSettings.needle_color });

      return this.el.append('path').attr('class', 'needle').attr('d', recalcPointerPos.call(this, 0)).style({ "fill": currentSettings.needle_color, "z-index": 1 });
    };

    Needle.prototype.moveTo = function(perc) {

      var self, oldValue = this.perc || 0;
      
      this.perc = perc;
      self = this;
      
      var unitExtension = " " + (currentSettings.units || "%");
      var delta = perc - oldValue;
      
      this.el.transition().duration(500).ease('quad').select('.needle').tween('progress', function() {
        return function(percentOfPercent) {
          var progress = oldValue + (percentOfPercent * delta);
          currentSettings.units = currentSettings.units || "%";
          gaugeAttributes.currentLabel.text(gaugeAttributes.currentVal + " "+currentSettings.units);
          //$currentLabel.text( (Math.round(progress * currentSettings.max_value) + unitExtension) );
          return d3.select(this).attr('d', recalcPointerPos.call(self, progress));
        };
      });
    };

    return Needle;
  })();


  this.renderGauge = function(){
    gaugeCanvas.remove();

    widgetCanvas.width = Math.floor(container.width()) || ((container.parent().parent().width() - container.parent().width()) * (Number.parseInt(currentSettings.container_width) / 100));
    widgetCanvas.height = Math.round(0.5 * widgetCanvas.width);
    widgetCanvas.padding.bottom = widgetCanvas.padding.top = Number.parseInt(container.css("padding-top"));
    widgetCanvas.padding.left = widgetCanvas.padding.right = Number.parseInt(container.css("padding-right"));

    $gaugeContainer.css({"width" : widgetCanvas.width});
    $gaugeContainer.css({"height": widgetCanvas.height});

    var gaugeDimensions = {
      width : widgetCanvas.width,
      height : Math.round(widgetCanvas.width / 2) + labelSize.height,
    }
    var labelPositions = {
      arc : {
        min : {
          height : labelSize.height,
          x : 0,
          y : gaugeDimensions.height,
          fill : currentSettings.label_color,
          "text-anchor": "start"
        },
        max : {
          height : labelSize.height,
          x : gaugeDimensions.width,
          y : gaugeDimensions.height,
          fill : currentSettings.label_color,
          "text-anchor": "end",
        },
        current : {
          height : labelSize.height,
          x : (gaugeDimensions.width / 2) - (labelSize.height * 0.60),
          y : (gaugeDimensions.height - (labelSize.height * 0.80)),
          fill : currentSettings.label_color,
          "text-anchor": "start",
        }
      },
      barH : {
        min : {
          height : labelSize.height,
          x : 0,
          y : (gaugeDimensions.height / 2) + 32,
          fill : currentSettings.label_color,
          "text-anchor": "start"
        },
        max : {
          height : labelSize.height,
          x : gaugeDimensions.width,
          y : (gaugeDimensions.height / 2) + 32,
          fill : currentSettings.label_color,
          "text-anchor": "end",
        },
        current : {
          height : labelSize.height,
          x : (gaugeDimensions.width / 2) - (labelSize.height * 0.60),
          y : (gaugeDimensions.height / 2) - 34,
          fill : currentSettings.label_color,
          "text-anchor": "middle",
        }
      },
      barV : {
        min : {
          height : labelSize.height,
          x : (gaugeDimensions.width/2 + 28),
          y : gaugeDimensions.height,
          fill : currentSettings.label_color,
          "text-anchor": "start"
        },
        max : {
          height : labelSize.height,
          x : (gaugeDimensions.width/2 + 28),
          y : 10 + labelSize.height,
          fill : currentSettings.label_color,
          "text-anchor": "start",
        },
        current : {
          height : labelSize.height,
          x : (gaugeDimensions.width/2 - 28),
          y : 10 + labelSize.height,
          fill : currentSettings.label_color,
          "text-anchor": "end",
        }
      }
    }

    gaugeCanvas = d3.select($gaugeContainer[0]).append("svg").attr(gaugeDimensions).style("overflow","visible");

    var widthAdjust = gaugeDimensions.width > 0 ? gaugeAttributes.barWidth * (gaugeDimensions.width / 278) : gaugeAttributes.barWidth;
    gaugeAttributes.barWidth = widthAdjust > 100 ? 100 : widthAdjust;
    gaugeAttributes.chartInset = 0;


    if(currentSettings.gauge_style === undefined || currentSettings.gauge_style === 0){
      gaugeAttributes.minLabel = gaugeCanvas.append("text")
        .attr(labelPositions.arc.min);
      gaugeAttributes.maxLabel = gaugeCanvas.append("text")
        .attr(labelPositions.arc.max);
      gaugeAttributes.radius = widgetCanvas.height > 0 ? widgetCanvas.height - labelSize.height : 10;

      gaugeAttributes.gauge = gaugeCanvas.append('g').attr('transform', "translate(" + ( gaugeDimensions.width / 2 ) + ", " + (gaugeDimensions.height - labelSize.height) + ")");
      gaugeAttributes.needleCanvas = gaugeCanvas.append('g').attr('transform', "translate(" + ( gaugeDimensions.width / 2 ) + ", " + (gaugeDimensions.height - labelSize.height) + ")");
      gaugeAttributes.needle = new Needle(gaugeAttributes.needleCanvas);

      gaugeAttributes.needle.render();
      gaugeAttributes.currentLabel = gaugeCanvas.append("text")
        .attr(labelPositions.arc.current);

    } else if (currentSettings.gauge_style === 1){
        // Bar Gauge
      gaugeAttributes.minLabel = gaugeCanvas.append("text")
        .attr(labelPositions.barH.min);
      gaugeAttributes.maxLabel = gaugeCanvas.append("text")
        .attr(labelPositions.barH.max);
      gaugeAttributes.radius = widgetCanvas.height - labelSize.height;

      gaugeAttributes.gauge = gaugeCanvas.append('g').attr('transform', "translate(0,"+ (gaugeDimensions.height/2 - 50) +")");
      gaugeAttributes.currentLabel = gaugeCanvas.append("text")
        .attr(labelPositions.barH.current);
      gaugeAttributes.indicator = gaugeCanvas.append("rect").attr({
        width : 2,
        height: 50,
        x: (gaugeDimensions.width/2 - 25),
        y: (gaugeDimensions.height/2 - 30),
        fill: currentSettings.needle_color
      });


    } else if (currentSettings.gauge_style === 2){
        // Bar Gauge
      gaugeAttributes.minLabel = gaugeCanvas.append("text")
        .attr(labelPositions.barV.min);
      gaugeAttributes.maxLabel = gaugeCanvas.append("text")
        .attr(labelPositions.barV.max);
      gaugeAttributes.radius = widgetCanvas.height - labelSize.height;

      gaugeAttributes.gauge = gaugeCanvas.append('g').attr('transform', "translate("+(gaugeDimensions.width/2 - 25)+", 20)");
      gaugeAttributes.currentLabel = gaugeCanvas.append("text")
        .attr(labelPositions.barV.current);
      gaugeAttributes.indicator = gaugeCanvas.append("rect").attr({
        width : 50,
        height: 2,
        x: (gaugeDimensions.width/2 - 25),
        y: gaugeDimensions.height/2,
        fill: currentSettings.needle_color
      });
    }

    self.paintGauge(gaugeAttributes.segments);

  }


  var activeSegments = [];

  this.paintGauge = function(segmentObjectArray){

    for(arc in activeSegments){
      activeSegments[arc].remove();
    }
    activeSegments.length = 0;
    var segements = [];
    var next_start = 0.75;
    
    if(currentSettings.gauge_style === undefined || currentSettings.gauge_style === 0){
      next_start = 0.75;
      for(var i = 0, len = segmentObjectArray.length, arc; i < len; i++){
        var segment = gaugeAttributes.gauge.append('path').attr({"class":"arc"}).style({ "fill": segmentObjectArray[i].color, "z-index": -1});
        activeSegments.push(segment);
        arc = d3.svg.arc().outerRadius(gaugeAttributes.radius - gaugeAttributes.chartInset).innerRadius((gaugeAttributes.radius - gaugeAttributes.chartInset) - gaugeAttributes.barWidth );
        arcStartRad = utils.percToRad(next_start);
        arcEndRad = arcStartRad + utils.percToRad(segmentObjectArray[i].share / 2);
        next_start += segmentObjectArray[i].share / 2;
        arc.startAngle(arcStartRad).endAngle(arcEndRad);
        segment.attr('d', arc);
      }
      gaugeAttributes.needle.moveTo(gaugeAttributes.currentVal / currentSettings.max_value);

    } else if (currentSettings.gauge_style === 1){

      if(currentSettings.gauge_varient === 0 || currentSettings.gauge_varient === 1){

        next_start = 0;
        for(var i = 0, len = segmentObjectArray.length, arc; i < len; i++){
          var w = widgetCanvas.width * Number.parseFloat(segmentObjectArray[i].share);
          var segment = gaugeAttributes.gauge.append('rect').attr({
            "class":"bar",
            "width": w,
            "height": 50,
            "x": next_start,
            "y": 20
          })
          .style({ "fill": segmentObjectArray[i].color, "z-index": -1 });
          activeSegments.push(segment);
          next_start += w;
        }
      }

      var curLabelX = ((gaugeAttributes.currentVal / currentSettings.max_value) * (widgetCanvas.width));
      gaugeAttributes.currentLabel.attr("x", curLabelX);
      gaugeAttributes.currentLabel.text(gaugeAttributes.currentVal+" "+currentSettings.units);
      gaugeAttributes.indicator.attr("x", curLabelX);

    } else if (currentSettings.gauge_style === 2){

      if(currentSettings.gauge_varient === 0 || currentSettings.gauge_varient === 1){

        next_start = widgetCanvas.height;
        for(var i = 0, len = segmentObjectArray.length, arc; i < len; i++){

          var h = widgetCanvas.height * Number.parseFloat(segmentObjectArray[i].share);
          var segment = gaugeAttributes.gauge.append('rect').attr({
            "class":"bar",
            "width": 50,
            "height": h,
            "x": 0,
            "y": next_start - h
          })
          .style({ "fill": segmentObjectArray[i].color, "z-index": -1 });
          activeSegments.push(segment);
          next_start -= h;
        }
      }

      var curLabelY = (widgetCanvas.height + 30) - ((gaugeAttributes.currentVal / currentSettings.max_value) * (widgetCanvas.height));
      gaugeAttributes.currentLabel.attr("y", curLabelY);
      gaugeAttributes.currentLabel.text(gaugeAttributes.currentVal+" "+currentSettings.units);
      gaugeAttributes.indicator.attr("y", curLabelY - 10);

    }

    gaugeAttributes.minLabel.text(currentSettings.min_value);
    gaugeAttributes.maxLabel.text(currentSettings.max_value);

  }

  this.adjustBarLabels = function(){

    if(currentSettings.gauge_style === 1){
      var curLabelX = ((gaugeAttributes.currentVal / currentSettings.max_value) * (widgetCanvas.width));
      gaugeAttributes.currentLabel.attr("x", curLabelX);
      gaugeAttributes.indicator.attr("x", curLabelX);
    }

    if(currentSettings.gauge_style === 2){
      var curLabelY = (widgetCanvas.height + 30) - ((gaugeAttributes.currentVal / currentSettings.max_value) * (widgetCanvas.height));
      gaugeAttributes.currentLabel.attr("y", curLabelY);
      gaugeAttributes.indicator.attr("y", curLabelY - 10);
    }

    gaugeAttributes.currentLabel.text(gaugeAttributes.currentVal+" "+currentSettings.units);


  }

  this.render = function (containerElement) {

      container = $(containerElement);
      container.css("width", "100%");
      $titleElement.html(currentSettings.title);
      container.append([$titleElement, $gaugeContainer]);

      widgetCanvas.width = Math.floor(container.width()) || ((container.parent().parent().width() - container.parent().width()) * (Number.parseInt(currentSettings.container_width) / 100));
      widgetCanvas.height = Math.round(0.5 * widgetCanvas.width);
      widgetCanvas.padding.bottom = widgetCanvas.padding.top = Number.parseInt(container.css("padding-top"));
      widgetCanvas.padding.left = widgetCanvas.padding.right = Number.parseInt(container.css("padding-right"));

      currentSettings.gauge_varient = Number.parseInt(currentSettings.gauge_varient);
      currentSettings.gauge_style = Number.parseInt(currentSettings.gauge_style);
      currentSettings.units = currentSettings.units || "";

      var seg = utils.parseJsonArray(currentSettings.gauge_segments);

      if(seg.length > 0){
        gaugeAttributes.segments = seg;
      } else {
        self.applyDefaults();
      }

      setTimeout(function(){
        self.onSettingsChanged(currentSettings);
      }, 1000);
      
      freeboard.resize();
  }

  this.onSettingsChanged = function (newSettings) {
      var shouldRender = false;

      currentSettings = newSettings;
      currentSettings.gauge_varient = Number.parseInt(currentSettings.gauge_varient);
      currentSettings.gauge_style = Number.parseInt(currentSettings.gauge_style);

      $titleElement.html(currentSettings.title);
      var seg = utils.parseJsonArray(currentSettings.gauge_segments);

      if(seg.length > 0){
        gaugeAttributes.segments = seg;
      } else {
        self.applyDefaults();
      }

      setTimeout(function(){ 
        self.renderGauge();
        setTimeout(function(){  
          freeboard.resize();
        }, 1000);
      }, 1000);

  }

  this.applyDefaults = function(){
    if(currentSettings.gauge_style === undefined || currentSettings.gauge_style === 0){
      if(currentSettings.gauge_varient === undefined || currentSettings.gauge_varient === 0){
        gaugeAttributes.segments = [{share: 0.30, color:"#607D8B"}, {share: 0.70, color:"#CCCCCC"}];
      } else if(currentSettings.gauge_varient === 1){
        gaugeAttributes.segments = [{share: 0.40, color:"#569922"}, {share: 0.25, color:"#FFF131"}, {share: 0.25, color:"#CC5C2F"}, {share: 0.10, color:"#AA3224"}];
      }
    } else if (currentSettings.gauge_style === 1 || currentSettings.gauge_style === 2){
      if(currentSettings.gauge_varient === undefined || currentSettings.gauge_varient === 0){
        gaugeAttributes.segments = [{share: 0.30, color:"#607D8B"}, {share: 0.70, color:"#CCCCCC"}];
      } else if(currentSettings.gauge_varient === 1){
        gaugeAttributes.segments = [{share: 0.40, color:"#569922"}, {share: 0.25, color:"#FFF131"}, {share: 0.25, color:"#CC5C2F"}, {share: 0.10, color:"#AA3224"}];
      }
    }
  }

  this.onCalculatedValueChanged = function (settingName, newValue) {
      gaugeAttributes.currentVal = newValue;
      
      if(currentSettings.gauge_style === undefined || currentSettings.gauge_style === 0){
        // Arc Gauge
        if(currentSettings.gauge_varient === undefined || currentSettings.gauge_varient === 0){
          gaugeAttributes.segments[0].share = newValue / currentSettings.max_value;
          gaugeAttributes.segments[1].share = 1 - gaugeAttributes.segments[0].share;
          self.paintGauge(gaugeAttributes.segments);
        } else if(currentSettings.gauge_varient === 1){
          gaugeAttributes.needle.moveTo(newValue / currentSettings.max_value);
        }
      } else if (currentSettings.gauge_style === 1 || currentSettings.gauge_style === 2){
        // Bar Gauge
        if(currentSettings.gauge_varient === undefined || currentSettings.gauge_varient === 0){
          gaugeAttributes.segments[0].share = newValue / currentSettings.max_value;
          gaugeAttributes.segments[1].share = 1 - gaugeAttributes.segments[0].share;
          self.paintGauge(gaugeAttributes.segments);
        } else {
          self.adjustBarLabels();
        }
      }
  }
  this.onDispose = function () {
  }

  this.getValue = function(){
      return gaugeAttributes.currentVal;
  }

  this.getHeight = function () {
      return utils.widget.calculateHeight(currentSettings.block_height);
  }

};


freeboard.loadWidgetPlugin({
    type_name: "gauge",
    display_name: "Gauge",
    "external_scripts" : [
        "https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.5/d3.min.js"
    ],
    settings: [
        {
            name: "title",
            display_name: "Title",
            type: "text"
        },
        {   name         : "gauge_style",
            display_name : "Style",
            type         : "option",
            options      : [
                  {
                      "name" : "Arc",
                      "value": 0
                  },
                  {
                      "name" : "Bar - Horizontal",
                      "value": 1
                  },
                  {
                      "name" : "Bar - Vertical",
                      "value": 2
                  }
              ]
        },
        {   name         : "gauge_varient",
            display_name : "Varient",
            type         : "option",
            options      : [
                  {
                      "name" : "Indicator",
                      "value": 0
                  },
                  {
                      "name" : "Segmented",
                      "value": 1
                  }
              ]
        },
        {
            name: "gaugeVal",
            display_name: "Gauge Value",
            type: "data",
            multi_input: true,
            incoming_parser: true,
            force_data: "dynamic",
        },
        {
            name: "units",
            display_name: "Units",
            type: "text"
        },
        {
            name: "min_value",
            display_name: "Minimum",
            type: "number",
            default_value: 0
        },
        {
            name: "max_value",
            display_name: "Maximum",
            type: "number",
            default_value: 100
        },
        {
          name            : "title_color",
          display_name    : "Title Color",
          type            : "text",
          "default_value" : "#5EA7CF"
        },
        {
          name            : "gauge_segments",
          display_name    : "Gauge Segments",
          type            : "text",
          "default_value" : "",
          "description" : "Provide in order the segment % share and associated color. Note: share % does not matter for indicator. Defaults: <br/>indicator: <br /> [ <br />  { \"share\": 0.40, \"color\": \"#569922\" }, <br />  { \"share\": 0.25, \"color\": \"#FFF131\" }<br /> ]<br />segmented: <br /> [ <br />  { \"share\": 0.40, \"color\": \"#569922\" }, <br />  { \"share\": 0.25, \"color\": \"#FFF131\" }, <br />  { \"share\": 0.25, \"color\": \"#CC5C2F\" }, <br />  { \"share\": 0.10, \"color\": \"#AA3224\" }<br /> ]"
        },
        {
          name            : "needle_color",
          display_name    : "Needle Color",
          type            : "text",
          "default_value" : "#444444"
        },
        {
          name            : "label_color",
          display_name    : "Label Color",
          type            : "text",
          "default_value" : "#5EA7CF"
        },
        {
            name: "block_height",
            display_name: "Block Height",
            type: "number",
            default_value: 4
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
        newInstanceCallback(new gaugeWidget(settings));
    }
});