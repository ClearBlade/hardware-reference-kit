DatasourceModel = function(theFreeboardModel, datasourcePlugins) {
	var self = this;
	var _lastSent = {};
	function disposeDatasourceInstance()
	{
		if(!_.isUndefined(self.datasourceInstance))
		{
			if(_.isFunction(self.datasourceInstance.onDispose))
			{
				self.datasourceInstance.onDispose();
			}

			self.datasourceInstance = undefined;
		}
	}

	this.datasourceRefreshNotifications = {};
	this.calculatedSettingScripts = {};

	this.name = ko.observable();
	this.latestData = ko.observable();
	this.settings = ko.observable({});
	this.settings.subscribe(function(newValue)
	{
		if(!_.isUndefined(self.datasourceInstance) && _.isFunction(self.datasourceInstance.onSettingsChanged))
		{
			self.datasourceInstance.onSettingsChanged(newValue);
		}
		self.updateCalculatedSettings();
	});

	this.processDatasourceUpdate = function (datasourceName, newData) {
		if (self.datasourceRefreshNotifications[datasourceName]) {
			self.processCalculatedSetting(datasourceName, newData);
		}
	};

	_datasourceListToMap = function (array) {
		var returnVal = {};

		if (array) {
			for (var i =0, len = array.length; i < len; i++) {
				returnVal[array[i].name()] = array[i];
			}
		}

		return returnVal;
	};

	var dsValue;
	this.callValueFunction = function (theFunction, dsName) {
		var datasources = _datasourceListToMap(theFreeboardModel.datasources());
		try {
			dsValue = datasources[dsName].latestData();
		} catch (e) {
            console.warn("Unable to get the latest data for the datasource with name '" + dsName + ".' Please make sure it implements the 'latestData' method.");
            console.warn(e);
		}

		var valueForThis = {
			datasource: dsValue
		};

		return theFunction.call(valueForThis, datasources);
	};

	this.processCalculatedSetting = function (dsName, newData) {
		if (self.calculatedSettingScripts[dsName]) {
			var returnValue = undefined;

			if (newData && _lastSent[dsName] && _.isEqual(newData, _lastSend[dsName])) {
                //if the new data is equal to the last message we sent that means we are receiving an update that we caused - ignore it
                return;
			}

			try {
				if (self.calculatedSettingScripts[dsName].incoming_parser && _.isFunction(self.calculatedSettingScripts[dsName].incoming_parser)) {
					returnValue = self.callValueFunction(self.calculatedSettingScripts[dsName].incoming_parser,dsName);
				} else {
					returnValue = newData;
				}
			} catch (e) {
                console.error("Unable to execute incoming parser for widget of type " + this.type());
                console.error(e);
			}

			if (!_.isUndefined(self.datasourceInstance) && _.isFunction(self.datasourceInstance.onCalculatedValueChanged) && !_.isUndefined(returnValue)) {
				try {
					self.datasourceInstance.onCalculatedValueChanged(self.calculatedSettingScripts[dsName].settingName, returnValue);
				} catch (e) {
                    console.log(e.toString());
				}
			}
		}
	};

	function _createParserFunction (script, debug) {
		try {
			if (debug) {
				script = "debugger;" + script;
			}
			return new Function("datasources", script);
		} catch (e) {
			return new Function("datasources", "return \"" + script + "\";");
		}
	}

	this.updateCalculatedSettings = function () {
		self.datasourceRefreshNotifications = {};
		self.calculatedSettingScripts = {};

		if (_.isUndefined(self.type())) {
			return;
		}

		var settingsDefs = datasourcePlugins[self.type()].settings;
		var currentSettings = self.settings();
		_.each(settingsDefs, function (settingDef) {
			if(settingDef.type === "data") {
				if (currentSettings._datatype === "static") {
					self.datasourceInstance.onCalculatedValueChanged(settingDef.name, currentSettings[settingDef.name]);
				} else if (currentSettings._datatype === "dynamic") {
					var sources = currentSettings[settingDef.name];
					for (var i = 0, len = sources.length; i < len; i++) {
						if (!_.isUndefined(sources[i].dsName)) {

							var parsers = {};

							var debug = sources[i]._debug || false;

							parsers.settingName = settingDef.name;
							if (sources[i].incoming_parser) {
								self.datasourceRefreshNotifications[sources[i].dsName] = sources[i].dsName;
								parsers.incoming_parser = _createParserFunction(sources[i].incoming_parser, debug);
							}

							if (sources[i].outgoing_parser) {
								parsers.outgoing_parser = _createParserFunction(sources[i].outgoing_parser, debug);
							}

							self.calculatedSettingScripts[sources[i].dsName] = parsers;
							self.processCalculatedSetting(sources[i].dsName);
						}
					}
				}
			}
		});
	}

	this.updateCallback = function(newData)
	{
		self.latestData(newData);
		var now = new Date();
		self.last_updated(now.toLocaleTimeString());
		theFreeboardModel.processDatasourceUpdate(self, newData);

		//now see if any other data sources care about this
		var datasources = freeboard.getDatasources();
		for (var i = 0; i < datasources.length; i++) {
			if (datasources[i].name() != self.name()) {
				var settings = datasources[i].settings();
                for (var key in settings) {
                    // skip loop if the property is from prototype
                    if (!settings.hasOwnProperty(key)) continue;
					if (_.isArray(settings[key])) {
						for (var j = 0; j < settings[key].length; j++) {
							//found a datasource that cares
							datasources[i].updateCalculatedSettings();
						}
					}
                }
			}
		}
    };

	this.type = ko.observable();
	this.type.subscribe(function(newValue)
	{
		disposeDatasourceInstance();

		if((newValue in datasourcePlugins) && _.isFunction(datasourcePlugins[newValue].newInstance))
		{
			var datasourceType = datasourcePlugins[newValue];

			function finishLoad()
			{
				datasourceType.newInstance(self.settings(), function(datasourceInstance)
				{

					self.datasourceInstance = datasourceInstance;
					datasourceInstance.updateNow();

				}, self.updateCallback);
			}

			// Do we need to load any external scripts?
			if(datasourceType.external_scripts)
			{
				head.js(datasourceType.external_scripts.slice(0), finishLoad); // Need to clone the array because head.js adds some weird functions to it
			}
			else
			{
				finishLoad();
			}
		}
	});

	this.last_updated = ko.observable("never");
	this.last_error = ko.observable();

	this.serialize = function()
	{
		return {
			name    : self.name(),
			type    : self.type(),
			settings: self.settings()
		};
	}

	this.deserialize = function(object)
	{
		self.settings(object.settings);
		self.name(object.name);
		self.type(object.type);
	}

	this.getDataRepresentation = function(dataPath)
	{
		var valueFunction = new Function("data", "return " + dataPath + ";");
		return valueFunction.call(undefined, self.latestData());
	}

	this.updateNow = function()
	{
		if(!_.isUndefined(self.datasourceInstance) && _.isFunction(self.datasourceInstance.updateNow))
		{
			self.datasourceInstance.updateNow();
		}
	}

	this.dispose = function()
	{
		disposeDatasourceInstance();
	}

	this.sendData = function(data, sendDataCallback)
	{
		return $.when(self.datasourceInstance.sendData(data));
	}

	this.query = function(){
		if(!_.isUndefined(self.datasourceInstance) && !_.isUndefined(self.datasourceInstance.query))
		{
			return self.datasourceInstance.query;
		}
	}

	this.clearQuery = function(){
		if(!_.isUndefined(self.datasourceInstance) && _.isFunction(self.datasourceInstance.clearQuery))
		{
			self.datasourceInstance.clearQuery();
		}
	}
}

DeveloperConsole = function(theFreeboardModel)
{
	function showDeveloperConsole()
	{
		var pluginScriptsInputs = [];
		var container = $('<div></div>');
		var addScript = $('<div class="table-operation text-button">ADD</div>');
		var table = $('<table class="table table-condensed sub-table"></table>');

		table.append($('<thead style=""><tr><th>Plugin Script URL</th></tr></thead>'));

		var tableBody = $("<tbody></tbody>");

		table.append(tableBody);

		container.append($("<p>Here you can add references to other scripts to load datasource or widget plugins.</p>"))
			.append(table)
			.append(addScript)
            .append('<p>To learn how to build plugins for freeboard, please visit <a target="_blank" href="http://freeboard.github.io/freeboard/docs/plugin_example.html">http://freeboard.github.io/freeboard/docs/plugin_example.html</a></p>');

		function refreshScript(scriptURL)
		{
			$('script[src="' + scriptURL + '"]').remove();
		}

		function addNewScriptRow(scriptURL)
		{
			var tableRow = $('<tr></tr>');
			var tableOperations = $('<ul class="board-toolbar"></ul>');
			var scriptInput = $('<input class="table-row-value" style="width:100%;" type="text">');
			var deleteOperation = $('<li><i class="icon-trash icon-white"></i></li>').click(function(e){
				pluginScriptsInputs = _.without(pluginScriptsInputs, scriptInput);
				tableRow.remove();
			});

			pluginScriptsInputs.push(scriptInput);

			if(scriptURL)
			{
				scriptInput.val(scriptURL);
			}

			tableOperations.append(deleteOperation);
			tableBody
				.append(tableRow
				.append($('<td></td>').append(scriptInput))
					.append($('<td class="table-row-operation">').append(tableOperations)));
		}

		_.each(theFreeboardModel.plugins(), function(pluginSource){

			addNewScriptRow(pluginSource);

		});

		addScript.click(function(e)
		{
			addNewScriptRow();
		});

		new DialogBox(container, "Developer Console", "OK", null, function(){

			// Unload our previous scripts
			_.each(theFreeboardModel.plugins(), function(pluginSource){

				$('script[src^="' + pluginSource + '"]').remove();

			});

			theFreeboardModel.plugins.removeAll();

			_.each(pluginScriptsInputs, function(scriptInput){

				var scriptURL = scriptInput.val();

				if(scriptURL && scriptURL.length > 0)
				{
					theFreeboardModel.addPluginSource(scriptURL);

					// Load the script with a cache buster
					head.js(scriptURL + "?" + Date.now());
				}
			});

		});
	}

	// Public API
	return {
		showDeveloperConsole : function()
		{
			showDeveloperConsole();
		}
	}
}

function DialogBox(contentElement, title, okTitle, cancelTitle, okCallback, cancelCallback)
{
	var modal_width = 900;

	// Initialize our modal overlay
	var overlay = $('<div id="modal_overlay" style="display:none;"></div>');

	var modalDialog = $('<div class="modal"></div>');

	this.closeModal = function()
	{
		overlay.fadeOut(200, function()
		{
			$(this).remove();
		});
	}

	// Create our header
	if (typeof title === "string") {
        modalDialog.append('<header><h2 class="title">' + title + "</h2></header>");
	} else {
		modalDialog.append(title);
	}


	$('<section></section>').appendTo(modalDialog).append(contentElement);

	// Create our footer
	var footer = $('<footer></footer>').appendTo(modalDialog);

	if(okTitle)
	{
		var okElem;
		if (typeof okTitle === "string") {
			okElem = $('<span id="dialog-ok" class="text-button">' + okTitle + '</span>');
		} else {
			okElem = okTitle;
		}
		okElem.appendTo(footer).click(function()
		{
			var hold = false;

			if(_.isFunction(okCallback))
			{
				hold = okCallback();
			}

			if(!hold)
			{
				this.closeModal();
			}
		}.bind(this));
	}

	if(cancelTitle)
	{
		$('<span id="dialog-cancel" class="text-button">' + cancelTitle + '</span>').appendTo(footer).click(function()
		{
			var hold = false;
			if(_.isFunction(cancelCallback))
			{
				hold = cancelCallback();
			}

			if(!hold)
			{
				this.closeModal();
			}
		}.bind(this));
	}


	$(modalDialog).keyup(function(e) {
	    var key = e.keyCode ? e.keyCode : e.which;
	    
	    if (key == 13) {
	        $("#dialog-ok").trigger("click");
	    }
	});

	overlay.append(modalDialog);
	$("body").append(overlay);
	overlay.fadeIn(200);
}

