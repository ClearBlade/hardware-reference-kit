var urlStor = {};
var callStore = [];
var loaded = false;


var mapLoader = function(url, callback) {
	function render(){
		loaded = true;
		var length = callStore.length;
		for (var i=0; i<length; i++){
			callStore[i]();
		}
	}
	if (urlStor[url] == undefined){
		urlStor[url] = true;
		callStore.push(callback);
		window.gmap_initialize = render;
		url = url + "&callback=gmap_initialize";
		head.js(url);
	} else {
		if (loaded == true){
			callback();
		} 
		else {
			callStore.push(callback);
		}
	}
}