freeboard.loadWidgetPlugin({
 
	"type_name"   : "form_accountConfirm",
	"display_name": "Account Confirmation",
    "description" : "Allows for a user to confirm a pasword reset. Note: This widget must have a code datasource that validates a requested pin and updates a user's password. See docmentation for example services.",


	"fill_size" : false,
	"settings"    : [
		{
			name        : "sectionTitle",
			display_name: "Title",
			type        : "text",
			default_value : "Confirm Account",
		},
		{
			name: "submission_handler",
			display_name: "Submission Handler",
			type: "data",
			incoming_parser: true,
			outgoing_parser: true,
			description: "outgoing payload: {user:\"email@clearblade.com\", pin:\"inputPin\", password:\"newUserPassword\"}"
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
		newInstanceCallback(new FormAccountConfimationPlugin(settings, updateCallback));
	}
});

 
var FormAccountConfimationPlugin = function(settings, updateCallback)
{

	var self = this;
	var currentSettings = settings;

	var $titleElement, $formOne, $formTwo, $emailConfirmLabel, $emailConfirm, $resetPinLabel, $resetPin, $newPasswordLabel, $newPasswordInput, $confirmPasswordLabel,$confirmPasswordInput;

	// Verify user email and reset pin
	self.processFormOne = function(event){
		event.preventDefault();

		var updatePayload = {
			"user"      : $emailConfirm.val(),
			"pin"       : $resetPin.val(),
			"password"  : $newPasswordInput.val()
		};
		
		if(updatePayload.user == null || updatePayload.pin == null || updatePayload.user === "" || updatePayload.pin === ""){
			alertMessage("Developer email and reset pin are required");
			return;
		}

		if(!utils.doesMatch(updatePayload.password, $confirmPasswordInput.val())){
			alertMessage("Passwords do not match.");
			return;
		}

		var result = updateCallback(updatePayload);
	}

	self.render = function(containerElement)
	{

		$titleElement = $("<h2>")
			.addClass("section-title").text(currentSettings.sectionTitle)

		$formOne = $("<form>")
				.addClass("widget-form-frame")
				.on("submit", self.processFormOne);

			$emailConfirmLabel = $("<label>")
					.text("Account Email")
					.addClass("widget-form-label");

			$emailConfirm = $("<input>")
					.attr({"type":"email"})
					.addClass("widget-form-input-text");

			$resetPinLabel = $("<label>")
					.text("Reset Pin")
					.addClass("widget-form-label");

			$resetPin = $("<input>")
					.attr({"type":"password"})
					.addClass("widget-form-input-text");

			$submitForm = $("<input>")
					.attr({"type":"submit", "placeholder":"Email", "value":"Update Account"})
					.addClass("widget-form-input-submit");

			$newPasswordLabel = $("<label>")
					.text("New Password")
					.addClass("widget-form-label");
			$newPasswordInput = $("<input>")
					.attr({"type":"password"})
					.addClass("widget-form-input-text");
			$confirmPasswordLabel = $("<label>")
					.text("Confirm Password")
					.addClass("widget-form-label");

			$confirmPasswordInput = $("<input>")
					.attr({"type":"password"})
					.addClass("widget-form-input-text");


		var $canvas = $(containerElement);
		$canvas.empty();

				$emailConfirmLabel.append($emailConfirm);
				$resetPinLabel.append($resetPin);

				$newPasswordLabel.append($newPasswordInput);
				$confirmPasswordLabel.append($confirmPasswordInput)


			$formOne.append([$emailConfirmLabel, $resetPinLabel,$newPasswordLabel,$confirmPasswordLabel, $submitForm]);

		$canvas.append([$titleElement, $formOne]);
	}


	self.getHeight = function()
	{
			return 5;	
	}


	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
	}


	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		if($emailConfirm.val() === ""){
			return;
		}

		if(newValue.success){
			alertMessage("Password updated for account "+$emailConfirm.val());
			$formOne[0].reset();
		} else {
			alertMessage("Error updating password: "+ newValue.results);
		}
	}


	self.onDispose = function()
	{
	}

	self.getValue = function() {
		return {
			email: $emailConfirm.val(),
			pin:   $resetPin.val(),
			password: $newPasswordInput.val()
		};
	}

	self.onEvent = function() {
		return;
	}
}