function FreeboardModel(datasourcePlugins, widgetPlugins, freeboardUI)
{
	var self = this;

	var SERIALIZATION_VERSION = 1;

	this.version = 0;
	this.isEditing = ko.observable(false);
	this.allow_edit = ko.observable(false);
	this.allow_edit.subscribe(function(newValue)
	{
		if(newValue)
		{
			$("#main-header").show();
		}
		else
		{
			$("#main-header").hide();
		}
	});

	this.header_image = ko.observable();
	this.plugins = ko.observableArray();
	this.datasources = ko.observableArray();
	this.panes = ko.observableArray();
	this.userPerms = {};

	this.datasourceData = {};
	this.processDatasourceUpdate = function(datasourceModel, newData)
	{
		var datasourceName = datasourceModel.name();

		self.datasourceData[datasourceName] = newData;

		_.each(self.panes(), function(pane)
		{
			_.each(pane.tabs(), function(tab){
				_.each(tab.widgets(), function(widget){
					widget.processDatasourceUpdate(datasourceName, newData);
				});
			});
		});
	}

	this._datasourceTypes = ko.observable();
	this.datasourceTypes = ko.computed({
		read: function()
		{
			self._datasourceTypes();

			var returnTypes = [];

			_.each(datasourcePlugins, function(datasourcePluginType)
			{
				var typeName = datasourcePluginType.type_name;
				var displayName = typeName;

				if(!_.isUndefined(datasourcePluginType.display_name))
				{
					displayName = datasourcePluginType.display_name;
				}

				returnTypes.push({
					name        : typeName,
					display_name: displayName
				});
			});

			return returnTypes;
		}
	});

	this._widgetTypes = ko.observable();
	this.widgetTypes = ko.computed({
		read: function()
		{
			self._widgetTypes();

			var returnTypes = [];

			_.each(widgetPlugins, function(widgetPluginType)
			{
				var typeName = widgetPluginType.type_name;
				var displayName = typeName;

				if(!_.isUndefined(widgetPluginType.display_name))
				{
					displayName = widgetPluginType.display_name;
				}

				returnTypes.push({
					name        : typeName,
					display_name: displayName
				});
			});

			return returnTypes;
		}
	});

	this.addPluginSource = function(pluginSource)
	{
		if(pluginSource && self.plugins.indexOf(pluginSource) == -1)
		{
			self.plugins.push(pluginSource);
		}
	}

	this.serialize = function()
	{
		var panes = [];

		_.each(self.panes(), function(pane)
		{
			panes.push(pane.serialize());
		});

		var datasources = [];

		_.each(self.datasources(), function(datasource)
		{
			datasources.push(datasource.serialize());
		});

		return {
			version     : SERIALIZATION_VERSION,
			header_image: self.header_image(),
			allow_edit  : self.allow_edit(),
			plugins     : self.plugins(),
			panes       : panes,
			datasources : datasources,
			columns     : freeboardUI.getUserColumns(),
			userPerms   : self.userPerms
		};
	}

	this.deserialize = function(object, finishedCallback)
	{
		self.clearDashboard();
		freeboardUI.setUserColumns(object.columns);
		freeboardUI.updateGridWidth(object.columns);
		function finishLoad()
		{


			if(!_.isUndefined(object.allow_edit))
			{
				self.allow_edit(object.allow_edit);
			}
			else
			{
				self.allow_edit(true);
			}
			self.version = object.version || 0;
			self.header_image(object.header_image);

			_.each(object.datasources, function(datasourceConfig)
			{
				var datasource = new DatasourceModel(self, datasourcePlugins);
				datasource.deserialize(datasourceConfig);
				self.addDatasource(datasource);
			});

			var sortedPanes = _.sortBy(object.panes, function(pane){
				return freeboardUI.getPositionForScreenSize(pane).row;
			});

			_.each(sortedPanes, function(paneConfig)
			{
				var pane = new PaneModel(self, widgetPlugins);
				pane.deserialize(paneConfig);
				self.panes.push(pane);
			});


			if(object.userPerms !== undefined){
				self.userPerms = object.userPerms;
			} else {
				self.userPerms = {
					editableAttributes : {},
					passwordMod : false
				};
			}

			if(self.allow_edit() && self.panes().length == 0)
			{
				self.setEditing(true);
			}

			if(_.isFunction(finishedCallback))
			{
				finishedCallback();
			}

			freeboardUI.processResize(true);
		}

		// This could have been self.plugins(object.plugins), but for some weird reason head.js was causing a function to be added to the list of plugins.
		_.each(object.plugins, function(plugin)
		{
			self.addPluginSource(plugin);
		});

		// Load any plugins referenced in this definition
		if(_.isArray(object.plugins) && object.plugins.length > 0)
		{
			head.js(object.plugins, function()
			{
				finishLoad();
			});
		}
		else
		{
			finishLoad();
		}
	}

	this.clearDashboard = function()
	{
		freeboardUI.removeAllPanes();

		_.each(self.datasources(), function(datasource)
		{
			datasource.dispose();
		});

		_.each(self.panes(), function(pane)
		{
			pane.dispose();
		});

		self.plugins.removeAll();
		self.datasources.removeAll();
		self.panes.removeAll();
	}

	this.getUserPermission = function(){
		return self.userPerms;
	}

	this.setUserPermission = function(permissionObj){
		return self.userPerms = permissionObj;
	}

	this.loadDashboard = function(dashboardData, callback)
	{
		freeboardUI.showLoadingIndicator(true);
		self.deserialize(dashboardData, function()
		{
			freeboardUI.showLoadingIndicator(false);

			if(_.isFunction(callback))
			{
				callback();
			}

        freeboard.emit("dashboard_loaded");
		});
	}

	this.loadDashboardFromLocalFile = function()
	{
		// Check for the various File API support.
		if(window.File && window.FileReader && window.FileList && window.Blob)
		{
			var input = document.createElement('input');
			input.type = "file";
			$(input).on("change", function(event)
			{
				var files = event.target.files;

				if(files && files.length > 0)
				{
					var file = files[0];
					var reader = new FileReader();

					reader.addEventListener("load", function(fileReaderEvent)
					{

						var textFile = fileReaderEvent.target;
						var jsonObject = JSON.parse(textFile.result);


						self.loadDashboard(jsonObject);
						self.setEditing(false);
					});

					reader.readAsText(file);
				}

			});
			$(input).trigger("click");
		}
		else
		{
			alert('Unable to load a file in this browser.');
		}
	}

	// this.saveDashboardClicked = function(){
	// 	var target = $(event.currentTarget);
	// 	var siblingsShown = target.data('siblings-shown') || false;
	// 	if(!siblingsShown){
	// 		$(event.currentTarget).siblings('label').fadeIn('slow');
	// 	}else{
	// 		$(event.currentTarget).siblings('label').fadeOut('slow');
	// 	}
	// 	target.data('siblings-shown', !siblingsShown);
	// }

	this.saveDashboard = function(_thisref, event)
	{
		var pretty = $(event.currentTarget).data('pretty');
		var contentType = 'application/octet-stream';
		var a = document.createElement('a');
		if(pretty){
			var blob = new Blob([JSON.stringify(self.serialize(), null, '\t')], {'type': contentType});
		}else{
			var blob = new Blob([JSON.stringify(self.serialize())], {'type': contentType});
		}
		document.body.appendChild(a);
		a.href = window.URL.createObjectURL(blob);
		a.download = "dashboard.json";
		a.target="_self";
		a.click();
	}

	this.addDatasource = function(datasource)
	{
		self.datasources.push(datasource);
	}

	this.deleteDatasource = function(datasource)
	{
		delete self.datasourceData[datasource.name()];
		datasource.dispose();
		self.datasources.remove(datasource);
	}

	this.createPane = function()
	{
		window.Need_Save = true;
		var newPane = new PaneModel(self, widgetPlugins);
		self.addPane(newPane);
	}

	this.addGridColumnLeft = function()
	{
		freeboardUI.addGridColumnLeft();
	}

	this.addGridColumnRight = function()
	{
		freeboardUI.addGridColumnRight();
	}

	this.subGridColumnLeft = function()
	{
		freeboardUI.subGridColumnLeft();
	}

	this.subGridColumnRight = function()
	{
		freeboardUI.subGridColumnRight();
	}

	this.addPane = function(pane)
	{
		self.panes.push(pane);
	}

	this.deletePane = function(pane)
	{
		pane.dispose();
		self.panes.remove(pane);
	}

	this.deleteWidget = function(widget)
	{
		ko.utils.arrayForEach(self.panes(), function(pane)
		{
			pane.widgetRemove(widget);
		});

		widget.dispose();
	}

	this.setEditing = function(editing, animate)
	{
		// Don't allow editing if it's not allowed
		if(!self.allow_edit() && editing)
		{
			return;
		}

		self.isEditing(editing);

		if(_.isUndefined(animate))
		{
			animate = true;
		}

		var animateLength = (animate) ? 250 : 0;
		var barHeight = $("#admin-bar").outerHeight();

		if(!editing)
		{
			$("#toggle-header-icon").addClass("icon-wrench").removeClass("icon-chevron-up");
			$(".gridster .gs_w").css({cursor: "default"});
			$("#main-header").animate({"top": "-" + barHeight + "px"}, animateLength);
			$("#board-content").animate({"top": "20"}, animateLength);
			$("#main-header").data().shown = false;
			$(".sub-section").unbind();

			$(".editTool").hide();
			freeboardUI.showPaneEditIcons(false);
			freeboardUI.disableGrid();
		}
		else
		{
			$("#toggle-header-icon").addClass("icon-chevron-up").removeClass("icon-wrench");
			$(".gridster .gs_w").css({cursor: "pointer"});
			$("#main-header").animate({"top": "0px"}, animateLength);
			$("#board-content").animate({"top": (barHeight + 20) + "px"}, animateLength);
			$("#main-header").data().shown = true;
			$(".editTool").show();
			freeboardUI.attachWidgetEditIcons($(".sub-section"));
			freeboardUI.showPaneEditIcons(true);
			freeboardUI.enableGrid();
		}

		freeboardUI.showPaneEditIcons(editing, animate);
	}

	this.toggleEditing = function()
	{
		var editing = !self.isEditing();
		self.setEditing(editing);
	}
}

function FreeboardUI()
{
	var PANE_MARGIN = 10;
	var PANE_WIDTH = 300;
	var MIN_COLUMNS = 3;
	var COLUMN_WIDTH = PANE_MARGIN + PANE_WIDTH + PANE_MARGIN;

	var userColumns = MIN_COLUMNS;

	var loadingIndicator = $('<div class="wrapperloading"><div class="loading up" ></div><div class="loading down"></div></div>');
	var grid;

	var gridWidth = 3;

	function processResize(layoutWidgets)
	{
		var maxDisplayableColumns = getMaxDisplayableColumnCount();
		var repositionFunction = function(){};
		if(layoutWidgets)
		{
			repositionFunction = function(index)
			{
				var paneElement = this;
				var paneModel = ko.dataFor(paneElement);

				var newPosition = getPositionForScreenSize(paneModel);
				$(paneElement).attr("data-sizex", Math.min(paneModel.col_width(),
					maxDisplayableColumns, grid.cols))
					.attr("data-row", newPosition.row)
					.attr("data-col", newPosition.col);

				paneModel.processSizeChange();
			}
		}

		updateGridWidth(Math.min(maxDisplayableColumns, userColumns));

		repositionGrid(repositionFunction);
		updateGridColumnControls();
	}

	function addGridColumn(shift)
	{
		var num_cols = grid.cols + 1;
		if(updateGridWidth(num_cols))
		{
			window.Need_Save = true;
			repositionGrid(function() {
				var paneElement = this;
				var paneModel = ko.dataFor(paneElement);

				var prevColumnIndex = grid.cols > 1 ? grid.cols - 1 : 1;
				var prevCol = paneModel.col[prevColumnIndex];
				var prevRow = paneModel.row[prevColumnIndex];
				var newPosition;
				if(shift)
				{
					leftPreviewCol = true;
					var newCol = prevCol < grid.cols ? prevCol + 1 : grid.cols;
					newPosition = {row: prevRow, col: newCol};
				}
				else
				{
					rightPreviewCol = true;
					newPosition = {row: prevRow, col: prevCol};
				}
				$(paneElement).attr("data-sizex", Math.min(paneModel.col_width(), grid.cols))
					.attr("data-row", newPosition.row)
					.attr("data-col", newPosition.col);
			});
		}
		updateGridColumnControls();
		userColumns = grid.cols;
	}

	function subtractGridColumn(shift)
	{
		var num_cols = grid.cols - 1;
		if(updateGridWidth(num_cols))
		{
			repositionGrid(function() {
				window.Need_Save = true;
				var paneElement = this;
				var paneModel = ko.dataFor(paneElement);

				var prevColumnIndex = grid.cols + 1;
				var prevCol = paneModel.col[prevColumnIndex];
				var prevRow = paneModel.row[prevColumnIndex];
				var newPosition;
				if(shift)
				{
					var newCol = prevCol > 1 ? prevCol - 1 : 1;
					newPosition = {row: prevRow, col: newCol};
				}
				else
				{
					var newCol = prevCol <= grid.cols ? prevCol : grid.cols;
					newPosition = {row: prevRow, col: newCol};
				}
				$(paneElement).attr("data-sizex", Math.min(paneModel.col_width(), grid.cols))
					.attr("data-row", newPosition.row)
					.attr("data-col", newPosition.col);
			});
		}
		updateGridColumnControls();
		userColumns = grid.cols;
	}

	function updateGridColumnControls()
	{
		var col_controls = $(".column-tool");
		var available_width = $("#board-content").width();
		var max_columns = Math.floor(available_width / COLUMN_WIDTH);

		if(grid.cols <= MIN_COLUMNS)
		{
			col_controls.addClass("min");
		}
		else
		{
			col_controls.removeClass("min");
		}

		if(grid.cols >= max_columns)
		{
			col_controls.addClass("max");
		}
		else
		{
			col_controls.removeClass("max");
		}
	}

	function getMaxDisplayableColumnCount()
	{
		var available_width = $("#board-content").width();
		return Math.floor(available_width / COLUMN_WIDTH);
	}

	function updateGridWidth(newCols)
	{
		if(newCols === undefined || newCols < MIN_COLUMNS)
		{
			newCols = MIN_COLUMNS;
		}

		var max_columns = getMaxDisplayableColumnCount();
		if(newCols > max_columns)
		{
			newCols = max_columns;
		}

		// +newCols to account for scaling on zoomed browsers
		var new_width = (COLUMN_WIDTH * newCols) + newCols;
		$(".responsive-column-width").css("max-width", new_width);

		gridWidth = newCols;

		if(newCols === grid.cols)
		{
			return false; 
		}
		else
		{
			return true;
		}
	}

	function repositionGrid(repositionFunction)
	{
		var rootElement = grid.$el;

		rootElement.find("> li").unbind().removeData();
		$(".responsive-column-width").css("width", "");
		grid.generate_grid_and_stylesheet();

		rootElement.find("> li").each(repositionFunction);

		grid.init();
		$(".responsive-column-width").css("width", grid.cols * PANE_WIDTH + (grid.cols * PANE_MARGIN * 2));
	}

	function getUserColumns()
	{
		return userColumns;
	}

	function setUserColumns(numCols)
	{
		userColumns = Math.max(MIN_COLUMNS, numCols);
	}

	ko.bindingHandlers.grid = {
		init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext)
		{
			// Initialize our grid
			grid = $(element).gridster({
				widget_margins        : [PANE_MARGIN, PANE_MARGIN],
				widget_base_dimensions: [PANE_WIDTH, 10],
				resize: {
					enabled : false,
					axes : "x"
				}
			}).data("gridster");

			processResize(false);
			grid.disable();
		}
	}

	function addPane(element, viewModel, isEditing)
	{
		var position = getPositionForScreenSize(viewModel);
		var col = position.col;
		var row = position.row;
		var width = Number(viewModel.width());
		var height = Number(viewModel.getCalculatedHeight());

		grid.add_widget(element, width, height, col, row);

		if(isEditing)
		{
			showPaneEditIcons(true);
		}

		updatePositionForScreenSize(viewModel, row, col);
		$(element).addClass("pane");

		$(element).attrchange({
			trackValues: true,
			callback   : function(event)
			{
				if(event.attributeName == "data-row")
				{
                    updatePositionForScreenSize(viewModel, Number(event.newValue), undefined);
				}
				else if(event.attributeName == "data-col")
				{
                    updatePositionForScreenSize(viewModel, undefined, Number(event.newValue));
				}
			}
		});
	}

	function updatePane(element, viewModel)
	{
		// If widget has been added or removed
		var calculatedHeight = viewModel.getCalculatedHeight();

		var elementHeight = Number($(element).attr("data-sizey"));
		var elementWidth = Number($(element).attr("data-sizex"));

		var colWidth = Number.parseInt(viewModel.col_width());

		if(calculatedHeight != elementHeight || colWidth !=  elementWidth)
		{
			grid.resize_widget($(element), colWidth, calculatedHeight, function(){
				grid.set_dom_grid_height();
			});
		}


	}

	function updatePositionForScreenSize(paneModel, row, col)
	{
		var displayCols = grid.cols;

		if(!_.isUndefined(row)) paneModel.row[displayCols] = Number.parseInt(row);
		if(!_.isUndefined(col)) paneModel.col[displayCols] = Number.parseInt(col);
	}

	function showLoadingIndicator(show)
	{
		if(show)
		{
			loadingIndicator.fadeOut(0).appendTo("body").fadeIn(500);
		}
		else
		{
	    		loadingIndicator.fadeOut(500).remove();
		}
	}

	function showPaneEditIcons(show, animate)
	{
		if(_.isUndefined(animate))
		{
			animate = true;
		}

		var animateLength = (animate) ? 250 : 0;

		if(show)
		{
			$(".pane-tools").css("display", "block").animate({opacity: 1.0}, animateLength);
			$("#column-tools").fadeIn(animateLength);
			$(".hidden-header-toolbar").fadeIn(animateLength);
		}
		else
		{
			$(".pane-tools").animate({opacity: 0.0}, animateLength).css("display", "none");
			$("#column-tools").fadeOut(animateLength);
			$(".hidden-header-toolbar").fadeOut(animateLength);
		}
	}

	function attachWidgetEditIcons(element)
	{
		$(element).hover(function()
		{
			showWidgetEditIcons(this, true);
		}, function()
		{
			showWidgetEditIcons(this, false);
		});
	}

	function showWidgetEditIcons(element, show)
	{
		if(show)
		{
			$(element).find(".sub-section-tools").fadeIn(250);
		}
		else
		{
			$(element).find(".sub-section-tools").fadeOut(250);
		}
	}

	function getPositionForScreenSize(paneModel)
	{
		var cols = gridWidth;

		if(_.isNumber(paneModel.row) && _.isNumber(paneModel.col)) // Support for legacy format
		{
			var obj = {};
			obj[cols] = paneModel.row;
			paneModel.row = obj;


			obj = {};
			obj[cols] = paneModel.col;
			paneModel.col = obj;
		}

		var newColumnIndex = 1;
		var columnDiff = 1000;

		for(var columnIndex in paneModel.col)
		{
			if(columnIndex == cols)	 // If we already have a position defined for this number of columns, return that position
			{
				return {row: paneModel.row[columnIndex], col: paneModel.col[columnIndex]};
			}
			else if(paneModel.col[columnIndex] > cols) // If it's greater than our display columns, put it in the last column
			{
				newColumnIndex = cols;
			}
			else // If it's less than, pick whichever one is closest
			{
				var delta = cols - columnIndex;

				if(delta < columnDiff)
				{
					newColumnIndex = columnIndex;
					columnDiff = delta;
				}
			}
		}

		if(newColumnIndex in paneModel.col && newColumnIndex in paneModel.row)
		{
			return {row: paneModel.row[newColumnIndex], col: paneModel.col[newColumnIndex]};
		}

		return {row:1,col:newColumnIndex};
	}


	// Public Functions
	return {
		showLoadingIndicator : function(show)
		{
			showLoadingIndicator(show);
		},
		showPaneEditIcons : function(show, animate)
		{
			showPaneEditIcons(show, animate);
		},
		attachWidgetEditIcons : function(element)
		{
			attachWidgetEditIcons(element);
		},
		getPositionForScreenSize : function(paneModel)
		{
			return getPositionForScreenSize(paneModel);
		},
		processResize : function(layoutWidgets)
		{
			processResize(layoutWidgets);
		},
		disableGrid : function()
		{
			grid.disable();
		},
		enableGrid : function()
		{
			grid.enable();
		},
		addPane : function(element, viewModel, isEditing)
		{
			addPane(element, viewModel, isEditing);
		},
		updatePane : function(element, viewModel)
		{
			updatePane(element, viewModel);
		},
		removePane : function(element)
		{
			grid.remove_widget(element);
		},
		removeAllPanes : function()
		{
			grid.remove_all_widgets();
		},
		addGridColumnLeft : function()
		{
			addGridColumn(true);
		},
		addGridColumnRight : function()
		{
			addGridColumn(false);
		},
		subGridColumnLeft : function()
		{
			subtractGridColumn(true);
		},
		subGridColumnRight : function()
		{
			subtractGridColumn(false);
		},
		getUserColumns : function()
		{
			return getUserColumns();
		},
		setUserColumns : function(numCols)
		{
			setUserColumns(numCols);
		},
		updateGridWidth: function(numCols) {
			updateGridWidth(numCols);
		}
	}
}


