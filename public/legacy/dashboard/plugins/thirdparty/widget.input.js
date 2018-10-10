freeboard.loadWidgetPlugin({
 
	"type_name"   : "novi_input",
	"display_name": "Input",
    "description" : "Link an HTML5 input field to a datasource for updates/publishes.",
	"fill_size" : false,
	"settings"    : [
		{
			name        : "sectionTitle",
			display_name: "Title",
			type        : "text"
		},
		{
			name         : "inputType",
			display_name : "Input Type",
			type         : "option",
			options      : [

				{
					"name" : "button",
					"value": "button"
				},
				{
					"name" : "checkbox",
					"value": "checkbox"
				},
				{
					"name" : "color",
					"value": "color"
				},
				{
					"name" : "date",
					"value": "date"
				},
				{
					"name" : "datetime-local",
					"value": "dateLocal"
				},
				{
					"name" : "email",
					"value": "email"
				},
				{
					"name" : "month",
					"value": "month"
				},
				{
					"name" : "number",
					"value": "number"
				},
				{
					"name" : "password",
					"value": "password"
				},
				{
					"name" : "range",
					"value": "range"
				},
				{
					"name" : "search",
					"value": "search"
				},
				{
					"name" : "select",
					"value": "select"
				},
				{
					"name" : "telephone",
					"value": "tel"
				},
				{
					"name" : "text",
					"value": "text"
				},
				{
					"name" : "textarea",
					"value": "textarea"
				},
				{
					"name" : "time",
					"value": "time"
				},
				{
					"name" : "url",
					"value": "url"
				},
				{
					"name" : "week",
					"value": "week"
				},
			]
		},
		{
			name: "inputVal",
			display_name: "Value",
			type: "data",
			force_data: "dynamic",
			incoming_parser: true,
			outgoing_parser: true
		},
		{
			name: "attributes",
			display_name: "Relevant Attributes",
			type: "text",
			description: "Provide range, options, and other relevant input attributes."
		},
		{
			"name"        : "blockHeight",
			"display_name": "Block Height",
			"type"        : "number",
			default_value : 2,
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
		newInstanceCallback(new InputWidgetPlugin(settings, updateCallback));
	}
});

 
var InputWidgetPlugin = function(settings, updateCallback)
{
	var self = this;
	var sectionTitle = settings.sectionTitle || "";
	var currentSettings = settings;
	var titleElement = $("<h2>")
							.addClass("section-title")
							.text(sectionTitle)
							.css("margin-bottom","3px");
    var inputElement = $("<input>");

    this.renderInput = function(){

    	var inputAttributes = utils.parseJsonObject(currentSettings.attributes);
    	var newInput = $("<input>");

    	var submitIfEnter = function(event){
	    	if(event.keyCode === 13){
	    		newInput.blur(); // Will fire on event
	    	}
	    }

    	switch(currentSettings.inputType){

    		case "button" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "button"
		    		})
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on("click", self.onEvent);

	    		break;

	    	case "checkbox" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "checkbox"
		    		})
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on("change", self.onEvent)
		    		.keyup(function(e){submitIfEnter(e)});

		    	/*
		    		Optional: {"checked": "String:boolean" }
		    	*/

		    	if(inputAttributes.checked !== undefined)
		    		newInput.prop("checked", (inputAttributes.checked == "true"))


	    		break;

	    	case "color" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "color"
		    		})
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on("change", self.onEvent)
		    		.keyup(function(e){submitIfEnter(e)});

	    		break;

	    	case "date" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "date"
		    		})
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on("blur", self.onEvent)
		    		.keyup(function(e){submitIfEnter(e)});

	    		break;

	    	case "dateLocal" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "datetime-local"
		    		})
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on("blur", self.onEvent)
		    		.keyup(function(e){submitIfEnter(e)});

	    		break;

	    	case "email" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "email"
		    		})
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on("blur", self.onEvent)
		    		.keyup(function(e){submitIfEnter(e)});

	    		break;

	    	case "month" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "month"
		    		})
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on("blur", self.onEvent)
		    		.keyup(function(e){submitIfEnter(e)});

	    		break;


	    	case "number" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "number"
		    		})
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on( "blur", self.onEvent)
		    		.keyup(function(e){submitIfEnter(e)});

		    	/*
		    		Optional: { "min" : Int , "max" : Int }
		    	*/

		    	if(inputAttributes.min !== undefined)
		    		newInput.attr("min", inputAttributes.min);

		    	if(inputAttributes.max !== undefined)
		    		newInput.attr("max", inputAttributes.max);

	    		break;

	    	case "password" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "password"
		    		})
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on( "blur", self.onEvent)
		    		.keyup(function(e){submitIfEnter(e)});
	    		
	    		break;

	    	case "range" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "range"
		    		})
		    		.css({
		    			"width" : "95%",
		    			"margin-top" : "5px"
		    		})
		    		.on( "change", self.onEvent)
		    		.val(currentSettings.inputVal);

		    	/*
		    		Optional: { "min" : Int , "max" : Int, "step": Int }
		    	*/

		    	if(inputAttributes.min !== undefined)
		    		newInput.attr("min", inputAttributes.min);

		    	if(inputAttributes.max !== undefined)
		    		newInput.attr("max", inputAttributes.max);

		    	if(inputAttributes.step !== undefined)
		    		newInput.attr("step", inputAttributes.step);

	    		break;


	    	case "search" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "search"
		    		})
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on("blur", self.onEvent)
		    		.keyup(function(e){submitIfEnter(e)});

	    		break;

	    	case "select" :

    			newInput = $("<select>")
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on("change", self.onEvent);


		    	/*
		    		Expected: { "options" : [ "String" ] }

					Optional: { "options" : [ "String" ] , "selected" : "String" }
		    	*/

		    	if(inputAttributes.options === undefined){
		    		console.error("Select missing options");
		    		break;
		    	}

		    	var selected = inputAttributes.selected || "";

		    	for(var i = 0, len = inputAttributes.options.length; i < len; i++){
		    		var opt = inputAttributes.options[i];
		    		newInput.append(
		    			$("<option>")
		    				.val(opt)
		    				.text(opt)
		    				.prop("selected", (opt === selected))
		    		)

		    	}	

	    		break;

    		case "tel" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "tel"
		    		})
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on("blur", self.onEvent)
		    		.keyup(function(e){submitIfEnter(e)});

	    		break;

    		case "text" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "text"
		    		})
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on("blur", self.onEvent)
		    		.keyup(function(e){submitIfEnter(e)});

	    		break;

	    	case "time" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "time"
		    		})
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on("blur", self.onEvent)
		    		.keyup(function(e){submitIfEnter(e)});

	    		break;

	    	case "url" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "url"
		    		})
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on("blur", self.onEvent)
		    		.keyup(function(e){submitIfEnter(e)});

	    		break;

	    	case "week" : 
    			newInput = $("<input>")
		    		.attr({
		    			"type" : "week"
		    		})
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on("blur", self.onEvent)
		    		.keyup(function(e){submitIfEnter(e)});

	    		break;

	    	case "textarea" : 
    			newInput = $("<textarea>")
		    		.css({
		    			"width" : "95%"
		    		})
		    		.on("blur", self.onEvent)
		    		.keyup(function(e){submitIfEnter(e)});
		    	
		    	if(inputAttributes.rows !== undefined)
		    		newInput.attr("rows", inputAttributes.rows);

	    		break;

	    	default:
	    		console.error("Invalid input type");
	    		break;
    	}

    	return newInput;

    }


	this.render = function(containerElement)
	{

		$(containerElement).empty();

		inputElement = self.renderInput();

		$(containerElement)
			.append(titleElement)
			.append(inputElement);

	}


	this.getHeight = function()
	{
		currentSettings.blockHeight = currentSettings.blockHeight || 1;
		return utils.widget.calculateHeight(currentSettings.blockHeight);
	}


	this.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
		titleElement.text(currentSettings.sectionTitle);

		var updatedInput = self.renderInput();

		inputElement.replaceWith(updatedInput); // Replace in DOM
		inputElement = updatedInput; // Update ref

		freeboard.resize();
	}


	this.onCalculatedValueChanged = function(settingName, newValue)
	{
		inputElement.val(newValue);
	}


	this.onDispose = function()
	{

	}

	this.getValue = function() {
		try {
			return inputElement.val();
		} catch(e) {
			var moreSpecific = (currentSettings.sectionTitle !== undefined && currentSettings.sectionTitle !== "") ? " with title: \""+currentSettings.sectionTitle+"\"" : "";
			console.error("Unable to retrieve value for "+currentSettings.inputType+" input"+moreSpecific+".");
			console.error(e);
			return {};
		}
	}

	this.onEvent = function() {
		updateCallback(self.getValue());
	}
}