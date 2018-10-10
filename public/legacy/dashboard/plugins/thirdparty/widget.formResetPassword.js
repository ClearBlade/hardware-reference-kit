freeboard.loadWidgetPlugin({
 
	"type_name"   : "form_passwordReset",
	"display_name": "Reset Password",
    "description" : "Allows for a user to initiate a pasword reset. Must link to a code service datasource that generates a reset pin.",



	"fill_size" : false,
	"settings"    : [
		{
			name        : "sectionTitle",
			display_name: "Title",
			type        : "text",
			default_value : "Reset Password",
		},
		{
			name: "submission_handler",
			display_name: "Submission Handler",
			type: "data",
			incoming_parser: true,
			outgoing_parser: true,
			description: "outgoing payload: {email:\"emailToReset@clearbalde.com\"}"
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
		newInstanceCallback(new FormResetPasswordPlugin(settings, updateCallback));
	}
});

 
var FormResetPasswordPlugin = function(settings, updateCallback)
{

	var self = this;
	var currentSettings = settings;
	var activeAccount = "";

	var $titleElement, $resetForm,$emailLabel, $emailInput, $submitForm;

	self.processForm = function(event){
		event.preventDefault();

		var emailToReset = $emailInput.val();
		if(emailToReset === null || emailToReset === ""){
			alertMessage("Developer email address is required");
			return;
		}

		activeAccount = emailToReset
		updateCallback();
	}

	self.render = function(containerElement)
	{

		$titleElement = $("<h2>")
			.addClass("section-title")
			.text(currentSettings.sectionTitle);

		$resetForm = $("<form>")
				.addClass("widget-form-frame")
				.on("submit", self.processForm);

		$emailLabel = $("<label>")
				.addClass("widget-form-label")
				.text("Account Email");

		$emailInput = $("<input>")
				.attr({"type":"email"})
				.addClass("widget-form-input-text");
				

		$submitForm = $("<input>")
				.attr({
					"type":"submit", 
					"placeholder":"Email", 
					"value":"Send Reset Code"
				})
				.addClass("widget-form-input-submit");


		var $canvas = $(containerElement);
		$canvas.empty();
				$emailLabel.append($emailInput);
			$resetForm.append([$emailLabel, $submitForm]);
		$canvas.append([$titleElement, $resetForm]);
	}


	self.getHeight = function()
	{
			return 2;	
	}


	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
	}


	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		if($emailInput.val() == ""){
			// random call
			return;
		}
		
		if(newValue.success){
			alertMessage("A reset pin has been sent to "+$emailInput.val());
			$resetForm[0].reset();
		} else {
			alertMessage("Error requesting reset: ", newValue.results);
		}
	}


	self.onDispose = function()
	{
	}

	self.getValue = function() {
		return {email:activeAccount};
	}

	self.onEvent = function() {
		return;
	}
}