JSEditor = function () {
	var assetRoot = ""

	function setAssetRoot(_assetRoot) {
		assetRoot = _assetRoot;
	}

	function displayJSEditor(value, options, callback) {

		var exampleText = "// Example: Convert temp from C to F and truncate to 2 decimal places.\n// return (datasources[\"MyDatasource\"].sensor.tempInF * 1.8 + 32).toFixed(2);";


		// If value is empty, go ahead and suggest something
		if (!value) {
			value = options && options.exampleText ? options.exampleText : exampleText;
		}

		var codeWindow = $('<div class="code-window"></div>');
		var codeMirrorWrapper = $('<div class="code-mirror-wrapper"></div>');
		var codeWindowFooter = $('<div class="code-window-footer"></div>');
		var defaultHelpText = 'This javascript will be re-evaluated any time a datasource referenced here is updated, and the value you <code><span class="cm-keyword">return</span></code> will be displayed in the widget. You can assume this javascript is wrapped in a function of the form <code><span class="cm-keyword">function</span>(<span class="cm-def">datasources</span>)</code> where datasources is a collection of javascript objects (keyed by their name) corresponding to the most current data in a datasource.';
		var helpText = options && options.helpText ? options.helpText : defaultHelpText;
		var codeWindowHeader = $('<div class="code-window-header cm-s-ambiance">'+helpText+'</div>');

		codeWindow.append([codeWindowHeader, codeMirrorWrapper, codeWindowFooter]);

		$("body").append(codeWindow);

		var codeMirrorEditor = CodeMirror(codeMirrorWrapper.get(0),
			{
				value: value,
				mode: "javascript",
				theme: "ambiance",
				indentUnit: 4,
				lineNumbers: true,
				matchBrackets: true,
				autoCloseBrackets: true
			}
		);

		var closeButton = $('<span id="dialog-cancel-code" class="text-button">Close</span>').click(function () {
			if (callback) {
				var newValue = codeMirrorEditor.getValue();

				if (newValue === exampleText) {
					newValue = "";
				}

				callback(newValue);
				codeWindow.remove();
			}
		});

		codeWindowFooter.append(closeButton);
	}

	// Public API
	return {
		displayJSEditor: function (value, options, callback) {
			displayJSEditor(value, options, callback);
		},
		setAssetRoot: function (assetRoot) {
			setAssetRoot(assetRoot)
		}
	}
}

JSEditorOld = function () {
	var assetRoot = ""

	function setAssetRoot(_assetRoot) {
		assetRoot = _assetRoot;
	}

	function displayJSEditor(value, callback) {

		var exampleText = "// Example: Convert temp from C to F and truncate to 2 decimal places.\n// return (datasources[\"MyDatasource\"].sensor.tempInF * 1.8 + 32).toFixed(2);";

		// If value is empty, go ahead and suggest something
		if (!value) {
			value = exampleText;
		}

		var codeWindow = $('<div class="code-window"></div>');
		var codeMirrorWrapper = $('<div class="code-mirror-wrapper"></div>');
		var codeWindowFooter = $('<div class="code-window-footer"></div>');
		var codeWindowHeader = $('<div class="code-window-header cm-s-ambiance">This javascript will be re-evaluated any time a datasource referenced here is updated, and the value you <code><span class="cm-keyword">return</span></code> will be displayed in the widget. You can assume this javascript is wrapped in a function of the form <code><span class="cm-keyword">function</span>(<span class="cm-def">datasources</span>)</code> where datasources is a collection of javascript objects (keyed by their name) corresponding to the most current data in a datasource.</div>');

		codeWindow.append([codeWindowHeader, codeMirrorWrapper, codeWindowFooter]);

		$("body").append(codeWindow);

		var codeMirrorEditor = CodeMirror(codeMirrorWrapper.get(0),
			{
				value: value,
				mode: "javascript",
				theme: "ambiance",
				indentUnit: 4,
				lineNumbers: true,
				matchBrackets: true,
				autoCloseBrackets: true
			}
		);

		var closeButton = $('<span id="dialog-cancel-code" class="text-button">Close</span>').click(function () {
			if (callback) {
				var newValue = codeMirrorEditor.getValue();

				if (newValue === exampleText) {
					newValue = "";
				}

				callback(newValue);
				codeWindow.remove();
			}
		});

		codeWindowFooter.append(closeButton);
	}

	// Public API
	return {
		displayJSEditor: function (value, callback) {
			displayJSEditor(value, callback);
		},
		setAssetRoot: function (assetRoot) {
			setAssetRoot(assetRoot)
		}
	}
}


function PaneModel (theFreeboardModel, widgetPlugins) {
    var self = this;

    this.title = ko.observable();
    this.pane_id = ko.observable();
    this.width = ko.observable(1);
    this.display_header = ko.observable(2);
    this.header_theme = ko.observable("primary");
    this.row = {};
    this.col = {};
    this.pane_type = ko.observable();
    this.col_width = ko.observable(1);
    this.col_width.subscribe(function (newValue) {
        self.processSizeChange();
    });


    this.tabs = ko.observableArray();
    this.currentTabIdx = ko.observable(0);
	this.tabs.push(new PaneTabModel(theFreeboardModel, widgetPlugins));

    this.currentTabIdx.subscribe(function(newValue) {
        self.refreshWidgets();//set widgets of tab to render
        self.processSizeChange();
    });
	

   
    this.addWidget = function (widget) {
        self.tabs()[self.currentTabIdx()].addWidget(widget);
    }
    this.refreshWidgets = function () {

        var widgetArray = self.tabs()[self.currentTabIdx()].widgets();
        var initial = widgetArray.length
        for (var i = 0; i < initial; i++) {
            widgetArray[i].shouldRender(true)
        }
    }
    this.widgetRemove = function (widget) {
        self.tabs()[self.currentTabIdx()].widgets.remove(widget)
    }
    this.widgetCanMoveUp = function (widget) {
        return (self.tabs()[self.currentTabIdx()].widgets.indexOf(widget) >= 1);
    }

    this.widgetCanMoveDown = function (widget) {
        var i = self.tabs()[self.currentTabIdx()].widgets.indexOf(widget);

        return (i < self.tabs()[self.currentTabIdx()].widgets().length - 1);
    }

    this.moveWidgetUp = function (widget) {
        if (self.widgetCanMoveUp(widget)) {
            window.Need_Save = true;
            var widgetsInTab = self.tabs()[self.currentTabIdx()].widgets;
            var i = widgetsInTab().indexOf(widget);
            widgetsInTab().splice(i - 1, 2, widgetsInTab()[i], widgetsInTab()[i - 1]);
            widgetsInTab.valueHasMutated();
        }
    }

    this.moveWidgetDown = function (widget) {
        if (self.widgetCanMoveDown(widget)) {

            window.Need_Save = true;
            var widgetsInTab = self.tabs()[self.currentTabIdx()].widgets;
            var i = widgetsInTab().indexOf(widget);
            widgetsInTab().splice(i, 2, widgetsInTab()[i + 1], widgetsInTab()[i]);
            widgetsInTab.valueHasMutated();
        }
    }

    var _getWidthForWidget = function (widget) {
        try {
            return parseInt(widget.settings().container_width);    
        } catch(e) {
            console.error("unable to get container_width for widget");
            console.error(e);
            return 100;
        }
    }

    this.processSizeChange = function () {
        // Give the animation a moment to complete. Really hacky.
        // TODO: Make less hacky. Also, doesn't work when screen resizes.
        var currentWidgetWidth;
        if(self.tabs()[self.currentTabIdx()] !== undefined){ 
	        setTimeout(function () {
	            _.each(self.tabs()[self.currentTabIdx()].widgets(), function (widget) {
                    currentWidgetWidth = _getWidthForWidget(widget);
                    if(widget.parentElement && currentWidgetWidth) {
                        widget.parentElement.css({"flex-basis": currentWidgetWidth + "%"});
                    }
	                widget.processSizeChange();
	            });
	        }, 50);
	    }
    }

    this.getCalculatedHeight = function () {

    	var sumHeights = 0;

    	if(self.tabs()[self.currentTabIdx()] !== undefined){

    		var widgets = self.tabs()[self.currentTabIdx()].widgets()

            for( var i = 0, len = widgets.length, widgetW = 0, widgetH = 0, rowH = 0, rowW = 0; i < len; i++){
                widgetW = _getWidthForWidget(widgets[i]);
                widgetH = widgets[i].height();

                rowW += widgetW;

                if(rowW > 100){
                    // Adding widget would exceed row
                    sumHeights += rowH;
                    rowH = 0;
                    rowW = rowW - 100;
                    rowW = widgetW;
                }

                // Make sure row accomidates highest widget
                rowH = Math.max(widgetH, rowH);

                // If we have a full row, or it is the last widget in the pane
                if(rowW === 100 || (i === len-1)){
                    sumHeights += rowH;
                    rowH = 0;
                    rowW = 0;
                }
            }
    	}

        sumHeights *= 6;
        sumHeights += 3;
        sumHeights *= 10;
        if (self.pane_type() == true) {
            sumHeights += 35
        }//accounts for tabs height

        var rows = Math.ceil((sumHeights + 20) / 30);

        return Math.max(4, rows);
    }

    this.serialize = function () {
        var savedtabs = [];
		//generate an array of serialized tabs
		        
		var tabs = self.tabs();
		for( var i = 0, len = tabs.length ; i < len ; i++ ){
			savedtabs.push(tabs[i].serialize());
		}

        return {
            pane_type: self.pane_type(),
            title: self.title(),
            pane_id: self.pane_id(),
            width: self.width(),
            display_header: self.display_header(),
            header_theme: self.header_theme(),
            row: self.row,
            col: self.col,
            col_width: self.col_width(),
            tabs: savedtabs
        };

    }

    this.deserialize = function (object) {
        self.pane_type(object.pane_type);
        self.tabs.removeAll();
        self.title(object.title);
        self.pane_id(object.pane_id);
        self.width(object.width);
        // Support older portals by defaulting to show headers if attribute not present
        var showHeader = object.display_header === undefined ? true : object.display_header;
        self.display_header(showHeader);
        var headerTheme = object.header_theme === undefined ? "primary" : object.header_theme;
        self.header_theme(headerTheme);
        self.row = object.row;
        self.col = object.col;
        self.col_width(object.col_width || 1);
        if (object.tabs) {

        	for( var i = 0, len = object.tabs.length ; i < len ; i++ ){
        		var parsedTab = new PaneTabModel(theFreeboardModel, widgetPlugins);
        		parsedTab.deserialize(object.tabs[i]);
        		self.tabs.push(parsedTab);
        	}
            self.currentTabIdx(0);
        }
        else {
        	// Make a default tab
    		var newTab = new PaneTabModel(theFreeboardModel, widgetPlugins);
            _.each(object.widgets, function (widgetConfig) {
                var widget = new WidgetModel(theFreeboardModel, widgetPlugins);
                widget.deserialize(widgetConfig);
                newTab.widgets.push(widget);
            });
            self.tabs.push(newTab);
            self.currentTabIdx(0);
        }
    }

    this.dispose = function () {
        _.each(self.tabs()[self.currentTabIdx()].widgets, function (widget) {
            widget.dispose();
        });
    }

    this.addTab = function (addButton) {
        self.tabs.push(new PaneTabModel(theFreeboardModel, widgetPlugins));
        self.currentTabIdx(self.tabs().length - 1);

        //should only occur when a user clicks on the add tab button. not when we call this method directly
        if(addButton) {
            positionTabContainer($(addButton).parent());
        }
    }

    this.editTab = function(index) {
		//Display tab edit dialog
		var tabEditDialog = {};
		var tab = self.tabs()[index];
		var rmTab = false;
		var $editForm = $("<form>").on("submit", function(){
			return false; // Prevent page reload on form submission
		});
        
        var $titleInput = $("<input>")
                .attr({
                    type: "text",
                    placeholder: "Tab Title"
                })
                .val(tab.title())
                .addClass("form-input-row");

        var $deleteTab = $("<input>")
        		.attr("type", "button")
        		.val("Delete Tab")
        		.on("click", function(){
                    var phraseElement = $('<p>Are you sure you want to delete this tab?</p>');
                    new DialogBox(phraseElement, "Confirm Delete", "Yes", "No", function() {
                        rmTab = true;
                        $("#dialog-ok").trigger("click");
                    });
		        });

        $editForm.append([$titleInput, $deleteTab]);

        tabEditDialog = new DialogBox($editForm, "Tab Editor", "Save", "Cancel", function()
        {
            tabEditDialog.closeModal();
        	tab.title($titleInput.val());
        	if(rmTab){
                // If there is only one tab left, set pane to non-tabbed
                if(self.tabs().length === 1){
                    self.pane_type(false);
                }
                // Else, remove and transition to appropriate tab
                else {
                    if(index > 0){
                        self.currentTabIdx((index - 1));
                        self.tabs.splice(index, 1);
                    }
                    else {
                        self.tabs.splice(index, 1);
                        self.currentTabIdx(index)
                    }
                }
	    	}
            return true;
        }); 

    	return;
    }

    this.updateCurrentTab = function(index){
        self.currentTabIdx(index);
    }

    //can update one or many tab containers
    var positionTabContainer = function (elem) {
        elem.animate({scrollLeft: '+=1500'}, 500);
    }

    this.headerShouldDisplay = function () {
        return self.display_header();
    }

    this.headerShouldHide = function () {
        return !self.display_header();
    }

    this.getHeaderTheme = function () {
        return self.header_theme();
    }

}

