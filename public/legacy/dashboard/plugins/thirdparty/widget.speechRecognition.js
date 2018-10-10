var SpeechRecognition = SpeechRecognition || webkitSpeechRecognition;

freeboard.loadWidgetPlugin({

	"type_name"   : "speech_recognition",
	"display_name": "Speech Recognition",
    "description" : "Convert speech to text",
	"fill_size" : false,
	"settings"    : [
		{
			name: "inputVal",
			display_name: "Event Target",
			type: "data",
			force_data: "dynamic",
			outgoing_parser: true
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
		newInstanceCallback(new SpeechWidgetPlugin(settings, updateCallback));
	}
});


var SpeechWidgetPlugin = function(settings, updateCallback)
{

	var currentSettings = settings;
	var currentVal = null;
	var isRecording = false
    var buttonElement = $("<button>").css({"width": "100%", "height": "50px"});
    var micMuteIcon = $("<img src='img/mic-mute.svg'>").addClass('speech-recognition-mic-icon');
    var micIcon = $("<img src='img/mic.svg'>").addClass('speech-recognition-mic-icon glowing');
    buttonElement.append(micMuteIcon);


    buttonElement.on('click', toggleRecording);

    var recognition = new SpeechRecognition();
	recognition.continuous = true;
	recognition.lang = 'en-US';
	recognition.interimResults = false;
	recognition.maxAlternatives = 1;

	this.render = function(containerElement)
	{

		$(containerElement).empty();

		$(containerElement)
			.append(buttonElement);

	}

	function toggleRecording () {
		if (isRecording) {
			micIcon.replaceWith(micMuteIcon);
			isRecording = false;
			recognition.stop();
		} else {
			micMuteIcon.replaceWith(micIcon);
			isRecording = true;
			recognition.start();
		}
	}

	recognition.onresult = function(event) {
		  // The SpeechRecognitionEvent results property returns a SpeechRecognitionResultList object
		  // The SpeechRecognitionResultList object contains SpeechRecognitionResult objects.
		  // It has a getter so it can be accessed like an array
		  // The [last] returns the SpeechRecognitionResult at the last position.
		  // Each SpeechRecognitionResult object contains SpeechRecognitionAlternative objects that contain individual results.
		  // These also have getters so they can be accessed like arrays.
		  // The [0] returns the SpeechRecognitionAlternative at position 0.
		  // We then return the transcript property of the SpeechRecognitionAlternative object

		  var last = event.results.length - 1;
		  currentVal = event.results[last][0].transcript;
		  updateCallback(currentVal);
	}

	recognition.onspeechend = function() {
	  recognition.stop();
	}

	recognition.onerror = function(event) {
		console.error('recognition error:', event.error);
		micIcon.replaceWith(micMuteIcon);
		alertMessage("Error performing speech recognition: ", event.error);
	}

	this.getHeight = function()
	{
		currentSettings.blockHeight = currentSettings.blockHeight || 1;
		return utils.widget.calculateHeight(currentSettings.blockHeight);
	}

	this.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
	}

	this.onDispose = function(){}

	this.getValue = function() {
		return currentVal;
	}

}