function PaneTabModel (theFreeboardModel, widgetPlugins) {
    
    var self = this;

    this.title = ko.observable();
    this.widgets = ko.observableArray();
    
    this.addWidget = function(widget) {
        self.widgets.push(widget);
    }

    this.serialize = function(){
    	var serializedTab = {};

    	serializedTab.title = self.title();
    	serializedTab.widgets = [];

    	_.each(self.widgets(), function (widget) {
            serializedTab.widgets.push(widget.serialize());
        });
    	return serializedTab;
    }

    this.deserialize = function(object){
    	self.title(object.title);
    	_.each(object.widgets, function (widgetConfig) {//for every widget on this specific tab, create a new model and slap on the settings of past widget
            var widget = new WidgetModel(theFreeboardModel, widgetPlugins);
            widget.deserialize(widgetConfig);
            self.widgets().push(widget);
        })
    }
}
// JSEditorOld and ValueEditorOld allows the calculated input option. 
// The old editors are taken from the pre parser version of freeboard. 
// This means that input will be whatever is typed into the JSEditor 
// instead of just what is return adding more flexibility to what our 
// inputs can be for a widget.

var PARSER_LABEL = {
	INCOMING: "INCOMING PARSER",
	OUTGOING: "OUTGOING PARSER"
}




PluginEditor = function(jsEditor, jsEditorOld, valueEditor, valueEditorOld)
{
	var incomingHelpText = 'This javascript will be re-evaluated any time the corresponding datasource is updated, and the value you <code><span class="cm-keyword">return</span></code> will be displayed in the widget. You have access to the following: <br> 1) The <code><span class="cm-keyword">this</span></code> keyword which has the following properties - <br> &nbsp;&nbsp;&nbsp;&nbsp; <code><span class="cm-keyword">widget</span></code> (widget that uses the datasource) <br> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;i. Use this to retrieve the current value for your widget, e.g., <code><span class="cm-keyword">this.widget</span></code> <br> &nbsp;&nbsp;&nbsp;&nbsp; <code><span class="cm-keyword">datasource</span></code> (datasource which triggered the parser) <br> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;i. Use this to retrieve the current value for your datasource, e.g., <code><span class="cm-keyword">this.datasource</span></code>  <br>  2) A variable named <code><span class="cm-keyword">datasources</span></code> <br> &nbsp;&nbsp;&nbsp;&nbsp; Use this to access any datasource within your portal. e.g., <code><span class="cm-keyword">datasources["dataSourceName"].latestData()</span> <br> 3) A variable named <code><span class="cm-keyword">panes</span></code> <br> &nbsp;&nbsp;&nbsp;&nbsp; Use this to access any pane within your portal. e.g., <code><span class="cm-keyword">panes["uniquePaneId"].updateCurrentTab(2)</span></code>';
	var outgoingHelpText = 'This javascript will be re-evaluated any time this widget\'s state changes, and the value you <code><span class="cm-keyword">return</span></code> will be sent to this datasource. You have access to the following: <br> 1) The <code><span class="cm-keyword">this</span></code> keyword which has the following properties - <br> &nbsp;&nbsp;&nbsp;&nbsp; <code><span class="cm-keyword">widget</span></code> (widget that uses the datasource) <br> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;i. Use this to retrieve the current value for your widget, e.g., <code><span class="cm-keyword">this.widget</span></code> <br> &nbsp;&nbsp;&nbsp;&nbsp; <code><span class="cm-keyword">datasource</span></code> (datasource which triggered the parser) <br> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;i. Use this to retrieve the current value for your datasource, e.g., <code><span class="cm-keyword">this.datasource</span></code>  <br>  2) A variable named <code><span class="cm-keyword">datasources</span></code> <br> &nbsp;&nbsp;&nbsp;&nbsp; Use this to access any datasource within your portal. e.g., <code><span class="cm-keyword">datasources["dataSourceName"].latestData()</span> <br> 3) A variable named <code><span class="cm-keyword">panes</span></code> <br> &nbsp;&nbsp;&nbsp;&nbsp; Use this to access any pane within your portal. e.g., <code><span class="cm-keyword">panes["uniquePaneId"].updateCurrentTab(2)</span></code>';
	var incomingExampleText = '// default - return the value for the datasource \nreturn this.datasource;';
	var outgoingExampleText = '// default - return the value for the widget \nreturn this.widget;';

	var selectedType;
	var newSettings = {
			type    : "",
			settings: {}
		};

	var getDatasource = function(dsName){
		var allDatasources = freeboard.getDatasources();
		for(i in allDatasources){
			if(allDatasources[i].name() === dsName)
				return allDatasources[i];
		}
		return null;
	}


	// Returns updated datasource settings with widget/source parsers, or examples if not specified
	var generateDefaultParser = function(settings){
		// Fetch targeted datasource
		var ds = getDatasource(settings.dsName);
		if(ds === null){
			// No matching datasource... perhaps widget is tied to deleted source
			console.error("unknown datasource");
			return settings;
		}
		var dsType = ds.type();
		if(selectedType.default_parsers === undefined || selectedType.default_parsers[dsType] === undefined){
			// Widget does not have parsers for datasource type, reset widget specified parsers to example text
			if(settings.outgoing_parser !== undefined)
				settings.outgoing_parser = outgoingExampleText;
			if(settings.incoming_parser !== undefined)
				settings.incoming_parser = incomingExampleText; 
			return settings;
		}
		// Widget specifies incoming parser 
		if(settings.incoming_parser !== undefined){
			// Update settings with matching default parser or with example
			if(selectedType.default_parsers[dsType].incoming !== undefined)
				settings.incoming_parser =  selectedType.default_parsers[dsType].incoming;
			else
				settings.incoming_parser = incomingExampleText; 
		}
		// Widget specifies outgoing parser 
		if(settings.outgoing_parser !== undefined){
			if(selectedType.default_parsers[dsType].outgoing !== undefined)
				settings.outgoing_parser = selectedType.default_parsers[dsType].outgoing;
			else
				settings.outgoing_parser = outgoingExampleText;
		}
		return settings;
	}



	function _displayValidationError(settingName, errorMessage)
	{
		var errorElement = $('<div class="validation-error"></div>').html(errorMessage);
		$("#setting-value-container-" + settingName).append(errorElement);
	}

	function _removeSettingsRows()
	{
		if($("#setting-row-instance-name").length)
		{
			$("#setting-row-instance-name").nextAll().remove();
		}
		else
		{
			$("#setting-row-plugin-types").nextAll().remove();
		}
	}

	function _isNumerical(n)
	{
		return !isNaN(parseFloat(n)) && isFinite(n);
	}

	function _createParserEditorTool(label, options, getValueFn, callback) {
		return $('<li><i class="icon-fullscreen"></i><label>'+label+'</label></li>')
			.mousedown(function(e) {
				e.preventDefault();
				jsEditor.displayJSEditor(getValueFn(), options, callback);
			});
	}


	function _appendDynamicSettingsRow(valueCell, settings, settingDef, removeCb)
	{
		var inputFrame = $('<div class="styled-select"></div>');
		var input = $("<select>")
				.css({
					    "position": "absolute",
					    "width": "414px",
					    "height": "30px",
					    "resize": "none",
					    "white-space": "nowrap",
					    "overflow": "auto"
				});
		var datasourceToolbox = $('<ul class="board-toolbar datasource-input-suffix"></ul>');
		var wrapperDiv = $('<div class="calculated-setting-row">');

		var allDatasources = freeboard.getDatasources();
		var dsName = "";
		var selectedDS = "";

		if((settings && settings.dsName) && (settings.dsName !== undefined)){
			// Datasource already selected
			selectedDS = settings.dsName;
		} else if( allDatasources.length > 0 ){
			// Default to first datasource
			settings.dsName = selectedDS = allDatasources[0].name();
		} else {
			// No available datasources
			console.warn("Portal has no datasources to select from.");
			return;
		}

		if(settings._debug === undefined)
			settings._debug = false;

		// Add option for each datasource
		for(i in allDatasources){
			dsName = allDatasources[i].name();
			var option = $("<option>").val(dsName).text(dsName);
			if(dsName === selectedDS){
				option.attr("selected","selected");
			}
			input.append(option);
		}

		// On select, change datasource
		input.change(function() {
			settings.dsName = input.val();
			settings = generateDefaultParser(settings);
		});
		
		inputFrame.append([input, datasourceToolbox]);
		wrapperDiv.append(inputFrame);

		if(settingDef.incoming_parser) {
			if(!settings.incoming_parser) {
				settings.incoming_parser = incomingExampleText; // Set default, generateDefaultParser will override if exists
				settings = generateDefaultParser(settings);
			}
			datasourceToolbox.append(_createParserEditorTool(PARSER_LABEL.INCOMING, {helpText: incomingHelpText, exampleText: settings.incoming_parser}, function() {
				return settings.incoming_parser || "";
			}, function(result) {
				settings.incoming_parser = result;
			}));
		}

		if(settingDef.outgoing_parser) {
			if(!settings.outgoing_parser) {
				settings.outgoing_parser = outgoingExampleText; // Set default, generateDefaultParser will override if exists
				settings = generateDefaultParser(settings);
			}
			datasourceToolbox.append(_createParserEditorTool(PARSER_LABEL.OUTGOING, {helpText: outgoingHelpText, exampleText: settings.outgoing_parser}, function() {
				return settings.outgoing_parser || "";
			}, function(result) {
				settings.outgoing_parser = result;
			}));
		}

		var $debugToggle = $('<input type="checkbox">')
			.css({"width":"25px"})
			.on("change", function(e) {
				e.preventDefault();
				settings._debug= !settings._debug;
			});
		if(settings._debug){
			$debugToggle.attr("checked", "checked");
		}
		var $debugLabel = $("<label>")
			.text("Debug")
			.css("margin-top", "-6px")
			.prepend($debugToggle);
		var $debugOption = $('<li>')
			.append($debugLabel);
		datasourceToolbox.append($debugOption);

		if(removeCb && _.isFunction(removeCb)) {
			var removeButton = $('<li class="remove-setting-row"><i class="icon-minus"></i><label></label></li>')
				.mousedown(function(e) {
					e.preventDefault();
					wrapperDiv.remove();
					removeCb(settings);
					
				});
			datasourceToolbox.prepend(removeButton);
		}

		$(valueCell).append(wrapperDiv);
	}

	function _appendCalculatedSettingRowOld(valueCell, newSettings, settingDef, currentValue, includeRemove)
	{

		var input = $('<textarea></textarea>');

		if(settingDef.multi_input) {
			input.change(function() {
				var arrayInput = [];
				$(valueCell).find('textarea').each(function() {
					var thisVal = $(this).val();
					if(thisVal) {
						arrayInput = arrayInput.concat(thisVal);
					}
				});
				newSettings.settings[settingDef.name] = arrayInput;
			});
		} else {
			input.change(function() {
				newSettings.settings[settingDef.name] = $(this).val();
			});
		}

		if(currentValue) {
			input.val(currentValue);
		}

		valueEditorOld.createValueEditor(input);

		var datasourceToolbox = $('<ul class="board-toolbar datasource-input-suffix"></ul>');
		var wrapperDiv = $('<div class="calculated-setting-row"></div>');
		wrapperDiv.append(input).append(datasourceToolbox);

		var datasourceTool = $('<li><i class="icon-plus"></i><label>DATASOURCE</label></li>')
			.mousedown(function(e) {
				e.preventDefault();
				$(input).val("").focus().insertAtCaret("datasources[\"").trigger("freeboard-eval");
			});
		datasourceToolbox.append(datasourceTool);

		var jsEditorTool = $('<li><i class="icon-fullscreen"></i><label>.JS EDITOR</label></li>')
			.mousedown(function(e) {
				e.preventDefault();
				jsEditorOld.displayJSEditor(input.val(), function(result) {
					input.val(result);
					input.change();
				});
			});
		datasourceToolbox.append(jsEditorTool);

		if(includeRemove) {
			var removeButton = $('<li class="remove-setting-row"><i class="icon-minus"></i><label></label></li>')
				.mousedown(function(e) {
					e.preventDefault();
					wrapperDiv.remove();
					$(valueCell).find('textarea:first').change();
				});
			datasourceToolbox.prepend(removeButton);
		}

		$(valueCell).append(wrapperDiv);
	}

	function createPluginEditor(title, pluginTypes, currentTypeName, currentSettingsValues, settingsSavedCallback)
	{
		newSettings = {
			type    : currentTypeName,
			settings: {}
		};

		function createSettingRow(name, displayName)
		{
			var tr = $('<div id="setting-row-' + name + '" class="form-row"></div>').appendTo(form);

			tr.append('<div class="form-label"><label class="control-label">' + displayName + '</label></div>');
			return $('<div id="setting-value-container-' + name + '" class="form-value"></div>').appendTo(tr);
		}

		var form = $('<div></div>');

		var pluginDescriptionElement = $('<div id="plugin-description"></div>').hide();
		form.append(pluginDescriptionElement);


		function createSettingsFromDefinition(settingsDefs, typeaheadSource, typeaheadDataSegment)
		{
			_.each(settingsDefs, function(settingDef)
			{
				// Set a default value if one doesn't exist
				if(!_.isUndefined(settingDef.default_value) && _.isUndefined(currentSettingsValues[settingDef.name]))
				{
					currentSettingsValues[settingDef.name] = settingDef.default_value;
				}

				var displayName = settingDef.name;

				if(!_.isUndefined(settingDef.display_name))
				{
					displayName = settingDef.display_name;
				}

				var valueCell = createSettingRow(settingDef.name, displayName);

				switch (settingDef.type)
				{
					case "array":
					{
						var subTableDiv = $('<div class="form-table-value-subtable"></div>').appendTo(valueCell);

						var subTable = $('<table class="table table-condensed sub-table"></table>').appendTo(subTableDiv);
						var subTableHead = $("<thead></thead>").hide().appendTo(subTable);
						var subTableHeadRow = $("<tr></tr>").appendTo(subTableHead);
						var subTableBody = $('<tbody></tbody>').appendTo(subTable);

						var currentSubSettingValues = [];

						// Create our headers
						_.each(settingDef.settings, function(subSettingDef)
						{
							var subsettingDisplayName = subSettingDef.name;

							if(!_.isUndefined(subSettingDef.display_name))
							{
								subsettingDisplayName = subSettingDef.display_name;
							}

							$('<th>' + subsettingDisplayName + '</th>').appendTo(subTableHeadRow);
						});

						if(settingDef.name in currentSettingsValues)
						{
							currentSubSettingValues = currentSettingsValues[settingDef.name];
						}

						function processHeaderVisibility()
						{
							if(newSettings.settings[settingDef.name].length > 0)
							{
								subTableHead.show();
							}
							else
							{
								subTableHead.hide();
							}
						}

						function createSubsettingRow(subsettingValue)
						{
							var subsettingRow = $('<tr></tr>').appendTo(subTableBody);

							var newSetting = {};

							if(!_.isArray(newSettings.settings[settingDef.name]))
							{
								newSettings.settings[settingDef.name] = [];
							}

							newSettings.settings[settingDef.name].push(newSetting);

							_.each(settingDef.settings, function(subSettingDef)
							{
								var subsettingCol = $('<td></td>').appendTo(subsettingRow);
								var subsettingValueString = "";

								if(!_.isUndefined(subsettingValue[subSettingDef.name]))
								{
									subsettingValueString = subsettingValue[subSettingDef.name];
								}

								newSetting[subSettingDef.name] = subsettingValueString;

								$('<input class="table-row-value" type="text">').appendTo(subsettingCol).val(subsettingValueString).change(function()
								{
									newSetting[subSettingDef.name] = $(this).val();
								});
							});

							subsettingRow.append($('<td class="table-row-operation"></td>').append($('<ul class="board-toolbar"></ul>').append($('<li></li>').append($('<i class="icon-trash icon-white"></i>').click(function()
							{
								var subSettingIndex = newSettings.settings[settingDef.name].indexOf(newSetting);

								if(subSettingIndex != -1)
								{
									newSettings.settings[settingDef.name].splice(subSettingIndex, 1);
									subsettingRow.remove();
									processHeaderVisibility();
								}
							})))));

							subTableDiv.scrollTop(subTableDiv[0].scrollHeight);

							processHeaderVisibility();
						}

						$('<div class="table-operation text-button">ADD</div>').appendTo(valueCell).click(function()
						{
							var newSubsettingValue = {};

							_.each(settingDef.settings, function(subSettingDef)
							{
								newSubsettingValue[subSettingDef.name] = "";
							});

							createSubsettingRow(newSubsettingValue);

						});

						// Create our rows
						_.each(currentSubSettingValues, function(currentSubSettingValue, subSettingIndex)
						{
							createSubsettingRow(currentSubSettingValue);
						});

						break;
					}
					case "boolean":
					{
						newSettings.settings[settingDef.name] = currentSettingsValues[settingDef.name];

						var onOffSwitch = $('<div class="onoffswitch"><label class="onoffswitch-label" for="' + settingDef.name + '-onoff"><div class="onoffswitch-inner"><span class="on">YES</span><span class="off">NO</span></div><div class="onoffswitch-switch"></div></label></div>').appendTo(valueCell);

						var input = $('<input type="checkbox" name="onoffswitch" class="onoffswitch-checkbox" id="' + settingDef.name + '-onoff">').prependTo(onOffSwitch).change(function()
						{
							newSettings.settings[settingDef.name] = this.checked;
						});

						if(settingDef.name in currentSettingsValues)
						{
							input.prop("checked", currentSettingsValues[settingDef.name]);
						}

						break;
					}
					case "option":
					{
						var defaultValue = currentSettingsValues[settingDef.name];

						var input = $('<select></select>').appendTo($('<div class="styled-select"></div>').appendTo(valueCell)).change(function()
						{
							newSettings.settings[settingDef.name] = $(this).val();
						});

						_.each(settingDef.options, function(option)
						{

							var optionName;
							var optionValue;

							if(_.isObject(option))
							{
								optionName = option.name;
								optionValue = option.value;
							}
							else
							{
								optionName = option;
							}

							if(_.isUndefined(optionValue))
							{
								optionValue = optionName;
							}

							if(_.isUndefined(defaultValue))
							{
								defaultValue = optionValue;
							}

							$("<option></option>").text(optionName).attr("value", optionValue).appendTo(input);
						});

						newSettings.settings[settingDef.name] = defaultValue;

						if(settingDef.name in currentSettingsValues)
						{
							input.val(currentSettingsValues[settingDef.name]);
						}

						break;
					}

					// This should replace static, datasources, and calculated switch cases (once working)
					case "data":
					{
						// Gather type pointer if set
						if(currentSettingsValues._datatype !== undefined){
							newSettings.settings._datatype = currentSettingsValues._datatype;
						}

						// Holder for all data related components
						var $dataFrame = $("<div>");
						// Holder for specific datatype field
						var $pickedInput = $("<div>");

						// Allows for adding multiple datasource
						var $inputAdder = $('<ul class="board-toolbar"><li class="add-setting-row"><i class="icon-plus"></i><label>ADD</label></li></ul>')
							.css({"margin-bottom":"5px", "display":"none"})
							.mousedown(function(e) {
								e.preventDefault();
								newSettings.settings[settingDef.name].push({});
								_appendDynamicSettingsRow($pickedInput, newSettings.settings[settingDef.name][newSettings.settings[settingDef.name].length - 1], settingDef, removeCb);
							});

						$dataFrame.append([$pickedInput, $inputAdder]);

						function removeCb(settingObj) {
							for(i = 0, len = newSettings.settings[settingDef.name].length; i < len; i++) {
								if(_.isEqual(newSettings.settings[settingDef.name][i], settingObj)) {
									newSettings.settings[settingDef.name].splice(i, 1);
									break;
								}
							}
						}

						// Generate a static field with editor
						function staticPick(){
							var input = $('<textarea></textarea>')
								.css({
									    "position": "absolute",
									    "width": "400px",
									    "height": "20px",
									    "resize": "none",
									    "white-space": "nowrap",
									    "overflow": "auto",
									    "z-index":"10"
								})
								.val( (currentSettingsValues[settingDef.name] || "") );
							var datasourceToolbox = $('<ul class="board-toolbar datasource-input-suffix"></ul>');
							var wrapperDiv = $('<div class="calculated-setting-row"></div>');
							input.change(function() {
								$pickedInput.find('textarea').each(function(idx) {
									var thisVal = $(this).val();
									if(thisVal) {
										newSettings.settings[settingDef.name] = thisVal;
									}
								});
							});
							//valueEditor.createValueEditor(input);
							wrapperDiv.append(input).append(datasourceToolbox);
							datasourceToolbox.append(_createParserEditorTool("STATIC DATA", {helpText: "static help", exampleText: "static example"}, function() {
								//Return current value
								return newSettings.settings[settingDef.name] || "";
							}, function(result) {
								input.val(result);
								input.change();
							}));

							$inputAdder.hide();

							$pickedInput.append(wrapperDiv);
						}

						// Generate a datasource field with parsers
						function datasourcePick(){
							//if we're dealing with an existant widget
							if(settingDef.name in currentSettingsValues) {
								var currentValue = currentSettingsValues[settingDef.name];
								if(settingDef.multi_input && _.isArray(currentValue)) {
									var includeRemove = false;
									var cbForRemoval;
									for(var i = 0; i < currentValue.length; i++) {
										newSettings.settings[settingDef.name].push(currentValue[i]);
										if(i > 0) {
											cbForRemoval = removeCb;
										}
										_appendDynamicSettingsRow($pickedInput, newSettings.settings[settingDef.name][i], settingDef, cbForRemoval);
										includeRemove = true;
									}
								} else if(_.isArray(currentValue) && currentValue.length > 0){
									newSettings.settings[settingDef.name].push(currentValue[0]);
									_appendDynamicSettingsRow($pickedInput, newSettings.settings[settingDef.name][0], settingDef, null);	
								} else {
									newSettings.settings[settingDef.name].push({});
									_appendDynamicSettingsRow($pickedInput, newSettings.settings[settingDef.name][0], settingDef, null);
								}
								//we're creating a new widget
							} else {
								newSettings.settings[settingDef.name].push({});
								_appendDynamicSettingsRow($pickedInput, newSettings.settings[settingDef.name][0], settingDef, null);
							}
							//this allows us to add more datasources
							if(settingDef.multi_input === true){
								$inputAdder.show();
							}
						}

						// Picker options
						var $staticOption = $("<option>").val("static").text("Static");
						var $dynamicOption = $("<option>").val("dynamic").text("Dynamic");

						function pick(datatype){
							// Clear current option
							$pickedInput.empty();
							// Set property to datatype
							newSettings.settings._datatype = datatype; 
							// Display appropriate form dialog
							switch (datatype)
							{
								case "static":
								{
									newSettings.settings[settingDef.name] = currentSettingsValues[settingDef.name] || "";
									$staticOption.attr("selected", "selected");
									staticPick(); 
									break;
								} 
								case "dynamic": 
								{
									newSettings.settings[settingDef.name] = [];
									$dynamicOption.attr("selected", "selected");
									datasourcePick();
									break;
								}
								default:
								{
									$staticOption.attr("selected", "selected");
									staticPick(); 
									break;
								} 
							}
						}

						var $dataSelector = $("<select>").appendTo($('<div class="styled-select"></div>').css("margin-bottom","5px").appendTo(valueCell)).on("change", function(){
							pick($dataSelector.val());
						});

						// If a datatype is forced, only display the forced option
						if(settingDef.force_data !== undefined){
							switch(settingDef.force_data){
								case "dynamic": $dataSelector.append($dynamicOption); break;
								case "static" : $dataSelector.append($staticOption); break;
								default: console.error("Error: unrecognized forced datatype"); break;
							}
							pick(settingDef.force_data);
						} 
						// Else display all datatype options and select the current or default
						else 
						{
							$dataSelector.append([$staticOption, $dynamicOption]);
							if(newSettings.settings._datatype !== undefined){
								pick(newSettings.settings._datatype);
							}else {
								pick("static");
							}
						}

						valueCell.append($dataFrame);

						break;
					}

					default:
					{
						newSettings.settings[settingDef.name] = currentSettingsValues[settingDef.name];
						
						var input = $('<input type="text">').appendTo(valueCell).change(function()
						{
							if(settingDef.type == "number")
							{
								newSettings.settings[settingDef.name] = Number($(this).val());
							}
							else
							{
								newSettings.settings[settingDef.name] = $(this).val();
							}
						});

						if(settingDef.name in currentSettingsValues)
						{
							input.val(currentSettingsValues[settingDef.name]);
						}

						if(typeaheadSource && settingDef.typeahead_data_field){
							input.addClass('typeahead_data_field-' + settingDef.typeahead_data_field);
						}

						if(typeaheadSource && settingDef.typeahead_field){
							var typeaheadValues = [];

							input.keyup(function(event){
								if(event.which >= 65 && event.which <= 91) {
									input.trigger('change');
								}
							});

							$(input).autocomplete({
								source: typeaheadValues,
								select: function(event, ui){
									input.val(ui.item.value);
									input.trigger('change');
								}
							});

							input.change(function(event){
								var value = input.val();
								var source = _.template(typeaheadSource)({input: value});
								$.get(source, function(data){
									if(typeaheadDataSegment){
										data = data[typeaheadDataSegment];
									}
									data  = _.select(data, function(elm){
										return elm[settingDef.typeahead_field][0] == value[0];
									});

									typeaheadValues = _.map(data, function(elm){
										return elm[settingDef.typeahead_field];
									});
									$(input).autocomplete("option", "source", typeaheadValues);

									if(data.length == 1){
										data = data[0];
										//we found the one. let's use it to populate the other info
										for(var field in data){
											if(data.hasOwnProperty(field)){
												var otherInput = $(_.template('input.typeahead_data_field-<%= field %>')({field: field}));
												if(otherInput){
													otherInput.val(data[field]);
													if(otherInput.val() != input.val()) {
														otherInput.trigger('change');
													}
												}
											}
										}
									}
								});
							});
						}

						break;
					}
				}

				if(!_.isUndefined(settingDef.suffix))
				{
					valueCell.append($('<div class="input-suffix">' + settingDef.suffix + '</div>'));
				}

				if(!_.isUndefined(settingDef.description))
				{
					valueCell.append($('<div class="setting-description">' + settingDef.description + '</div>'));
				}
			});
		}


		new DialogBox(form, title, "Save", "Cancel", function()
		{
			$(".validation-error").remove();

			$('textarea').blur();

			// Loop through each setting and validate it
			for(var index = 0; index < selectedType.settings.length; index++)
			{
				var settingDef = selectedType.settings[index];

				if(settingDef.required && (_.isUndefined(newSettings.settings[settingDef.name]) || newSettings.settings[settingDef.name] == ""))
				{
					_displayValidationError(settingDef.name, "This is required.");
					return true;
				}
				else if(settingDef.type == "integer" && (newSettings.settings[settingDef.name] % 1 !== 0))
				{
					_displayValidationError(settingDef.name, "Must be a whole number.");
					return true;
				}
				else if(settingDef.type == "number" && !_isNumerical(newSettings.settings[settingDef.name]))
				{
					_displayValidationError(settingDef.name, "Must be a number.");
					return true;
				}
			}

			if(_.isFunction(settingsSavedCallback))
			{
				settingsSavedCallback(newSettings);
			}
		});

		// Create our body
		var pluginTypeNames = _.keys(pluginTypes);
		var typeSelect;

		if(pluginTypeNames.length > 1)
		{
			var typeRow = createSettingRow("plugin-types", "Type");
			typeSelect = $('<select></select>').appendTo($('<div class="styled-select"></div>').appendTo(typeRow));

			typeSelect.append($("<option>Select a type...</option>").attr("value", "undefined"));

			var sortablePlugin = [];
			for (var widget in pluginTypes){
				sortablePlugin.push({display_name:pluginTypes[widget].display_name, type_name:pluginTypes[widget].type_name});
			}
			sortablePlugin.sort(function(a,b){
				return a.display_name.localeCompare(b.display_name);
			});
			_.each(sortablePlugin, function(pluginType)
			{
				typeSelect.append($("<option></option>").text(pluginType.display_name).attr("value", pluginType.type_name));
			});

			typeSelect.change(function()
			{
				newSettings.type = $(this).val();
				newSettings.settings = {};

				// Remove all the previous settings
				_removeSettingsRows();

				selectedType = pluginTypes[typeSelect.val()];

				if(_.isUndefined(selectedType))
				{
					$("#setting-row-instance-name").hide();
					$("#dialog-ok").hide();
				}
				else
				{
					$("#setting-row-instance-name").show();

					if(selectedType.description && selectedType.description.length > 0)
					{
						pluginDescriptionElement.html(selectedType.description).show();
					}
					else
					{
						pluginDescriptionElement.hide();
					}

					$("#dialog-ok").show();
					createSettingsFromDefinition(selectedType.settings, selectedType.typeahead_source, selectedType.typeahead_data_segment);
				}
			});
		}
		else if(pluginTypeNames.length == 1)
		{
			selectedType = pluginTypes[pluginTypeNames[0]];
			newSettings.type = selectedType.type_name;
			newSettings.settings = {};
			createSettingsFromDefinition(selectedType.settings);
		}

		if(typeSelect)
		{
			if(_.isUndefined(currentTypeName))
			{
				$("#setting-row-instance-name").hide();
				$("#dialog-ok").hide();
			}
			else
			{
				$("#dialog-ok").show();
				typeSelect.val(currentTypeName).trigger("change");
			}
		}
	}

	// Public API
	return {
		createPluginEditor : function(
			title,
			pluginTypes,
			currentInstanceName,
			currentTypeName,
			currentSettingsValues,
			settingsSavedCallback)
		{
			createPluginEditor(title, pluginTypes, currentInstanceName, currentTypeName, currentSettingsValues, settingsSavedCallback);
		}
	}
}

ValueEditor = function(theFreeboardModel)
{
	var _veDatasourceRegex = new RegExp(".*datasources\\[\"([^\"]*)(\"\\])?(.*)$");

	var dropdown = null;
	var selectedOptionIndex = 0;
	var _autocompleteOptions = [];
	var currentValue = null;

	var EXPECTED_TYPE = {
		ANY : "any",
		ARRAY : "array",
		OBJECT : "object",
		STRING : "string",
		NUMBER : "number",
		BOOLEAN : "boolean"
	};

	function _isPotentialTypeMatch(value, expectsType)
	{
		if(_.isArray(value) || _.isObject(value))
		{
			return true;
		}
		return _isTypeMatch(value, expectsType);
	}

	function _isTypeMatch(value, expectsType) {
		switch(expectsType)
		{
		case EXPECTED_TYPE.ANY: return true;
		case EXPECTED_TYPE.ARRAY: return _.isArray(value);
		case EXPECTED_TYPE.OBJECT: return _.isObject(value);
		case EXPECTED_TYPE.STRING: return _.isString(value);
		case EXPECTED_TYPE.NUMBER: return _.isNumber(value);
		case EXPECTED_TYPE.BOOLEAN: return _.isBoolean(value);
		}
	}

	function _checkCurrentValueType(element, expectsType) {
		$(element).parent().find(".validation-error").remove();
		if(!_isTypeMatch(currentValue, expectsType)) {
			$(element).parent().append("<div class='validation-error'>" +
				"This field expects an expression that evaluates to type " +
				expectsType + ".</div>");
		}
	}

	function _resizeValueEditor(element)
	{
		var lineBreakCount = ($(element).val().match(/\n/g) || []).length;

		var newHeight = Math.min(200, 20 * (lineBreakCount + 1));

		$(element).css({height: newHeight + "px"});
	}

	function _autocompleteFromDatasource(inputString, datasources, expectsType)
	{

		var options = [];
		if(datasources) {
			var currentDsName;
			for(var i=0, len=datasources.length; i < len; i++) {
				currentDsName = datasources[i].name();
				if(currentDsName.indexOf(inputString) > -1) {
					options.push({value: currentDsName, entity: datasources[i].getDataRepresentation("data"), precede_char: "", follow_char: ""});
				}
			}
		}

		_autocompleteOptions = options;
	}

	function _renderAutocompleteDropdown(element, expectsType)
	{
		var inputString = $(element).val().substring(0, $(element).getCaretPosition());

		// Weird issue where the textarea box was putting in ASCII (nbsp) for spaces.
		inputString = inputString.replace(String.fromCharCode(160), " ");

		_autocompleteFromDatasource(inputString, theFreeboardModel.datasources(), expectsType);

		if(_autocompleteOptions.length > 0)
		{
			if(!dropdown)
			{
				dropdown = $('<ul id="value-selector" class="value-dropdown"></ul>')
					.insertAfter(element)
					.width($(element).outerWidth() - 2)
					.css("left", $(element).position().left)
					.css("top", $(element).position().top + $(element).outerHeight() - 1);
			}

			dropdown.empty();
			dropdown.scrollTop(0);

			var selected = true;
			selectedOptionIndex = 0;

			_.each(_autocompleteOptions, function(option, index)
			{
				var li = _renderAutocompleteDropdownOption(element, inputString, option, index);
				if(selected)
				{
					$(li).addClass("selected");
					selected = false;
				}
			});
		}
		else
		{
			_checkCurrentValueType(element, expectsType);
			$(element).next("ul#value-selector").remove();
			dropdown = null;
			selectedOptionIndex = -1;
		}
	}

	function _renderAutocompleteDropdownOption(element, inputString, option, currentIndex)
	{
		var optionLabel = option.value;
		if(option.preview)
		{
			optionLabel = optionLabel + "<span class='preview'>" + option.preview + "</span>";
		}
		var li = $('<li>' + optionLabel + '</li>').appendTo(dropdown)
			.mouseenter(function()
			{
				$(this).trigger("freeboard-select");
			})
			.mousedown(function(event)
			{
				$(this).trigger("freeboard-insertValue");
				event.preventDefault();
			})
			.data("freeboard-optionIndex", currentIndex)
			.data("freeboard-optionValue", option.value)
			.bind("freeboard-insertValue", function()
			{
				var optionValue = option.value;
				optionValue = option.precede_char + optionValue + option.follow_char;

				var replacementIndex = inputString.lastIndexOf("]");
				if(replacementIndex != -1)
				{
					$(element).replaceTextAt(replacementIndex+1, $(element).val().length,
						optionValue);
				}
				else
				{
					$(element).insertAtCaret(optionValue);
				}

				currentValue = option.entity;
				$(element).triggerHandler("mouseup");
			})
			.bind("freeboard-select", function()
			{
				$(this).parent().find("li.selected").removeClass("selected");
				$(this).addClass("selected");
				selectedOptionIndex = $(this).data("freeboard-optionIndex");
			});
		return li;
	}

	function createValueEditor(element, expectsType)
	{
		$(element).addClass("calculated-value-input")
			.bind("keyup mouseup freeboard-eval", function(event) {
				// Ignore arrow keys and enter keys
				if(dropdown && event.type == "keyup"
					&& (event.keyCode == 38 || event.keyCode == 40 || event.keyCode == 13))
				{
					event.preventDefault();
					return;
				}
				_renderAutocompleteDropdown(element, expectsType);
			})
			.focus(function()
			{
				$(element).css({"z-index" : 3001});
				_resizeValueEditor(element);
			})
			.focusout(function()
			{
				_checkCurrentValueType(element, expectsType);
				$(element).css({
					"height": "",
					"z-index" : 3000
				});
				$(element).next("ul#value-selector").remove();
				dropdown = null;
				selectedOptionIndex = -1;
			})
			.bind("keydown", function(event)
			{

				if(dropdown)
				{
					if(event.keyCode == 38 || event.keyCode == 40) // Handle Arrow keys
					{
						event.preventDefault();

						var optionItems = $(dropdown).find("li");

						if(event.keyCode == 38) // Up Arrow
						{
							selectedOptionIndex--;
						}
						else if(event.keyCode == 40) // Down Arrow
						{
							selectedOptionIndex++;
						}

						if(selectedOptionIndex < 0)
						{
							selectedOptionIndex = optionItems.size() - 1;
						}
						else if(selectedOptionIndex >= optionItems.size())
						{
							selectedOptionIndex = 0;
						}

						var optionElement = $(optionItems).eq(selectedOptionIndex);

						optionElement.trigger("freeboard-select");
						$(dropdown).scrollTop($(optionElement).position().top);
					}
					else if(event.keyCode == 13) // Handle enter key
					{
						event.preventDefault();

						if(selectedOptionIndex != -1)
						{
							$(dropdown).find("li").eq(selectedOptionIndex)
								.trigger("freeboard-insertValue");
						}
					}
				}
			});
	}

	// Public API
	return {
		createValueEditor : function(element, expectsType)
		{
			if(expectsType)
			{
				createValueEditor(element, expectsType);
			}
			else {
				createValueEditor(element, EXPECTED_TYPE.ANY);
			}
		},
		EXPECTED_TYPE : EXPECTED_TYPE
	}
}

ValueEditorOld = function(theFreeboardModel)
{
	var _veDatasourceRegex = new RegExp(".*datasources\\[\"([^\"]*)(\"\\])?(.*)$");

	var dropdown = null;
	var selectedOptionIndex = 0;
	var _autocompleteOptions = [];
	var currentValue = null;

	var EXPECTED_TYPE = {
		ANY : "any",
		ARRAY : "array",
		OBJECT : "object",
		STRING : "string",
		NUMBER : "number",
		BOOLEAN : "boolean"
	};

	function _isPotentialTypeMatch(value, expectsType)
	{
		if(_.isArray(value) || _.isObject(value))
		{
			return true;
		}
		return _isTypeMatch(value, expectsType);
	}

	function _isTypeMatch(value, expectsType) {
		switch(expectsType)
		{
		case EXPECTED_TYPE.ANY: return true;
		case EXPECTED_TYPE.ARRAY: return _.isArray(value);
		case EXPECTED_TYPE.OBJECT: return _.isObject(value);
		case EXPECTED_TYPE.STRING: return _.isString(value);
		case EXPECTED_TYPE.NUMBER: return _.isNumber(value);
		case EXPECTED_TYPE.BOOLEAN: return _.isBoolean(value);
		}
	}

	function _checkCurrentValueType(element, expectsType) {
		$(element).parent().find(".validation-error").remove();
		if(!_isTypeMatch(currentValue, expectsType)) {
			$(element).parent().append("<div class='validation-error'>" +
				"This field expects an expression that evaluates to type " +
				expectsType + ".</div>");
		}
	}

	function _resizeValueEditor(element)
	{
		var lineBreakCount = ($(element).val().match(/\n/g) || []).length;

		var newHeight = Math.min(200, 20 * (lineBreakCount + 1));

		$(element).css({height: newHeight + "px"});
	}

	function _autocompleteFromDatasource(inputString, datasources, expectsType)
	{
		var match = _veDatasourceRegex.exec(inputString);

		var options = [];

		if(match)
		{
			// Editor value is: datasources["; List all datasources
			if(match[1] == "")
			{
				_.each(datasources, function(datasource)
				{
					options.push({value: datasource.name(), entity: undefined,
						precede_char: "", follow_char: "\"]"});
				});
			}
			// Editor value is a partial match for a datasource; list matching datasources
			else if(match[1] != "" && _.isUndefined(match[2]))
			{
				var replacementString = match[1];

				_.each(datasources, function(datasource)
				{
					var dsName = datasource.name();

					if(dsName != replacementString && dsName.indexOf(replacementString) == 0)
					{
						options.push({value: dsName, entity: undefined,
							precede_char: "", follow_char: "\"]"});
					}
				});
			}
			// Editor value matches a datasources; parse JSON in order to populate list
			else
			{
				// We already have a datasource selected; find it
				var datasource = _.find(datasources, function(datasource)
				{
					return (datasource.name() === match[1]);
				});

				if(!_.isUndefined(datasource))
				{
					var dataPath = "data";
					var remainder = "";

					// Parse the partial JSON selectors
					if(!_.isUndefined(match[2]))
					{
						// Strip any incomplete field values, and store the remainder
						var remainderIndex = match[3].lastIndexOf("]") + 1;
						dataPath = dataPath + match[3].substring(0, remainderIndex);
						remainder = match[3].substring(remainderIndex, match[3].length);
						remainder = remainder.replace(/^[\[\"]*/, "");
						remainder = remainder.replace(/[\"\]]*$/, "");
					}

					// Get the data for the last complete JSON field
					var dataValue = datasource.getDataRepresentation(dataPath);
					currentValue = dataValue;

					// For arrays, list out the indices
					if(_.isArray(dataValue))
					{
						for(var index = 0; index < dataValue.length; index++)
						{
							if(index.toString().indexOf(remainder) == 0)
							{
								var value = dataValue[index];
								if(_isPotentialTypeMatch(value, expectsType))
								{
									options.push({value: index, entity: value,
										precede_char: "[", follow_char: "]",
										preview: value.toString()});
								}
							}
						}
					}
					// For objects, list out the keys
					else if(_.isObject(dataValue))
					{
						_.each(dataValue, function(value, name)
						{
							if(name.indexOf(remainder) == 0)
							{
								if(_isPotentialTypeMatch(value, expectsType))
								{
									options.push({value: name, entity: value,
										precede_char: "[\"", follow_char: "\"]"});
								}
							}
						});
					}
					// For everything else, do nothing (no further selection possible)
					else
					{
						// no-op
					}
				}
			}
		}
		_autocompleteOptions = options;
	}

	function _renderAutocompleteDropdown(element, expectsType)
	{
		var inputString = $(element).val().substring(0, $(element).getCaretPosition());

		// Weird issue where the textarea box was putting in ASCII (nbsp) for spaces.
		inputString = inputString.replace(String.fromCharCode(160), " ");

		_autocompleteFromDatasource(inputString, theFreeboardModel.datasources(), expectsType);

		if(_autocompleteOptions.length > 0)
		{
			if(!dropdown)
			{
				dropdown = $('<ul id="value-selector" class="value-dropdown"></ul>')
					.insertAfter(element)
					.width($(element).outerWidth() - 2)
					.css("left", $(element).position().left)
					.css("top", $(element).position().top + $(element).outerHeight() - 1);
			}

			dropdown.empty();
			dropdown.scrollTop(0);

			var selected = true;
			selectedOptionIndex = 0;

			_.each(_autocompleteOptions, function(option, index)
			{
				var li = _renderAutocompleteDropdownOption(element, inputString, option, index);
				if(selected)
				{
					$(li).addClass("selected");
					selected = false;
				}
			});
		}
		else
		{
			_checkCurrentValueType(element, expectsType);
			$(element).next("ul#value-selector").remove();
			dropdown = null;
			selectedOptionIndex = -1;
		}
	}

	function _renderAutocompleteDropdownOption(element, inputString, option, currentIndex)
	{
		var optionLabel = option.value;
		if(option.preview)
		{
			optionLabel = optionLabel + "<span class='preview'>" + option.preview + "</span>";
		}
		var li = $('<li>' + optionLabel + '</li>').appendTo(dropdown)
			.mouseenter(function()
			{
				$(this).trigger("freeboard-select");
			})
			.mousedown(function(event)
			{
				$(this).trigger("freeboard-insertValue");
				event.preventDefault();
			})
			.data("freeboard-optionIndex", currentIndex)
			.data("freeboard-optionValue", option.value)
			.bind("freeboard-insertValue", function()
			{
				var optionValue = option.value;
				optionValue = option.precede_char + optionValue + option.follow_char;

				var replacementIndex = inputString.lastIndexOf("]");
				if(replacementIndex != -1)
				{
					$(element).replaceTextAt(replacementIndex+1, $(element).val().length,
						optionValue);
				}
				else
				{
					$(element).insertAtCaret(optionValue);
				}

				currentValue = option.entity;
				$(element).triggerHandler("mouseup");
			})
			.bind("freeboard-select", function()
			{
				$(this).parent().find("li.selected").removeClass("selected");
				$(this).addClass("selected");
				selectedOptionIndex = $(this).data("freeboard-optionIndex");
			});
		return li;
	}

	function createValueEditor(element, expectsType)
	{
		$(element).addClass("calculated-value-input")
			.bind("keyup mouseup freeboard-eval", function(event) {
				// Ignore arrow keys and enter keys
				if(dropdown && event.type == "keyup"
					&& (event.keyCode == 38 || event.keyCode == 40 || event.keyCode == 13))
				{
					event.preventDefault();
					return;
				}
				_renderAutocompleteDropdown(element, expectsType);
			})
			.focus(function()
			{
				$(element).css({"z-index" : 3001});
				_resizeValueEditor(element);
			})
			.focusout(function()
			{
				_checkCurrentValueType(element, expectsType);
				$(element).css({
					"height": "",
					"z-index" : 3000
				});
				$(element).next("ul#value-selector").remove();
				dropdown = null;
				selectedOptionIndex = -1;
			})
			.bind("keydown", function(event)
			{

				if(dropdown)
				{
					if(event.keyCode == 38 || event.keyCode == 40) // Handle Arrow keys
					{
						event.preventDefault();

						var optionItems = $(dropdown).find("li");

						if(event.keyCode == 38) // Up Arrow
						{
							selectedOptionIndex--;
						}
						else if(event.keyCode == 40) // Down Arrow
						{
							selectedOptionIndex++;
						}

						if(selectedOptionIndex < 0)
						{
							selectedOptionIndex = optionItems.size() - 1;
						}
						else if(selectedOptionIndex >= optionItems.size())
						{
							selectedOptionIndex = 0;
						}

						var optionElement = $(optionItems).eq(selectedOptionIndex);

						optionElement.trigger("freeboard-select");
						$(dropdown).scrollTop($(optionElement).position().top);
					}
					else if(event.keyCode == 13) // Handle enter key
					{
						event.preventDefault();

						if(selectedOptionIndex != -1)
						{
							$(dropdown).find("li").eq(selectedOptionIndex)
								.trigger("freeboard-insertValue");
						}
					}
				}
			});
	}

	// Public API
	return {
		createValueEditor : function(element, expectsType)
		{
			if(expectsType)
			{
				createValueEditor(element, expectsType);
			}
			else {
				createValueEditor(element, EXPECTED_TYPE.ANY);
			}
		},
		EXPECTED_TYPE : EXPECTED_TYPE
	}
}


function WidgetModel (theFreeboardModel, widgetPlugins) {
    function disposeWidgetInstance () {
        if (!_.isUndefined(self.widgetInstance)) {
            if (_.isFunction(self.widgetInstance.onDispose)) {
                self.widgetInstance.onDispose();
            }

            self.widgetInstance = undefined;
        }
    }

    var self = this;
    var _lastSent = {};

    this.datasourceRefreshNotifications = {};
    this.calculatedSettingScripts = {};

    this.title = ko.observable();
    this.fillSize = ko.observable(false);

    this.type = ko.observable();
    this.type.subscribe(function (newValue) {
        disposeWidgetInstance();

        if ((newValue in widgetPlugins) && _.isFunction(widgetPlugins[newValue].newInstance)) {
            var widgetType = widgetPlugins[newValue];

            function finishLoad () {
                widgetType.newInstance(self.settings(), function (widgetInstance) {

                    self.fillSize((widgetType.fill_size === true));
                    self.widgetInstance = widgetInstance;
                    self.shouldRender(true);
                    self._heightUpdate.valueHasMutated();

                }, self.updateCallback);
            }

            // Do we need to load any external scripts?
            if (widgetType.external_scripts) {
                head.js(widgetType.external_scripts.slice(0), finishLoad); // Need to clone the array because head.js adds some weird functions to it
            }
            else {
                finishLoad();
            }
        }
    });

    this.settings = ko.observable({});
    this.settings.subscribe(function (newValue) {
        if (!_.isUndefined(self.widgetInstance) && _.isFunction(self.widgetInstance.onSettingsChanged)) {
            self.widgetInstance.onSettingsChanged(newValue);
        }

        self.updateCalculatedSettings();
        self._heightUpdate.valueHasMutated();
    });

    this.processDatasourceUpdate = function (datasourceName, newData) {
        if (self.datasourceRefreshNotifications[datasourceName]) {
            self.processCalculatedSetting(datasourceName, newData);
        }
    }

    _datasourceListToMap = function (array) {
        var returnVal = {};

        if (array) {
            for (var i = 0, len = array.length; i < len; i++) {
                returnVal[array[i].name()] = array[i];
            }
        }

        return returnVal;
    }

    _paneListToMap = function (array) {
        var rtn = {};

        if (array) {
            for (var i=0, len = array.length; i < len; i++) {
                rtn[array[i].pane_id()] = array[i];
            }
        }

        return rtn;
    }

    //create these out here so we're not constantly allocating new vars
    var dsValue;
    var widgetValue;
    this.callValueFunction = function (theFunction, dsName) {
        var datasources = _datasourceListToMap(theFreeboardModel.datasources());
        var panes = _paneListToMap(theFreeboardModel.panes());
        try {
            dsValue = datasources[dsName].latestData();
        } catch (e) {
            console.warn("Unable to get the latest data for the datasource with name '" + dsName + ".' Please make sure it implements the 'latestData' method.");
            console.warn(e);
        }

        try {
            widgetValue = this.widgetInstance.getValue();
        } catch (e) {
            console.warn("Unable to get the value for the widget with type '" + self.type() + ".' Please make sure it implements the 'getValue' method.");
            console.warn(e);
        }

        var valueForThis = {
            datasource: dsValue,
            widget: widgetValue
        }

        //pass in the instance of the widget so that the user can call methods on it, e.g., this.getValue()
        return theFunction.call(valueForThis, datasources, panes);
    }

    this.processSizeChange = function () {
        if (!_.isUndefined(self.widgetInstance) && _.isFunction(self.widgetInstance.onSizeChanged)) {
            self.widgetInstance.onSizeChanged();
        }
    }

    function _checkScriptError (e, rawValue) {
        var returnValue;

        // If there is a reference error and the value just contains letters and numbers, then
        if (e instanceof ReferenceError && (/^\w+$/).test(rawValue)) {
            returnValue = rawValue;
        }

        return returnValue;
    }

    this.processCalculatedSetting = function (dsName, newData) {
        if (self.calculatedSettingScripts[dsName]) {
            var returnValue = undefined;

            if (newData && _lastSent[dsName] && _.isEqual(newData, _lastSent[dsName])) {
                //if the new data is equal to the last message we sent that means we are receiving an update that we caused - ignore it
                return;
            }

            try {
                //check if we have an incoming parser
                if (self.calculatedSettingScripts[dsName].incoming_parser && _.isFunction(self.calculatedSettingScripts[dsName].incoming_parser)) {
                    returnValue = self.callValueFunction(self.calculatedSettingScripts[dsName].incoming_parser, dsName);
                } else {
                    returnValue = newData;
                }
            }
            catch (e) {
                console.error("Unable to execute incoming parser for widget of type " + this.type());
                console.error(e);
            }

            if (!_.isUndefined(self.widgetInstance) && _.isFunction(self.widgetInstance.onCalculatedValueChanged) && !_.isUndefined(returnValue)) {
                try {
                    //we send the name of the setting so that widgets can decide how to handle the data
                    self.widgetInstance.onCalculatedValueChanged(self.calculatedSettingScripts[dsName].settingName, returnValue);
                }
                catch (e) {
                    console.log(e.toString());
                }
            }
        }
    }

    function _createParserFunction (script, debug) {

        try { 
            if(debug){
                script = "debugger;"+script;
            } 
            return new Function("datasources", "panes", script);
        }
        catch (e) {
            // If the value function cannot be created, then go ahead and treat it as literal text
            return new Function("datasources", "panes", "return \"" + script + "\";");
        }
    }

    this.updateCalculatedSettings = function () {
        self.datasourceRefreshNotifications = {};
        self.calculatedSettingScripts = {};

        if (_.isUndefined(self.type())) {
            return;
        }

        // Check for any calculated settings
        var settingsDefs = widgetPlugins[self.type()].settings;
        var currentSettings = self.settings();
        _.each(settingsDefs, function (settingDef) {


            if(settingDef.type == "data"){
                if(currentSettings._datatype === "static"){
                    self.widgetInstance.onCalculatedValueChanged(settingDef.name, currentSettings[settingDef.name]);
                }
                else if(currentSettings._datatype === "dynamic")
                {
                    var sources = currentSettings[settingDef.name];
                    for (var i = 0, len = sources.length; i < len; i++) {
                        if (!_.isUndefined(sources[i].dsName)) {

                            var parsers = {};

                            var debug = sources[i]._debug || false;

                            //we save the setting name so that widgets know where the update is coming from in their 'onCalculatedValueChanged' method
                            parsers.settingName = settingDef.name;
                            if (sources[i].incoming_parser) {
                                self.datasourceRefreshNotifications[sources[i].dsName] = sources[i].dsName;
                                parsers.incoming_parser = _createParserFunction(sources[i].incoming_parser, debug);
                            }

                            if (sources[i].outgoing_parser) {
                                parsers.outgoing_parser = _createParserFunction(sources[i].outgoing_parser, debug);
                            }

                            self.calculatedSettingScripts[sources[i].dsName] = parsers;
                            self.processCalculatedSetting(sources[i].dsName);
                        }
                    }
                }
            }
            // Deprecated - should use 'data' type
            if (settingDef.type == "datasources") {
                var sources = currentSettings[settingDef.name];
                for (var i = 0, len = sources.length; i < len; i++) {
                    if (!_.isUndefined(sources[i].dsName)) {

                        var parsers = {};
                        parsers.settingName = settingDef.name;
                        var debug = sources[i]._debug || false;
                        if (sources[i].incoming_parser) {
                            self.datasourceRefreshNotifications[sources[i].dsName] = sources[i].dsName;
                            parsers.incoming_parser = _createParserFunction(sources[i].incoming_parser, debug);
                        }

                        if (sources[i].outgoing_parser) {
                            parsers.outgoing_parser = _createParserFunction(sources[i].outgoing_parser, debug);
                        }

                        self.calculatedSettingScripts[sources[i].dsName] = parsers;
                        self.processCalculatedSetting(sources[i].dsName);

                    }
                }

            }
        });
    }

    this._heightUpdate = ko.observable();
    this.height = ko.computed({
        read: function () {
            self._heightUpdate();

            if (!_.isUndefined(self.widgetInstance) && _.isFunction(self.widgetInstance.getHeight)) {
                return self.widgetInstance.getHeight();
            }

            return 1;
        }
    });

    this.shouldRender = ko.observable(false);
    this.render = function (element) {
        this.parentElement = $(element).parent();
        self.shouldRender(false);
        if (!_.isUndefined(self.widgetInstance) && _.isFunction(self.widgetInstance.render)) {
            self.widgetInstance.render(element);
            self.updateCalculatedSettings();
        }
    }

    this.dispose = function () {

    }

    this.serialize = function () {
        return {
            title: self.title(),
            type: self.type(),
            settings: self.settings()
        };
    }

    this.deserialize = function (object) {
        self.title(object.title);
        self.settings(object.settings);
        self.type(object.type);
    }

    this.processAndSendData = function (ds) {
        var dsName = ds.name();
        //if we have an outgoing parser let's run it
        if (this.calculatedSettingScripts[dsName].outgoing_parser && _.isFunction(this.calculatedSettingScripts[dsName].outgoing_parser)) {
            data = this.callValueFunction(this.calculatedSettingScripts[dsName].outgoing_parser, dsName);
        }
        //save the data so that we can check if we need to update the widget later when the processCalculatedSetting method runs
        _lastSent[dsName] = data;
        return ds.datasourceInstance.sendData(data);
    }

    this.updateCallback = function (data, selectDS) {
        var ds;
        var dsName;
        var settingsDefs = widgetPlugins[self.type()].settings;
        var currentSettings = self.settings();
        var settingFound = false;
        var promises = [];

        if (!selectDS){

            _.each(settingsDefs, function (settingDef) {
                if(settingDef.type === "data" && currentSettings._datatype === "dynamic"){
                    settingFound = true;
                    for (var i = 0, len = currentSettings[settingDef.name].length; i < len; i++) {
                        ds = freeboard.getDatasource(currentSettings[settingDef.name][i].dsName);
                        if (!ds) {
                            continue;
                        }
                        promises.push(self.processAndSendData(ds))
                    }
                }
            });
                    
        } else {
            settingFound = true;
            for(var i=0, len=selectDS.length; i < len; i++) {
                ds = freeboard.getDatasource(selectDS[i].dsName);
                if(!ds) { continue; }
                promises.push(self.processAndSendData(ds));
            }
        }

        // Deprecated. Suppport default datasources if no setting with type data and datatype dynamic is found
        if(!settingFound){
            if (!selectDS){
                for (var i = 0, len = self.settings().datasources.length; i < len; i++) {
                    ds = freeboard.getDatasource(self.settings().datasources[i].dsName);
                    if (!ds) {
                        continue;
                    }
                    promises.push(self.processAndSendData(ds));
                }
            }
            else {
                for(var i=0, len=selectDS.length; i < len; i++) {
                    ds = freeboard.getDatasource(selectDS[i].dsName);
                    if(!ds) { continue; }
                    promises.push(self.processAndSendData(ds));
                }
            }
        }

        //wait for all promises to resolve
        return $.when.apply($, promises);
    }
}

// ┌────────────────────────────────────────────────────────────────────┐ \\
// │ F R E E B O A R D                                                  │ \\
// ├────────────────────────────────────────────────────────────────────┤ \\
// │ Copyright © 2013 Jim Heising (https://github.com/jheising)         │ \\
// │ Copyright © 2013 Bug Labs, Inc. (http://buglabs.net)               │ \\
// ├────────────────────────────────────────────────────────────────────┤ \\
// │ Licensed under the MIT license.                                    │ \\
// └────────────────────────────────────────────────────────────────────┘ \\

// Jquery plugin to watch for attribute changes
(function($)
{
	function isDOMAttrModifiedSupported()
	{
		var p = document.createElement('p');
		var flag = false;

		if(p.addEventListener)
		{
			p.addEventListener('DOMAttrModified', function()
			{
				flag = true
			}, false);
		}
		else if(p.attachEvent)
		{
			p.attachEvent('onDOMAttrModified', function()
			{
				flag = true
			});
		}
		else
		{
			return false;
		}

		p.setAttribute('id', 'target');

		return flag;
	}

	function checkAttributes(chkAttr, e)
	{
		if(chkAttr)
		{
			var attributes = this.data('attr-old-value');

			if(e.attributeName.indexOf('style') >= 0)
			{
				if(!attributes['style'])
				{
					attributes['style'] = {};
				} //initialize
				var keys = e.attributeName.split('.');
				e.attributeName = keys[0];
				e.oldValue = attributes['style'][keys[1]]; //old value
				e.newValue = keys[1] + ':' + this.prop("style")[$.camelCase(keys[1])]; //new value
				attributes['style'][keys[1]] = e.newValue;
			}
			else
			{
				e.oldValue = attributes[e.attributeName];
				e.newValue = this.attr(e.attributeName);
				attributes[e.attributeName] = e.newValue;
			}

			this.data('attr-old-value', attributes); //update the old value object
		}
	}

	//initialize Mutation Observer
	var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

	$.fn.attrchange = function(o)
	{

		var cfg = {
			trackValues: false,
			callback   : $.noop
		};

		//for backward compatibility
		if(typeof o === "function")
		{
			cfg.callback = o;
		}
		else
		{
			$.extend(cfg, o);
		}

		if(cfg.trackValues)
		{ //get attributes old value
			$(this).each(function(i, el)
			{
				var attributes = {};
				for(var attr, i = 0, attrs = el.attributes, l = attrs.length; i < l; i++)
				{
					attr = attrs.item(i);
					attributes[attr.nodeName] = attr.value;
				}

				$(this).data('attr-old-value', attributes);
			});
		}

		if(MutationObserver)
		{ //Modern Browsers supporting MutationObserver
			/*
			 Mutation Observer is still new and not supported by all browsers.
			 http://lists.w3.org/Archives/Public/public-webapps/2011JulSep/1622.html
			 */
			var mOptions = {
				subtree          : false,
				attributes       : true,
				attributeOldValue: cfg.trackValues
			};

			var observer = new MutationObserver(function(mutations)
			{
				mutations.forEach(function(e)
				{
					var _this = e.target;

					//get new value if trackValues is true
					if(cfg.trackValues)
					{
						/**
						 * @KNOWN_ISSUE: The new value is buggy for STYLE attribute as we don't have
						 * any additional information on which style is getting updated.
						 * */
						e.newValue = $(_this).attr(e.attributeName);
					}

					cfg.callback.call(_this, e);
				});
			});

			return this.each(function()
			{
				observer.observe(this, mOptions);
			});
		}
		else if(isDOMAttrModifiedSupported())
		{ //Opera
			//Good old Mutation Events but the performance is no good
			//http://hacks.mozilla.org/2012/05/dom-mutationobserver-reacting-to-dom-changes-without-killing-browser-performance/
			return this.on('DOMAttrModified', function(event)
			{
				if(event.originalEvent)
				{
					event = event.originalEvent;
				} //jQuery normalization is not required for us
				event.attributeName = event.attrName; //property names to be consistent with MutationObserver
				event.oldValue = event.prevValue; //property names to be consistent with MutationObserver
				cfg.callback.call(this, event);
			});
		}
		else if('onpropertychange' in document.body)
		{ //works only in IE
			return this.on('propertychange', function(e)
			{
				e.attributeName = window.event.propertyName;
				//to set the attr old value
				checkAttributes.call($(this), cfg.trackValues, e);
				cfg.callback.call(this, e);
			});
		}

		return this;
	}
})(jQuery);

(function(jQuery) {

    jQuery.eventEmitter = {
        _JQInit: function() {
            this._JQ = jQuery(this);
        },
        emit: function(evt, data) {
            !this._JQ && this._JQInit();
            this._JQ.trigger(evt, data);
        },
        once: function(evt, handler) {
            !this._JQ && this._JQInit();
            this._JQ.one(evt, handler);
        },
        on: function(evt, handler) {
            !this._JQ && this._JQInit();
            this._JQ.bind(evt, handler);
        },
        off: function(evt, handler) {
            !this._JQ && this._JQInit();
            this._JQ.unbind(evt, handler);
        }
    };

}(jQuery));

var freeboard = (function()
{
	var datasourcePlugins = {};
	var widgetPlugins = {};

	var freeboardUI = new FreeboardUI();
	var theFreeboardModel = new FreeboardModel(datasourcePlugins, widgetPlugins, freeboardUI);

	var jsEditor = new JSEditor();
	var jsEditorOld = new JSEditorOld();
	var valueEditor = new ValueEditor(theFreeboardModel);
	var valueEditorOld = new ValueEditorOld(theFreeboardModel);
	var pluginEditor = new PluginEditor(jsEditor, jsEditorOld, valueEditor, valueEditorOld);

	var developerConsole = new DeveloperConsole(theFreeboardModel);

	var currentStyle = {
		values: {
			"font-family": '"HelveticaNeue-UltraLight", "Helvetica Neue Ultra Light", "Helvetica Neue", sans-serif',
			"color"      : "#d3d4d4",
			"font-weight": 100
		}
	};

	ko.bindingHandlers.pluginEditor = {
		init: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext)
		{
			var options = ko.unwrap(valueAccessor());

			var types = {};
			var settings = undefined;
			var title = "";

			if(options.type == 'datasource')
			{
				types = datasourcePlugins;
				title = "Datasource";
			}
			else if(options.type == 'widget')
			{
				types = widgetPlugins;
				title = "Widget";
			}
			else if(options.type == 'pane')
			{
				title = "Pane";
			}

			$(element).click(function(event)
			{
				if(options.operation == 'delete')
				{
					var phraseElement = $('<p>Are you sure you want to delete this ' + title + '?</p>');
					new DialogBox(phraseElement, "Confirm Delete", "Yes", "No", function()
					{
						window.Need_Save = true;
						if(options.type == 'datasource')
						{
							theFreeboardModel.deleteDatasource(viewModel);
						}
						else if(options.type == 'widget')
						{
							theFreeboardModel.deleteWidget(viewModel);
						}
						else if(options.type == 'pane')
						{
							theFreeboardModel.deletePane(viewModel);
						}

					});
				}
				else
				{
					var instanceType = undefined;

					if(options.type == 'datasource')
					{
						if(options.operation == 'add')
						{
							settings = {};
						}
						else
						{
							instanceType = viewModel.type();
							settings = viewModel.settings();
							settings.name = viewModel.name();
						}
					}
					else if(options.type == 'widget')
					{
						if(options.operation == 'add')
						{
							settings = {};
						}
						else
						{
							instanceType = viewModel.type();
							settings = viewModel.settings();
						}
					}
					else if(options.type == 'pane')
					{
						settings = {};

						if(options.operation == 'edit')
						{
							settings.title = viewModel.title();
							settings.col_width = viewModel.col_width();
							settings.pane_type = viewModel.pane_type();
							settings.display_header = viewModel.display_header();
							settings.pane_id = viewModel.pane_id();
							settings.header_theme = viewModel.header_theme();
						}

						types = {
							settings: {
								settings: [
									{
										name          : "title",
										display_name  : "Title",
										type          : "text"
									},
									{
										name          : "col_width",
										display_name  : "Columns",
										type          : "integer",
										default_value : 1,
										required      : true
									},
									{
										name          : "pane_type",
										display_name  : "Tabbed Pane",
										type          : "boolean",
										default_value : false
									},
									{
										name          : "display_header",
										display_name  : "Display Header",
										type          : "boolean",
										default_value : true,
									},
									{
										name: "header_theme",
										display_name: "Theme",
										type: "option",
										options: [
											{
												name: "Primary",
												value: "primary"
											},
											{
												name: "Secondary",
												value: "secondary"
											}
										]
									},
									{
										name: "pane_id",
										display_name: "Pane ID",
										type: "text",
										description: "Optional: Unique ID for pane. Necessary for updating panes programmatically"
									}
								]
							}
						}
					}

					pluginEditor.createPluginEditor(title, types, instanceType, settings, function(newSettings)
					{
						window.Need_Save = true;
						if(options.operation == 'add')
						{
							if(options.type == 'datasource')
							{
								var newViewModel = new DatasourceModel(theFreeboardModel, datasourcePlugins);
								theFreeboardModel.addDatasource(newViewModel);

								newViewModel.name(newSettings.settings.name);
								delete newSettings.settings.name;

								newViewModel.settings(newSettings.settings);
								newViewModel.type(newSettings.type);
							}
							else if(options.type == 'widget')
							{
								var newViewModel = new WidgetModel(theFreeboardModel, widgetPlugins);
								newViewModel.settings(newSettings.settings);
								newViewModel.type(newSettings.type);

								viewModel.addWidget(newViewModel);

								freeboardUI.attachWidgetEditIcons(element);
								freeboardUI.processResize(true);
							}
						}
						else if(options.operation == 'edit')
						{
							if(options.type == 'pane')
							{
								viewModel.title(newSettings.settings.title);
								viewModel.col_width(newSettings.settings.col_width);

								if(!newSettings.settings.pane_type && viewModel.tabs() !== undefined){
									var tabs = viewModel.tabs();
									while(tabs.length > 1){
										tabs[0].widgets(tabs[0].widgets().concat(tabs[1].widgets()));
										tabs.splice(1, 1);
									}
									viewModel.updateCurrentTab(0);
								}

								viewModel.pane_type(newSettings.settings.pane_type);
								viewModel.display_header(newSettings.settings.display_header);
								viewModel.header_theme(newSettings.settings.header_theme);
								viewModel.pane_id(newSettings.settings.pane_id);
								freeboardUI.processResize(false);
							}
							else
							{
								if(options.type == 'datasource')
								{
									viewModel.name(newSettings.settings.name);
									delete newSettings.settings.name;
								} else if(options.type == 'widget') {
									freeboardUI.processResize(true);
								}

								viewModel.type(newSettings.type);
								viewModel.settings(newSettings.settings);
							}
						}
					});
				}
			});
		}
	}

	ko.virtualElements.allowedBindings.datasourceTypeSettings = true;
	ko.bindingHandlers.datasourceTypeSettings = {
		update: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext)
		{
			processPluginSettings(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext);
		}
	}

	ko.bindingHandlers.pane = {
		init  : function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext)
		{
			if(theFreeboardModel.isEditing())
			{
				$(element).css({cursor: "pointer"});
			}

			freeboardUI.addPane(element, viewModel, bindingContext.$root.isEditing());
		},
		update: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext)
		{
			// If pane has been removed
			if(theFreeboardModel.panes.indexOf(viewModel) == -1)
			{
				freeboardUI.removePane(element);
			}
			freeboardUI.updatePane(element, viewModel);
		}
	}

	ko.bindingHandlers.widget = {
		init  : function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext)
		{
			if(theFreeboardModel.isEditing())
			{
				freeboardUI.attachWidgetEditIcons($(element).parent());
			}
		},
		update: function(element, valueAccessor, allBindingsAccessor, viewModel, bindingContext)
		{
			if(viewModel.shouldRender())
			{
				$(element).empty();
				viewModel.render(element);
			}
		}
	}

	function getParameterByName(name)
	{
		name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
		var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"), results = regex.exec(location.search);
		return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
	}

	$(function()
	{ //DOM Ready
		// Show the loading indicator when we first load
		freeboardUI.showLoadingIndicator(true);

        var resizeTimer;

        function resizeEnd()
        {
            freeboardUI.processResize(true);
        }

        $(window).resize(function() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(resizeEnd, 500);
        });

	});

	// PUBLIC FUNCTIONS
	return {
		initialize          : function(allowEdit, finishedCallback)
		{
			ko.applyBindings(theFreeboardModel);

			// Check to see if we have a query param called load. If so, we should load that dashboard initially
			var freeboardLocation = getParameterByName("load");

			if(freeboardLocation != "")
			{
				$.ajax({
					url    : freeboardLocation,
					success: function(data)
					{
						theFreeboardModel.loadDashboard(data);

						if(_.isFunction(finishedCallback))
						{
							finishedCallback();
						}
					}
				});
			}
			else
			{
				theFreeboardModel.allow_edit(allowEdit);
				theFreeboardModel.setEditing(allowEdit);

				freeboardUI.showLoadingIndicator(false);
				if(_.isFunction(finishedCallback))
				{
					finishedCallback();
				}

                freeboard.emit("initialized");
			}
		},
		newDashboard        : function()
		{
			theFreeboardModel.loadDashboard({allow_edit: true});
		},
		loadDashboard       : function(configuration, callback)
		{
			theFreeboardModel.loadDashboard(configuration, callback);
		},
		serialize           : function()
		{
			return theFreeboardModel.serialize();
		},
		setEditing          : function(editing, animate)
		{
			theFreeboardModel.setEditing(editing, animate);
		},
		isEditing           : function()
		{
			return theFreeboardModel.isEditing();
		},
		loadDatasourcePlugin: function(plugin)
		{
			if(_.isUndefined(plugin.display_name))
			{
				plugin.display_name = plugin.type_name;
			}

            // Add a required setting called name to the beginning
            plugin.settings.unshift({
                name : "name",
                display_name : "Name",
                type : "text",
                required : true
            });


			theFreeboardModel.addPluginSource(plugin.source);
			datasourcePlugins[plugin.type_name] = plugin;
			theFreeboardModel._datasourceTypes.valueHasMutated();
		},
		// Allow widgets to force a board resize
        resize : function()
        {
        	// Prevent invalid schema during rearrangment
        	if(canResize)
            	freeboardUI.processResize(true);
        },
		loadWidgetPlugin    : function(plugin)
		{
			if(_.isUndefined(plugin.display_name))
			{
				plugin.display_name = plugin.type_name;
			}

			theFreeboardModel.addPluginSource(plugin.source);
			widgetPlugins[plugin.type_name] = plugin;
			theFreeboardModel._widgetTypes.valueHasMutated();
		},
		// To be used if freeboard is going to load dynamic assets from a different root URL
		setAssetRoot        : function(assetRoot)
		{
			jsEditor.setAssetRoot(assetRoot);
		},
		addStyle            : function(selector, rules)
		{
			var styleString = selector + "{" + rules + "}";

			var styleElement = $("style#fb-styles");

			if(styleElement.length == 0)
			{
				styleElement = $('<style id="fb-styles" type="text/css"></style>');
				$("head").append(styleElement);
			}

			if(styleElement[0].styleSheet)
			{
				styleElement[0].styleSheet.cssText += styleString;
			}
			else
			{
				styleElement.text(styleElement.text() + styleString);
			}
		},
		showLoadingIndicator: function(show)
		{
			freeboardUI.showLoadingIndicator(show);
		},
		showDialog          : function(contentElement, title, okTitle, cancelTitle, okCallback)
		{
			new DialogBox(contentElement, title, okTitle, cancelTitle, okCallback);
		},
		getDatasource : function(datasourceName)
		{
			var datasources = theFreeboardModel.datasources();

			// Find the datasource with the name specified
			var datasource = _.find(datasources, function(datasourceModel){
				return (datasourceModel.name() === datasourceName);
			});

			if(datasource)
			{
				return datasource;
			}
			else
			{
				return null;
			}
		},
		getDatasources : function(){
			var datasources = theFreeboardModel.datasources();
			return datasources;
		},
        getDatasourceSettings : function(datasourceName)
        {
			var datasource = this.getDatasource(datasourceName);
			if(datasource) {
				return datasource.settings();
			} else {
				return null;
			}
        },
        setDatasourceSettings : function(datasourceName, settings)
        {
            var datasources = theFreeboardModel.datasources();

            // Find the datasource with the name specified
            var datasource = _.find(datasources, function(datasourceModel){
                return (datasourceModel.name() === datasourceName);
            });

            if(!datasource)
            {
                console.log("Datasource not found");
                return;
            }

            var combinedSettings = _.defaults(settings, datasource.settings());
            datasource.settings(combinedSettings);
        },
		getStyleString      : function(name)
		{
			var returnString = "";

			_.each(currentStyle[name], function(value, name)
			{
				returnString = returnString + name + ":" + value + ";";
			});

			return returnString;
		},
		getStyleObject      : function(name)
		{
			return currentStyle[name];
		},
		showDeveloperConsole : function()
		{
			developerConsole.showDeveloperConsole();
		},
		getUserPermission : function(){
			return theFreeboardModel.getUserPermission();
		},
		setUserPermission : function(permissionObject){
			theFreeboardModel.setUserPermission(permissionObject);
		}
	};
}());

$.extend(freeboard, jQuery.eventEmitter);
