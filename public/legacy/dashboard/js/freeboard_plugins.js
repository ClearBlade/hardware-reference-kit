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

// ┌────────────────────────────────────────────────────────────────────┐ \\
// │ F R E E B O A R D                                                  │ \\
// ├────────────────────────────────────────────────────────────────────┤ \\
// │ Copyright © 2013 Jim Heising (https://github.com/jheising)         │ \\
// │ Copyright © 2013 Bug Labs, Inc. (http://buglabs.net)               │ \\
// ├────────────────────────────────────────────────────────────────────┤ \\
// │ Licensed under the MIT license.                                    │ \\
// └────────────────────────────────────────────────────────────────────┘ \\

(function () {
	var jsonDatasource = function (settings, updateCallback) {
		var self = this;
		var updateTimer = null;
		var currentSettings = settings;
		var errorStage = 0; 	// 0 = try standard request
		// 1 = try JSONP
		// 2 = try thingproxy.freeboard.io
		var lockErrorStage = false;

		function updateRefresh(refreshTime) {
			if (updateTimer) {
				clearInterval(updateTimer);
			}

			updateTimer = setInterval(function () {
				self.updateNow();
			}, refreshTime);
		}

		updateRefresh(currentSettings.refresh * 1000);

		this.updateNow = function () {
			if ((errorStage > 1 && !currentSettings.use_thingproxy) || errorStage > 2) // We've tried everything, let's quit
			{
				return; // TODO: Report an error
			}

			var requestURL = currentSettings.url;

			if (errorStage == 2 && currentSettings.use_thingproxy) {
				requestURL = (location.protocol == "https:" ? "https:" : "http:") + "//thingproxy.freeboard.io/fetch/" + encodeURI(currentSettings.url);
			}

			var body = currentSettings.body;

			// Can the body be converted to JSON?
			if (body) {
				try {
					body = JSON.parse(body);
				}
				catch (e) {
				}
			}

			$.ajax({
				url: requestURL,
				dataType: (errorStage == 1) ? "JSONP" : "JSON",
				type: currentSettings.method || "GET",
				data: body,
				beforeSend: function (xhr) {
					try {
						_.each(currentSettings.headers, function (header) {
							var name = header.name;
							var value = header.value;

							if (!_.isUndefined(name) && !_.isUndefined(value)) {
								xhr.setRequestHeader(name, value);
							}
						});
					}
					catch (e) {
					}
				},
				success: function (data) {
					lockErrorStage = true;
					updateCallback(data);
				},
				error: function (xhr, status, error) {
					if (!lockErrorStage) {
						// TODO: Figure out a way to intercept CORS errors only. The error message for CORS errors seems to be a standard 404.
						errorStage++;
						self.updateNow();
					}
				}
			});
		}

		this.onDispose = function () {
			clearInterval(updateTimer);
			updateTimer = null;
		}

		this.onSettingsChanged = function (newSettings) {
			lockErrorStage = false;
			errorStage = 0;

			currentSettings = newSettings;
			updateRefresh(currentSettings.refresh * 1000);
			self.updateNow();
		}
	};

	freeboard.loadDatasourcePlugin({
		type_name: "JSON",
		settings: [
			{
				name: "url",
				display_name: "URL",
				type: "text"
			},
			{
				name: "use_thingproxy",
				display_name: "Try thingproxy",
				description: 'A direct JSON connection will be tried first, if that fails, a JSONP connection will be tried. If that fails, you can use thingproxy, which can solve many connection problems to APIs. <a href="https://github.com/Freeboard/thingproxy" target="_blank">More information</a>.',
				type: "boolean",
				default_value: true
			},
			{
				name: "refresh",
				display_name: "Refresh Every",
				type: "number",
				suffix: "seconds",
				default_value: 5
			},
			{
				name: "method",
				display_name: "Method",
				type: "option",
				options: [
					{
						name: "GET",
						value: "GET"
					},
					{
						name: "POST",
						value: "POST"
					},
					{
						name: "PUT",
						value: "PUT"
					},
					{
						name: "DELETE",
						value: "DELETE"
					}
				]
			},
			{
				name: "body",
				display_name: "Body",
				type: "text",
				description: "The body of the request. Normally only used if method is POST"
			},
			{
				name: "headers",
				display_name: "Headers",
				type: "array",
				settings: [
					{
						name: "name",
						display_name: "Name",
						type: "text"
					},
					{
						name: "value",
						display_name: "Value",
						type: "text"
					}
				]
			}
		],
		newInstance: function (settings, newInstanceCallback, updateCallback) {
			newInstanceCallback(new jsonDatasource(settings, updateCallback));
		}
	});

	var clockDatasource = function (settings, updateCallback) {
		var self = this;
		var currentSettings = settings;
		var timer;

		function stopTimer() {
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
		}

		function updateTimer() {
			stopTimer();
			timer = setInterval(self.updateNow, currentSettings.refresh * 1000);
		}

		this.updateNow = function () {
			var date = new Date();

			var data = {
				numeric_value: date.getTime(),
				full_string_value: date.toLocaleString(),
				date_string_value: date.toLocaleDateString(),
				time_string_value: date.toLocaleTimeString(),
				date_object: date
			};

			updateCallback(data);
		}

		this.onDispose = function () {
			stopTimer();
		}

		this.onSettingsChanged = function (newSettings) {
			currentSettings = newSettings;
			updateTimer();
		}

		updateTimer();
	};

	freeboard.loadDatasourcePlugin({
		"type_name": "clock",
		"display_name": "Clock",
		"settings": [
			{
				"name": "refresh",
				"display_name": "Refresh Every",
				"type": "number",
				"suffix": "seconds",
				"default_value": 1
			}
		],
		newInstance: function (settings, newInstanceCallback, updateCallback) {
			newInstanceCallback(new clockDatasource(settings, updateCallback));
		}
	});

}());

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
var RbDisplayMessageContainer = (function($){

    var self = this;

    function rbDisplayMessageContainer(config){
        this.config = config;

        this.element = $('<div></div>')
            .attr('class', 'rbDisplayMessageContainer');

        this.render();

        return this.element;
    }

    rbDisplayMessageContainer.prototype = {

        render: function(){

            this.renderMessageContainer(this.config);
        },

        renderMessageContainer: function(config) {
            this.element.append($("<h4>" + config.message + "</h4>"));
            this.element.append($("<h4>" + config.messageDetail + "</h4>"));
        },

        onOkClicked: function(event){
            RuleBuilderUtils.closeDialog();
        }
    };

    return rbDisplayMessageContainer;
})(jQuery);
var RbRuleAlertContainer = (function($){
    //      alerts: [
    //          {
    //              type: "sms", {sms|email}
    //              provider: "twilio",
    //              options: {      --See email section below for valid email options
    //                  smsApiKey: "",
    //                  smsApiSecret: "",
    //                  smsFrom: "",
    //                  smsTo: "",
    //                  smsBody: ""
    //              }
    //          }
    //      ]

    var self = this;

    function rbRuleAlertContainer(config){
        this.rule = !!config.rule.rulename ? config.rule : {};
        this.widgetId = config.widgetId;
        this.allowEdit = config.allowEdit;

        if(!this.rule.alerts) {
            this.rule.alerts = [];
        }

        this.readOnly = config.readOnly || false;

        this.element = $('<div></div>')
            .attr('class', 'RbRuleAlertContainer');

        this.render();

        return this.element;
    }

    rbRuleAlertContainer.prototype = {
        render: function(){
            this.element.empty();
            this.element.append(this.constructThenContainer());
        },

        getAlertText: function() {
            var alertsText = [];

            for(var i=0; i<this.rule.alerts.length; i++){
                
                switch(this.rule.alerts[i].type) {
                    case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SMS:
                        alertsText.push(this.getSMSAlertText(this.rule.alerts[i]));
                        break;
                    case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_EMAIL:
                        alertsText.push(this.getEmailAlertText(this.rule.alerts[i]));
                        break;
                    case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE:
                        alertsText.push(this.getServiceAlertText(this.rule.alerts[i]));
                        break;
                }
            }
            return alertsText;
        },

        getSMSAlertText: function(alert) {
            var alertText = alert.provider[0].toUpperCase() + alert.provider.substring(1) + " ";
            alertText += alert.type.toUpperCase() + " FROM ";
            alertText += alert.options["smsFrom"];

            return alertText;
        },

        getEmailAlertText: function(alert) {
            var alertText = alert.provider[0].toUpperCase() + alert.provider.substring(1) + " ";
            alertText += alert.type[0].toUpperCase() + alert.type.substring(1) + " FROM ";
            alertText += alert.options["emailFrom"];

            return alertText;
        },

        getServiceAlertText: function(alert) {
            var alertText = "Invoke " + alert.type[0].toUpperCase() + alert.type.substring(1) + " ";
            alertText += alert.options["serviceName"];

            return alertText;
        },

        constructThenContainer: function() {
            var ifContainer = $('<div></div>')
                .attr('class', '.RbRuleThenContainer');

            var fieldSet = $('<fieldset><legend>Then</legend></fieldset>');

            if(this.readOnly) {
                fieldSet.append(this.constructReadOnlyAlerts());
            } else {
                if(this.rule.alerts.length === 0) {
                    fieldSet.append(this.getNewAlert(0));
                } else {
                    //Append the alerts to the fieldset
                    for(var i=0; i<this.rule.alerts.length; i++) {
                        fieldSet.append(this.getNewAlert(i));
                    }
                }

                //Append button container to the fieldset
                fieldSet.append(this.constructThenButtonContainer());
            }

            //Append the fieldset to the container
            ifContainer.append(fieldSet);
            return ifContainer;
        },

        constructReadOnlyAlerts: function() {
            var readOnlyContainer = $('<div></div>')
                .attr('class', '.RbRuleAlertReadOnly');
            var ruleAlertsText = this.getAlertText();

            //Add text blocks for each condition
            var list = $('<ul></ul>')
                .attr('class', '.RbRuleAlertList');
            for(var i=0; i<ruleAlertsText.length; i++){
                list.append($('<li>' + ruleAlertsText[i] + '</li>')
                    .attr('class', '.RbRuleAlertReadOnly'))
            }
            readOnlyContainer.append(list);

            if(this.allowEdit) {
                //Add edit button
                readOnlyContainer.append($("<button>Edit</button>")
                    .attr("class", "editLink clickable")
                    .on("click", $.proxy(this.onEditClick, this))
                );
            }

            return readOnlyContainer;
        },

        constructThenButtonContainer: function () {
            var container = $('<div></div>')
                    .attr('class', 'then-btn-container btn-container ')
                    //Append the add THEN button
                    .append($('<input type= "button" value="+ Add THEN">')
                        .attr('class', 'addConditionBtn btn')
                        .on("click", $.proxy(this.onAddThen, this))
                    )
                    //Append the Next button
                    .append($('<input type= "button" value="Next">')
                        .attr('class', 'nextBtn btn')
                        .on("click", $.proxy(this.onNextClick, this))
                    );

            return container;
        },

        onAddThen: function(event) {
            if (this.displayedFormsAreValid()){
                //Insert a new alert item before the button container
                this.getNewAlert().insertBefore(this.element.find('.then-btn-container'));
                $('body').trigger(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.RESIZE_DIALOG);
            } 
        },

        onNextClick: function(event) {
            if (this.displayedFormsAreValid()){
                //If all forms are valid, save the event data and display the alert container
                this.saveRuleAlerts();
            } 
        },

        getNewAlert: function(ndx) {
            var ndx = ndx || this.element.find('.RbRuleAlertForm').length;

            var container = $('<div class ="RbRuleAlertItemContainer"></div>');
            var deleteIcon = $('<div class ="icon-container"><i class ="icon-trash"></i></div>')
                .on("click", $.proxy(this.deleteAlert, this));

            var alert = new RbRuleAlertItem({
                alert: this.rule.alerts[ndx] || {},
                readOnly: this.readOnly
            });
            
            //Append the delete icon to the condition item
            container.append(alert);
            container.append(deleteIcon);
            return container;
        },

        deleteAlert: function(event) {
            $(event.currentTarget.parentElement).remove();
        },

        displayedFormsAreValid: function() {
            //Loop over each alert form and validate each form individually
            var alertForms = this.element.find('.RbRuleAlertForm');
            for (var i=0; i< alertForms.length; i++) {

                var form = $(alertForms[i]);

                //Reset validation data. The jquery validator doesn't
                //play nice when fields are added to a form dynamically
                form.removeData('validator');
                form.removeData('unobtrusiveValidation');

                //Retrieve the alert value
                var alertValue = form.find('.alert-select').val();
                var providerValue = form.find('.provider-select').val();
                var fields = RuleBuilderUtils.getAlertFields(alertValue, providerValue);

                if(alertValue === RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE) {
                    fields = fields.concat(this.buildServiceFieldsForValidation(alertForms[i]));
                }

                var validationOptions = RuleBuilderUtils.getFormValidationOptions(fields);
                
                form.validate(validationOptions);
                if (!form.valid()) {
                    return false;
                }
            }; 
            return true;
        },

        saveRuleAlerts: function() {
            //Retrieve all of the alert data
            var alerts = this.extractAlertsFromDOM();

            //Emit the saved data
            this.element.closest($('.RbRuleContainer')).trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.SAVE_ALERT, this.widgetId), [alerts]);
        },

        extractAlertsFromDOM: function() {
            var alerts = [];
            
            var alertForms = this.element.find('.RbRuleAlertForm');
            for (var i=0; i< alertForms.length; i++) {
                alerts.push(this.extractAlertFromDOM(alertForms[i]))
            }
            return alerts;
        },

        extractAlertFromDOM: function(form) {
            //Build a json object representing all of the event settings.
            //
            // alerts: [
            //     {
            //         type: "sms", {sms|email}
            //         provider: "twilio",
            //         options: {      --See email section below for valid email options
            //             smsApiKey: "",
            //             smsApiSecret: "",
            //             smsFrom: "",
            //             smsTo: "",
            //             smsBody: ""
            //         }
            //     }
            // ]
            var alert = {}, formElement = $(form);
            alert.options = {};

            alert.type = formElement.find('.alert-select').val();
            alert.provider = formElement.find('.provider-select').val() || "";

            //Extract the form fields and populate the alert object
            var alertFields = formElement.find(":text, textarea");
            for (var i=0; i< alertFields.length; i++) {
                alert.options[alertFields[i].name] = alertFields[i].value;
            };

            return alert;
        },

        onEditClick: function() {
            this.readOnly = false;
            this.render();

            this.element.closest(".RbRuleContainer").trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.EDIT_RULE, this.widgetId));
        },

        buildServiceFieldsForValidation: function(form) {
            //Since service fields are entered dynamically in the UI
            //We need to build the validation options dynamically
        
            // {
            //     fieldName: "emailFrom", 
            //     fieldLabel: "origin email address",
            //     fieldTag: "input", 
            //     fieldType: "text",
            //     events: [],
            //     validationOptions: {
            //         rules: {
            //             required: true,
            //             email: true
            //         },
            //         message: {
            //             required: "Sender's email is required.",
            //             email: "Please enter valid email address"
            //         }
            //     }
            // }
            var fields = [];
        
            var parms = this.getServiceParmDOMFields(form);
            for(var i=0; i<parms.length; i++) {
                var field = {};
                field.fieldName = parms[i].name;
                field.fieldLabel = parms[i].placeholder;

                field.validationOptions = {};
                field.validationOptions.rules = {};
                field.validationOptions.rules.required = true;

                field.validationOptions.message = {};
                field.validationOptions.message.required = field.fieldLabel + " is required"

                fields.push(field);
            }
            return fields;
        },

        getServiceParmDOMFields: function(form) {
            var fields = [];
        
            var containers = $(form).find('.svcparm-container', form);
            for(var i=0; i<containers.length; i++) {
                var parms = $(containers[i]).find('input', containers[i]);
                for(var j=0; j<parms.length; j++) {
                    fields.push(parms[j]);
                }
            }
            return fields;
        }
    };

    return rbRuleAlertContainer;
})(jQuery);
//      alerts: [
//          {
//              type: "sms", {sms|email}
//              provider: "twilio",
//              options: {      --See email section below for valid email options
//                  smsApiKey: "",
//                  smsApiSecret: "",
//                  smsFrom: "",
//                  smsTo: "",
//                  smsBody: ""
//              }
//          }
//      ]
var RbRuleAlertItem = (function($){
    var self = this;

    function rbRuleAlertItem(config){
        this.alert = config.alert || {};

        if(!this.alert.options) {
            this.alert.options = {};
        }

        this.element = $('<form></form>')
            .attr('class', 'rbForm RbRuleAlertForm');

        this.render();
        return this.element;
    }

    rbRuleAlertItem.prototype = {

        render: function(){
            this.element.append(this.constructAlertSelect());
            this.element.append(this.constructProviderSelect());

            if(!!this.alert.provider || this.alert.type === RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE) {
                this.element.append(this.constructFormFields());
            }
        },

        constructAlertSelect: function() {
            var fieldContainer = $('<div class=""></div>')
                .attr("class", "form-field-container alert-select-container");

            //Append the label and alert select to the container
            fieldContainer.append($('<label class="form-field-label" for="alerttype">Trigger</label>'))
                .append($('<select name="alerttype"></select>')
                    .attr('class', 'styled-select form-field alert-select')
                    //Append the options to the select element
                    .append('<option value="">Select Alert Type</option>')
                    .append('<option value="sms">SMS</option>')
                    .append('<option value="email">E-Mail</option>')
                    .append('<option value="service">Service</option>')
                        .val(this.alert.type || "")
                    .on('change', $.proxy(this.onAlertChange, this))
                );
            return fieldContainer;
        },

        constructProviderSelect: function() {
            var fieldContainer = $('<div class="form-field-container provider-select-container"></div>')
                .append($('<label class="form-field-label" for="alerttype">Service</label>'));
        
            //Append the "event source" select element to the fields container
            var providerSelect = $('<select name="providers"></select>')
                    .attr('class', 'styled-select form-field provider-select')
                    .on('change', $.proxy(this.onProviderChange, this));
            fieldContainer.append(providerSelect);

            this.setProviderOptions(providerSelect);

            if(this.alert.type !== RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE) {
                fieldContainer.hide();
            }

            return fieldContainer;
        },

        setProviderOptions: function(parent){
            //Remove any options that were previously present
            parent.find('option').remove();

            //Append the options to the select element
            parent.append('<option value="" default selected>Select Alert Service</option>');

            var providers = this.getProviders(this.alert.type);

            //Display the options in the select
            for (var i=0; i< providers.length; i++) {
                parent.append('<option value="' + providers[i].providerName + '">' + providers[i].providerLabel + '</option>');
            }
            if(providers.length === 0) {
                parent.parent().hide();
            } else {
                if(providers.length === 1) {
                    parent.val(providers[0].providerName);
                    this.alert.provider = providers[0].providerName;
                    this.constructFormFields();
                }
            }
        },

        onAlertChange: function(event) {
            var providerSelect = this.element.find(".provider-select-container");

            //Store the selected alert type value
            this.alert.type = event.currentTarget.value;

            //Retrieve the providers for the selected alert type and render the provider select
            if(this.alert.type !== RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE && this.alert.type !== "") {
                providerSelect.show();
                this.setProviderOptions(this.element.find(".provider-select"));
            } else {
                this.alert.provider = "";
                providerSelect.hide();
                this.constructFormFields();
            }
        },

        onProviderChange: function(event) {
            //Store the selected provider value
            this.alert.provider = event.currentTarget.value;
            this.constructFormFields();
        },

        constructFormFields: function() {
            //Remove any previously defined fields
            this.element.find(".alert-fields").remove();
            
            if(this.alert.type !== ""){
                this.element.append(this.constructAlertFields());

                if(this.alert.type === RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE) {
                    this.renderServiceAlertFields();
                }
            }
        },

        constructAlertFields: function() {
            var fieldsContainer = $('<div class=""></div>')
                .attr("class", "alert-fields");

            var fields = RuleBuilderUtils.getAlertFields(this.alert.type, this.alert.provider);

            for (var i=0; i<fields.length;i++) {
                var fieldContainer = $('<div class=""></div>').attr("class", "alert-field");

                fieldContainer.append(RuleBuilderUtils.createFormFields(fields[i], true, this.alert.options[fields[i].fieldName] || ""));
                fieldsContainer.append(fieldContainer);
            }

            //Bind the addParameter button event for services
            if(this.alert.type === RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE) {
                //Hide the "Add Parameter" label that was automatically created
                var btnContainer = fieldsContainer.find("label[for='addServiceParm']").parent();
                btnContainer.addClass("addServiceParmContainer");

                fieldsContainer.find("label[for='addServiceParm']").hide();
                fieldsContainer.find(".addServiceParm").on("click", $.proxy(this.addServiceParm, this));
            }

            return fieldsContainer;
        },

        //Retrieve the list of providers for a particular alert
        getProviders: function(alertValue) {
            switch(alertValue) {
                case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_EMAIL:
                    return rbEmailAlertImpl.getProviders();
                case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SMS:
                    return rbSmsAlertImpl.getProviders();
                case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE:
                    return rbServiceAlertImpl.getProviders();
                default:
                    return [];
            }
        },

        renderServiceAlertFields: function(div, ndx) {
            //Service parameters are comprised of 2 fields (options in settings).
            //We need to group the param name and param value options together
            //Since we aren't guaranteed to order of the options in the object, we need to
            //make sure the param name is correctly matched to its value

            //Get all the keys that begin with parmName
            var paramNames = Object.keys(this.alert.options).filter(function( key ){
                return key.indexOf("serviceParmName") > -1;
            })

            for(var i=0; i< paramNames.length; i+=1){
                var fields = [
                    {
                        fieldName: paramNames[i], 
                        fieldLabel: "Parameter Name",
                        fieldTag: "input", 
                        fieldType: "text"
                    }, {
                        fieldName: "serviceParmValue_" + paramNames[i].split("_")[1],
                        fieldLabel: "Parameter Value",
                        fieldTag: "input", 
                        fieldType: "text"
                    }
                ];

                //Create the html structure for the service parm
                this.renderServiceParm(div, fields);
            }
        },

        addServiceParm: function(event) {
            //Each field needs to have a unique "name" attribute in order for form
            //validation to work correctly
            var fieldID = new Date().getUTCMilliseconds()

            fields = [
                {
                    fieldName: "serviceParmName_" + fieldID, 
                    fieldLabel: "Parameter Name",
                    fieldTag: "input", 
                    fieldType: "text"
                }, {
                    fieldName: "serviceParmValue_" + fieldID, 
                    fieldLabel: "Parameter Value",
                    fieldTag: "input", 
                    fieldType: "text"
                }
            ];

            this.renderServiceParm(event.target.parentNode, fields);
        },

        renderServiceParm: function(div, fields) {
            //A service parm will always consist of a field for the parm name
            //and a field for the parm value. This function, therefore, assumes
            //the incoming fields array has two elements in it.
            var fieldDiv = $('<div class="svcparm-container"></div>');
            var parmNameField = RuleBuilderUtils.createFormFields(fields[0], true, this.alert.options[fields[0].fieldName] || "");
            var parmValueField = RuleBuilderUtils.createFormFields(fields[1], true, this.alert.options[fields[1].fieldName] || "");
            
            $(parmNameField).find('.form-field').addClass('serviceParmNameValue');
            $(parmValueField).find('.form-field').addClass('serviceParmValueValue');
            fieldDiv.append(parmNameField, parmValueField);

            fieldDiv.append($('<div class="icon-container"></div>')
                .append($('<i class ="icon-trash"></i>'))
                .on('click', $.proxy(this.deleteServiceParm, this)));

//TODO - Add the right class
            this.element.find(".addServiceParmContainer").before(fieldDiv);
        },

        deleteServiceParm: function(event) {
            event.target.parentNode.parentNode.remove();
        }
    };

    return rbRuleAlertItem;
})(jQuery);
var RbRuleContainer = (function($){

    var self = this;

    function rbRuleContainer(config){
        this.config = config;
        this.rule = this.config.rule || {};

        this.element = $('<div></div>')
            .attr('class', 'RbRuleContainer');

        this.render();
        return this.element;
    }

    rbRuleContainer.prototype = {

        render: function(){

            //This function is invoked when the dialog is displayed.
            //The dialog is only displayed when either the "Add Rule"
            //link is clicked in the ruleList widget or an existing rule is
            //clicked in the ruleList widget. We therefore need to inspect the
            //contents of the rule to determine how to display the
            //containers.
            if(!this.rule.rulename || this.rule.rulename == "") {
                //If the rule name is not present, render the
                //event container in "edit" mode
                this.renderEventContainer(false);
            } else {
                //Render both containers in readOnly mode
                this.renderEventContainer(true);
                this.renderAlertContainer(true);

                //We need to wait to ensure the dialog has been rendered
                setTimeout($.proxy(this.showOrHideButtons, this), 500);
            }

            this.bindEvents();
        },

        bindEvents: function(){
            //Bind custom events
            this.element.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.SAVE_EVENT, this.config.widgetId), $.proxy(this.onEventSaved, this));
            this.element.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.SAVE_ALERT, this.config.widgetId), $.proxy(this.onAlertSaved, this));
            this.element.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.EDIT_RULE, this.config.widgetId), $.proxy(this.showOrHideButtons, this));
            this.element.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.CLOSE_DIALOG, this.config.widgetId), $.proxy(this.onRuleDone, this));
        },

        renderEventContainer: function(isReadOnly) {
            //Remove any containers that were previously added
            this.element.empty();
            this.element.append(new RbRuleEventContainer({
                rule: this.rule,
                widgetId: this.config.widgetId,
                readOnly: isReadOnly,
                allowEdit: this.config.allowEdit
            }));
        },

        renderAlertContainer: function(isReadOnly) {
            //Remove any containers that were previously added
            this.element.find(".RbRuleAlertContainer").remove();
            this.element.find(".rule-btn-container").remove();
            this.element.append(new RbRuleAlertContainer({
                rule: this.rule,
                widgetId: this.config.widgetId,
                readOnly: isReadOnly,
                allowEdit: this.config.allowEdit
            }));
        },

        showOrHideButtons: function(event) {
            //Determine whether or not to display the Done button in the dialog
            if(event || !this.rule.event.eventSource || this.rule.alerts.length === 0) {
                $("#dialog-ok").hide();
            } else {
                $("#dialog-ok").show();
            }            
        },

        onRuleDone: function(event){
            if (this.config.allowEdit) {
                //Publish the save rule event so that the back-end logic can be invoked
                $('#' + this.config.widgetId + '> .rbRuleListContainer').trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.SAVE_RULE, this.config.widgetId), [{rule:this.rule, ruleIndex:this.config.ruleIndex}]);
            }
        },

        onEventSaved: function(event, data){
            this.rule.rulename = data.rulename;
            this.rule.event = data.event;

            //Render the event container as read only
            this.renderEventContainer(true);
            this.renderAlertContainer(!!this.rule.alerts && this.rule.alerts.length > 0);
            this.showOrHideButtons();
        },

        onAlertSaved: function(event, data){
            //We need to reconcile the alerts against what we already have so that
            //we dont lose the isCreated, serviceName, and triggerName properties
            var newAlerts = data;

            for(var i=0; i<newAlerts.length; i++) {
                //loop through the existing alerts to match them up by type
                for(var j=0; j<this.rule.alerts.length; j++) {
                    if(newAlerts[i].type === this.rule.alerts[j].type) {
                        if(this.rule.alerts[j].isCreated){
                            newAlerts[i].isCreated = this.rule.alerts[j].isCreated;
                        }
                        if(this.rule.alerts[j].serviceName){
                            newAlerts[i].serviceName = this.rule.alerts[j].serviceName;
                        }
                        if(this.rule.alerts[j].isCreated){
                            newAlerts[i].triggerName = this.rule.alerts[j].triggerName;
                        }

                        this.rule.alerts.splice(j, 1); //delete this entry so that we don't process it again 
                        break;
                    }
                }
                //Initialize the isCreated attribute
                if(!newAlerts[i].isCreated) {
                    newAlerts[i].isCreated = false;
                }
            }

            this.rule.alerts = newAlerts;
            //Render the alert container as read only
            this.renderAlertContainer(true);
            this.showOrHideButtons();
        }
    };

    return rbRuleContainer;
})(jQuery);
// var RbRuleEditorDialog = (function($){

//     function rbRuleEditorDialog(){

//         this.element = $("<div></div>")
//             .attr('class', 'rbRuleEditorDialog');

//         this.render();
//         this.bindEvents();
//     }

//     rbRuleEditorDialog.prototype = {

//         render: function(){
//             this.closeDialog();

//             var modal = $('<div class="rbRuleEditorDialogModal"></div>')
//                 .append($('<div class="rbRuleEditorDialogHeader"></div>')
//                     .append($('<span class="dialog-title left"></span>'))
//                     .append($('<i class="icon-remove right"></i>')))
//                 .append($('<div class="rbRuleEditorDialogContent"></div>'));

//             //Append the overlay
//             this.element.append($('<div class="rbRuleEditorDialogOverlay"></div>'));

//             //Append the modal
//             this.element.append(modal);

//             //Append the modal to the body
//             $('body').append(this.element);

//             this.bindEvents();
//         },

//         bindEvents: function(){
//             this.element.find(".icon-remove").on('click', $.proxy(this.closeDialog, this));

//             //Bind custom events
//             $('body').on(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.OPEN_DIALOG, $.proxy(this.openTheDialog, this));
//             $('body').on(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.CLOSE_DIALOG, $.proxy(this.closeDialog, this));
//             $('body').on(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.RESIZE_DIALOG, $.proxy(this.centerModal, this));
//             //TODO $('body').on(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.RULENAME_UPDATED, $.proxy(this.setHeader, this));
//         },

//         setHeader: function(event, data){
//             //TODO $(".dialog-title").text(data);
//             //$(".modal .title").text(data);
//         },

//         openTheDialog: function(event, data) {
//             this.element.find(".rbRuleEditorDialogContent").append(data);
//             this.centerModal();
//             this.element.show();
//         },

//         closeDialog: function(event, data) {
//             this.element.find(".rbRuleEditorDialogContent").empty();
//             this.element.hide();
//         },

//         centerModal: function() {
//             var header = $("#main-header")
//             var modal = this.element.find(".rbRuleEditorDialogModal");
//             var content = this.element.find(".rbRuleEditorDialogContent");
            
//             //Center the modal
//             //var top = (Math.max($(window).height() - modal.outerHeight(), 0) / 2);
//             var top = header[0].offsetHeight + header[0].offsetTop + 20;
//             var left = Math.max($(window).width() - modal.outerWidth(), 0) / 2;

//             modal.css({
//                 top:top + $(window).scrollTop(), 
//                 left:left + $(window).scrollLeft(),
//                 "min-height": '200px',
//                 "max-height": $('#board-content').height() - top - 40 + 'px'
//             });

//             content.css({
//                 "min-height": '200px',
//                 "max-height": $('#board-content').height() - top - 40 + 'px'
//             });
//         }
//     };

//     return rbRuleEditorDialog;
// })(jQuery);
var RbRuleEventConditionItem = (function($){

    var self = this;

    function rbRuleEventConditionItem(config){
        this.condition = config.condition || {};
        this.eventType = config.eventType;
        this.readOnly = config.readOnly || false;
        this.conditionIndex = config.conditionIndex;

        this.element = $('<form></form>')
            .attr('class', 'rbForm RbRuleEventConditionForm');

        this.render();

        return this.element;
    }

    rbRuleEventConditionItem.prototype = {

        render: function(){
            if(!this.readOnly) {
                if(this.conditionIndex > 0) {
                    this.element.append(this.constructLogicalCondition());
                }
                
                this.element.append(this.constructFormFields());
            } else {
                this.element.append(this.constructReadOnlyInterface());
            }

            this.bindEvents();
        },

        bindEvents: function(){
        },

        constructLogicalCondition: function() {
            return cond = $('<div class="form-field-container logical-condition-container"></div>')
                .append($('<label class="form-field-label" for="logical">Operator</label>'))
                .append($('<select name="logical"></select>')
                    .attr('class', 'styled-select logical-condition-select form-field')
                    //Append the options to the select element
                    .append('<option value="AND" default>AND</option>')
                    .append('<option value="OR">OR</option>')
                    .val(this.condition.logical || "AND")
                    .on('change', $.proxy(this.onSelectChange, this)))
        },

        onSelectChange: function(event) {
            //Set the value in the condition
            this.condition.logical = event.currentTarget.value;
        },

        constructFormFields: function() {
            var fieldsContainer = $('<div class=""></div>')
                .attr("class", "condition-fields")

            var fields = RuleBuilderUtils.getEventSpecificFields(this.eventType);

            for (var i=0; i<fields.length;i++) {
                var fieldContainer = $('<div class=""></div>')
                    .attr("class", "condition-field")

                if(fields[i].fieldName === "operator") {
                    fieldContainer.append(this.constructOperator());
                    fieldsContainer.append(fieldContainer);
                } else {
                    if(fields[i].isConditionField === true) {
                        fieldContainer.append(RuleBuilderUtils.createFormFields(fields[i], true, this.condition[fields[i].fieldName]));
                        fieldsContainer.append(fieldContainer);
                    }
                }
            }
            return fieldsContainer;
        },

        //Render the operator field used to build conditions
        constructOperator: function() {

            var container = $('<div class="form-field-container"></div>');
            container.append($('<label class="form-field-label" for="operator">Operator</label>'));
            container.append($('<select name="operator"></select>')
                .attr('class', 'styled-select form-field condition-operator')
                .append($('<option value="" default selected>Select Operator Type</option>'))
                .append($('<option value="GREATER_THAN">' + RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS.GREATER_THAN +'</option>'))
                .append($('<option value="LESS_THAN">' + RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS.LESS_THAN + '</option>'))
                .append($('<option value="GREATER_THAN_EQUAL_TO">' + RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS.GREATER_THAN_EQUAL_TO + '</option>'))
                .append($('<option value="LESS_THAN_EQUAL_TO">' + RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS.LESS_THAN_EQUAL_TO + '</option>'))
                .append($('<option value="EQUAL_TO">' + RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS.EQUAL_TO + '</option>'))
                .append($('<option value="NOT_EQUAL_TO">' + RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS.NOT_EQUAL_TO + '</option>'))
                .val(this.condition.operator || ""));

            return container;
        }
    };

    return rbRuleEventConditionItem;
})(jQuery);
var RbRuleEventContainer = (function($){

    var self = this;

    function rbRuleEventContainer(config){
        this.rule = !!config.rule.rulename ? config.rule : {event: {conditions: [], options: {}}};
        this.widgetId = config.widgetId;
        this.readOnly = config.readOnly || false;
        this.allowEdit = config.allowEdit;

        this.element = $('<div></div>')
            .attr('class', 'RbRuleEventContainer');

        this.render();

        return this.element;
    }

    rbRuleEventContainer.prototype = {

        render: function(){

            this.element.empty();

            this.element.append(this.constructRuleName());
            this.element.append(this.constructIfContainer());
        },

        getRuleText: function() {
            var ruleConditionsText = [];

            for(var i=0; i<this.rule.event.conditions.length; i++){
                var ruleText = "";

                if(i>0) {
                    ruleText += this.rule.event.conditions[i].logical + " ";
                }
                ruleText += this.rule.event.eventSource[0].toUpperCase() + this.rule.event.eventSource.substring(1) + " ";
                ruleText += this.rule.event.conditions[i].variable + " ";
                ruleText += RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS[this.rule.event.conditions[i].operator] + " ";
                ruleText += isNaN(this.rule.event.conditions[i].value) ? 
                    "\"" + this.rule.event.conditions[i].value + "\" " : this.rule.event.conditions[i].value;
                
                ruleConditionsText.push(ruleText);
            }
            return ruleConditionsText;
        },

        constructRuleName: function() {
            if(!this.rule.rulename) {
                var nameField = RuleBuilderUtils.createFormFields({
                    fieldName: "rulename", 
                    fieldLabel: "Rule Name",
                    fieldTag: "input", 
                    fieldType: "text",
                    isConditionField: false,
                    renderLabelField: false,
                    events: [
                        {eventName: "onfocus", eventValue: "this.placeholder=\'\'"},
                        {eventName: "onblur", eventValue: "this.placeholder=\'Rule Name (Required)\'"}
                    ]
                }, false, this.rule.rulename || "");
            }

            return form = $('<form method="post"></form>')
                .attr('class', 'rbForm rulename-form')
                .append(nameField);
        },

        constructIfContainer: function() {
            var ifContainer = $('<div></div>')
                .attr('class', '.RbRuleIfContainer');

            var fieldSet = $('<fieldset><legend>IF</legend></fieldset>');

            if(this.readOnly) {
                fieldSet.append(this.constructReadOnlyEvent());
            } else {
                //Append the select form to the fieldset
                fieldSet.append(this.constructEditableEvent());

                //Append the conditions to the fieldset
                for(var i=0; i<this.rule.event.conditions.length; i++) {
                    fieldSet.append(this.getNewCondition(i));
                }

                //Append button container to the fieldset
                fieldSet.append(this.constructIfButtonContainer());
            }

            //Append the fieldset to the container
            ifContainer.append(fieldSet);
            return ifContainer;
        },

        constructReadOnlyEvent: function() {
            var readOnlyContainer = $('<div></div>')
                .attr('class', '.RbRuleEventReadOnly');
            var ruleConditionsText = this.getRuleText();

            //Add text blocks for each condition
            var list = $('<ul></ul>')
                .attr('class', '.RbRuleEventList');
            for(var i=0; i<ruleConditionsText.length; i++){
                list.append($('<li>' + ruleConditionsText[i] + '</li>')
                    .attr('class', '.RbRuleConditionReadOnly'))
            }
            readOnlyContainer.append(list);

            if(this.allowEdit) {
                //Add edit button
                readOnlyContainer.append($("<button>Edit</button>")
                    .attr("class", "editLink clickable")
                    .on("click", $.proxy(this.onEditClick, this))
                );
            }

            return readOnlyContainer;
        },

        constructEditableEvent: function() {
            var fieldContainer = $('<div class=""></div>')
                .attr("class", "event-fields-container")
            var evtForm = $('<form method="post"></form>')
                .attr('class', 'rbForm select-form');

            //Append the "event source" select element to the fields container

            fieldContainer.append($('<div class="form-field-container"></div>')
                .append($('<label class="form-field-label" for="eventsource">Datasource</label>'))
                    .append($('<select name="eventsource"></select>')
                        .attr('class', 'styled-select form-field source-select')
                        //Append the options to the select element
                        //Uncomment commented options when the event sources have been
                        //implemented.
                        .append('<option value="" default>Select Source Type</option>')
                        // .append('<option value="user">user</option>')
                        .append('<option value="message">message</option>')
                        // .append('<option value="data">data</option>')
                        // .append('<option value="device">device</option>')
                        .val(this.rule.event.eventSource || "")
                        .on('change', $.proxy(this.onSelectChange, this))
                    ));

            //Append the event specific fields to the container
            fieldContainer.append(this.renderEventSpecificFields());

            //Append the field container to the form
            evtForm.append(fieldContainer);

            return evtForm;
        },

        constructIfButtonContainer: function () {
            var container = $('<div></div>')
                    .attr('class', 'if-btn-container btn-container ')
                    //Append the Create Rule button
                    .append($('<input type= "button" value="+ Add Condition">')
                        .attr('class', 'addConditionBtn btn')
                        .on("click", $.proxy(this.onAddCondition, this))
                    )
                    //Append the Update Rule button
                    .append($('<input type= "button" value="Next">')
                        .attr('class', 'nextBtn btn')
                        .on("click", $.proxy(this.validateForms, this))
                    );

            //Render the container as hidden
            if(!this.rule.event.eventSource) {
                container.hide();
            }
            return container;
        },

        renderEventSpecificFields: function() {
            var eventFields = $('<div></div>').attr("class", "event-fields");

            if(!!this.rule.event.eventSource) {
                var fields = RuleBuilderUtils.getEventSpecificFields(this.rule.event.eventSource);
                var eventFields = $('<div></div>').attr("class", "event-fields");

                for (var i=0; i<fields.length;i++) {
                    if(fields[i].isConditionField === false) {
                        eventFields.append(RuleBuilderUtils.createFormFields(fields[i], true, 
                            this.rule.event.options[fields[i].fieldName] || ""));
                    }
                }
            }
            return eventFields;
        },

        onAddCondition: function(event) {
            //Insert a new condition item before the button container
            this.getNewCondition().insertBefore(this.element.find('.if-btn-container'));

            $('body').trigger(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.RESIZE_DIALOG);
        },

        getNewCondition: function(ndx) {
            var ndx = ndx || this.element.find('.RbRuleEventConditionForm').length

            var deleteIcon = $('<div class ="icon-container"><i class ="icon-trash"></i></div>')
                .on("click", $.proxy(this.deleteCondition, this))

            var condition = new RbRuleEventConditionItem({
                condition: this.rule.event.conditions[ndx] || {},
                eventType: this.rule.event.eventSource,
                readOnly: this.readOnly,
                conditionIndex: ndx
            });
            
            //Append the delete icon to the condition item
            condition.append(deleteIcon);
            return condition;
        },

        deleteCondition: function(event) {
            $(event.currentTarget.parentElement).remove();

            //Remove the condition select on the first condition
            var conditions = this.element.find('.RbRuleEventConditionForm');
            if(conditions.length > 0) {
                $(conditions[0]).find('.logical-condition-container').remove();
            }
        },

        validateForms: function(event) {
            var formsAreValid = true;

            var validationOptions = RuleBuilderUtils.getFormValidationOptions(
                this.rule.event.eventSource !== "" ? RuleBuilderUtils.getEventSpecificFields(this.rule.event.eventSource) : []);

            if(!this.rule.rulename) {
                //Verify a rule name was specified in the rulename form
                var nameForm = $(this.element.find('.rulename-form'));
                if(nameForm.length > 0) {
                    nameForm.validate(validationOptions);
                    if(!nameForm.valid()) {
                        formsAreValid = false;
                    }
                }
            }

            //Verify the select form
            var selectForm = $(this.element.find('.select-form'));
            selectForm.validate(validationOptions);
            if(!selectForm.valid()) {
                formsAreValid = false;
            }

            //Loop over each condition form and validate each form individually
            var condForms = this.element.find('.RbRuleEventConditionForm');
            for (var i=0; i< condForms.length; i++) {
                var form = $(condForms[i]);
                form.validate(validationOptions);
                if (!form.valid()) {
                    formsAreValid = false;
                }
            };  

            if(!formsAreValid) {
                return;
            } else {
                //If all forms are valid, save the event data and display the alert container
                this.saveRuleEvent();
            }
        },

        onSelectChange: function(event) {
            this.rule.event.eventSource = event.currentTarget.value;
            this.rule.event.conditions = [];
            
            var btnContainer = this.element.find(".if-btn-container")

            //Remove non-condition fields that were previously added to the UI
            this.element.find(".event-fields").remove();

            //Remove any condition forms that were previously added to the UI 
            this.element.find(".RbRuleEventConditionForm").remove();

            //
            var eventFields = 
            this.element.find('.event-fields-container').append(this.renderEventSpecificFields());
            if(this.rule.event.eventSource != "") {

                this.onAddCondition(event);

                //Display the button container
                btnContainer.show();
            } else {
                btnContainer.hide();
            }
        },

        saveRuleEvent: function() {
            //Retrieve all of the rule data
            var rule = this.extractEventFromDOM();

            //Set the dialog title to be the rule name
            $(".modal .title").text(rule.rulename);

            //Emit the saved data
            this.element.closest($('.RbRuleContainer')).trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.SAVE_EVENT, this.widgetId), [rule]);
        },

        extractEventFromDOM: function() {
            //Build a json object representing all of the event settings.
            //
            // {
            //      rulename: xxxx,
            //      event: {
            //          eventSource: "message", {user|message|data|device}
            //          options: {
            //              topic: ""
            //          }, {
            //          conditions: [
            //              logical: "AND|OR"
            //              variable: "", 
            //              operator: "",
            //              value: ""
            //          ]
            //      }

            //Make a clone of the rule being edited so that changes made in this widget
            //do not affect the original rule
            var rule = this.rule, event = {}, options = {}, conditions = [];
            
            if(!this.rule.rulename) {
                rule.rulename = this.element.find($(".rulename"))[0].value;
            }
            event.eventSource = this.rule.event.eventSource;
            
            //Store the event specific data
            var eventFields = this.element.find($('.event-fields .form-field'));
            for (var i=0; i< eventFields.length; i++) {
                options[eventFields[i].name] = eventFields[i].value;
            };
            
            //Store all of the condition specific data
            var conditionForms = this.element.find($('.RbRuleEventConditionForm'));
            for (var j=0; j< conditionForms.length; j++) {
                var conditionFields = $(conditionForms[j]).find($('.form-field'));
                var condition = {};
                for (var k=0; k< conditionFields.length; k++) {
                    

                    switch (conditionFields[k].name) {
                        case 'value':
                            if(!isNaN(conditionFields[k].value)) {
                                condition[conditionFields[k].name] = Number(conditionFields[k].value);
                            } else {
                                condition[conditionFields[k].name] = conditionFields[k].value;
                            }
                            break;
                        case 'logical':
                            //We dont' want to store the logical operator for the first condition
                            if(j>0) {
                                condition[conditionFields[k].name] = conditionFields[k].value;
                            } else {
                                condition[conditionFields[k].name] = "";
                            }
                            break;
                        default:
                            condition[conditionFields[k].name] = conditionFields[k].value;
                    }
                }
                conditions.push(condition);
            };

            event.options = options;
            event.conditions = conditions;
            rule.event = event;

            return rule;
        },

        onEditClick: function() {
            this.readOnly = false;
            this.render();

            this.element.closest(".RbRuleContainer").trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.EDIT_RULE, this.widgetId));
        }
    };

    return rbRuleEventContainer;
})(jQuery);
var RbRuleList = (function($){

    var self = this;

    function rbRuleList(config){
        //Make a clone of the rules list so that modifications made
        //do not affect the original rules
        this.config = JSON.parse(JSON.stringify(config)) || {};

        if(!config.rules) {
            config.rules = [];
        }

        this.element = $("<div></div>")
            .attr('class', 'rbRuleListContainer');

        this.render();
        return this.element;
    }

    rbRuleList.prototype = {

        render: function(){
            this.element.empty();
            this.element.off();

            //Create the fieldset
            var fieldSet = $("<fieldset></fieldset>")
                .append($("<legend>" + this.config.widgetName + "</legend>"))

            //Append the rules
            if(this.config.rules.length > 0) {
                var scrollContainer = $("<div class='rbRuleListScroll'></div>");
                var list = $("<ul></ul>")
                    .attr("class", "rbRuleList"); 

                for(var i=0; i<this.config.rules.length; i++) {
                    //Clone the config object
                    var itemConfig = JSON.parse(JSON.stringify(this.config));

                    itemConfig.rule = this.config.rules[i];
                    itemConfig.ruleIndex = i;
                    delete itemConfig.rules;

                    list.append(new RbRuleListItem(itemConfig));
                }

                scrollContainer.append(list);
                fieldSet.append(scrollContainer);
            } else {
                fieldSet.append($('<div class="NoRulesContainer"></div>')
                    .append($('<h4>No Rules</h4>').attr('class', 'rbRuleListItem')));
            }


            if(this.config.allowCreate) {
                fieldSet.append($("<div></div>")
                    .append($("<i class='icon-plus'></i>"))
                    .attr("id", "addNewRuleLink_" + this.config.widgetId)
                    .attr("class", "addNewRuleLink clickable")
                    .append("<span>Add New Rule</span>")
                );
            }

            //Append the fieldset
            this.element.append(fieldSet);
            this.bindEvents();
        },

        bindEvents: function(){
            this.element.find("#addNewRuleLink_" + this.config.widgetId).on('click', $.proxy(this.addNewRule, this));

            //Bind custom events
            this.element.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.DELETE_RULE, this.config.widgetId), $.proxy(this.onRuleDeleted, this));
            this.element.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.SAVE_RULE, this.config.widgetId), $.proxy(this.onRuleSaved, this));
        },

        addNewRule: function() {
            var ruleNdx = -1;
            RuleBuilderUtils.openRuleDialog({
                    widgetId: this.config.widgetId, 
                    ruleIndex: ruleNdx,
                    allowEdit: this.config.allowEdit
            });
        },

        onRuleSaved: function(event, data) {
            //We need to determine if the rule is a new rule or a modified rule
            if(data.ruleIndex !== -1 /*&& data.ruleIndex + 1 <= this.config.rules.length*/) {
                this.config.rules[data.ruleIndex] = data.rule;

                //Publish the event to update the back-end rule
                this.element.trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.MODIFY_RULE, this.config.widgetId), 
                    [{rule: data.rule, ruleIndex: data.ruleIndex}]);
            } else {
                this.config.rules.push(data.rule);

                //Publish the event to add a new back-end rule
                this.element.trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.CREATE_RULE, this.config.widgetId), 
                    [{rule: data.rule, ruleIndex: data.ruleIndex + 1}]);
            }

            this.render();
        },

        onRuleDeleted: function(event, data) {
            //Delete the rule from the internal array
            this.config.rules.splice(data.ruleIndex, 1);
            this.render();
        }
    };

    return rbRuleList;
})(jQuery);
var RbRuleListItem = (function($){

    function rbRuleListItem(config){

        this.config = config;
        this.element = $("<li></li>")
            .attr('class', 'rbRuleListItem');

        this.render();
        this.bindEvents();

        return this.element;
    }

    rbRuleListItem.prototype = {

        render: function(){

            if(this.config.allowDelete) {
                //Append the delete icon
                this.element.append($('<div class ="icon-container"><i class ="icon-trash"></i></div>'));
            }
            
            //Append the rule editing button
            //TODO: Add last run logic
            this.element.append($("<div></div>")
                .attr("class", "rbRuleListItemNameContainer")
                .append($('<button>' + this.config.rule.rulename + '</button>')
                    .attr("class", "rbRuleListItemName"))
                // TODO - Uncomment when API is exposed
                // .append($('<span>Last run: </span>')
                //     .attr("class", "rbRuleListItemLastRun")
                //     .append($('<span>Mar 3, 2017 10:34:12 AM</span>')
                //         .attr("class", "rbRuleListItemLastRunDate")))
                );

            if (this.config.allowOnOff) {
                //Append the on/off slider
                this.element.append($('<div></div>')
                    .attr("class", "onoffswitch-container")
                    .append($('<div></div>')
                        .attr("class", "onoffswitch")
                        .append($("<input>")
                            .attr("class", "onoffswitch-checkbox")
                            .attr("id", this.config.rule.rulename + "-onoff")
                            .attr("type", "checkbox")
                            .attr("name", "onoffswitch")
                            .attr("checked", this.config.rule.enabled))
                        .append($("<label>")
                            .attr("class", "onoffswitch-label")
                            .attr("for", this.config.rule.rulename + "-onoff")
                            .append($('<div></div>')
                                .attr("class", "onoffswitch-inner")
                                .append($('<span class="on">on</span>'))
                                .append($('<span class="off">off</span>'))
                            .append($('<div></div>')
                                .attr("class", "onoffswitch-switch"))
                        ))
                    )
                );
            }
        },

        bindEvents: function(){
            this.element.find(".onoffswitch-checkbox").on("change", $.proxy(this.onToggle, this));
            this.element.find(".icon-trash").on("click", $.proxy(this.deleteRule, this));
            this.element.find(".rbRuleListItemName").on("click", $.proxy(this.editRule, this));
        },

        //TODO - Implement this when API is available
        getLastRun: function() {

        },

        onToggle: function(event){
            var enableRule = event.currentTarget.checked;

            if(enableRule) {
                this.element.trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.ENABLE_RULE, this.config.widgetId), 
                    [{ruleIndex: this.config.ruleIndex}]);
            } else {
                this.element.trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.DISABLE_RULE, this.config.widgetId), 
                    [{ruleIndex: this.config.ruleIndex}]);
            }
        },

        deleteRule: function(event) {
            this.element.trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.DELETE_RULE, this.config.widgetId), 
                [{rule:this.config.rule, ruleIndex: this.config.ruleIndex}]);
        },

        editRule: function(event) {
            RuleBuilderUtils.openRuleDialog(this.config);
        }
    };

    return rbRuleListItem;
})(jQuery);
var RuleBuilderUtils = {
    createEventName: function(event, widgetId){

        //Get the parent element whose class is rbwidget. Append its 
        //id attribute value to the custom event
        return widgetId + ":" + event;
    },

    displayMessage: function(config) {
        freeboard.showDialog(new RbDisplayMessageContainer(config), "Error", "OK", null, function() {});
    },

    openRuleDialog: function(config) {
        // onDoneClick() is the inner function, a closure so we can access the config object when the showDialog
        // is closed
        function onDoneClick() { 
            //Publish the save rule event so that the back-end logic can be invoked
            $('.modal .RbRuleContainer').trigger(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.CLOSE_DIALOG, 
            config.widgetId)); 
        }

        freeboard.showDialog(new RbRuleContainer(config), 
            !!config.rule && !!config.rule.rulename ? config.rule.rulename : "New Rule", "Done", "Cancel", onDoneClick);

        //Hide the done button if the rule is not ready to be created
        if(!config.rule || !config.rule.event || config.rule.event.eventSource || config.rule.alerts.length === 0) {
            $("#dialog-ok").hide();
        }          
    },

    closeDialog: function() {
        $('body').trigger(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.CLOSE_DIALOG);
    },

    buildServiceFieldsForValidation: function(form) {
        //Since service fields are entered dynamically in the UI
        //We need to build the validation options dynamically
        
        // {
        //     fieldName: "emailFrom", 
        //     fieldLabel: "origin email address",
        //     fieldTag: "input", 
        //     fieldType: "text",
        //     events: [],
        //     validationOptions: {
        //         rules: {
        //             required: true,
        //             email: true
        //         },
        //         message: {
        //             required: "Sender's email is required.",
        //             email: "Please enter valid email address"
        //         }
        //     }
        // }
        var fields = [];
        
        var parms = self._getServiceParmDOMFields(form);
        for(var i=0; i<parms.length; i++) {
            var field = {};
            field.fieldName = parms[i].name;
            field.fieldLabel = parms[i].placeholder;

            field.validationOptions = {};
            field.validationOptions.rules = {};
            field.validationOptions.rules.required = true;

            field.validationOptions.message = {};
            field.validationOptions.message.required = field.fieldLabel + " is required"

            fields.push(field);
        }
        return fields;
    },

    getFormValidationOptions: function(fields) {
        //We start off with the rule name and alert options since they are common
        var validationOptions = {
            rules: {
                rulename: {
                    required: true
                },
                operator: {
                    required: true
                },
                alerttype: {
                    required: true
                },
                providers: {
                    required: true
                },
            },
            messages: {
                rulename: "Rule Name is required",
                operator: "Operator type is required.",
                alerttype: "Alert type is required",
                providers: "Provider is required"
            },
            errorPlacement: function(label, element) {
                label.addClass('validation-error');
                label.insertAfter(element);
            },
            wrapper: 'div'
        };

        for (var i=0; i< fields.length; i++) {
            if(fields[i].fieldName !== "operator") {
                validationOptions.rules[fields[i].fieldName] = fields[i].validationOptions.rules;
                validationOptions.messages[fields[i].fieldName] = fields[i].validationOptions.message;
            }
        }

        return validationOptions;
    },

    //Create an html field
    createFormFields: function (field, createFieldLabel, initialValue) {

        var fieldContainer = $('<div class="form-field-container"></div>');
        var jfield = {};

        if(!!createFieldLabel) {
            var label = $('<label class="form-field-label" for="' + field.fieldName + '">' + field.fieldLabel + '</label>');
            fieldContainer.append(label);
        }

        switch(field.fieldType) {
            case 'button':
                jfield =  $('<' + field.fieldTag + ' type="' + field.fieldType + 
                    '" name="' + field.fieldName + '" value="' + field.fieldLabel + '"/>');
                jfield.attr('class', field.fieldName + ' form-field ' + field.fieldTag);
                break;
            default:
                jfield = $('<' + field.fieldTag + ' type="' + field.fieldType + 
                    '" placeholder="' + field.fieldLabel + '" name="' + field.fieldName + '"/>');
                jfield.attr('class', field.fieldName + ' form-field ' + field.fieldTag)
                jfield.val(initialValue || "");
                break;
        };

        if(field.events && field.events.length > 0){
            for(var i=0; i<field.events.length; i++) {
                jfield.on(field.events[i].eventName, self[field.events[i].eventValue]);
            };
        }
        fieldContainer.append(jfield);
        return fieldContainer;
    },

    //Retrieve the displayable fields for the event source type
    getEventSpecificFields: function(event) {
        switch(event) {
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_DATA:
                return rbDataSourceImpl.getFieldsToRender();
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_DEVICE:
                return rbDeviceSourceImpl.getFieldsToRender();
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_MESSAGE:
                return rbMessageSourceImpl.getFieldsToRender();
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_USER:
                return rbUserSourceImpl.getFieldsToRender();
        }
    },

    //Retrieve the displayable fields for the alert type and provider
    getAlertFields: function(alertValue, provider) {
        var fields = [];

        //setTheProviderImpl so that the correct fields are rendered
        switch(alertValue) {
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_EMAIL:
                rbEmailAlertImpl.setProvider(provider);
                return fields.concat(rbEmailAlertImpl.getFieldsToRender());
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SMS:
                rbSmsAlertImpl.setProvider(provider);
                return fields.concat(rbSmsAlertImpl.getFieldsToRender());
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE:
                return fields.concat(rbServiceAlertImpl.getFieldsToRender());
            default:
                return fields;
        }
    },

    createTrigger: function(URI, system_key, triggerName, serviceName, serviceSettings) {
        var deferred = $.Deferred();

        ruleBuilderTrigger.getInstance(serviceSettings).createTrigger(URI, system_key, 
            triggerName, serviceName, serviceSettings).then(function() {

            deferred.resolve();
        }, function(err) {
            console.log("RuleBuilderUtils.createTrigger - Failed to create trigger: ", err.msg);
            deferred.reject(err.msg);
        });

        return deferred.promise();
    },

    deleteTrigger: function(URI, system_key, triggerName, serviceSettings) {
        var deferred = $.Deferred();

        ruleBuilderTrigger.getInstance(serviceSettings).deleteTrigger(URI, system_key, 
            triggerName, serviceSettings).then(function() {

            deferred.resolve();
        }, function(err) {
            if(!err.code === 500) {
                console.log("RuleBuilderUtils.deleteTrigger - Failed to delete trigger: ", err.msg);
                deferred.reject(err.msg);
            } else {
                deferred.resolve();
            }
        });
        return deferred.promise();
    }
}

var rbEmailAlertImpl = (function() {
	// Private variables
    var TEMPLATE_FILENAME = "message/emailService.txt";
    var SERVICE_DEPENDENCIES = "http";
    var template = "";
    var providerImpl = {};

    var fieldsToRender = [
        {
            fieldName: "emailFrom", 
            fieldLabel: "From E-mail",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true,
                    email: true
                },
                message: {
                    required: "Sender's email is required.",
                    email: "Please enter a valid email address"
                }
            }
        }, {
            fieldName: "emailTo", 
            fieldLabel: "To E-mail",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true,
                    email: true
                },
                message: {
                    required: "Recipient's email is required.",
                    email: "Please enter a valid email address"
                }
            }
        }, {
            fieldName: "emailSubject", 
            fieldLabel: "Subject",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: "The Email subject is required."
            }
        }, {
            fieldName: "emailBody", 
            fieldLabel: "Message",
            fieldTag: "textarea", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: "The Email body is required."
            }
        }
    ];

    var providers = [
        {
            providerName: "sendGrid", 
            providerLabel: "SendGrid",
        }
    ];

    function _retrieveTemplate() {
        var def = $.Deferred();
        if(template !== "") {
            def.resolve(template);
        } else {
            $.get("templates/" + TEMPLATE_FILENAME)
            .done(function(data) {
                template = data;
                def.resolve(data);
            }).fail(function(error) {
                def.reject(error);
            });
        }

        return def.promise();
    }

    function _getTemplate(ruleSettings) {
        //Get the provider specific template
        //Replace the common email tags in the template
        var tokens = _getTokens(ruleSettings);
        
        if(providerImpl.getTemplate) {
            tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.PROVIDER] = 
                rbTokenReplacer.replaceTokens(tokens, providerImpl.getTemplate(ruleSettings));
        }

        return rbTokenReplacer.replaceTokens(tokens, template);
    }

    function _getProviders() { 
        return providers;
    }

    function _setProviderImpl(provider) { 
        switch (provider) {
            case "sendGrid":
                providerImpl = rbSendGridEmailImpl;
                break;
            default:
                providerImpl = {};
        }
    }

    function _getTokens(ruleSettings) {
        var tokens = {};
        
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.EMAIL_SUBJ] = rbTokenReplacer.parseToken(ruleSettings.alert.options.emailSubject);
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.EMAIL_BODY] = rbTokenReplacer.parseToken(ruleSettings.alert.options.emailBody);
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.EMAIL_TO] = _createRecipientArray(ruleSettings.alert.options.emailTo);
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.EMAIL_FROM] = ruleSettings.alert.options.emailFrom;   

        return tokens;         
    }

    function _getFieldsToRender() {
        if(providerImpl.getFieldsToRender) {
            return providerImpl.getFieldsToRender().concat(fieldsToRender);
        } else {
            return fieldsToRender;
        }
    }
    
    function _createRecipientArray (recipients) {
        var theArray = recipients.split(/[;,]+/);
        
        //Trim leading and trailing spaces from each array element
        for (var i = 0; i < theArray.length; i++) {
            theArray[i] = theArray[i].trim();
        }

        return JSON.stringify(theArray);
    }

    function _getServiceDependencies () {
        return SERVICE_DEPENDENCIES;
    }

    _retrieveTemplate();

	return {
        getTemplate: _getTemplate,
        getTokens: _getTokens,
        getFieldsToRender: _getFieldsToRender,
        setProvider: _setProviderImpl,
        getProviders: _getProviders,
        getServiceDependencies: _getServiceDependencies
    };
})();

var rbServiceAlertImpl = (function() {
	// Private variables
    var TEMPLATE_FILENAME = "message/serviceService.txt";
    var SERVICE_DEPENDENCIES = "clearblade, log";
    var template = "";
    var providerImpl = {};

    var fieldsToRender = [
        {
            fieldName: "serviceName", 
            fieldLabel: "Service Name",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Service name is required."
                }
            }
        }, {
            fieldName: "addServiceParm", 
            fieldLabel: "Add Parameter",
            fieldTag: "input", 
            fieldType: "button",
            events: [
            ],
            validationOptions: {
                rules: {},
                message: {}
            }
        }
    ];

    var providers = [];

    function _retrieveTemplate() {
        var def = $.Deferred();
        if(template !== "") {
            def.resolve(template);
        } else {
            $.get("templates/" + TEMPLATE_FILENAME)
            .done(function(data) {
                template = data;
                def.resolve(data);
            }).fail(function(error) {
                def.reject(error);
            });
        }

        return def.promise();
    }

    function _getTemplate(ruleSettings) {
        //Replace the tags in the template
        var tokens = _getTokens(ruleSettings);

        return rbTokenReplacer.replaceTokens(tokens, template);
    }

    function _getProviders() { 
        return providers;
    }

    function _setProviderImpl(provider) { 
        providerImpl = {};
    }

    function _getTokens(ruleSettings) {
        var tokens = {};
        var params = {};

        //Service parameters are comprised of 2 options in the settings object
        //We need to group the param name and param value options together.
        //Since we aren't guaranteed to order of the options in the object, we need to
        //make sure the param name is correctly matched to its value

        //Get all the keys that begin with parmName
        var paramNames = Object.keys(ruleSettings.alert.options).filter(function( key ){
            return key.indexOf("parmName") > -1;
        })
        
        //For each paramName, get its associated value 
        for(var i=0; i< paramNames.length; i+=1){
            params[ruleSettings.alert.options[paramNames[i]]] = 
                ruleSettings.alert.options["parmValue_" + paramNames[i].split("_")[1]];
        }

        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.SVC_SERVICE] = ruleSettings.alert.options.serviceName;
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.SVC_PARAMS] = JSON.stringify(params);

        return tokens;         
    }

    function _getFieldsToRender() {
        if(providerImpl.getFieldsToRender) {
            return providerImpl.getFieldsToRender().concat(fieldsToRender);
        } else {
            return fieldsToRender;
        }
    }

    function _getServiceDependencies () {
        return SERVICE_DEPENDENCIES;
    }

    _retrieveTemplate();

	return {
        getTemplate: _getTemplate,
        getTokens: _getTokens,
        getFieldsToRender: _getFieldsToRender,
        setProvider: _setProviderImpl,
        getProviders: _getProviders,
        getServiceDependencies: _getServiceDependencies
    };
})();

var rbSmsAlertImpl = (function () {
    // Private variables
    var TEMPLATE_FILENAME = "message/smsService.txt";
    var SERVICE_DEPENDENCIES = "http";
    var template = "";
    var providerImpl = {};

    var fieldsToRender = [
        {
            fieldName: "smsFrom", 
            fieldLabel: "From Phone #",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true,
                    phoneList: true
                },
                message: {
                    required: "The SMS (From) phone number is required.",
                    phoneList: "Please enter a valid SMS (From) mobile phone number"
                }
            }
        }, {
            fieldName: "smsTo", 
            fieldLabel: "To Phone #",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true,
                    phoneList: true
                },
                message: {
                    required: "Mobile number is required.",
                    phoneList: "Please enter a valid list of mobile phone numbers"
                }
            }
        }, {
            fieldName: "smsBody", 
            fieldLabel: "Message",
            fieldTag: "textarea", 
            fieldType: "text",
            events: [],
            validationOptions: {
                 rules: {
                    required: true
                },
                message: {
                    required: "Message is required."
                }
            }
        }
    ];

    var providers = [
        {
            providerName: "twilio", 
            providerLabel: "Twilio",
        }
    ];

    function _retrieveTemplate() {
        var def = $.Deferred();
        if(template !== "") {
            def.resolve(template);
        } else {
            $.get("templates/" + TEMPLATE_FILENAME)
            .done(function(data) {
                template = data;
                def.resolve(data);
            }).fail(function(error) {
                def.reject(error);
            });
        }

        return def.promise();
    }

    function _getTemplate(ruleSettings) {
        //Get the provider specific template
        //Replace the common email tags in the template
        var tokens = _getTokens(ruleSettings);
        
        if(providerImpl.getTemplate) {
            tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.PROVIDER] = 
            rbTokenReplacer.replaceTokens(tokens, providerImpl.getTemplate(ruleSettings));
        }
        return rbTokenReplacer.replaceTokens(tokens, template);
    }

    function _getProviders() { 
        return providers;
    }

    function _setProviderImpl(provider) { 
        switch (provider) {
            case "twilio":
                providerImpl = rbTwilioSmsImpl;
                break;
            default:
                providerImpl = {};
        }
    }

    function _getTokens(ruleSettings) {
        var tokens = {};
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.SMS_MSG] = rbTokenReplacer.parseToken(ruleSettings.alert.options.smsBody);
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.SMS_TO] = _createRecipientArray(ruleSettings.alert.options.smsTo);
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.SMS_FROM] = ruleSettings.alert.options.smsFrom;

        return tokens;         
    }

    function _getFieldsToRender() {
        if(providerImpl.getFieldsToRender) {
            return providerImpl.getFieldsToRender().concat(fieldsToRender);
        } else {
            return fieldsToRender;
        }
    }
    
    function _createRecipientArray (recipients) {
        var theArray = recipients.split(/[;,]+/);
        
        //Trim leading and trailing spaces from each array element
        for (var i = 0; i < theArray.length; i++) {
            theArray[i] = theArray[i].trim();
        }

        return JSON.stringify(theArray);
    }

    function _getServiceDependencies () {
        return SERVICE_DEPENDENCIES;
    }

    _retrieveTemplate();

    return {
        getTemplate: _getTemplate,
        getTokens: _getTokens,
        getFieldsToRender: _getFieldsToRender,
        setProvider: _setProviderImpl,
        getProviders: _getProviders,
        getServiceDependencies: _getServiceDependencies
    };
})();

var rbDataSourceImpl = (function () {
    var alertImpl;

    var fieldsToRender = [
        {
            fieldName: "variable", 
            fieldLabel: "Variable",
            fieldTag: "input",
            fieldType: "text",
            isConditionField: true,
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Variable name is required."
                }
            }
        }, {
            fieldName: "operator"
        }, {
            fieldName: "value", 
            fieldLabel: "value",
            fieldTag: "input",
            fieldType: "text",
            isConditionField: true,
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Variable value is required."
                }
            }
        }
    ];

    function _getTemplate(serviceName, ruleSettings) {
        //Get the template specific to the alert type
        //Replace the common message tags in the template
        return rbTokenReplacer.replaceTokens(_getTokens(serviceName, ruleSettings), alertImpl.getTemplate(ruleSettings));
    }

    function _getTokens(serviceName, ruleSettings) {
        var tokens = {};
        return tokens;  
    }

    function _setAlertImpl(alertType) { 
        switch (alertType) {
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_EMAIL:
                alertImpl = rbEmailAlertImpl;
                break;
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SMS:
                alertImpl = rbSmsAlertImpl;
                break;
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE:
                alertImpl = rbServiceAlertImpl;
                break;
        }
    }

    function _getAlertImpl() { 
        return alertImpl;
    }

    function _getFieldsToRender() {
        return fieldsToRender;
    }

    function _getServiceDependencies() {
        return alertImpl.getServiceDependencies();
    }

    return {
        getAlert: _getAlertImpl,
        setAlert: _setAlertImpl,
        getServiceTemplate: _getTemplate,
        getServiceTokens: _getTokens,
        getFieldsToRender: _getFieldsToRender,
        getServiceDependencies: _getServiceDependencies
    };
})();

var rbDataTriggerImpl = (function () {
    // Private variables
    var eventSrcImpl;
        
    function _getSystemModule() {
        return RULE_BUILDER_CONSTANTS.TRIGGERS.MODULES.DATA.MODULE_NAME;
    }

    /*  *
        * This method should return the action associated with the trigger.
        * Publish is the only action currently supported for messaging.
    */
    function _getTriggerAction() {
        return RULE_BUILDER_CONSTANTS.TRIGGERS.MODULES.DATA.ACTIONS.COLLECTION.CREATED;
    }

    /*  *
        * This method should return the key-value pairs needed for the api call
        *
    */
    function _getTriggerActionData(ruleSettings) {
        return {};
    }

    // Singleton
    var publicApi = {
        getSystemModule: _getSystemModule,
        getTriggerAction: _getTriggerAction,
        getTriggerActionData: _getTriggerActionData
    };

    // Public methods and variables should be placed within the returned object
    return publicApi;
})();

var rbDeviceSourceImpl = (function () {
    var alertImpl;

    var fieldsToRender = [
        {
            fieldName: "variable", 
            fieldLabel: "Variable",
            fieldTag: "input",
            fieldType: "text",
            isConditionField: true,
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Variable name is required."
                }
            }
        }, {
            fieldName: "operator"
        }, {
            fieldName: "value", 
            fieldLabel: "value",
            fieldTag: "input",
            fieldType: "text",
            isConditionField: true,
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Variable value is required."
                }
            }
        }
    ];

    function _getTemplate(serviceName, ruleSettings) {
        //Get the template specific to the alert type
        //Replace the common message tags in the template
        return rbTokenReplacer.replaceTokens(_getTokens(serviceName, ruleSettings), alertImpl.getTemplate(ruleSettings));
    }

    function _getTokens(serviceName, ruleSettings) {
        var tokens = {};
        return tokens;  
    }

    function _setAlertImpl(alertType) { 
        switch (alertType) {
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_EMAIL:
                alertImpl = rbEmailAlertImpl;
                break;
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SMS:
                alertImpl = rbSmsAlertImpl;
                break;
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE:
                alertImpl = rbServiceAlertImpl;
                break;
        }
    }

    function _getAlertImpl() { 
        return alertImpl;
    }

    function _getFieldsToRender() {
        return fieldsToRender;
    }

    function _getServiceDependencies() {
        return alertImpl.getServiceDependencies();
    }

    return {
        getAlert: _getAlertImpl,
        setAlert: _setAlertImpl,
        getServiceTemplate: _getTemplate,
        getServiceTokens: _getTokens,
        getFieldsToRender: _getFieldsToRender,
        getServiceDependencies: _getServiceDependencies
    };
})();

var rbDeviceTriggerImpl = (function () {
    // Private variables
    var eventSrcImpl;
        
    function _getSystemModule() {
        return RULE_BUILDER_CONSTANTS.TRIGGERS.MODULES.DEVICE.MODULE_NAME;
    }

    /*  *
        * This method should return the action associated with the trigger.
        * Publish is the only action currently supported for messaging.
    */
    function _getTriggerAction() {
        return RULE_BUILDER_CONSTANTS.TRIGGERS.MODULES.DEVICE.ACTIONS.CREATED;
    }

    /*  *
        * This method should return the key-value pairs needed for the api call
        *
    */
    function _getTriggerActionData(ruleSettings) {
        return {};
    }

    // Singleton
    var publicApi = {
        getSystemModule: _getSystemModule,
        getTriggerAction: _getTriggerAction,
        getTriggerActionData: _getTriggerActionData
    };

    // Public methods and variables should be placed within the returned object
    return publicApi;
})();

var rbMessageSourceImpl = (function () {
    var alertImpl;

    var fieldsToRender = [
        {
            fieldName: "topic", 
            fieldLabel: "Topic",
            fieldTag: "input", 
            fieldType: "text",
            isConditionField: false,
            events: [
                {eventName: "onfocus", eventValue: "this.placeholder=\'\'"},
                {eventName: "onblur", eventValue: "this.placeholder=\'Topic (Required)\'"}
            ],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Topic name is required."
                }
            }
        }, {
            fieldName: "variable", 
            fieldLabel: "Variable",
            fieldTag: "input", 
            fieldType: "text",
            isConditionField: true,
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Variable name is required."
                }
            }

        }, {
            fieldName: "operator"
        }, {
            fieldName: "value", 
            fieldLabel: "value",
            fieldTag: "input", 
            fieldType: "text",
            isConditionField: true,
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Variable value is required."
                }
            }
        }
    ];

    function _getTemplate(serviceName, ruleSettings) {

        //Get the template specific to the alert type
        //Replace the common message tags in the template
        return rbTokenReplacer.replaceTokens(_getTokens(serviceName, ruleSettings), alertImpl.getTemplate(ruleSettings));
    }

    function _getTokens(serviceName, ruleSettings) {
        var tokens = {};
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.SVC_NAME] = serviceName;

        //Construct the textual description of the conditions
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.CONDITION_TEXT] = "";
        for(var i=0; i<ruleSettings.event.conditions.length; i++) {
            if(ruleSettings.event.conditions[i].logical) {
                tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.CONDITION_TEXT] += 
                    " " + ruleSettings.event.conditions[i].logical + " ";
            }
            tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.CONDITION_TEXT] += ruleSettings.event.conditions[i].variable + " " +
                ruleSettings.event.conditions[i].operator + " " + ruleSettings.event.conditions[i].value;
        }

        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.CONDITION] = 
			conditionBuilder.getInstance().createCondition(ruleSettings.event.conditions);
        tokens[RULE_BUILDER_CONSTANTS.SERVICE_TOKENS.MSG_TOPIC] = ruleSettings.event.options.topic;  

        return tokens;  
    }

    function _setAlertImpl(alertType) { 
        switch (alertType) {
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_EMAIL:
                alertImpl = rbEmailAlertImpl;
                break;
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SMS:
                alertImpl = rbSmsAlertImpl;
                break;
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE:
                alertImpl = rbServiceAlertImpl;
                break;
            default:
                alertImpl = {};
        }
    }

    function _getAlertImpl() { 
        return alertImpl;
    }

    function _getFieldsToRender() {
        return fieldsToRender;
    }

    function _getServiceDependencies() {
        return alertImpl.getServiceDependencies();
    }

    return {
        getAlert: _getAlertImpl,
        setAlert: _setAlertImpl,
        getServiceTemplate: _getTemplate,
        getServiceTokens: _getTokens,
        getFieldsToRender: _getFieldsToRender,
        getServiceDependencies: _getServiceDependencies
    };
})();

var rbMessageTriggerImpl = (function () {
    // Private variables
    var eventSrcImpl;
        
    function _getSystemModule() {
        return RULE_BUILDER_CONSTANTS.TRIGGERS.MODULES.MESSAGE.MODULE_NAME;
    }

    /*  *
        * This method should return the action associated with the trigger.
        * Publish is the only action currently supported for messaging.
    */
    function _getTriggerAction() {
        return RULE_BUILDER_CONSTANTS.TRIGGERS.MODULES.MESSAGE.ACTIONS.PUBLISH;
    }

    /*  *
        * This method should return the key-value pairs needed for the api call
        *
    */
    function _getTriggerActionData(ruleSettings) {
        return { "topic": ruleSettings.event.options.topic };
    }

    // Singleton
    var publicApi = {
        getSystemModule: _getSystemModule,
        getTriggerAction: _getTriggerAction,
        getTriggerActionData: _getTriggerActionData
    };

    // Public methods and variables should be placed within the returned object
    return publicApi;
})();

var rbSendGridEmailImpl = (function() {
	// Private variables
    var API_KEY_TOKEN = "SENDGRID_APIKEY";
    var TEMPLATE_FILENAME = "providers/email/sendgrid.txt";
    var template = "";

    var fieldsToRender = [
        {
            fieldName: "sendGridApiKey", 
            fieldLabel: "Key",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "sendGrid key is required."
                }
            }
        }
    ];

    function _retrieveTemplate() {
        var def = $.Deferred();
        if(template !== "") {
            def.resolve(template);
        } else {
            $.get("templates/" + TEMPLATE_FILENAME)
            .done(function(data) {
                template = data;
                def.resolve(data);
            }).fail(function(error) {
                def.reject(error);
            });
        }

        return def.promise();
    }

    function _getTemplate(ruleSettings) {
        //Replace the provider specific tags in the template
        return rbTokenReplacer.replaceTokens(_getTokens(ruleSettings), template);
    }

    function _getTokens(ruleSettings) {
        var tokens = {};
        tokens[API_KEY_TOKEN] = ruleSettings.alert.options.sendGridApiKey;  

        return tokens;         
    }

    function _getFieldsToRender() {
        return fieldsToRender;
    }
    
    _retrieveTemplate();

	return {
        getTemplate: _getTemplate,
        getFieldsToRender: _getFieldsToRender
    };
})();

var rbTwilioSmsImpl = (function() {
	// Private variables
    var API_KEY_TOKEN = "TWILIO_APIKEY";
    var API_SECRET_TOKEN = "TWILIO_APISECRET";
    var TEMPLATE_FILENAME = "providers/sms/twilio.txt";
    var template = "";

    var fieldsToRender = [
        {
            fieldName: "twilioApiKey", 
            fieldLabel: "Key",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Twilio API key is required."
                }
            }
        }, {
            fieldName: "twilioApiSecret", 
            fieldLabel: "Secret",
            fieldTag: "input", 
            fieldType: "text",
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Twilio API secret is required."
                }
            }
        }, 
    ];

    function _retrieveTemplate() {
        var def = $.Deferred();
        if(template !== "") {
            def.resolve(template);
        } else {
            $.get("templates/" + TEMPLATE_FILENAME)
            .done(function(data) {
                template = data;
                def.resolve(data);
            }).fail(function(error) {
                def.reject(error);
            });
        }

        return def.promise();
    }

    function _getTemplate(ruleSettings) {
        //Replace the provider specific tags in the template
        return rbTokenReplacer.replaceTokens(_getTokens(ruleSettings), template);
    }

    function _getTokens(ruleSettings) {
        var tokens = {};
        tokens[API_KEY_TOKEN] = ruleSettings.alert.options.twilioApiKey;
        tokens[API_SECRET_TOKEN] = ruleSettings.alert.options.twilioApiSecret; 

        return tokens;         
    }

    function _getFieldsToRender() {
        return fieldsToRender;
    }
    
    _retrieveTemplate();

	return {
        getTemplate: _getTemplate,
        getFieldsToRender: _getFieldsToRender
    };
})();

var rbUserSourceImpl = (function () {
    var alertImpl;

    var fieldsToRender = [
        {
            fieldName: "variable", 
            fieldLabel: "Variable",
            fieldTag: "input",
            fieldType: "text",
            isConditionField: true,
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Variable name is required."
                }
            }
        }, {
            fieldName: "operator"
        }, {
            fieldName: "value", 
            fieldLabel: "value",
            fieldTag: "input",
            fieldType: "text",
            isConditionField: true,
            events: [],
            validationOptions: {
                rules: {
                    required: true
                },
                message: {
                    required: "Variable value is required."
                }
            }
        }
    ];

    function _getTemplate(serviceName, ruleSettings) {
        //Get the template specific to the alert type
        //Replace the common message tags in the template
        return rbTokenReplacer.replaceTokens(_getTokens(serviceName, ruleSettings), alertImpl.getTemplate(ruleSettings));
    }

    function _getTokens(serviceName, ruleSettings) {
        var tokens = {};
        return tokens;  
    }

    function _setAlertImpl(alertType) { 
        switch (alertType) {
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_EMAIL:
                alertImpl = rbEmailAlertImpl;
                break;
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SMS:
                alertImpl = rbSmsAlertImpl;
                break;
            case RULE_BUILDER_CONSTANTS.ALERT_TYPES.ALERT_SERVICE:
                alertImpl = rbServiceAlertImpl;
                break;
        }
    }

    function _getAlertImpl() { 
        return alertImpl;
    }

    function _getFieldsToRender() {
        return fieldsToRender;
    }

    function _getServiceDependencies() {
        return alertImpl.getServiceDependencies();
    }

    return {
        getAlert: _getAlertImpl,
        setAlert: _setAlertImpl,
        getServiceTemplate: _getTemplate,
        getServiceTokens: _getTokens,
        getFieldsToRender: _getFieldsToRender,
        getServiceDependencies: _getServiceDependencies
    };
})();

var rbUserTriggerImpl = (function () {
    // Private variables
    var eventSrcImpl;
        
    function _getSystemModule() {
        return RULE_BUILDER_CONSTANTS.TRIGGERS.MODULES.USER.MODULE_NAME;
    }

    /*  *
        * This method should return the action associated with the trigger.
        * Publish is the only action currently supported for messaging.
    */
    function _getTriggerAction() {
        return RULE_BUILDER_CONSTANTS.TRIGGERS.MODULES.USER.ACTIONS.CREATED;
    }

    /*  *
        * This method should return the key-value pairs needed for the api call
        *
    */
    function _getTriggerActionData(ruleSettings) {
        return {};
    }

    // Singleton
    var publicApi = {
        getSystemModule: _getSystemModule,
        getTriggerAction: _getTriggerAction,
        getTriggerActionData: _getTriggerActionData
    };

    // Public methods and variables should be placed within the returned object
    return publicApi;
})();

var conditionBuilder = (function () {
    // Instance stores a reference to the Singleton
    var instance;

    function init() {
        // Singleton

        function createCondition (conditions) {

            var condition = "";

            for (var i=0; i< conditions.length; i++) {

                if(conditions[i].logical && conditions[i].logical !== "") {
                    switch (conditions[i].logical) {
                    case RULE_BUILDER_CONSTANTS.LOGICAL_OPERATORS.AND:
                        condition += " && ";
                        break;
                    case RULE_BUILDER_CONSTANTS.LOGICAL_OPERATORS.OR:
                        condition += " || ";
                        break;
                    default:
                        console.error("Logical operator not supported: " + conditions[i].operator);
                        break;
                    }

                }

                condition += "messageObject." + conditions[i].variable + " " + 
                    RULE_BUILDER_CONSTANTS.OPERATORS.SYMBOLS[conditions[i].operator] + " " + 
                    JSON.stringify(conditions[i].value);
            }
            return condition;
        }

        var publicApi = {
            createCondition: createCondition
        };

        // Public methods and variables should be placed within the returned object
        return publicApi;
    };

    return {
        // Get the Singleton instance if one exists
        // or create one if it doesn't
        getInstance: function () {
            if ( !instance ) {
                instance = init();
            }
            return instance;
        }
    }
})();
var RULE_BUILDER_CONSTANTS = {
    CUSTOM_DOM_EVENTS: {
        CREATE_RULE: "ruleBuilder:createRule",
        MODIFY_RULE: "ruleBuilder:modifyRule",
        DELETE_RULE: "ruleBuilder:deleteRule",
        SAVE_RULE: "ruleBuilder:saveRule",
        ENABLE_RULE: "ruleBuilder:enableRule",
        DISABLE_RULE: "ruleBuilder:disableRule",
        OPEN_DIALOG: "ruleBuilder:openDialog",
        CLOSE_DIALOG: "ruleBuilder:closeDialog",
        RESIZE_DIALOG: "ruleBuilder:resizeDialog",
        SAVE_EVENT: "ruleBuilder:saveEvent",
        SAVE_ALERT: "ruleBuilder:saveAlert",
        EDIT_RULE: "ruleBuilder:editRule",
        RULENAME_UPDATED: "ruleBuilder:ruleNameUpdated"
    },
    LOGICAL_OPERATORS: {
        AND: "AND",
        OR: "OR"
    },
    OPERATORS: {
        GREATER_THAN: "greater than",
        LESS_THAN: "less than",
        GREATER_THAN_EQUAL_TO: "greater than or equal to",
        LESS_THAN_EQUAL_TO: "less than or equal to",
        EQUAL_TO: "equal to",
        NOT_EQUAL_TO: "not equal to",
        SYMBOLS: {
            GREATER_THAN: ">",
            LESS_THAN: "<",
            GREATER_THAN_EQUAL_TO: ">=",
            LESS_THAN_EQUAL_TO: "<=",
            EQUAL_TO: "==",
            NOT_EQUAL_TO: "!=",
        }
    },
    EVENT_SOURCES: {
        EVENT_DATA: "data",
        EVENT_DEVICE: "device",
        EVENT_MESSAGE: "message",
        EVENT_USER: "user",
    },
    ALERT_TYPES:{
        ALERT_SMS: "sms",
        ALERT_EMAIL: "email",
        ALERT_SERVICE: "service"
    },
    PROVIDERS: {
        EMAIL: {
            SENDGRID: "sendGrid"
        },
        SMS: {
            TWILIO: "twilio"
        }
    },
    SERVICE_TOKENS: {
        SVC_NAME: "SERVICE_NAME",
        VARNAME: "VARIABLE_NAME",
        VARVALUE: "VARIABLE_VALUE",
        OPERATOR: "OPERATOR_TEXT",
        CONDITION: "CONDITION_TO_CHECK",
        CONDITION_TEXT: "CONDITION_TEXT",
        MSG_TOPIC: "MESSAGE_TOPIC",
        SMS_MSG: "SMS_MESSAGE",
        SMS_TO: "SMS_TO",
        SMS_FROM: "SMS_FROM",
        EMAIL_SUBJ: "EMAIL_SUBJECT",
        EMAIL_BODY: "EMAIL_BODY",
        EMAIL_TO: "EMAIL_TO",
        EMAIL_FROM: "EMAIL_FROM",
        PROVIDER: "PROVIDER_IMPL",
        SVC_SERVICE: "SERVICE_TO_INVOKE",
        SVC_PARAMS: "SERVICE_PARAMS"
    },
    TRIGGERS: {
        MODULES: {
            DEVICE: {
                MODULE_NAME: "Device",
                ACTIONS: {
                    CREATED: "DeviceCreated",
                    UPDATED: "DeviceUpdated",
                    DELETED: "DeviceDeleted"
                }
            },
            DATA: {
                MODULE_NAME: "Data",
                ACTIONS: {
                    COLLECTION: {
                        CREATED: "CollectionCreated",
                        UPDATED: "CollectionUpdated",
                        DELETED: "CollectionDeleted"
                    },
                    ITEM: {
                        CREATED: "ItemCreated",
                        UPDATED: "ItemUpdated",
                        DELETED: "ItemDeleted"
                    },
                }
            },
            MESSAGE: {
                MODULE_NAME: "Messaging",
                ACTIONS: {
                    PUBLISH: "Publish",
                    SUBSCRIBE: "Subscribe",
                    UNSUBSCRIBE: "Unsubscribe"
                }
            },
            USER: {
                MODULE_NAME: "User",
                ACTIONS: {
                    CREATED: "UserCreated",
                    UPDATED: "UserUpdated",
                    DELETED: "UserDeleted"
                }
            }
        }
    }
}
freeboard.loadWidgetPlugin({

    "type_name": "clearblade_RuleBuilder",
    "display_name": "RuleBuilder",
    "description": "Rule Builder Widget, which will allow users to create simple conditional statements, which will trigger other services such as SMS, Email etc.",
    "external_scripts": [
        "https://ajax.aspnetcdn.com/ajax/jquery.validate/1.15.0/jquery.validate.min.js"
    ],
    "fill_size": false,
    "settings": [{
        name: "widgetName",
        display_name: "Name",
        type: "text",
        required: true
    }, {
        name: "allowCreate",
        display_name: "Allow Create",
        type: "boolean",
        required: false
    }, {
        name: "allowDelete",
        display_name: "Allow Delete",
        type: "boolean",
        required: false
    }, {
        name: "allowEdit",
        display_name: "Allow Edit",
        type: "boolean",
        required: false
        
    }, {
        name: "allowOnOff",
        display_name: "Allow On/Off",
        type: "boolean",
        required: false
    }, {
        "name": "blockHeight",
        "display_name": "Block Height",
        "type": "number",
        default_value: 3,
    }, {
        name: "container_width",
        display_name: "Container width",
        type: "integer",
        description: "Width of your widget's container as a percentage. Useful when juxtaposing widgets.",
        default_value: "100",
        required: true
    }],

    newInstance: function(settings, newInstanceCallback) {
        newInstanceCallback(new RuleBuilderWidgetPlugin(settings));
    }
});

var RuleBuilderWidgetPlugin = function(settings) {
    var self = this;
    var URI = platformConfig.url;
    var currentSettings = settings;

    var system_key;
    var containerElement;

    //replace spaces with dashes so we can retrieve by id or class later
    if (currentSettings.widgetName === undefined) {
        currentSettings.widgetId = "";
    } else {
        currentSettings.widgetId = currentSettings.widgetName.replace(/\s+/g, '_');
    }

    self._getParameterByName = function(name, url) {
        var paramValue = ""

        if (!url) {
            //Default the url if it was not specified
            url = window.location.href;  
        }  
        name = name.replace(/[\[\]]/g, "\\$&");

        //Create a regular expression to match the query param
        var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)");
        var results = regex.exec(url);
        
        if (!!results && !!results[2]){
            //Decrypt the system key
            if(name === "systemKey") {
                paramValue = (CryptoJS.AES.decrypt(decodeURIComponent(results[2]), "ClearBladeDashboards2016")).toString(CryptoJS.enc.Utf8);
            } else {
                paramValue = results[2];
            }
        }
        return paramValue;
    }
    system_key = self._getParameterByName('systemKey');

    self._saveDashboard = function() { 
        saveDashboard(function(data, status) {
            //Whenever the dashboard is saved, we need to re-render the rules list
            self.renderContent();
        });
    }

    /* 
     * Required public function. Called when freeboard wants to render the widget.
     */
    self.render = function(containerElement) {
        self.addCustomValidators();

        self.containerElement = containerElement;

        var displayElement = $('<div class="tw-display rbwidget"></div>')
            .attr('id', currentSettings.widgetId);
        
        if(!currentSettings.rules) {
            currentSettings.rules = [];
        }

        $(containerElement).append(displayElement);
        self.bindEvents();
        self.renderContent();
    }

    self.addCustomValidators = function() {
        //Add a custom e-mail validator to the jquery form validator so that we can support multiple
        //recipients
        $.validator.methods.email = function(value, element) {
            var regex = /([a-zA-Z0-9_\-\.]+@[a-zA-Z0-9_\-\.]+\.[a-zA-Z]{2,5}[;,]?)+/g;
            return this.optional(element) || regex.test(value);
        };

        //Add a custom validator for the phone number list
        $.validator.addMethod("phoneList", function(value, element) {
            return this.optional(element) || /^(?:(?:\s*(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})(?:\s*[;,]\s*)?)+$/.test(value);
        }, "Invalid phone number(s) specified");
    }

    self.renderContent = function() {
        //Create a new instance of RbRuleList and attach it to the container element
        var ruleList = new RbRuleList({
            widgetId: currentSettings.widgetId,
            widgetName: currentSettings.widgetName,
            allowCreate: currentSettings.allowCreate,
            allowDelete: currentSettings.allowDelete,
            allowEdit: currentSettings.allowEdit,
            allowOnOff: currentSettings.allowOnOff,
            rules: currentSettings.rules
        });
        
        var widget = $('#' + currentSettings.widgetId);

        //Set the height of the fieldset to the number of blocks minus the widget top and bottom padding
        var fieldSetHeight = utils.widget.blocksToPixels(currentSettings.blockHeight) - 
            parseInt(widget.css("padding-top")) - parseInt(widget.css("padding-bottom"));

        $(ruleList.children()[0]).height(fieldSetHeight + 'px');
        var availableHeight = fieldSetHeight - (utils.widget.blockSize * .75);

        ruleList.find('.rbRuleListScroll').height(availableHeight + 'px');
        widget.empty().append(ruleList);
    }

    self.bindEvents = function() {
        var rbWidget = $(this.containerElement).find(".rbwidget");
        rbWidget.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.CREATE_RULE, rbWidget.attr("id")), $.proxy(self._onCreateRule, self));
        rbWidget.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.MODIFY_RULE, rbWidget.attr("id")), $.proxy(self._onModifyRule, self));
        rbWidget.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.DELETE_RULE, rbWidget.attr("id")), $.proxy(self._onDeleteRule, self));
        rbWidget.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.ENABLE_RULE, rbWidget.attr("id")), $.proxy(self._onRuleEnabled, self));
        rbWidget.on(RuleBuilderUtils.createEventName(RULE_BUILDER_CONSTANTS.CUSTOM_DOM_EVENTS.DISABLE_RULE, rbWidget.attr("id")), $.proxy(self._onRuleDisabled, self));
    }

    /*
     * Create the back-end service and trigger.
     * Save the rule settings so that they are rendered the next time the dashboard is displayed.
     */
    self._onCreateRule = function(event, data){
        $.when(self._saveRule(data.rule, data.ruleIndex)).then(function() {
            //Save the rule to the current settings
            data.rule.enabled = true;
            currentSettings.rules.push(data.rule);
            self._saveDashboard();
        });
    }

    /*
     * Modify the back-end service and trigger.
     * Save the rule settings so that they are rendered the next time the dashboard is displayed.
     */
    self._onModifyRule = function(event, data) {
        //Compare the existing rule against the modified rule to find alerts
        //that have been deleted. We need to process deletes first so that
        //the alerts array in the currentSettings rule is up to date prior to
        //processing modified rules
        var deletedRules = [];
        for(var j=currentSettings.rules[data.ruleIndex].alerts.length; j>0; j--) {
            if(self._findAlert(currentSettings.rules[data.ruleIndex].alerts[j-1], data.rule) === -1) {
                //Delete the alert
                deletedRules.push(self._deleteSingleAlert(currentSettings.rules[data.ruleIndex], j-1));
            }
        }

        $.when.apply(undefined, deletedRules).then(function(){
            //Invoke the back-end logic to update modified rules
            $.when(self._saveRule(data.rule, data.ruleIndex)).then(function() {
                //Update the rule contents in the current settings
                currentSettings.rules[data.ruleIndex] = data.rule;
                self._saveDashboard();
            });
        });
    }

    /*
     * Delete the back-end service and trigger.
     * Save the rule settings so that the rule is not rendered the next time the dashboard is displayed.
     */
    self._onDeleteRule = function(event, data){
        $.when(self._deleteRule(data.rule)).then(function() {
            currentSettings.rules.splice(data.ruleIndex, 1);
            self._saveDashboard();
        })
    }

    self._onRuleEnabled = function(event, data){
        $.when(self.enableRule(data.ruleIndex)).then(function (){
            console.log("Rule enabled");
            currentSettings.rules[data.ruleIndex].enabled = true;
            self._saveDashboard();
        }, function(err){
            console.log("Rule not enabled");
            currentSettings.rules[data.ruleIndex].enabled = false;
            self.displayError({
                message: "Unable to enable rule " + currentSettings.rules[data.ruleIndex].ruleName +
                    ". Please try again later.",
                messageDetail: ""
            });
            self._saveDashboard();
        });
    }

    self._onRuleDisabled = function(event, data){
        $.when(self.disableRule(data.ruleIndex)).then(function (){
            console.log("Rule disabled");
            currentSettings.rules[data.ruleIndex].enabled = false;
            self._saveDashboard();
        }, function(err){
            console.log("Rule not disabled");
            currentSettings.rules[data.ruleIndex].enabled = true;
            self.displayError({
                message: "Unable to disable rule " + currentSettings.rules[data.ruleIndex].ruleName +
                    ". Please try again later.",
                messageDetail: ""
            });
            self._saveDashboard();  
        });
    }

    self._objectsAreEqual = function(obj1, obj2) {
        if (JSON.stringify(obj1) === JSON.stringify(obj2)) {
            return true;
        } else {
            return false;
        }
    }

    self._saveRule = function(rule, ruleIndex) {
        var promises = [];

        //Add a loop here to support chaining of alerts
        for (var i=0; i<rule.alerts.length; i++) {
            if(currentSettings.rules.length === 0 || ruleIndex > currentSettings.rules.length - 1 ||
                rule.alerts[i].isCreated === false) {

                //Create any new rules
                promises.push(self._createAlert(rule, i));
            } else {
                var existingRuleNdx = self._findAlert(rule.alerts[i], currentSettings.rules[ruleIndex]);
                if(existingRuleNdx !== -1) {
                    //The alert exists in the modified rule. Make sure it was actually modified
                    if(!self._objectsAreEqual(rule.alerts[i], currentSettings.rules[ruleIndex].alerts[existingRuleNdx]) ||
                        !self._objectsAreEqual(rule.event, currentSettings.rules[ruleIndex].event)) {
                        promises.push(self._modifyAlert(rule, i));
                    }
                }
            }
        }

        return $.when.apply(undefined, promises).promise();
    }

    self._findAlert = function(alert, sourceRule) {
        for(var i=0; i<sourceRule.alerts.length; i++) {
            if(sourceRule.alerts[i].serviceName === alert.serviceName) {
                return i;
            }
        }
        return -1;
    }

    self._setService = function(rule, alertNdx) {
        //We need to ensure everything on the back-end is setup correctly one last time
        //The singletons get botched up when there is more than one of these widgets
        //being displayed and worked with.
        ruleBuilderService.setEventSource(rule.event.eventSource);
        ruleBuilderService.getEventSource().setAlert(rule.alerts[alertNdx].type);

        if(ruleBuilderService.getEventSource().getAlert().setProvider) {
            ruleBuilderService.getEventSource().getAlert().setProvider(rule.alerts[alertNdx].provider);
        }
    }

    self._createServiceName = function(rule, alertNdx) {
        //Since we support chaining alerts, we need to ensure the service name is unique
        //Append the alert type and index to the service name
        var svcName = "RB_Service_" + currentSettings.widgetId + "_" + 
            rule.rulename.replace(/\s+/g, '') + "_" + rule.alert.type + "_" + alertNdx;
        return svcName
    }

    self._createTriggerName = function(rule, alertNdx) {
        //Since we support chaining alerts, we need to ensure the service name is unique
        //Append the alert type and index to the service name
        var trigger = "RB_Trigger_" + currentSettings.widgetId + "_" + 
            rule.rulename + "_" + rule.alert.type + "_" + alertNdx;
        return trigger
    }

    self._createSettingsForService = function(rule, alertNdx) {
        //Make a clone of the rule so we can modify its structure
        //without affecting the original rule
        var ruleSettings = JSON.parse(JSON.stringify(rule));
        ruleSettings.alert = ruleSettings.alerts[alertNdx];
        delete ruleSettings.alerts;
        return ruleSettings;
    }

    self._createAlert = function(rule, alertNdx) {
        var deferred = $.Deferred();

        self._setService(rule, alertNdx);
        var serviceSettings = self._createSettingsForService(rule, alertNdx);
        var svcName = self._createServiceName(serviceSettings, alertNdx);

        ruleBuilderService.createService(URI, system_key, svcName, 
            serviceSettings).then(function() {
            
            rule.alerts[alertNdx].isCreated = true;
            rule.alerts[alertNdx].serviceName = svcName;
            
            var triggerName = self._createTriggerName(serviceSettings, alertNdx);
            RuleBuilderUtils.createTrigger(URI, system_key, triggerName, svcName, 
                serviceSettings).then(function() {

                rule.alerts[alertNdx].triggerName = triggerName;
                deferred.resolve();
            }, function(err) {
                console.log("Failed to create Trigger: ", err.msg);
                
                //If the trigger could not be created, delete the service
                //that was already created
                self._deleteSingleAlert(rule, alertNdx).then(function() {
                    deferred.reject();
                    self.displayError({
                        message: "Unable to create trigger " + triggerName,
                        messageDetail: err.msg
                    });
                }, function(err2) { 
                    //Not much we can do here
                    self.displayError({
                        message: "Unable to create trigger " + triggerName + ".\n" + 
                        "An error occured while attempting to delete the created service.",
                        messageDetail: err.msg + "\n" + err2.msg
                    });
                });

            });
        }, function(err) {
            console.log("Failed to create Service: ", err.msg);
            deferred.reject(err.msg);
            self.displayError({
                message: "Unable to create service " + svcName,
                messageDetail: err.msg
            });
            rule.alerts[alertNdx].isCreated = false;
        });

        return deferred.promise();
    }

    self._modifyAlert = function(rule, alertNdx) {
        var deferred = $.Deferred();

        self._setService(rule, alertNdx);
        var serviceSettings = self._createSettingsForService(rule, alertNdx);
                
        //Since we support chaining alerts, we need to ensure the service name is unique
        //Append the alert type and index to the service name
        ruleBuilderService.modifyService(URI, system_key, rule.alerts[alertNdx].serviceName, 
            serviceSettings).then(function() {

            //Rather than attempt to figure out what to do, we will blindly delete the trigger 
            //and recreate it. Modifying triggers does not work if the event source or event action
            //have been changed.
            RuleBuilderUtils.deleteTrigger(URI, system_key, rule.alerts[alertNdx].triggerName, 
                serviceSettings).then(function() {

                RuleBuilderUtils.createTrigger(URI, system_key, rule.alerts[alertNdx].triggerName, 
                    rule.alerts[alertNdx].serviceName, serviceSettings).then(function() {

                    deferred.resolve();
                }, function(err) {
                    console.log("Failed to create trigger when updating service: ", err.msg);
                    deferred.reject(err.msg);
                    self.displayError({
                        message: "Unable to create trigger " + rule.alerts[alertNdx].triggerName,
                        messageDetail: err.msg
                    });
                })
            }, function(err) {
                console.log("Failed to delete trigger when updating service: ", err.msg);
                deferred.reject(err.msg);
                self.displayError({
                    message: "Unable to delete trigger " + rule.alerts[alertNdx].triggerName,
                    messageDetail: err.msg
                });
            });
        }, function(err) {
            console.log("Failed to update Service: ", err.msg);
            deferred.reject(err.msg);
            self.displayError({
                message: "Unable to update service " + rule.alerts[alertNdx].serviceName,
                messageDetail: err.msg
            });
        });

        return deferred.promise();
    }

    self._deleteRule = function(rule, alertNdx) {
        //We need to find out if we are deleting a specific alert or all alerts in a rule
        //If alertNdx is present, we know we are deleting a specific alert
        if(!!alertNdx) {
            return self._deleteSingleAlert(rule, alertNdx);
        } else {
            return self._deleteAllAlerts(rule);
        }
    }

    self._deleteSingleAlert = function(rule, alertNdx) {
        var deferred = $.Deferred();

        if(rule.alerts && rule.alerts[alertNdx]) {
            
            //Delete a specific alert
            if(rule.alerts[alertNdx].isCreated === true) {
                var serviceSettings = self._createSettingsForService(rule, alertNdx);
                ruleBuilderService.deleteService(URI, system_key, rule.alerts[alertNdx].serviceName).then(function() {
                    RuleBuilderUtils.deleteTrigger(URI, system_key, rule.alerts[alertNdx].triggerName, 
                        serviceSettings).then(function() {

                        //Delete the alert from the rule
                        rule.alerts.splice(alertNdx, 1);
                        deferred.resolve();
                    }, function(err) {
                        console.log("Failed to delete Trigger: ", err.msg);
                        self.displayError({
                            message: "Unable to delete trigger " + rule.alerts[alertNdx].triggerName,
                            messageDetail: err.msg
                        });
                        deferred.reject(err.msg);
                    });
                }, function(err) {
                    if(!err.code === 500) {
                        console.log("Failed to delete Service: ", err.msg);
                        self.displayError({
                            message: "Unable to delete service " + rule.alerts[alertNdx].serviceName,
                            messageDetail: err.msg
                        });
                        deferred.reject(err.msg);
                    } else {
                        //Delete the alert from the current settings
                        rule.alerts.splice(alertNdx, 1);
                        deferred.resolve();
                    }
                });

                return deferred.promise();
            } else {
                //Delete the alert from the current settings
                rule.alerts.splice(alertNdx, 1);
                return;
            }
        } else {
            return;
        }
    }

    self._deleteAllAlerts = function(rule) {
        var promises = [];

        if(rule.alerts && rule.alerts.length > 0) {
                
            //Delete all alerts within the rule
            for(var i=rule.alerts.length; i>0; i--) {
                promises.push(self._deleteSingleAlert(rule, i-1));
            }
        }

        return $.when.apply(undefined, promises).promise();
    }

    self.displayError = function(msg) {
        RuleBuilderUtils.displayMessage(msg)
    }

    self.enableRule = function(ruleIndex) {
        var promises = [], rule = currentSettings.rules[ruleIndex];

        //Create all triggers for the rule
        for(var i=0; i<rule.alerts.length; i++) {
            promises.push(
                RuleBuilderUtils.createTrigger(URI, system_key, rule.alerts[i].triggerName, rule.alerts[i].serviceName, 
                self._createSettingsForService(rule, i))
            );
        }

        return $.when.apply(undefined, promises).promise();
    }

    self.disableRule = function(ruleIndex) {
        var promises = [], rule = currentSettings.rules[ruleIndex];

        //Delete all triggers for a rule
        for(var i=0; i<rule.alerts.length; i++) {
            promises.push(
                RuleBuilderUtils.deleteTrigger(URI, system_key, rule.alerts[i].triggerName, 
                self._createSettingsForService(rule, i))
            );
        }

        return $.when.apply(undefined, promises).promise();
    }

    /* 
     * Required public function. Called when freeboard wants to know how big we expect to be when 
     * we render, and returns a height. Called any time a user updates their settings (including 
     * the first time they create the widget).
     */
    self.getHeight = function() {
        if(!currentSettings.rules || currentSettings.rules.length === 0) {
            //If there are no rules, the minimum block size to display the UI is 3
            currentSettings.blockHeight = 2;
        } else {
            //If there are rules, the minimum block size is 2
            currentSettings.blockHeight = currentSettings.blockHeight >= 2 ? 
                currentSettings.blockHeight : 2;
        }
        
        return utils.widget.calculateHeight(currentSettings.blockHeight);
    }

    /* 
     * Required public function. Called when a user makes a change to the settings
     */
    self.onSettingsChanged = function(newSettings) {
        //Persist the current rules in the settings object
        newSettings.rules = currentSettings.rules;
        newSettings.widgetId = currentSettings.widgetId;
        currentSettings = newSettings;

        freeboard.resize();

        self._saveDashboard();
    }

    /* 
     * Required public function. Called when a calculated value changes
     */
    self.onCalculatedValueChanged = function(settingName, newValue) {
    }

    /* 
     * Required public function. Called when this instance is no longer needed.
     * Do anything you need to cleanup after yourself here.
     */
    self.onDispose = function() {
    }
}

var ruleBuilderService = (function () {
    // Instance stores a reference to the Singleton
    var instance;
    var eventSrcImpl;
    var alertSrcImpl;
        
    // Private methods and variables
    function _getEventSourceImpl (ruleSettings) { 
        return eventSrcImpl;
    }

    function _setEventSourceImpl (eventSource) { 
        switch (eventSource) {
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_DATA:
                eventSrcImpl = rbDataSourceImpl;
                break;
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_DEVICE:
                eventSrcImpl = rbDeviceSourceImpl; 
                break;
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_MESSAGE:
                eventSrcImpl = rbMessageSourceImpl;
                break;
            case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_USER:
                eventSrcImpl = rbUserSourceImpl;
                break;
            default:
                eventSrcImpl = {};
        }
    }

    function _createService(URI, system_key, service_name, ruleSettings) {
        var deferred = $.Deferred();
        var end_point = URI + "/api/v/3/code/" + system_key + "/service/" + service_name;
            
        //Replace all the tokens in the template
        $.when(eventSrcImpl.getServiceTemplate(service_name, ruleSettings)).then(function(template) {
            var service_body = JSON.stringify({
                "code": template,
                "parameters": [],
                "systemID": system_key,
                "name": service_name,
                "dependencies": eventSrcImpl.getServiceDependencies(),
                "run_user": ""
            });
            
            $.ajax({
                method: 'POST',
                url: end_point,
                data: service_body,
                dataType: 'json',
                contentType: 'application/json',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader("ClearBlade-UserToken", cbsettings.authToken);
                },
                success: function(data) {
                    console.log("Got response Create Service: %o", data);
                    deferred.resolve(data);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log("Request failed Create Service: " + errorThrown);
                    deferred.reject(_createHttpError("create", jqXHR.status));
                }
            });
        });
            
        return deferred.promise();
    };

    function _deleteService(URI, system_key, service_name) {
        var deferred = $.Deferred();
        var end_point = URI + "/api/v/3/code/" + system_key + "/service/" + service_name;
            
        $.ajax({
            method: 'DELETE',
            url: end_point,
            contentType: 'application/json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader("ClearBlade-UserToken", cbsettings.authToken);
            },
            success: function(data) {
                console.log("Got response Delete Service: %o", data);
                deferred.resolve(data);
            },
            error: function(jqXHR, textStatus, errorThrown) {
                console.log("Request failed Delete Service : " + errorThrown);
                deferred.reject(_createHttpError("delete", jqXHR.status));
            }
        });
        return deferred.promise();
    };
        
    function _modifyService(URI, system_key, service_name, ruleSettings) {
        var deferred = $.Deferred();
        var end_point = URI + "/api/v/3/code/" + system_key + "/service/" + service_name;
            
        //Replace all the tokens in the template
        $.when(eventSrcImpl.getServiceTemplate(service_name, ruleSettings)).then(function(template) {
            var service_body = JSON.stringify({
                "code": template,
                "parameters": [],
                "systemID": system_key,
                "name": service_name,
                "dependencies": eventSrcImpl.getServiceDependencies(),
                "run_user": ""
            });
            
            $.ajax({
                method: 'PUT',
                url: end_point,
                data: service_body,
                dataType: 'json',
                contentType: 'application/json',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader("ClearBlade-UserToken", cbsettings.authToken);
                },
                success: function(data) {
                    console.log("Got response Update Service: %o", data);
                    deferred.resolve(data);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log("Request failed Update Service: " + errorThrown);
                    deferred.reject(_createHttpError("modify", jqXHR.status));
                }
            });
        });

        return deferred.promise();
    };

    function _createHttpError(operation, status) {
        var error = {};
        switch(status) {
            case 400:
            case 401:
                error.msg = "You do not have the necessary permissions to " + operation + " services." + 
                    "You need to be granted permission in the ClearBlade developers console (Roles > System Level) to do this.";
                break;
            case 404:
                switch (operation) {
                    case "delete":
                        error.msg = "The service you are attempting to delete does not exist.";
                        break;
                    case "modify":
                        error.msg = "The service you are attempting to modify does not exist.";
                        break;
                }
                break;
            case 405:
                //Invalid method - this should never happen
                error.msg = "Oops, something went wrong. Please open a support ticket with ClearBlade.";
                break;
            case 500:
                switch (operation) {
                    case "create":
                        error.msg = "The service you are attempting to create already exists.";
                        break;
                    case "delete":
                        error.msg = "The service you are attempting to delete does not exist.";
                        break;
                }
                break;
        }
        error.code = status;
        return error;
    }

    return {
        createService: _createService,
        modifyService: _modifyService,
        deleteService: _deleteService,
        setEventSource: _setEventSourceImpl,
        getEventSource: _getEventSourceImpl
    };
})();

var rbTokenReplacer = (function () {
    function _replaceTokensInTemplate(tokens, template) {
        var theTemplate = template;
        for (var token in tokens) {
            theTemplate = theTemplate.replace(new RegExp("@" + token + "@", "g"), tokens[token]);   
        }
        return theTemplate
    }

    //This function parses a token value and returns a string
    //containing the token that will be replaced in an impl class. 
    //Variables within a token are surrounded by "<" and ">".
    //"\<" and "\>" allow the "<" and ">" to be included as "text"
    //within the string
    function _parseToken(token, templateVariable) {

        var tokenString = token;

        //Add quotes to the beginning and end of the string
        if (tokenString.length > 0) {
            if(tokenString[0] != "<") {
                tokenString = '"' + tokenString;
            }
            if(tokenString[tokenString.length - 1] != ">" || 
                (tokenString[tokenString.length - 1] === ">" && tokenString[tokenString.length - 2] === "\\")) {
                tokenString += '"';
            }

            var regex = /[^\\]([\<](.+?[^\\])[\>])/g;
            var variable = regex.exec(tokenString);

            while (variable != null) {
                // matched text: variable[0]
                // match start: variable.index
                // capturing group n: variable[n]

                //Build the replacement string
                var replacement = "";

                if(variable.index > 0) {
                    replacement += '" + ';
                }

                replacement += "messageObject." + variable[2];
                if(variable.index + variable[0].length < tokenString.length - 1) {
                    replacement += ' + "';
                }

                //Perform the string replacement
                tokenString = tokenString.replace(variable[1], replacement);

                //Look for the next match within the token string
                variable = regex.exec(tokenString);
            }
        }
        return tokenString;
    }

    return {
        replaceTokens: _replaceTokensInTemplate,
        parseToken: _parseToken
    };
})();

var ruleBuilderTrigger = (function () {
    // Instance stores a reference to the Singleto
    var instance;
    
    function init() {
        // Singleton
        
        // Private methods and variables
        var triggerImpl;

        function _setTriggerImpl (ruleSettings) { 
            switch (ruleSettings.event.eventSource) {
                case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_DATA:
                    triggerImpl = rbDataTriggerImpl;
                    break;
                case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_DEVICE:
                    triggerImpl = rbDeviceTriggerImpl; 
                    break;
                case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_MESSAGE:
                    triggerImpl = rbMessageTriggerImpl;
                    break;
                case RULE_BUILDER_CONSTANTS.EVENT_SOURCES.EVENT_USER:
                    triggerImpl = rbUserTriggerImpl;
                    break;
            }
        }

        function _getRequestData (system_key, trigger_name, service_name, ruleSettings) { 
            var token_body = JSON.stringify({
                "system_key": system_key,
                "name": trigger_name,
                "def_module": triggerImpl.getSystemModule(),
                "def_name": triggerImpl.getTriggerAction(),
                "service_name": service_name,
                "key_value_pairs": triggerImpl.getTriggerActionData(ruleSettings)
            });
            return token_body;
        }

        function createTrigger(URI, system_key, trigger_name, service_name, ruleSettings) {
            var deferred = $.Deferred();
            var end_point = URI + "/api/v/3/code/" + system_key + "/trigger/" + trigger_name;
            
            $.ajax({
                method: 'POST',
                url: end_point,
                data: _getRequestData(system_key, trigger_name, service_name, ruleSettings),
                dataType: 'json',
                contentType: 'application/json',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader("ClearBlade-UserToken", cbsettings.authToken);
                },
                success: function(data) {
                    console.log("Got response Create Trigger : %o", data);
                    deferred.resolve(data);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log("Request failed Create Trigger: " + errorThrown);
                    deferred.reject(_createHttpError("create", jqXHR.status));
                }
            });
            return deferred.promise();
        }

        function modifyTrigger(URI, system_key, trigger_name, service_name, ruleSettings) {
            var deferred = $.Deferred();
            var end_point = URI + "/api/v/3/code/" + system_key + "/trigger/" + trigger_name;

            $.ajax({
                method: 'PUT',
                url: end_point,
                data: _getRequestData(system_key, trigger_name, service_name, ruleSettings),
                dataType: 'json',
                contentType: 'application/json',
                beforeSend: function(xhr) {
                    xhr.setRequestHeader("ClearBlade-UserToken", cbsettings.authToken);
                },
                success: function(data) {
                    console.log("Got response Update Trigger: %o", data);
                    deferred.resolve(data);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log("Request failed Update Trigger: " + errorThrown);
                    deferred.reject(_createHttpError("modify", jqXHR.status));
                }
            });
            return deferred.promise();
        };

        function deleteTrigger(URI, system_key, trigger_name, ruleSettings) {
            var deferred = $.Deferred();
            var end_point = URI + "/api/v/3/code/" + system_key + "/trigger/" + trigger_name;

            $.ajax({
                method: 'DELETE',
                url: end_point,

                beforeSend: function(xhr) {
                    xhr.setRequestHeader("ClearBlade-UserToken", cbsettings.authToken);
                },
                success: function(data) {
                    console.log("Got response Delete Trigger: %o", data);
                    deferred.resolve(data);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.log("Request failed Delete Trigger: " + errorThrown);
                    deferred.reject(_createHttpError("delete", jqXHR.status));
                }
            });
            return deferred.promise();
        };

        var publicApi = {
            setTriggerImpl: _setTriggerImpl,
            createTrigger: createTrigger,
            modifyTrigger: modifyTrigger,
            deleteTrigger: deleteTrigger
        };

        // Public methods and variables should be placed within the returned object
        return publicApi;
  };

    function _createHttpError(operation, status) {
        var error = {};
        switch(status) {
            case 400:
            case 401:
                error.msg = "You do not have the necessary permissions to " + operation + " triggers." + 
                    "You need to be granted permission in the ClearBlade developers console (Roles > System Level) to do this.";
                break;
            case 405:
                //Invalid method - this should never happen
                error.msg = "Oops, something went wrong. Please open a support ticket with ClearBlade.";
                break;
            case 500:
                switch (operation) {
                    case "create":
                        error.msg = "The trigger you are attempting to create already exists.";
                        break;
                    case "modify":
                        error.msg = "The trigger you are attempting to modify does not exist.";
                        break;
                    case "delete":
                        error.msg = "The trigger you are attempting to delete does not exist.";
                        break;
                }
                break;
        }
        error.code = status;
        return error;
    }

  return {
      // Get the Singleton instance if one exists
      // or create one if it doesn't
      getInstance: function (ruleSettings) {
          if ( !instance ) {
              instance = init();
            }

            instance.setTriggerImpl(ruleSettings);
            return instance;
        }
    }
})();
function Controls ()
{
  var update = document.getElementById ('update');

  var mode_incr = document.getElementById ('incremental'),
      mode_rand = document.getElementById ('random');

  var rescale  = document.getElementById ('rescale'),
      maxvalue = document.getElementById ('maxvalue');

  // Animated update
  //
  var start_update = function ()
  {
    if (mode_incr.checked)
      incrementalUpdate ();
    else if (mode_rand.checked)
      randomUpdate ();

    update.value = 'stop';
  }

  var stop_update = function ()
  {
    stopAnimation ();

    update.value = 'start';
  }

  var updating = function ()
  {
    return update.value == 'stop';
  }

  this.start = start_update;

  update.onclick = function () {
    if (updating ())
      stop_update ();
    else
      start_update ();
  }

  mode_incr.onchange = mode_rand.onchange = function ()
  {
    if (updating ())
    {
      stop_update ();
      start_update ();
    }
  }

  // Animated Rescale
  //
  rescale.onclick = function ()
  {
    var max = parseInt (maxvalue.value);

    if (max == speedometer.max ())
      return;

    if (updating ())
      stop_update ();

    speedometer.animatedRescale (max, 2000);
  }

}

var clearbladeAnalyticsDatasourcePlugin = function (settings, updateCallback) {
var self = this;
		var currentSettings = settings;

		this.updateNow = function () {
			var devToken = JSON.parse(localStorage["ngStorage-cb_novi_dev_token"]);
			var platformUrl = JSON.parse(localStorage["ngStorage-cb_platformURL"]);
			var devInfo = JSON.parse(localStorage["ngStorage-dev_info"]);
			var devEmail = devInfo.email;
			var req_url = platformUrl+'/api/v/2/analytics/eventtotals?'+'query={"scope":{"developer":"'+devEmail+'"},"filter":{"module":"'+currentSettings.module_name+'","action":"'+currentSettings.action+'","id":"'+currentSettings.id+'","interval":'+currentSettings.interval+'}}';
			
			if(window.XMLHttpRequest)
		    {
		        client=new XMLHttpRequest();
		        //alert("request Obj");
		    }
		    else
		    {
		        client=new ActiveXObject("Microsoft.XMLHTTP");
		        //alert("request Obj2");
		    }
		    client.onreadystatechange=function()
		    {
		        if(client.readyState==4){
		            if (client.status==200)
		            {
		                updateCallback(client.responseText);
		            }else{
		                console.log(client.responseText);
		                alert("error");
		            }
		        }
		    };
		    client.open("GET",req_url,true);
		    client.setRequestHeader("Content-type", "application/json");
		    client.setRequestHeader("ClearBlade-DevToken", devToken);
		    client.send(null);
		}

		this.onDispose = function () {
			
		}

		this.onSettingsChanged = function (newSettings) {
			currentSettings = newSettings;
			self.updateNow();
		}
	};
	
	
	freeboard.loadDatasourcePlugin({
		"type_name": "clearblade_analytics_event_totals",
		"display_name": "Analytics: Event Totals",
		"settings": [
			{
				"name": "module_name",
				"display_name": "Module",
				"type": "text",
				"description" : "module: user | collection | messaging | service | push ",
				"required" : true
			},
			{
				"name": "id",
				"display_name": "ID",
				"type": "text",
				"description" : "id: collectionid|userid|topicid|service name| blank if push",
				"required" : false
			},
			{
				"name": "action",
				"display_name": "Action",
				"type": "text",
				"description" : "action: create|password reset|update|dev alter|dev password reset|dev delete|dev read|dev update|read|delete|dev create|execute|dev save|publish|recieve|ios|android|connection|login|logout|disconnect|sent ",
				"required" : true
			},
			{
				"name": "interval",
				"display_name": "Time Interval",
				"type": "text",
				"description" : "A time specified in seconds",
				"required" : false
			}
		],
		newInstance: function (settings, newInstanceCallback, updateCallback) {
			newInstanceCallback(new clearbladeAnalyticsDatasourcePlugin(settings, updateCallback));
		}
	});
var clearbladeCollectionDatasourcePlugin = function (settings, updateCallback) {
	var self = this;

	// Validate settings
	var currentSettings = settings;
	var refreshTimer;
	var errorPopDisplayed = false;
	var currentQuery = generateQuery();

	// Generate a default query to the target collection
	function generateQuery(){
    	return cb.Query({collectionName: currentSettings.collection_name});  
	}

	function createRefreshTimer(interval) {
		if(refreshTimer) {
			clearInterval(refreshTimer);
		}
		refreshTimer = setInterval(function() {
			self.updateNow();
		}, interval);
	}

	var fetchData = function (data) {
		var def = $.Deferred();
		// If no query is specified, use default collection query
		var query = (data === undefined || data.query === undefined) ? generateQuery() : data.query;
		var coll = cb.Collection({collectionName: currentSettings.collection_name});
        coll.fetch(query, function(err, body) {
        	if(err){
                if(!errorPopDisplayed) {
                    alertMessage("Error fetching collection datasource", body);
                    errorPopDisplayed = true;
                }
                def.reject(body);
            }else{
                updateCallback(body);
                def.resolve(body);
            }
        });
        return def.promise();
	}


	var insertData = function (data) {
		var def = $.Deferred();
		var fmtPayload = self.formatPayload(data.data, data.options.schema);
        var coll = cb.Collection({collectionName: currentSettings.collection_name});
        coll.create(fmtPayload, function(err, body) {
            if(err) {
                alertMessage("Error inserting into collection datasource with name '" + currentSettings.collection_name + "': ", body);
                def.reject(body);
            } else {
            	delete data.query; //we don't want to pass the query to our fetch call
            	fetchData(data); // Update with existing options.. eg: selected page
                def.resolve();
            }
        });
		return def.promise();
	}

	var updateData = function (data) {
		var def = $.Deferred();
		var fmtPayload = self.formatPayload(data.data, data.options.schema);
        if(data.query) {
            try {
                var coll = cb.Collection({collectionName: currentSettings.collection_name});
                coll.update(data.query, fmtPayload, function(err, body) {
                    if(err) {
                        alertMessage("Error updating collection datasource with name '" + currentSettings.collection_name + "': ", body);
                        def.reject(body);
                    } else {
                    	delete data.query; //we don't want to pass the query to our fetch call
                    	fetchData(data); // Update with existing options.. eg: selected page
                        def.resolve();
                    }
                });
            } catch(e) {
                console.error("Error: Unable to update collection. Please check the outgoing parser for " + currentSettings.collection_name);
                console.error(e);
                def.reject(e);
            }
        } else {
            console.warn("No query parameter supplied for updating a collection. Please check the outgoing parser for " + currentSettings.collection_name);
            def.reject();
        }

        return def.promise();
	}

	var deleteData = function (data) {
		var def = $.Deferred();
        if(data.query) {
            try {
                var coll = cb.Collection({collectionName: currentSettings.collection_name});
                coll.remove(data.query, function(err, body) {
                    if(err) {
                        alertMessage("Error deleting record in collection datasource with name '" + currentSettings.collection_name + "': ", body);
                        def.reject(body);
                    } else {
                    	delete data.query; //we don't want to pass the query to our fetch call
                    	fetchData(data); // Update with existing options.. eg: selected page (NOTE: js grid defaults to page 1 after delete. Need workaround)
                        def.resolve();
                    }
                });
            } catch(e) {
                console.error("Error: Unable to remove item from collection. Please check the outgoing parser for " + currentSettings.collection_name);
                console.error(e);
                def.reject(e);
            }
        } else {
            console.warn("No query parameter supplied for deleting a row in a collection. Please check the outgoing parser for " + currentSettings.collection_name);
            def.reject();
        }

		return def.promise();
	}

	this.clearQuery = function(){
		currentQuery = generateQuery()
	}

	this.formatPayload = function(data, schema){
		var fmtData = {};
		// Remove uneditable attributes
		if(data.item_id !== undefined){delete data.item_id;}
		// Convert attributes to match column schema
		for(var i = 0, len = schema.length; i < len; i++){
			if(data[schema[i].name] !== undefined && data[schema[i].name] !== ""){
				fmtData[schema[i].name] = utils.convertString(data[schema[i].name], schema[i].type);
			}
		}
		return fmtData;
	}

	this.sendData = function(data){
		//NOTE: data should only come from an outgoing parser or widgets targeting collection
		if (data) {
			if(data.method) {
				switch(data.method) {
					case utils.constants.INSERT_METHOD:
						return $.when(insertData(data));
					case utils.constants.UPDATE_METHOD:
						return $.when(updateData(data));
					case utils.constants.DELETE_METHOD:
                        return $.when(deleteData(data));
                    case utils.constants.PAGE_METHOD:
                        return $.when(fetchData(data));
				}
			}
		} else {
            if (currentSettings.refresh_time > 0){
                createRefreshTimer(currentSettings.refresh_time);
            }
            else {
                clearInterval(refreshTimer);
                refreshTimer = undefined;
            }

            return $.when(fetchData());
		}

	}

	this.updateNow = function(){
		self.sendData();
	}

	this.onDispose = function () {
		clearInterval(refreshTimer);
		refreshTimer = undefined;
	}

	this.onSettingsChanged = function (newSettings) {
		currentSettings = newSettings;
		self.updateNow();
	}
};


freeboard.loadDatasourcePlugin({
	"type_name": "clearblade_collection",
	"display_name": "Collection",
	"settings": [
		{
			"name": "collection_name",
			"display_name": "Collection Name",
			"type": "text",
			"description" : "Name of collection",
			"required" : true
		},
		{
			"name"         : "refresh_time",
			"display_name" : "Refresh Time",
			"type"         : "text",
			"description"  : "In milliseconds",
			"required"		: false,
			"default_value": 5000
		}
	],
	newInstance: function (settings, newInstanceCallback, updateCallback) {
		newInstanceCallback(new clearbladeCollectionDatasourcePlugin(settings, updateCallback));
	}
});
var clearbladeCollectionColumnsDatasourcePlugin = function (settings, updateCallback) {
    var self = this;
    var currentSettings = settings;
    var refreshTimer;
    var errorPopDisplayed = false;

    function createRefreshTimer(interval) {
        if(refreshTimer) {
            clearInterval(refreshTimer);
        }

        refreshTimer = setInterval(function() {
            self.updateNow();
        }, interval);
    }

    this.sendData = function(){

        //let's instantiate the collection object here so that we always use the current setting for collection_name
        var coll = cb.Collection({collectionName: currentSettings.collection_name});

        var callback = function(err, data){
            if(err){
                console.log(err);
                if(!errorPopDisplayed) {
                    alertMessage("Error fetching collection datasource: ", data);
                    errorPopDisplayed = true;
                }
            }else{
                updateCallback(data);
            }
        }

        coll.columns(callback);

        if (currentSettings.refresh_time > 0){
            createRefreshTimer(currentSettings.refresh_time);
        }
        else {
            clearInterval(refreshTimer);
            refreshTimer = undefined;
        }
    }

    this.updateNow = function(){
        self.sendData();
    }

    this.onDispose = function () {
        clearInterval(refreshTimer);
        refreshTimer = undefined;
    }

    this.onSettingsChanged = function (newSettings) {
        currentSettings = newSettings;
        self.updateNow();
    }
};


freeboard.loadDatasourcePlugin({
    "type_name": "clearblade_collection_columns",
    "display_name": "Collection Columns",
    "settings": [
        {
            "name": "collection_name",
            "display_name": "Collection Name",
            "type": "text",
            "description" : "Name of collection",
            "required" : true
        },
        {
            "name"         : "refresh_time",
            "display_name" : "Refresh Time",
            "type"         : "text",
            "description"  : "In milliseconds",
            "required"		: false,
            "default_value": 0
        }

    ],
    newInstance: function (settings, newInstanceCallback, updateCallback) {
        newInstanceCallback(new clearbladeCollectionColumnsDatasourcePlugin(settings, updateCallback));
    }
});
var clearbladeCollectionItemCountDatasourcePlugin = function (settings, updateCallback) {
    var self = this;
    var currentSettings = settings;
    var refreshTimer;
    var errorPopDisplayed = false;

    var coll = cb.Collection({collectionName: currentSettings.collection_name});

    function createRefreshTimer(interval) {
        if(refreshTimer) {
            clearInterval(refreshTimer);
        }

        refreshTimer = setInterval(function() {
            self.updateNow();
        }, interval);
    }

    this.sendData = function(){
        coll.count(undefined, function(err, body) {
            if(err) {
                alertMessage("Error getting record count in collection '" + currentSettings.collection_name + "': ", body);
            } else {
                updateCallback(body.count);
            }
        });
    }

    this.updateNow = function(){
        self.sendData();
    }

    this.onDispose = function () {
        clearInterval(refreshTimer);
        refreshTimer = undefined;
    }

    this.onSettingsChanged = function (newSettings) {
        currentSettings = newSettings;
        self.updateNow();
    }
};


freeboard.loadDatasourcePlugin({
    "type_name": "clearblade_collection_count",
    "display_name": "Collection Item Count",
    "settings": [
        {
            "name": "collection_name",
            "display_name": "Collection Name",
            "type": "text",
            "description" : "Name of collection",
            "required" : true
        },
        {
            "name"         : "refresh_time",
            "display_name" : "Refresh Time",
            "type"         : "text",
            "description"  : "In milliseconds",
            "required"	   : false,
            "default_value": 0
        }
    ],
    newInstance: function (settings, newInstanceCallback, updateCallback) {
        newInstanceCallback(new clearbladeCollectionItemCountDatasourcePlugin(settings, updateCallback));
    }
});
var clearbladeCurrentUserDatasourcePlugin = function (settings, updateCallback) {
	var self = this;
	var currentSettings = settings;
	var refreshTimer;
	var errorPopDisplayed = false;

	function createRefreshTimer(interval) {
		if(refreshTimer) {
			clearInterval(refreshTimer);
		}

		refreshTimer = setInterval(function() {
			self.updateNow();
		}, interval);
	}

	this.updateNow = function () {
	
		var callback = function(err, data){
			if(err){
				console.log(err);
				if(!errorPopDisplayed) {
					alertMessage("Error fetching current user: ", data);
					errorPopDisplayed = true;
				}
			}else{
				//console.log(JSON.stringify(data));
				updateCallback(data);
			}
		}

		var user = cb.User();
		user.getUser(callback);
	}

	this.onDispose = function () {
		clearInterval(refreshTimer);
		refreshTimer = undefined;
	}

	this.onSettingsChanged = function (newSettings) {
		currentSettings = newSettings;
		self.updateNow();
	}

	createRefreshTimer(currentSettings.refresh_time);
};

freeboard.loadDatasourcePlugin({
	"type_name": "clearblade_user",
	"display_name": "Current User",
	"settings": [
		{
			"name"         : "refresh_time",
			"display_name" : "Refresh Time",
			"type"         : "text",
			"description"  : "In milliseconds",
			"default_value": 5000
		}
	],
	newInstance: function (settings, newInstanceCallback, updateCallback) {
		newInstanceCallback(new clearbladeCurrentUserDatasourcePlugin(settings, updateCallback));
	}
});
var clearbladeDeviceDataPlugin = function (settings, updateCallback) {
	var self = this;
	var currentSettings = settings;
	var refreshTimer;
	var errorPopDisplayed = false;
	var device = {};

	function createRefreshTimer(interval) {
		if(refreshTimer) {
			clearInterval(refreshTimer);
		}

		refreshTimer = setInterval(function() {
			self.updateNow();
		}, interval);
	}

	this.updateNow = function() {
		var dev = cb.Device();
		dev.getDeviceByName(currentSettings.device_name, function(err, body){
			if (err){
				if(!errorPopDisplayed) {
					alertMessage("Error getting device: ", body);
					errorPopDisplayed = true;
				}
			} else {
				device = body;
				updateCallback(device);
			}
		});
	}

	this.onDispose = function (){
		clearInterval(refreshTimer);
		refreshTimer = undefined;
	}

	this.onSettingsChanged = function(newSettings) {
		currentSettings = newSettings;
		self.updateNow();
	}

	this.sendData = function(data){
		
		if (typeof data != "object"){
			data = JSON.parse(data);
		}
		var dev = cb.Device();
		dev.updateDevice(currentSettings.device_name, data, true, function(err, body){
			if (err){
				console.log("Error updating device " + currentSettings.device_name);
				console.log(JSON.stringify(body));
				alertMessage("Error updating device: ", body);
			}
		});

	}

	createRefreshTimer(currentSettings.refresh_time);

};

freeboard.loadDatasourcePlugin({
	"type_name"    : "clearblade_device",
	"display_name" : "ClearBlade Device",
	"description"  : "Access a ClearBlade Device",
	"settings": [
		{
			"name" 			: "device_name",
			"display_name"  : "Device Name",
			"type" 			: "text",
			"description" 	: "Name of ClearBlade Device you would like to access",
			"required" 		: true
		},
		{
			"name" 			: "refresh_time",
			"display_name" 	: "Refresh Time",
			"description" 	: "Data refresh time in milliseconds",
			"required"		: false,
			"default_value"	: 1000
		}
	],
	newInstance: function (settings, newInstanceCallback, updateCallback){
		newInstanceCallback(new clearbladeDeviceDataPlugin(settings, updateCallback));
	}
});
var edgeMetricsDatasourcePlugin = function (settings, updateCallback) {
    var self = this;
    var currentSettings = settings;
    var refreshTimer;
    var errorPopDisplayed = false;
    this.edgeName = "";

    var someObj = {};

    if (typeof currentSettings.edge_name === "string") {
        this.edgeName = currentSettings.edge_name;
    }


    function createRefreshTimer(interval) {
        if (refreshTimer) {
            clearInterval(refreshTimer);
        }
        refreshTimer = setInterval(function () {
            self.updateNow();
        }, interval);
    }

    this.updateNow = function () {

        if (this.edgeName === "") {
            //no edge set, let's not do anything
            console.log('edge_name doesn\'t seem to be set, not doing anything');
            return;
        }

        var metrics = cb.Metrics();
        var query = cb.Query();
        query.equalTo('name', this.edgeName);
        metrics.setQuery(query);

        function getStats () {
            var promise = jQuery.Deferred();

            metrics.getStatistics(function (err, data) {
                if (err) {
                    promise.reject(err);
                } else {
                    promise.resolve(data.DATA);
                }
            });

            return promise.promise();
        }

        function getStatsHistory () {
            var promise = jQuery.Deferred();

            metrics.getStatisticsHistory(function (err, data) {
                if (err) {
                    promise.reject(err);
                } else {
                    promise.resolve(data.DATA);
                }
            });

            return promise.promise();
        }

        function getDBConns () {
            var promise = jQuery.Deferred();

            metrics.getDBConnections(function (err, data) {
                if (err) {
                    promise.reject(err);
                } else {
                    promise.resolve(data.DATA);
                }
            });

            return promise.promise();
        }

        function getLogs () {
            var promise = jQuery.Deferred();

            metrics.getLogs(function (err, data) {
                if (err) {
                    promise.reject(err);
                } else {
                    promise.resolve(data.DATA);
                }
            });

            return promise.promise();
        }

        $.when(getStats(), getStatsHistory(), getDBConns(), getLogs()).then(
            function(stats, history, dbconns, logs) {
                var edgeKey = cb.systemKey + ":" + this.edgeName;
                var returnObj = {
                    stats: stats[edgeKey],
                    history: history[edgeKey],
                    dbconns: dbconns[edgeKey],
                    logs: logs[edgeKey]
                };
                updateCallback(returnObj);
            }.bind(self), function (err) {
                if(!errorPopDisplayed) {
                    alertMessage("Error getting metrics: ", err);
                    errorPopDisplayed = true;
                }
            }
        );

    };

    this.onDispose = function () {
        clearInterval(refreshTimer);
        refreshTimer = undefined;
    };

    this.onSettingsChanged = function (newSettings) {
        currentSettings = newSettings;
        if (typeof currentSettings.edge_name === "string") {
            this.edgeName = currentSettings.edge_name;
        } else {
            //reset edge name, means this setting was changed to a data source, so it should get set somewhere else
            this.edgeName = "";
        }
        self.updateNow();
    };

    this.onCalculatedValueChanged = function (settingName, newValue) {
        this.edgeName = newValue;
        self.updateNow();
    };

    createRefreshTimer(currentSettings.refresh_time);
};

freeboard.loadDatasourcePlugin({
   "type_name": "edge_metrics",
    "display_name": "Edge Metrics",
    "settings": [
        {
            "name": "refresh_time",
            "display_name": "Refresh Time",
            "type": "text",
            "description": "In milliseconds",
            "default_value": 5000
        }, {
            "name": "edge_name",
            "display_name": "Edge Name",
            "type": "data",
            "description": "Name of the edge you would like to access",
            "incoming_parser": true
        }
    ],
    newInstance: function (settings, newInstanceCallback, updateCallback) {
       newInstanceCallback(new edgeMetricsDatasourcePlugin(settings, updateCallback));
    }
});
var edgeListDatasourcePlugin = function (settings, updateCallback) {
	var self = this;
	var currentSettings = settings;
	var refreshTimer;
	var errorPopDisplayed = false;

	function createRefreshTimer(interval) {
		if(refreshTimer) {
			clearInterval(refreshTimer);
		}

		refreshTimer = setInterval(function() {
			self.updateNow();
		}, interval);
	}

	this.updateNow = function () {
		
		var callback = function(err, data){
			if(err){
				console.log("error: "+err);
				if(!errorPopDisplayed) {
					alertMessage("Error fetching edge list: ", data);
					errorPopDisplayed = true;
				}
			}else{
				console.log("Data :"+data);
				updateCallback(data);
			}
		}
		cb.getEdges(callback);
	}

	this.onDispose = function () {
		clearInterval(refreshTimer);
		refreshTimer = undefined;
	}

	this.onSettingsChanged = function (newSettings) {
		currentSettings = newSettings;
		self.updateNow();
	}

	createRefreshTimer(currentSettings.refresh_time);
};

freeboard.loadDatasourcePlugin({
	"type_name": "edge_list",
	"display_name": "Edge List",
	"settings": [
		{
			"name"         : "refresh_time",
			"display_name" : "Refresh Time",
			"type"         : "text",
			"description"  : "In milliseconds",
			"default_value": 5000
		}
	],
	newInstance: function (settings, newInstanceCallback, updateCallback) {
		newInstanceCallback(new edgeListDatasourcePlugin(settings, updateCallback));
	}
});
var clearbladeCollectionRowsDatasourcePlugin = function (settings, updateCallback) {
	var self = this;
	var currentSettings = settings;
	var refreshTimer;
	var errorPopDisplayed = false;

	function createRefreshTimer(interval) {
		if(refreshTimer) {
			clearInterval(refreshTimer);
		}

		refreshTimer = setInterval(function() {
			self.updateNow();
		}, interval);
	}

	this.updateNow = function () {
		
		var data;
		var callback = function(err, data){
			if(err){
				console.log(err);
				if(!errorPopDisplayed) {
					alertMessage("Error fetching item: ", data);
					errorPopDisplayed = true;
				}
			}else{
				console.log(JSON.stringify(data));
				updateCallback(data);
			}
		}

		var q = cb.Query({collectionName: currentSettings.collection_name});
		q.equalTo(currentSettings.field_name,currentSettings.field_value);
		q.fetch(callback)
		
	}

	this.onDispose = function () {
		clearInterval(refreshTimer);
		refreshTimer = undefined;
	}

	this.onSettingsChanged = function (newSettings) {
		currentSettings = newSettings;
		self.updateNow();
	}

	createRefreshTimer(currentSettings.refresh_time);
};

freeboard.loadDatasourcePlugin({
	"type_name": "clearblade_fetch_row",
	"display_name": "Item",
	"settings": [
		{
			"name": "collection_name",
			"display_name": "Collection Name",
			"type": "text",
			"description" : "Name of the collection stored in your system",
			"required" : true
		},
		{
			"name": "field_name",
			"display_name": "Field Name",
			"type": "text",
			"description" : "Name of the column from collection on the system",
			"required" : true
		},
		{
			"name": "field_value",
			"display_name": "Field Value",
			"type": "text",
			"description" : "Name of the item value to be retrieved",
			"required" : true
		},
		{
			"name"         : "refresh_time",
			"display_name" : "Refresh Time",
			"type"         : "text",
			"description"  : "In milliseconds",
			"default_value": 5000
		}
	],
	newInstance: function (settings, newInstanceCallback, updateCallback) {
		newInstanceCallback(new clearbladeCollectionRowsDatasourcePlugin(settings, updateCallback));
	}
});
var default_start_time = -1;

freeboard.loadDatasourcePlugin({
	"type_name"   : "message_history",
	"display_name": "Message History",
	"description" : "Retrieves messaging history for a topic",

	

	"settings"    : [
		{
			name         : "topic_name",
			display_name : "Message Topic",
			type         : "text",
			default_value: "device/tool1",
			description  : "Set your message topic",
			required	 : true
		},
		{
			name         : "message_count",
			display_name : "Message Count",
			type         : "number",
			default_value: 25,
			description  : "Set your message count",
			required	 : true
		},
		{
			name         : "start_time",
			display_name : "Start Time",
			type         : "number",
			description  : "Start time in 'epoch timestamp milliseconds' format. Default to -1 in order to retrieve latest",
			default_value: default_start_time
		},
		{
			"name"         : "refresh_time",
			"display_name" : "Refresh Time",
			"type"         : "text",
			"description"  : "In milliseconds",
			"default_value": 5000
		}

	],
	newInstance   : function(settings, newInstanceCallback, updateCallback) {
		newInstanceCallback(new messageHistoryPlugin(settings, updateCallback));
	}
});

var messageHistoryPlugin = function(settings, updateCallback)
{

	var self = this;
	var currentSettings = settings;
	var refreshTimer;
	var errorPopDisplayed = false;

	var connectCallback = function(err, data) {
    	if(err) {
    		console.log("Error connecting to messaging: " + JSON.stringify(data));
    	} else {
    		console.log("Connected to messaging");
    	}
    };

    // Create a new messaging object for each topic datasource
    var messaging = cb.Messaging({"useSSL":false}, connectCallback);
    console.log("Connecting to messaging");

	function createRefreshTimer(interval) {
		if(refreshTimer) {
			clearInterval(refreshTimer);
		}

		refreshTimer = setInterval(function() {
			self.updateNow();
		}, interval);
	}



	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
		self.updateNow();
	}


	self.updateNow = function()
	{
		var topic = currentSettings.topic_name;
		var count = currentSettings.message_count;
		var time  = currentSettings.start_time === default_start_time ? new Date().getTime() : currentSettings.start_time;

		var callback = function(err, data){
			if(err){
				if(!errorPopDisplayed) {
					alertMessage("Error in retreiving messaging history: ", data);
					errorPopDisplayed = true;
				}
			}else{
				console.log("Retreived messaging history");
				updateCallback(data);
			}
		}
		messaging.getMessageHistory(topic, time, count, callback);

	}

	self.onDispose = function()
	{

		 clearInterval(refreshTimer);
		 refreshTimer = undefined;
		
	}


	createRefreshTimer(currentSettings.refresh_time);
}




var dashboardEventPlugin = function (settings, updateCallback) {

    var self = this;

    var currentSettings = settings;
    var scope = {};

    self.sendData = function (data) {
        scope = data;
        updateCallback(scope);
    }


    self.onSettingsChanged = function (newSettings) {
        currentSettings = newSettings;
    }


    self.updateNow = function (data) {
        scope = data;
    }

    self.onDispose = function () {
    }

}


freeboard.loadDatasourcePlugin({
    "type_name": "dashboardEvent",
    "display_name": "Local Variable",
    "description": "A variable or object stored in the local portal scope",
    settings: [],
    newInstance: function (settings, newInstanceCallback, updateCallback) {
        newInstanceCallback(new dashboardEventPlugin(settings, updateCallback));
    }
});
var clearbladeServiceDatasourcePlugin = function (settings, updateCallback) {
		
	var self = this;
	var currentSettings = settings;
	var codeName = currentSettings.code_name;
	var errorPopDisplayed = false;

	var refreshTimer;

	self.onDispose = function () {
		clearInterval(refreshTimer);
	}

	self.configure = function(){

		codeName = currentSettings.code_name;

		clearInterval(refreshTimer);
		if(currentSettings.refresh_interval !== undefined && currentSettings.refresh_interval > 0){
			refreshTimer = setInterval(function() {
				self.updateNow();
			}, utils.secToMs(currentSettings.refresh_interval));
		}
	}

	self.onSettingsChanged = function (newSettings) {
		currentSettings = newSettings;
		self.configure();
	}

	self.sendData = function(data){
		var def = $.Deferred();
		var code = cb.Code();

		if(data === undefined){
			data = {};
		}

		code.execute(codeName, data, function(err, resp){
			if(err){
				console.log(resp);
				if(!errorPopDisplayed) {
					alertMessage("Error calling code service: ", resp);
					errorPopDisplayed = true;
				}
				def.reject(resp);
			} else {
				updateCallback(resp);
				def.resolve(resp);
			}
		});
        return def.promise();
	}

	self.updateNow = function(){
		self.sendData(utils.parseJsonObject(currentSettings.default_payload));
	}

	// On load.. configure. Set's interval if present
	self.configure();

};

freeboard.loadDatasourcePlugin({
	"type_name": "clearblade_execute_code",
	"display_name": "Code",
	"description" : "Call a ClearBlade service with parameters. Data payload must be a valid JSON object. ex: { \"key\" : \"value\" } ",
	"settings": [
		{
			"name": "code_name",
			"display_name": "Code Name",
			"type": "text",
			"description" : "Name of the code service which you wish to execute on your system",
			"required" : true
		},
		{
			"name": "refresh_interval",
			"display_name": "Refresh Interval",
			"type": "number",
			"description" : "Send default payload every X seconds. 0 for no interval",
			"default_value" : 0
		},
		{
			"name": "default_payload",
			"display_name": "Default Payload",
			"type": "String",
			"default_value" : "{}",
			"description" : "payload must be a valid JSON object. ex: { \"parameter\" : \"value\" } "
		}
	],
	newInstance: function (settings, newInstanceCallback, updateCallback) {
		newInstanceCallback(new clearbladeServiceDatasourcePlugin(settings, updateCallback));
	}
});
freeboard.loadDatasourcePlugin({
	"type_name"   : "messageTopic",
	"display_name": "Message Topic",
	"description" : "A topic streaming payloads over a websocket",

	

	"settings"    : [
		{
			name         : "topic_name",
			display_name : "Message Topic",
			type         : "text",
			default_value: "device/tool1",
			description  : "Set your message topic"
		}
	],
	newInstance   : function(settings, newInstanceCallback, updateCallback) {
		newInstanceCallback(new messageTopicPlugin(settings, updateCallback));
	}
});

var messageTopicPlugin = function(settings, updateCallback)
{

	var self = this;
	var currentSettings = settings;
	var lastMessage = {};


    var connectCallback = function(err, data) {
    	if(err) {
    		console.log("Error connecting to messaging: " + JSON.stringify(data));
    	} else {
    		console.log("Connected to messaging");
    		messaging.subscribe(currentSettings.topic_name, {}, stateMessageReceived); 
    	}   
    };

	var isSSL = window.location.protocol === "https:";
	// Create a new messaging object for each topic datasource
    var messaging = cb.Messaging({"useSSL":isSSL}, connectCallback);
    console.log("Connecting to messaging");

    var count = 1; 
    var time  = (new Date).getTime();    
    var historyCallback = function(err, data){
    	if(err){
    		if(data && data.indexOf('not authorized')) {
			    alertMessage("You need to authorize this user in 'Auth > Roles > Message History > Edit' to read the messaging history");
			} else {
			    alertMessage("Error fetching topic history for '" + currentSettings.topic_name + "'", data);
			}
    	}else{
    		if(typeof data !== 'undefined' && data.constructor === Array && data.length > 0){
    			lastMessage = data[0].message;
    		}
    		updateCallback(lastMessage);
    	}
    }

    var getMessageHistory = function () {
    	messaging.getMessageHistory(currentSettings.topic_name, time, count, historyCallback);	
    }
	
	var stateMessageReceived = function(message) {
	 	updateCallback(message);
	}

	self.sendData = function(data){
		try {
			messaging.publish(currentSettings.topic_name, data);	
		} catch(e) {
			console.log('ERROR PUBLISHING TO TOPIC');
			console.log(e);
		}
	}

	self.onSettingsChanged = function(newSettings)
	{

		messaging.unsubscribe(currentSettings.topic_name, {});
		currentSettings = newSettings;
		messaging.subscribe(currentSettings.topic_name, {}, stateMessageReceived); 
		getMessageHistory();
	}


	self.updateNow = function() {}

	self.onDispose = function()
	{
		messaging.unsubscribe(currentSettings.topic_name, {});
	}

	getMessageHistory();

}




var clearbladeUsersDatasourcePlugin = function (settings, updateCallback) {
		var self = this;
		var currentSettings = settings;
		var query = currentSettings.query_object;
		var refreshTimer;
		var errorPopDisplayed = false;


		function createRefreshTimer(interval) {
		if(refreshTimer) {
			clearInterval(refreshTimer);
		}

		refreshTimer = setInterval(function() {
			self.updateNow();
		}, interval);
	}

		this.updateNow = function () {
		
			var callback = function(err, data){
				if(err){
					console.log(err);
					if(!errorPopDisplayed) {
						alertMessage("Error fetching users: ", data);
						errorPopDisplayed = true;
					}
				}else{
					//console.log(JSON.stringify(data));
					console.log('updatecallback bout to fire')
					updateCallback(data);
				}
			}

			var user = cb.User();
			user.allUsers('',callback);
			
			if (currentSettings.refresh_time > 0){
				createRefreshTimer(currentSettings.refresh_time);
			}
			else {
				clearInterval(refreshTimer);
				refreshTimer = undefined;
			}

		}

		this.onDispose = function () {
			clearInterval(refreshTimer);
		    refreshTimer = undefined;
		}

		this.onSettingsChanged = function (newSettings) {
			currentSettings = newSettings;
			self.updateNow();
		}
	};

	freeboard.loadDatasourcePlugin({
		"type_name": "clearblade_users",
		"display_name": "Users",
		"settings": [
		{
			"name"         : "refresh_time",
			"display_name" : "Refresh Time",
			"type"         : "text",
			"description"  : "In milliseconds",
			"default_value": 5000
		}
				
		],
		newInstance: function (settings, newInstanceCallback, updateCallback) {
			newInstanceCallback(new clearbladeUsersDatasourcePlugin(settings, updateCallback));
		}
	});
// Original code shared in the public domain on the 'net by <anonymous>
// Further work by vjt@openssl.it - http://sindro.me/
//
function DigitalDisplay (options)
{
  var element = options.element;
  var width = options.width || 300;

  var Color = {
    placeholders: options.placeholders || 'Gray',
    digits:       options.digits       || 'Gray'
  };

  var xScale = options.xScale || 0.6;
  var yScale = options.yScale || 0.8;

  var context = TBE.GetElement2DContext (element);

  var DigitsSegments = [
    // 
    //     1
    //     --
    //  2 |  | 4
    //     --  8
    // 16 |  | 32
    //     --  
    //     64
    1 | 2 | 4 | 16 | 32 | 64,
    4 | 32,
    1 | 4 | 8 | 16 | 64,
    1 | 4 | 8 | 32 | 64,
    2 | 4 | 8 | 32,
    1 | 2 | 8 | 32 | 64,
    1 | 2 | 8 | 16 | 32 | 64,
    1 | 4 | 32,
    1 | 2 | 4 | 8 | 16 | 32 | 64,
    1 | 2 | 4 | 8 | 32 | 64
  ];

  this.clear = function ()
  {
    TBE.ClearCanvas (element);
  }
  
  this.drawNumber = function (value, len, y, height)
  {
    var segs = createSegments (height);
    var fixv = Math.round (value);
    var decv = (value - fixv) * 100;

    context.fillStyle = Color.placeholders;
    context.globalAlpha = 0.15;

    // Compute the increment for each digit.
    var incr = height * xScale;

    // offset relative to mid point of width
    var off = ((width - (incr * len)) / 2.0);

    // Draw shadow display
    for (var n = 0; n < len; n++)
    {
      drawSingleDigit (segs, 127, off, y);
      off += incr;
    }

    context.fillStyle = Color.digits;
    context.globalAlpha = 0.80;
    for (var n = 0; n < len; n++)
    {
      off -= incr;
      drawSingleDigit (segs, DigitsSegments[(fixv % 10)], off, y);
      fixv = Math.floor (fixv / 10.0);
      // Perform the check here so we output a 0
      if (fixv == 0)
        break;
    }
  }

  function drawSingleDigit (segs, bits, x, y)
  {
    for (var n = 0; n < 7; n++)
    {
      if (bits & (1 << n))
      context.fillPolygon (offsetPolygon (x, y, segs[n]));
    }
  }

  function createSegments (height)
  {
    var _x = function (xx) { return xx * height * xScale; }
    var _y = function (yy) { return yy * height * yScale; }
    var segments =
    [ // 1 Upper --
      [
        _x (0.28), _y (0.08),
        _x (1.00), _y (0.08),
        _x (0.88), _y (0.15),
        _x (0.38), _y (0.15),
        _x (0.28), _y (0.08)
      ],
      // 2 Left Upper |
      [
        _x (0.30), _y (0.49),
        _x (0.18), _y (0.52),
        _x (0.26), _y (0.10),
        _x (0.36), _y (0.17),
        _x (0.30), _y (0.49)
      ],
      // 4 Right Upper |
      [
        _x (1.00), _y (0.10),
        _x (0.93), _y (0.52),
        _x (0.84), _y (0.49),
        _x (0.90), _y (0.17),
        _x (1.00), _y (0.11)
      ],
      // 8 Middle --
      [
        _x (0.20), _y (0.54),
        _x (0.31), _y (0.50),
        _x (0.83), _y (0.50),
        _x (0.90), _y (0.54),
        _x (0.82), _y (0.56),
        _x (0.29), _y (0.56),
        _x (0.20), _y (0.54)
      ],
      // 16 Left Lower |
      [
        _x (0.22), _y (0.91),
        _x (0.10), _y (0.98),
        _x (0.17), _y (0.55),
        _x (0.28), _y (0.59),
        _x (0.22), _y (0.91)
      ],
      // 32 Right Lower |
      [
        _x (0.92), _y (0.55),
        _x (0.87), _y (0.98),
        _x (0.78), _y (0.92),
        _x (0.82), _y (0.59),
        _x (0.92), _y (0.55)
      ],
      // 64 Lower --
      [
        _x (0.74), _y (0.93),
        _x (0.84), _y (1.00),
        _x (0.13), _y (1.00),
        _x (0.22), _y (0.93),
        _x (0.74), _y (0.93)
      ]
    ];

    return segments;
  }

  function offsetPolygon (x, y, points)
  {
    var npoints = points.length;
    if (npoints & 1)
      npoints--;
    var result = new Array ();
    for (var n = 0; n < npoints / 2; n++)
    {
      result[n*2+0] = x + points[n*2+0];
      result[n*2+1] = y + points[n*2+1];
    }
    return result;
  }
}

function incrementalUpdate ()
{
  var target = speedometer.value () < speedometer.max () ?
      speedometer.max () : speedometer.min ();

  speedometer.animatedUpdate (target, 5000);
}

function randomUpdate ()
{
  var target = Math.random () * speedometer.max ();
  var time = Math.random () * 5000;

  speedometer.animatedUpdate (target, time);
}

function stopAnimation ()
{
  speedometer.stopAnimation ();
}

/* jquery.sparkline 2.1.2 - http://omnipotent.net/jquery.sparkline/
** Licensed under the New BSD License - see above site for details */

(function(a,b,c){(function(a){typeof define=="function"&&define.amd?define(["jquery"],a):jQuery&&!jQuery.fn.sparkline&&a(jQuery)})(function(d){"use strict";var e={},f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,A,B,C,D,E,F,G,H,I,J,K,L=0;f=function(){return{common:{type:"line",lineColor:"#00f",fillColor:"#cdf",defaultPixelsPerValue:3,width:"auto",height:"auto",composite:!1,tagValuesAttribute:"values",tagOptionsPrefix:"spark",enableTagOptions:!1,enableHighlight:!0,highlightLighten:1.4,tooltipSkipNull:!0,tooltipPrefix:"",tooltipSuffix:"",disableHiddenCheck:!1,numberFormatter:!1,numberDigitGroupCount:3,numberDigitGroupSep:",",numberDecimalMark:".",disableTooltips:!1,disableInteraction:!1},line:{spotColor:"#f80",highlightSpotColor:"#5f5",highlightLineColor:"#f22",spotRadius:1.5,minSpotColor:"#f80",maxSpotColor:"#f80",lineWidth:1,normalRangeMin:c,normalRangeMax:c,normalRangeColor:"#ccc",drawNormalOnTop:!1,chartRangeMin:c,chartRangeMax:c,chartRangeMinX:c,chartRangeMaxX:c,tooltipFormat:new h('<span style="color: {{color}}">&#9679;</span> {{prefix}}{{y}}{{suffix}}')},bar:{barColor:"#3366cc",negBarColor:"#f44",stackedBarColor:["#3366cc","#dc3912","#ff9900","#109618","#66aa00","#dd4477","#0099c6","#990099"],zeroColor:c,nullColor:c,zeroAxis:!0,barWidth:4,barSpacing:1,chartRangeMax:c,chartRangeMin:c,chartRangeClip:!1,colorMap:c,tooltipFormat:new h('<span style="color: {{color}}">&#9679;</span> {{prefix}}{{value}}{{suffix}}')},tristate:{barWidth:4,barSpacing:1,posBarColor:"#6f6",negBarColor:"#f44",zeroBarColor:"#999",colorMap:{},tooltipFormat:new h('<span style="color: {{color}}">&#9679;</span> {{value:map}}'),tooltipValueLookups:{map:{"-1":"Loss",0:"Draw",1:"Win"}}},discrete:{lineHeight:"auto",thresholdColor:c,thresholdValue:0,chartRangeMax:c,chartRangeMin:c,chartRangeClip:!1,tooltipFormat:new h("{{prefix}}{{value}}{{suffix}}")},bullet:{targetColor:"#f33",targetWidth:3,performanceColor:"#33f",rangeColors:["#d3dafe","#a8b6ff","#7f94ff"],base:c,tooltipFormat:new h("{{fieldkey:fields}} - {{value}}"),tooltipValueLookups:{fields:{r:"Range",p:"Performance",t:"Target"}}},pie:{offset:0,sliceColors:["#3366cc","#dc3912","#ff9900","#109618","#66aa00","#dd4477","#0099c6","#990099"],borderWidth:0,borderColor:"#000",tooltipFormat:new h('<span style="color: {{color}}">&#9679;</span> {{value}} ({{percent.1}}%)')},box:{raw:!1,boxLineColor:"#000",boxFillColor:"#cdf",whiskerColor:"#000",outlierLineColor:"#333",outlierFillColor:"#fff",medianColor:"#f00",showOutliers:!0,outlierIQR:1.5,spotRadius:1.5,target:c,targetColor:"#4a2",chartRangeMax:c,chartRangeMin:c,tooltipFormat:new h("{{field:fields}}: {{value}}"),tooltipFormatFieldlistKey:"field",tooltipValueLookups:{fields:{lq:"Lower Quartile",med:"Median",uq:"Upper Quartile",lo:"Left Outlier",ro:"Right Outlier",lw:"Left Whisker",rw:"Right Whisker"}}}}},E='.jqstooltip { position: absolute;left: 0px;top: 0px;visibility: hidden;background: rgb(0, 0, 0) transparent;background-color: rgba(0,0,0,0.6);filter:progid:DXImageTransform.Microsoft.gradient(startColorstr=#99000000, endColorstr=#99000000);-ms-filter: "progid:DXImageTransform.Microsoft.gradient(startColorstr=#99000000, endColorstr=#99000000)";color: white;font: 10px arial, san serif;text-align: left;white-space: nowrap;padding: 5px;border: 1px solid white;z-index: 10000;}.jqsfield { color: white;font: 10px arial, san serif;text-align: left;}',g=function(){var a,b;return a=function(){this.init.apply(this,arguments)},arguments.length>1?(arguments[0]?(a.prototype=d.extend(new arguments[0],arguments[arguments.length-1]),a._super=arguments[0].prototype):a.prototype=arguments[arguments.length-1],arguments.length>2&&(b=Array.prototype.slice.call(arguments,1,-1),b.unshift(a.prototype),d.extend.apply(d,b))):a.prototype=arguments[0],a.prototype.cls=a,a},d.SPFormatClass=h=g({fre:/\{\{([\w.]+?)(:(.+?))?\}\}/g,precre:/(\w+)\.(\d+)/,init:function(a,b){this.format=a,this.fclass=b},render:function(a,b,d){var e=this,f=a,g,h,i,j,k;return this.format.replace(this.fre,function(){var a;return h=arguments[1],i=arguments[3],g=e.precre.exec(h),g?(k=g[2],h=g[1]):k=!1,j=f[h],j===c?"":i&&b&&b[i]?(a=b[i],a.get?b[i].get(j)||j:b[i][j]||j):(n(j)&&(d.get("numberFormatter")?j=d.get("numberFormatter")(j):j=s(j,k,d.get("numberDigitGroupCount"),d.get("numberDigitGroupSep"),d.get("numberDecimalMark"))),j)})}}),d.spformat=function(a,b){return new h(a,b)},i=function(a,b,c){return a<b?b:a>c?c:a},j=function(a,c){var d;return c===2?(d=b.floor(a.length/2),a.length%2?a[d]:(a[d-1]+a[d])/2):a.length%2?(d=(a.length*c+c)/4,d%1?(a[b.floor(d)]+a[b.floor(d)-1])/2:a[d-1]):(d=(a.length*c+2)/4,d%1?(a[b.floor(d)]+a[b.floor(d)-1])/2:a[d-1])},k=function(a){var b;switch(a){case"undefined":a=c;break;case"null":a=null;break;case"true":a=!0;break;case"false":a=!1;break;default:b=parseFloat(a),a==b&&(a=b)}return a},l=function(a){var b,c=[];for(b=a.length;b--;)c[b]=k(a[b]);return c},m=function(a,b){var c,d,e=[];for(c=0,d=a.length;c<d;c++)a[c]!==b&&e.push(a[c]);return e},n=function(a){return!isNaN(parseFloat(a))&&isFinite(a)},s=function(a,b,c,e,f){var g,h;a=(b===!1?parseFloat(a).toString():a.toFixed(b)).split(""),g=(g=d.inArray(".",a))<0?a.length:g,g<a.length&&(a[g]=f);for(h=g-c;h>0;h-=c)a.splice(h,0,e);return a.join("")},o=function(a,b,c){var d;for(d=b.length;d--;){if(c&&b[d]===null)continue;if(b[d]!==a)return!1}return!0},p=function(a){var b=0,c;for(c=a.length;c--;)b+=typeof a[c]=="number"?a[c]:0;return b},r=function(a){return d.isArray(a)?a:[a]},q=function(b){var c;a.createStyleSheet?a.createStyleSheet().cssText=b:(c=a.createElement("style"),c.type="text/css",a.getElementsByTagName("head")[0].appendChild(c),c[typeof a.body.style.WebkitAppearance=="string"?"innerText":"innerHTML"]=b)},d.fn.simpledraw=function(b,e,f,g){var h,i;if(f&&(h=this.data("_jqs_vcanvas")))return h;if(d.fn.sparkline.canvas===!1)return!1;if(d.fn.sparkline.canvas===c){var j=a.createElement("canvas");if(!j.getContext||!j.getContext("2d")){if(!a.namespaces||!!a.namespaces.v)return d.fn.sparkline.canvas=!1,!1;a.namespaces.add("v","urn:schemas-microsoft-com:vml","#default#VML"),d.fn.sparkline.canvas=function(a,b,c,d){return new J(a,b,c)}}else d.fn.sparkline.canvas=function(a,b,c,d){return new I(a,b,c,d)}}return b===c&&(b=d(this).innerWidth()),e===c&&(e=d(this).innerHeight()),h=d.fn.sparkline.canvas(b,e,this,g),i=d(this).data("_jqs_mhandler"),i&&i.registerCanvas(h),h},d.fn.cleardraw=function(){var a=this.data("_jqs_vcanvas");a&&a.reset()},d.RangeMapClass=t=g({init:function(a){var b,c,d=[];for(b in a)a.hasOwnProperty(b)&&typeof b=="string"&&b.indexOf(":")>-1&&(c=b.split(":"),c[0]=c[0].length===0?-Infinity:parseFloat(c[0]),c[1]=c[1].length===0?Infinity:parseFloat(c[1]),c[2]=a[b],d.push(c));this.map=a,this.rangelist=d||!1},get:function(a){var b=this.rangelist,d,e,f;if((f=this.map[a])!==c)return f;if(b)for(d=b.length;d--;){e=b[d];if(e[0]<=a&&e[1]>=a)return e[2]}return c}}),d.range_map=function(a){return new t(a)},u=g({init:function(a,b){var c=d(a);this.$el=c,this.options=b,this.currentPageX=0,this.currentPageY=0,this.el=a,this.splist=[],this.tooltip=null,this.over=!1,this.displayTooltips=!b.get("disableTooltips"),this.highlightEnabled=!b.get("disableHighlight")},registerSparkline:function(a){this.splist.push(a),this.over&&this.updateDisplay()},registerCanvas:function(a){var b=d(a.canvas);this.canvas=a,this.$canvas=b,b.mouseenter(d.proxy(this.mouseenter,this)),b.mouseleave(d.proxy(this.mouseleave,this)),b.click(d.proxy(this.mouseclick,this))},reset:function(a){this.splist=[],this.tooltip&&a&&(this.tooltip.remove(),this.tooltip=c)},mouseclick:function(a){var b=d.Event("sparklineClick");b.originalEvent=a,b.sparklines=this.splist,this.$el.trigger(b)},mouseenter:function(b){d(a.body).unbind("mousemove.jqs"),d(a.body).bind("mousemove.jqs",d.proxy(this.mousemove,this)),this.over=!0,this.currentPageX=b.pageX,this.currentPageY=b.pageY,this.currentEl=b.target,!this.tooltip&&this.displayTooltips&&(this.tooltip=new v(this.options),this.tooltip.updatePosition(b.pageX,b.pageY)),this.updateDisplay()},mouseleave:function(){d(a.body).unbind("mousemove.jqs");var b=this.splist,c=b.length,e=!1,f,g;this.over=!1,this.currentEl=null,this.tooltip&&(this.tooltip.remove(),this.tooltip=null);for(g=0;g<c;g++)f=b[g],f.clearRegionHighlight()&&(e=!0);e&&this.canvas.render()},mousemove:function(a){this.currentPageX=a.pageX,this.currentPageY=a.pageY,this.currentEl=a.target,this.tooltip&&this.tooltip.updatePosition(a.pageX,a.pageY),this.updateDisplay()},updateDisplay:function(){var a=this.splist,b=a.length,c=!1,e=this.$canvas.offset(),f=this.currentPageX-e.left,g=this.currentPageY-e.top,h,i,j,k,l;if(!this.over)return;for(j=0;j<b;j++)i=a[j],k=i.setRegionHighlight(this.currentEl,f,g),k&&(c=!0);if(c){l=d.Event("sparklineRegionChange"),l.sparklines=this.splist,this.$el.trigger(l);if(this.tooltip){h="";for(j=0;j<b;j++)i=a[j],h+=i.getCurrentRegionTooltip();this.tooltip.setContent(h)}this.disableHighlight||this.canvas.render()}k===null&&this.mouseleave()}}),v=g({sizeStyle:"position: static !important;display: block !important;visibility: hidden !important;float: left !important;",init:function(b){var c=b.get("tooltipClassname","jqstooltip"),e=this.sizeStyle,f;this.container=b.get("tooltipContainer")||a.body,this.tooltipOffsetX=b.get("tooltipOffsetX",10),this.tooltipOffsetY=b.get("tooltipOffsetY",12),d("#jqssizetip").remove(),d("#jqstooltip").remove(),this.sizetip=d("<div/>",{id:"jqssizetip",style:e,"class":c}),this.tooltip=d("<div/>",{id:"jqstooltip","class":c}).appendTo(this.container),f=this.tooltip.offset(),this.offsetLeft=f.left,this.offsetTop=f.top,this.hidden=!0,d(window).unbind("resize.jqs scroll.jqs"),d(window).bind("resize.jqs scroll.jqs",d.proxy(this.updateWindowDims,this)),this.updateWindowDims()},updateWindowDims:function(){this.scrollTop=d(window).scrollTop(),this.scrollLeft=d(window).scrollLeft(),this.scrollRight=this.scrollLeft+d(window).width(),this.updatePosition()},getSize:function(a){this.sizetip.html(a).appendTo(this.container),this.width=this.sizetip.width()+1,this.height=this.sizetip.height(),this.sizetip.remove()},setContent:function(a){if(!a){this.tooltip.css("visibility","hidden"),this.hidden=!0;return}this.getSize(a),this.tooltip.html(a).css({width:this.width,height:this.height,visibility:"visible"}),this.hidden&&(this.hidden=!1,this.updatePosition())},updatePosition:function(a,b){if(a===c){if(this.mousex===c)return;a=this.mousex-this.offsetLeft,b=this.mousey-this.offsetTop}else this.mousex=a-=this.offsetLeft,this.mousey=b-=this.offsetTop;if(!this.height||!this.width||this.hidden)return;b-=this.height+this.tooltipOffsetY,a+=this.tooltipOffsetX,b<this.scrollTop&&(b=this.scrollTop),a<this.scrollLeft?a=this.scrollLeft:a+this.width>this.scrollRight&&(a=this.scrollRight-this.width),this.tooltip.css({left:a,top:b})},remove:function(){this.tooltip.remove(),this.sizetip.remove(),this.sizetip=this.tooltip=c,d(window).unbind("resize.jqs scroll.jqs")}}),F=function(){q(E)},d(F),K=[],d.fn.sparkline=function(b,e){return this.each(function(){var f=new d.fn.sparkline.options(this,e),g=d(this),h,i;h=function(){var e,h,i,j,k,l,m;if(b==="html"||b===c){m=this.getAttribute(f.get("tagValuesAttribute"));if(m===c||m===null)m=g.html();e=m.replace(/(^\s*<!--)|(-->\s*$)|\s+/g,"").split(",")}else e=b;h=f.get("width")==="auto"?e.length*f.get("defaultPixelsPerValue"):f.get("width");if(f.get("height")==="auto"){if(!f.get("composite")||!d.data(this,"_jqs_vcanvas"))j=a.createElement("span"),j.innerHTML="a",g.html(j),i=d(j).innerHeight()||d(j).height(),d(j).remove(),j=null}else i=f.get("height");f.get("disableInteraction")?k=!1:(k=d.data(this,"_jqs_mhandler"),k?f.get("composite")||k.reset():(k=new u(this,f),d.data(this,"_jqs_mhandler",k)));if(f.get("composite")&&!d.data(this,"_jqs_vcanvas")){d.data(this,"_jqs_errnotify")||(alert("Attempted to attach a composite sparkline to an element with no existing sparkline"),d.data(this,"_jqs_errnotify",!0));return}l=new(d.fn.sparkline[f.get("type")])(this,e,f,h,i),l.render(),k&&k.registerSparkline(l)};if(d(this).html()&&!f.get("disableHiddenCheck")&&d(this).is(":hidden")||!d(this).parents("body").length){if(!f.get("composite")&&d.data(this,"_jqs_pending"))for(i=K.length;i;i--)K[i-1][0]==this&&K.splice(i-1,1);K.push([this,h]),d.data(this,"_jqs_pending",!0)}else h.call(this)})},d.fn.sparkline.defaults=f(),d.sparkline_display_visible=function(){var a,b,c,e=[];for(b=0,c=K.length;b<c;b++)a=K[b][0],d(a).is(":visible")&&!d(a).parents().is(":hidden")?(K[b][1].call(a),d.data(K[b][0],"_jqs_pending",!1),e.push(b)):!d(a).closest("html").length&&!d.data(a,"_jqs_pending")&&(d.data(K[b][0],"_jqs_pending",!1),e.push(b));for(b=e.length;b;b--)K.splice(e[b-1],1)},d.fn.sparkline.options=g({init:function(a,b){var c,f,g,h;this.userOptions=b=b||{},this.tag=a,this.tagValCache={},f=d.fn.sparkline.defaults,g=f.common,this.tagOptionsPrefix=b.enableTagOptions&&(b.tagOptionsPrefix||g.tagOptionsPrefix),h=this.getTagSetting("type"),h===e?c=f[b.type||g.type]:c=f[h],this.mergedOptions=d.extend({},g,c,b)},getTagSetting:function(a){var b=this.tagOptionsPrefix,d,f,g,h;if(b===!1||b===c)return e;if(this.tagValCache.hasOwnProperty(a))d=this.tagValCache.key;else{d=this.tag.getAttribute(b+a);if(d===c||d===null)d=e;else if(d.substr(0,1)==="["){d=d.substr(1,d.length-2).split(",");for(f=d.length;f--;)d[f]=k(d[f].replace(/(^\s*)|(\s*$)/g,""))}else if(d.substr(0,1)==="{"){g=d.substr(1,d.length-2).split(","),d={};for(f=g.length;f--;)h=g[f].split(":",2),d[h[0].replace(/(^\s*)|(\s*$)/g,"")]=k(h[1].replace(/(^\s*)|(\s*$)/g,""))}else d=k(d);this.tagValCache.key=d}return d},get:function(a,b){var d=this.getTagSetting(a),f;return d!==e?d:(f=this.mergedOptions[a])===c?b:f}}),d.fn.sparkline._base=g({disabled:!1,init:function(a,b,e,f,g){this.el=a,this.$el=d(a),this.values=b,this.options=e,this.width=f,this.height=g,this.currentRegion=c},initTarget:function(){var a=!this.options.get("disableInteraction");(this.target=this.$el.simpledraw(this.width,this.height,this.options.get("composite"),a))?(this.canvasWidth=this.target.pixelWidth,this.canvasHeight=this.target.pixelHeight):this.disabled=!0},render:function(){return this.disabled?(this.el.innerHTML="",!1):!0},getRegion:function(a,b){},setRegionHighlight:function(a,b,d){var e=this.currentRegion,f=!this.options.get("disableHighlight"),g;return b>this.canvasWidth||d>this.canvasHeight||b<0||d<0?null:(g=this.getRegion(a,b,d),e!==g?(e!==c&&f&&this.removeHighlight(),this.currentRegion=g,g!==c&&f&&this.renderHighlight(),!0):!1)},clearRegionHighlight:function(){return this.currentRegion!==c?(this.removeHighlight(),this.currentRegion=c,!0):!1},renderHighlight:function(){this.changeHighlight(!0)},removeHighlight:function(){this.changeHighlight(!1)},changeHighlight:function(a){},getCurrentRegionTooltip:function(){var a=this.options,b="",e=[],f,g,i,j,k,l,m,n,o,p,q,r,s,t;if(this.currentRegion===c)return"";f=this.getCurrentRegionFields(),q=a.get("tooltipFormatter");if(q)return q(this,a,f);a.get("tooltipChartTitle")&&(b+='<div class="jqs jqstitle">'+a.get("tooltipChartTitle")+"</div>\n"),g=this.options.get("tooltipFormat");if(!g)return"";d.isArray(g)||(g=[g]),d.isArray(f)||(f=[f]),m=this.options.get("tooltipFormatFieldlist"),n=this.options.get("tooltipFormatFieldlistKey");if(m&&n){o=[];for(l=f.length;l--;)p=f[l][n],(t=d.inArray(p,m))!=-1&&(o[t]=f[l]);f=o}i=g.length,s=f.length;for(l=0;l<i;l++){r=g[l],typeof r=="string"&&(r=new h(r)),j=r.fclass||"jqsfield";for(t=0;t<s;t++)if(!f[t].isNull||!a.get("tooltipSkipNull"))d.extend(f[t],{prefix:a.get("tooltipPrefix"),suffix:a.get("tooltipSuffix")}),k=r.render(f[t],a.get("tooltipValueLookups"),a),e.push('<div class="'+j+'">'+k+"</div>")}return e.length?b+e.join("\n"):""},getCurrentRegionFields:function(){},calcHighlightColor:function(a,c){var d=c.get("highlightColor"),e=c.get("highlightLighten"),f,g,h,j;if(d)return d;if(e){f=/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(a)||/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(a);if(f){h=[],g=a.length===4?16:1;for(j=0;j<3;j++)h[j]=i(b.round(parseInt(f[j+1],16)*g*e),0,255);return"rgb("+h.join(",")+")"}}return a}}),w={changeHighlight:function(a){var b=this.currentRegion,c=this.target,e=this.regionShapes[b],f;e&&(f=this.renderRegion(b,a),d.isArray(f)||d.isArray(e)?(c.replaceWithShapes(e,f),this.regionShapes[b]=d.map(f,function(a){return a.id})):(c.replaceWithShape(e,f),this.regionShapes[b]=f.id))},render:function(){var a=this.values,b=this.target,c=this.regionShapes,e,f,g,h;if(!this.cls._super.render.call(this))return;for(g=a.length;g--;){e=this.renderRegion(g);if(e)if(d.isArray(e)){f=[];for(h=e.length;h--;)e[h].append(),f.push(e[h].id);c[g]=f}else e.append(),c[g]=e.id;else c[g]=null}b.render()}},d.fn.sparkline.line=x=g(d.fn.sparkline._base,{type:"line",init:function(a,b,c,d,e){x._super.init.call(this,a,b,c,d,e),this.vertices=[],this.regionMap=[],this.xvalues=[],this.yvalues=[],this.yminmax=[],this.hightlightSpotId=null,this.lastShapeId=null,this.initTarget()},getRegion:function(a,b,d){var e,f=this.regionMap;for(e=f.length;e--;)if(f[e]!==null&&b>=f[e][0]&&b<=f[e][1])return f[e][2];return c},getCurrentRegionFields:function(){var a=this.currentRegion;return{isNull:this.yvalues[a]===null,x:this.xvalues[a],y:this.yvalues[a],color:this.options.get("lineColor"),fillColor:this.options.get("fillColor"),offset:a}},renderHighlight:function(){var a=this.currentRegion,b=this.target,d=this.vertices[a],e=this.options,f=e.get("spotRadius"),g=e.get("highlightSpotColor"),h=e.get("highlightLineColor"),i,j;if(!d)return;f&&g&&(i=b.drawCircle(d[0],d[1],f,c,g),this.highlightSpotId=i.id,b.insertAfterShape(this.lastShapeId,i)),h&&(j=b.drawLine(d[0],this.canvasTop,d[0],this.canvasTop+this.canvasHeight,h),this.highlightLineId=j.id,b.insertAfterShape(this.lastShapeId,j))},removeHighlight:function(){var a=this.target;this.highlightSpotId&&(a.removeShapeId(this.highlightSpotId),this.highlightSpotId=null),this.highlightLineId&&(a.removeShapeId(this.highlightLineId),this.highlightLineId=null)},scanValues:function(){var a=this.values,c=a.length,d=this.xvalues,e=this.yvalues,f=this.yminmax,g,h,i,j,k;for(g=0;g<c;g++)h=a[g],i=typeof a[g]=="string",j=typeof a[g]=="object"&&a[g]instanceof Array,k=i&&a[g].split(":"),i&&k.length===2?(d.push(Number(k[0])),e.push(Number(k[1])),f.push(Number(k[1]))):j?(d.push(h[0]),e.push(h[1]),f.push(h[1])):(d.push(g),a[g]===null||a[g]==="null"?e.push(null):(e.push(Number(h)),f.push(Number(h))));this.options.get("xvalues")&&(d=this.options.get("xvalues")),this.maxy=this.maxyorg=b.max.apply(b,f),this.miny=this.minyorg=b.min.apply(b,f),this.maxx=b.max.apply(b,d),this.minx=b.min.apply(b,d),this.xvalues=d,this.yvalues=e,this.yminmax=f},processRangeOptions:function(){var a=this.options,b=a.get("normalRangeMin"),d=a.get("normalRangeMax");b!==c&&(b<this.miny&&(this.miny=b),d>this.maxy&&(this.maxy=d)),a.get("chartRangeMin")!==c&&(a.get("chartRangeClip")||a.get("chartRangeMin")<this.miny)&&(this.miny=a.get("chartRangeMin")),a.get("chartRangeMax")!==c&&(a.get("chartRangeClip")||a.get("chartRangeMax")>this.maxy)&&(this.maxy=a.get("chartRangeMax")),a.get("chartRangeMinX")!==c&&(a.get("chartRangeClipX")||a.get("chartRangeMinX")<this.minx)&&(this.minx=a.get("chartRangeMinX")),a.get("chartRangeMaxX")!==c&&(a.get("chartRangeClipX")||a.get("chartRangeMaxX")>this.maxx)&&(this.maxx=a.get("chartRangeMaxX"))},drawNormalRange:function(a,d,e,f,g){var h=this.options.get("normalRangeMin"),i=this.options.get("normalRangeMax"),j=d+b.round(e-e*((i-this.miny)/g)),k=b.round(e*(i-h)/g);this.target.drawRect(a,j,f,k,c,this.options.get("normalRangeColor")).append()},render:function(){var a=this.options,e=this.target,f=this.canvasWidth,g=this.canvasHeight,h=this.vertices,i=a.get("spotRadius"),j=this.regionMap,k,l,m,n,o,p,q,r,s,u,v,w,y,z,A,B,C,D,E,F,G,H,I,J,K;if(!x._super.render.call(this))return;this.scanValues(),this.processRangeOptions(),I=this.xvalues,J=this.yvalues;if(!this.yminmax.length||this.yvalues.length<2)return;n=o=0,k=this.maxx-this.minx===0?1:this.maxx-this.minx,l=this.maxy-this.miny===0?1:this.maxy-this.miny,m=this.yvalues.length-1,i&&(f<i*4||g<i*4)&&(i=0);if(i){G=a.get("highlightSpotColor")&&!a.get("disableInteraction");if(G||a.get("minSpotColor")||a.get("spotColor")&&J[m]===this.miny)g-=b.ceil(i);if(G||a.get("maxSpotColor")||a.get("spotColor")&&J[m]===this.maxy)g-=b.ceil(i),n+=b.ceil(i);if(G||(a.get("minSpotColor")||a.get("maxSpotColor"))&&(J[0]===this.miny||J[0]===this.maxy))o+=b.ceil(i),f-=b.ceil(i);if(G||a.get("spotColor")||a.get("minSpotColor")||a.get("maxSpotColor")&&(J[m]===this.miny||J[m]===this.maxy))f-=b.ceil(i)}g--,a.get("normalRangeMin")!==c&&!a.get("drawNormalOnTop")&&this.drawNormalRange(o,n,g,f,l),q=[],r=[q],z=A=null,B=J.length;for(K=0;K<B;K++)s=I[K],v=I[K+1],u=J[K],w=o+b.round((s-this.minx)*(f/k)),y=K<B-1?o+b.round((v-this.minx)*(f/k)):f,A=w+(y-w)/2,j[K]=[z||0,A,K],z=A,u===null?K&&(J[K-1]!==null&&(q=[],r.push(q)),h.push(null)):(u<this.miny&&(u=this.miny),u>this.maxy&&(u=this.maxy),q.length||q.push([w,n+g]),p=[w,n+b.round(g-g*((u-this.miny)/l))],q.push(p),h.push(p));C=[],D=[],E=r.length;for(K=0;K<E;K++)q=r[K],q.length&&(a.get("fillColor")&&(q.push([q[q.length-1][0],n+g]),D.push(q.slice(0)),q.pop()),q.length>2&&(q[0]=[q[0][0],q[1][1]]),C.push(q));E=D.length;for(K=0;K<E;K++)e.drawShape(D[K],a.get("fillColor"),a.get("fillColor")).append();a.get("normalRangeMin")!==c&&a.get("drawNormalOnTop")&&this.drawNormalRange(o,n,g,f,l),E=C.length;for(K=0;K<E;K++)e.drawShape(C[K],a.get("lineColor"),c,a.get("lineWidth")).append();if(i&&a.get("valueSpots")){F=a.get("valueSpots"),F.get===c&&(F=new t(F));for(K=0;K<B;K++)H=F.get(J[K]),H&&e.drawCircle(o+b.round((I[K]-this.minx)*(f/k)),n+b.round(g-g*((J[K]-this.miny)/l)),i,c,H).append()}i&&a.get("spotColor")&&J[m]!==null&&e.drawCircle(o+b.round((I[I.length-1]-this.minx)*(f/k)),n+b.round(g-g*((J[m]-this.miny)/l)),i,c,a.get("spotColor")).append(),this.maxy!==this.minyorg&&(i&&a.get("minSpotColor")&&(s=I[d.inArray(this.minyorg,J)],e.drawCircle(o+b.round((s-this.minx)*(f/k)),n+b.round(g-g*((this.minyorg-this.miny)/l)),i,c,a.get("minSpotColor")).append()),i&&a.get("maxSpotColor")&&(s=I[d.inArray(this.maxyorg,J)],e.drawCircle(o+b.round((s-this.minx)*(f/k)),n+b.round(g-g*((this.maxyorg-this.miny)/l)),i,c,a.get("maxSpotColor")).append())),this.lastShapeId=e.getLastShapeId(),this.canvasTop=n,e.render()}}),d.fn.sparkline.bar=y=g(d.fn.sparkline._base,w,{type:"bar",init:function(a,e,f,g,h){var j=parseInt(f.get("barWidth"),10),n=parseInt(f.get("barSpacing"),10),o=f.get("chartRangeMin"),p=f.get("chartRangeMax"),q=f.get("chartRangeClip"),r=Infinity,s=-Infinity,u,v,w,x,z,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R;y._super.init.call(this,a,e,f,g,h);for(A=0,B=e.length;A<B;A++){O=e[A],u=typeof O=="string"&&O.indexOf(":")>-1;if(u||d.isArray(O))J=!0,u&&(O=e[A]=l(O.split(":"))),O=m(O,null),v=b.min.apply(b,O),w=b.max.apply(b,O),v<r&&(r=v),w>s&&(s=w)}this.stacked=J,this.regionShapes={},this.barWidth=j,this.barSpacing=n,this.totalBarWidth=j+n,this.width=g=e.length*j+(e.length-1)*n,this.initTarget(),q&&(H=o===c?-Infinity:o,I=p===c?Infinity:p),z=[],x=J?[]:z;var S=[],T=[];for(A=0,B=e.length;A<B;A++)if(J){K=e[A],e[A]=N=[],S[A]=0,x[A]=T[A]=0;for(L=0,M=K.length;L<M;L++)O=N[L]=q?i(K[L],H,I):K[L],O!==null&&(O>0&&(S[A]+=O),r<0&&s>0?O<0?T[A]+=b.abs(O):x[A]+=O:x[A]+=b.abs(O-(O<0?s:r)),z.push(O))}else O=q?i(e[A],H,I):e[A],O=e[A]=k(O),O!==null&&z.push(O);this.max=G=b.max.apply(b,z),this.min=F=b.min.apply(b,z),this.stackMax=s=J?b.max.apply(b,S):G,this.stackMin=r=J?b.min.apply(b,z):F,f.get("chartRangeMin")!==c&&(f.get("chartRangeClip")||f.get("chartRangeMin")<F)&&(F=f.get("chartRangeMin")),f.get("chartRangeMax")!==c&&(f.get("chartRangeClip")||f.get("chartRangeMax")>G)&&(G=f.get("chartRangeMax")),this.zeroAxis=D=f.get("zeroAxis",!0),F<=0&&G>=0&&D?E=0:D==0?E=F:F>0?E=F:E=G,this.xaxisOffset=E,C=J?b.max.apply(b,x)+b.max.apply(b,T):G-F,this.canvasHeightEf=D&&F<0?this.canvasHeight-2:this.canvasHeight-1,F<E?(Q=J&&G>=0?s:G,P=(Q-E)/C*this.canvasHeight,P!==b.ceil(P)&&(this.canvasHeightEf-=2,P=b.ceil(P))):P=this.canvasHeight,this.yoffset=P,d.isArray(f.get("colorMap"))?(this.colorMapByIndex=f.get("colorMap"),this.colorMapByValue=null):(this.colorMapByIndex=null,this.colorMapByValue=f.get("colorMap"),this.colorMapByValue&&this.colorMapByValue.get===c&&(this.colorMapByValue=new t(this.colorMapByValue))),this.range=C},getRegion:function(a,d,e){var f=b.floor(d/this.totalBarWidth);return f<0||f>=this.values.length?c:f},getCurrentRegionFields:function(){var a=this.currentRegion,b=r(this.values[a]),c=[],d,e;for(e=b.length;e--;)d=b[e],c.push({isNull:d===null,value:d,color:this.calcColor(e,d,a),offset:a});return c},calcColor:function(a,b,e){var f=this.colorMapByIndex,g=this.colorMapByValue,h=this.options,i,j;return this.stacked?i=h.get("stackedBarColor"):i=b<0?h.get("negBarColor"):h.get("barColor"),b===0&&h.get("zeroColor")!==c&&(i=h.get("zeroColor")),g&&(j=g.get(b))?i=j:f&&f.length>e&&(i=f[e]),d.isArray(i)?i[a%i.length]:i},renderRegion:function(a,e){var f=this.values[a],g=this.options,h=this.xaxisOffset,i=[],j=this.range,k=this.stacked,l=this.target,m=a*this.totalBarWidth,n=this.canvasHeightEf,p=this.yoffset,q,r,s,t,u,v,w,x,y,z;f=d.isArray(f)?f:[f],w=f.length,x=f[0],t=o(null,f),z=o(h,f,!0);if(t)return g.get("nullColor")?(s=e?g.get("nullColor"):this.calcHighlightColor(g.get("nullColor"),g),q=p>0?p-1:p,l.drawRect(m,q,this.barWidth-1,0,s,s)):c;u=p;for(v=0;v<w;v++){x=f[v];if(k&&x===h){if(!z||y)continue;y=!0}j>0?r=b.floor(n*(b.abs(x-h)/j))+1:r=1,x<h||x===h&&p===0?(q=u,u+=r):(q=p-r,p-=r),s=this.calcColor(v,x,a),e&&(s=this.calcHighlightColor(s,g)),i.push(l.drawRect(m,q,this.barWidth-1,r-1,s,s))}return i.length===1?i[0]:i}}),d.fn.sparkline.tristate=z=g(d.fn.sparkline._base,w,{type:"tristate",init:function(a,b,e,f,g){var h=parseInt(e.get("barWidth"),10),i=parseInt(e.get("barSpacing"),10);z._super.init.call(this,a,b,e,f,g),this.regionShapes={},this.barWidth=h,this.barSpacing=i,this.totalBarWidth=h+i,this.values=d.map(b,Number),this.width=f=b.length*h+(b.length-1)*i,d.isArray(e.get("colorMap"))?(this.colorMapByIndex=e.get("colorMap"),this.colorMapByValue=null):(this.colorMapByIndex=null,this.colorMapByValue=e.get("colorMap"),this.colorMapByValue&&this.colorMapByValue.get===c&&(this.colorMapByValue=new t(this.colorMapByValue))),this.initTarget()},getRegion:function(a,c,d){return b.floor(c/this.totalBarWidth)},getCurrentRegionFields:function(){var a=this.currentRegion;return{isNull:this.values[a]===c,value:this.values[a],color:this.calcColor(this.values[a],a),offset:a}},calcColor:function(a,b){var c=this.values,d=this.options,e=this.colorMapByIndex,f=this.colorMapByValue,g,h;return f&&(h=f.get(a))?g=h:e&&e.length>b?g=e[b]:c[b]<0?g=d.get("negBarColor"):c[b]>0?g=d.get("posBarColor"):g=d.get("zeroBarColor"),g},renderRegion:function(a,c){var d=this.values,e=this.options,f=this.target,g,h,i,j,k,l;g=f.pixelHeight,i=b.round(g/2),j=a*this.totalBarWidth,d[a]<0?(k=i,h=i-1):d[a]>0?(k=0,h=i-1):(k=i-1,h=2),l=this.calcColor(d[a],a);if(l===null)return;return c&&(l=this.calcHighlightColor(l,e)),f.drawRect(j,k,this.barWidth-1,h-1,l,l)}}),d.fn.sparkline.discrete=A=g(d.fn.sparkline._base,w,{type:"discrete",init:function(a,e,f,g,h){A._super.init.call(this,a,e,f,g,h),this.regionShapes={},this.values=e=d.map(e,Number),this.min=b.min.apply(b,e),this.max=b.max.apply(b,e),this.range=this.max-this.min,this.width=g=f.get("width")==="auto"?e.length*2:this.width,this.interval=b.floor(g/e.length),this.itemWidth=g/e.length,f.get("chartRangeMin")!==c&&(f.get("chartRangeClip")||f.get("chartRangeMin")<this.min)&&(this.min=f.get("chartRangeMin")),f.get("chartRangeMax")!==c&&(f.get("chartRangeClip")||f.get("chartRangeMax")>this.max)&&(this.max=f.get("chartRangeMax")),this.initTarget(),this.target&&(this.lineHeight=f.get("lineHeight")==="auto"?b.round(this.canvasHeight*.3):f.get("lineHeight"))},getRegion:function(a,c,d){return b.floor(c/this.itemWidth)},getCurrentRegionFields:function(){var a=this.currentRegion;return{isNull:this.values[a]===c,value:this.values[a],offset:a}},renderRegion:function(a,c){var d=this.values,e=this.options,f=this.min,g=this.max,h=this.range,j=this.interval,k=this.target,l=this.canvasHeight,m=this.lineHeight,n=l-m,o,p,q,r;return p=i(d[a],f,g),r=a*j,o=b.round(n-n*((p-f)/h)),q=e.get("thresholdColor")&&p<e.get("thresholdValue")?e.get("thresholdColor"):e.get("lineColor"),c&&(q=this.calcHighlightColor(q,e)),k.drawLine(r,o,r,o+m,q)}}),d.fn.sparkline.bullet=B=g(d.fn.sparkline._base,{type:"bullet",init:function(a,d,e,f,g){var h,i,j;B._super.init.call(this,a,d,e,f,g),this.values=d=l(d),j=d.slice(),j[0]=j[0]===null?j[2]:j[0],j[1]=d[1]===null?j[2]:j[1],h=b.min.apply(b,d),i=b.max.apply(b,d),e.get("base")===c?h=h<0?h:0:h=e.get("base"),this.min=h,this.max=i,this.range=i-h,this.shapes={},this.valueShapes={},this.regiondata={},this.width=f=e.get("width")==="auto"?"4.0em":f,this.target=this.$el.simpledraw(f,g,e.get("composite")),d.length||(this.disabled=!0),this.initTarget()},getRegion:function(a,b,d){var e=this.target.getShapeAt(a,b,d);return e!==c&&this.shapes[e]!==c?this.shapes[e]:c},getCurrentRegionFields:function(){var a=this.currentRegion;return{fieldkey:a.substr(0,1),value:this.values[a.substr(1)],region:a}},changeHighlight:function(a){var b=this.currentRegion,c=this.valueShapes[b],d;delete this.shapes[c];switch(b.substr(0,1)){case"r":d=this.renderRange(b.substr(1),a);break;case"p":d=this.renderPerformance(a);break;case"t":d=this.renderTarget(a)}this.valueShapes[b]=d.id,this.shapes[d.id]=b,this.target.replaceWithShape(c,d)},renderRange:function(a,c){var d=this.values[a],e=b.round(this.canvasWidth*((d-this.min)/this.range)),f=this.options.get("rangeColors")[a-2];return c&&(f=this.calcHighlightColor(f,this.options)),this.target.drawRect(0,0,e-1,this.canvasHeight-1,f,f)},renderPerformance:function(a){var c=this.values[1],d=b.round(this.canvasWidth*((c-this.min)/this.range)),e=this.options.get("performanceColor");return a&&(e=this.calcHighlightColor(e,this.options)),this.target.drawRect(0,b.round(this.canvasHeight*.3),d-1,b.round(this.canvasHeight*.4)-1,e,e)},renderTarget:function(a){var c=this.values[0],d=b.round(this.canvasWidth*((c-this.min)/this.range)-this.options.get("targetWidth")/2),e=b.round(this.canvasHeight*.1),f=this.canvasHeight-e*2,g=this.options.get("targetColor");return a&&(g=this.calcHighlightColor(g,this.options)),this.target.drawRect(d,e,this.options.get("targetWidth")-1,f-1,g,g)},render:function(){var a=this.values.length,b=this.target,c,d;if(!B._super.render.call(this))return;for(c=2;c<a;c++)d=this.renderRange(c).append(),this.shapes[d.id]="r"+c,this.valueShapes["r"+c]=d.id;this.values[1]!==null&&(d=this.renderPerformance().append(),this.shapes[d.id]="p1",this.valueShapes.p1=d.id),this.values[0]!==null&&(d=this.renderTarget().append(),this.shapes[d.id]="t0",this.valueShapes.t0=d.id),b.render()}}),d.fn.sparkline.pie=C=g(d.fn.sparkline._base,{type:"pie",init:function(a,c,e,f,g){var h=0,i;C._super.init.call(this,a,c,e,f,g),this.shapes={},this.valueShapes={},this.values=c=d.map(c,Number),e.get("width")==="auto"&&(this.width=this.height);if(c.length>0)for(i=c.length;i--;)h+=c[i];this.total=h,this.initTarget(),this.radius=b.floor(b.min(this.canvasWidth,this.canvasHeight)/2)},getRegion:function(a,b,d){var e=this.target.getShapeAt(a,b,d);return e!==c&&this.shapes[e]!==c?this.shapes[e]:c},getCurrentRegionFields:function(){var a=this.currentRegion;return{isNull:this.values[a]===c,value:this.values[a],percent:this.values[a]/this.total*100,color:this.options.get("sliceColors")[a%this.options.get("sliceColors").length],offset:a}},changeHighlight:function(a){var b=this.currentRegion,c=this.renderSlice(b,a),d=this.valueShapes[b];delete this.shapes[d],this.target.replaceWithShape(d,c),this.valueShapes[b]=c.id,this.shapes[c.id]=b},renderSlice:function(a,d){var e=this.target,f=this.options,g=this.radius,h=f.get("borderWidth"),i=f.get("offset"),j=2*b.PI,k=this.values,l=this.total,m=i?2*b.PI*(i/360):0,n,o,p,q,r;q=k.length;for(p=0;p<q;p++){n=m,o=m,l>0&&(o=m+j*(k[p]/l));if(a===p)return r=f.get("sliceColors")[p%f.get("sliceColors").length],d&&(r=this.calcHighlightColor(r,f)),e.drawPieSlice(g,g,g-h,n,o,c,r);m=o}},render:function(){var a=this.target,d=this.values,e=this.options,f=this.radius,g=e.get("borderWidth"),h,i;if(!C._super.render.call(this))return;g&&a.drawCircle(f,f,b.floor(f-g/2),e.get("borderColor"),c,g).append();for(i=d.length;i--;)d[i]&&(h=this.renderSlice(i).append(),this.valueShapes[i]=h.id,this.shapes[h.id]=i);a.render()}}),d.fn.sparkline.box=D=g(d.fn.sparkline._base,{type:"box",init:function(a,b,c,e,f){D._super.init.call(this,a,b,c,e,f),this.values=d.map(b,Number),this.width=c.get("width")==="auto"?"4.0em":e,this.initTarget(),this.values.length||(this.disabled=1)},getRegion:function(){return 1},getCurrentRegionFields:function(){var a=[{field:"lq",value:this.quartiles[0]},{field:"med",value:this.quartiles
[1]},{field:"uq",value:this.quartiles[2]}];return this.loutlier!==c&&a.push({field:"lo",value:this.loutlier}),this.routlier!==c&&a.push({field:"ro",value:this.routlier}),this.lwhisker!==c&&a.push({field:"lw",value:this.lwhisker}),this.rwhisker!==c&&a.push({field:"rw",value:this.rwhisker}),a},render:function(){var a=this.target,d=this.values,e=d.length,f=this.options,g=this.canvasWidth,h=this.canvasHeight,i=f.get("chartRangeMin")===c?b.min.apply(b,d):f.get("chartRangeMin"),k=f.get("chartRangeMax")===c?b.max.apply(b,d):f.get("chartRangeMax"),l=0,m,n,o,p,q,r,s,t,u,v,w;if(!D._super.render.call(this))return;if(f.get("raw"))f.get("showOutliers")&&d.length>5?(n=d[0],m=d[1],p=d[2],q=d[3],r=d[4],s=d[5],t=d[6]):(m=d[0],p=d[1],q=d[2],r=d[3],s=d[4]);else{d.sort(function(a,b){return a-b}),p=j(d,1),q=j(d,2),r=j(d,3),o=r-p;if(f.get("showOutliers")){m=s=c;for(u=0;u<e;u++)m===c&&d[u]>p-o*f.get("outlierIQR")&&(m=d[u]),d[u]<r+o*f.get("outlierIQR")&&(s=d[u]);n=d[0],t=d[e-1]}else m=d[0],s=d[e-1]}this.quartiles=[p,q,r],this.lwhisker=m,this.rwhisker=s,this.loutlier=n,this.routlier=t,w=g/(k-i+1),f.get("showOutliers")&&(l=b.ceil(f.get("spotRadius")),g-=2*b.ceil(f.get("spotRadius")),w=g/(k-i+1),n<m&&a.drawCircle((n-i)*w+l,h/2,f.get("spotRadius"),f.get("outlierLineColor"),f.get("outlierFillColor")).append(),t>s&&a.drawCircle((t-i)*w+l,h/2,f.get("spotRadius"),f.get("outlierLineColor"),f.get("outlierFillColor")).append()),a.drawRect(b.round((p-i)*w+l),b.round(h*.1),b.round((r-p)*w),b.round(h*.8),f.get("boxLineColor"),f.get("boxFillColor")).append(),a.drawLine(b.round((m-i)*w+l),b.round(h/2),b.round((p-i)*w+l),b.round(h/2),f.get("lineColor")).append(),a.drawLine(b.round((m-i)*w+l),b.round(h/4),b.round((m-i)*w+l),b.round(h-h/4),f.get("whiskerColor")).append(),a.drawLine(b.round((s-i)*w+l),b.round(h/2),b.round((r-i)*w+l),b.round(h/2),f.get("lineColor")).append(),a.drawLine(b.round((s-i)*w+l),b.round(h/4),b.round((s-i)*w+l),b.round(h-h/4),f.get("whiskerColor")).append(),a.drawLine(b.round((q-i)*w+l),b.round(h*.1),b.round((q-i)*w+l),b.round(h*.9),f.get("medianColor")).append(),f.get("target")&&(v=b.ceil(f.get("spotRadius")),a.drawLine(b.round((f.get("target")-i)*w+l),b.round(h/2-v),b.round((f.get("target")-i)*w+l),b.round(h/2+v),f.get("targetColor")).append(),a.drawLine(b.round((f.get("target")-i)*w+l-v),b.round(h/2),b.round((f.get("target")-i)*w+l+v),b.round(h/2),f.get("targetColor")).append()),a.render()}}),G=g({init:function(a,b,c,d){this.target=a,this.id=b,this.type=c,this.args=d},append:function(){return this.target.appendShape(this),this}}),H=g({_pxregex:/(\d+)(px)?\s*$/i,init:function(a,b,c){if(!a)return;this.width=a,this.height=b,this.target=c,this.lastShapeId=null,c[0]&&(c=c[0]),d.data(c,"_jqs_vcanvas",this)},drawLine:function(a,b,c,d,e,f){return this.drawShape([[a,b],[c,d]],e,f)},drawShape:function(a,b,c,d){return this._genShape("Shape",[a,b,c,d])},drawCircle:function(a,b,c,d,e,f){return this._genShape("Circle",[a,b,c,d,e,f])},drawPieSlice:function(a,b,c,d,e,f,g){return this._genShape("PieSlice",[a,b,c,d,e,f,g])},drawRect:function(a,b,c,d,e,f){return this._genShape("Rect",[a,b,c,d,e,f])},getElement:function(){return this.canvas},getLastShapeId:function(){return this.lastShapeId},reset:function(){alert("reset not implemented")},_insert:function(a,b){d(b).html(a)},_calculatePixelDims:function(a,b,c){var e;e=this._pxregex.exec(b),e?this.pixelHeight=e[1]:this.pixelHeight=d(c).height(),e=this._pxregex.exec(a),e?this.pixelWidth=e[1]:this.pixelWidth=d(c).width()},_genShape:function(a,b){var c=L++;return b.unshift(c),new G(this,c,a,b)},appendShape:function(a){alert("appendShape not implemented")},replaceWithShape:function(a,b){alert("replaceWithShape not implemented")},insertAfterShape:function(a,b){alert("insertAfterShape not implemented")},removeShapeId:function(a){alert("removeShapeId not implemented")},getShapeAt:function(a,b,c){alert("getShapeAt not implemented")},render:function(){alert("render not implemented")}}),I=g(H,{init:function(b,e,f,g){I._super.init.call(this,b,e,f),this.canvas=a.createElement("canvas"),f[0]&&(f=f[0]),d.data(f,"_jqs_vcanvas",this),d(this.canvas).css({display:"inline-block",width:b,height:e,verticalAlign:"top"}),this._insert(this.canvas,f),this._calculatePixelDims(b,e,this.canvas),this.canvas.width=this.pixelWidth,this.canvas.height=this.pixelHeight,this.interact=g,this.shapes={},this.shapeseq=[],this.currentTargetShapeId=c,d(this.canvas).css({width:this.pixelWidth,height:this.pixelHeight})},_getContext:function(a,b,d){var e=this.canvas.getContext("2d");return a!==c&&(e.strokeStyle=a),e.lineWidth=d===c?1:d,b!==c&&(e.fillStyle=b),e},reset:function(){var a=this._getContext();a.clearRect(0,0,this.pixelWidth,this.pixelHeight),this.shapes={},this.shapeseq=[],this.currentTargetShapeId=c},_drawShape:function(a,b,d,e,f){var g=this._getContext(d,e,f),h,i;g.beginPath(),g.moveTo(b[0][0]+.5,b[0][1]+.5);for(h=1,i=b.length;h<i;h++)g.lineTo(b[h][0]+.5,b[h][1]+.5);d!==c&&g.stroke(),e!==c&&g.fill(),this.targetX!==c&&this.targetY!==c&&g.isPointInPath(this.targetX,this.targetY)&&(this.currentTargetShapeId=a)},_drawCircle:function(a,d,e,f,g,h,i){var j=this._getContext(g,h,i);j.beginPath(),j.arc(d,e,f,0,2*b.PI,!1),this.targetX!==c&&this.targetY!==c&&j.isPointInPath(this.targetX,this.targetY)&&(this.currentTargetShapeId=a),g!==c&&j.stroke(),h!==c&&j.fill()},_drawPieSlice:function(a,b,d,e,f,g,h,i){var j=this._getContext(h,i);j.beginPath(),j.moveTo(b,d),j.arc(b,d,e,f,g,!1),j.lineTo(b,d),j.closePath(),h!==c&&j.stroke(),i&&j.fill(),this.targetX!==c&&this.targetY!==c&&j.isPointInPath(this.targetX,this.targetY)&&(this.currentTargetShapeId=a)},_drawRect:function(a,b,c,d,e,f,g){return this._drawShape(a,[[b,c],[b+d,c],[b+d,c+e],[b,c+e],[b,c]],f,g)},appendShape:function(a){return this.shapes[a.id]=a,this.shapeseq.push(a.id),this.lastShapeId=a.id,a.id},replaceWithShape:function(a,b){var c=this.shapeseq,d;this.shapes[b.id]=b;for(d=c.length;d--;)c[d]==a&&(c[d]=b.id);delete this.shapes[a]},replaceWithShapes:function(a,b){var c=this.shapeseq,d={},e,f,g;for(f=a.length;f--;)d[a[f]]=!0;for(f=c.length;f--;)e=c[f],d[e]&&(c.splice(f,1),delete this.shapes[e],g=f);for(f=b.length;f--;)c.splice(g,0,b[f].id),this.shapes[b[f].id]=b[f]},insertAfterShape:function(a,b){var c=this.shapeseq,d;for(d=c.length;d--;)if(c[d]===a){c.splice(d+1,0,b.id),this.shapes[b.id]=b;return}},removeShapeId:function(a){var b=this.shapeseq,c;for(c=b.length;c--;)if(b[c]===a){b.splice(c,1);break}delete this.shapes[a]},getShapeAt:function(a,b,c){return this.targetX=b,this.targetY=c,this.render(),this.currentTargetShapeId},render:function(){var a=this.shapeseq,b=this.shapes,c=a.length,d=this._getContext(),e,f,g;d.clearRect(0,0,this.pixelWidth,this.pixelHeight);for(g=0;g<c;g++)e=a[g],f=b[e],this["_draw"+f.type].apply(this,f.args);this.interact||(this.shapes={},this.shapeseq=[])}}),J=g(H,{init:function(b,c,e){var f;J._super.init.call(this,b,c,e),e[0]&&(e=e[0]),d.data(e,"_jqs_vcanvas",this),this.canvas=a.createElement("span"),d(this.canvas).css({display:"inline-block",position:"relative",overflow:"hidden",width:b,height:c,margin:"0px",padding:"0px",verticalAlign:"top"}),this._insert(this.canvas,e),this._calculatePixelDims(b,c,this.canvas),this.canvas.width=this.pixelWidth,this.canvas.height=this.pixelHeight,f='<v:group coordorigin="0 0" coordsize="'+this.pixelWidth+" "+this.pixelHeight+'"'+' style="position:absolute;top:0;left:0;width:'+this.pixelWidth+"px;height="+this.pixelHeight+'px;"></v:group>',this.canvas.insertAdjacentHTML("beforeEnd",f),this.group=d(this.canvas).children()[0],this.rendered=!1,this.prerender=""},_drawShape:function(a,b,d,e,f){var g=[],h,i,j,k,l,m,n;for(n=0,m=b.length;n<m;n++)g[n]=""+b[n][0]+","+b[n][1];return h=g.splice(0,1),f=f===c?1:f,i=d===c?' stroked="false" ':' strokeWeight="'+f+'px" strokeColor="'+d+'" ',j=e===c?' filled="false"':' fillColor="'+e+'" filled="true" ',k=g[0]===g[g.length-1]?"x ":"",l='<v:shape coordorigin="0 0" coordsize="'+this.pixelWidth+" "+this.pixelHeight+'" '+' id="jqsshape'+a+'" '+i+j+' style="position:absolute;left:0px;top:0px;height:'+this.pixelHeight+"px;width:"+this.pixelWidth+'px;padding:0px;margin:0px;" '+' path="m '+h+" l "+g.join(", ")+" "+k+'e">'+" </v:shape>",l},_drawCircle:function(a,b,d,e,f,g,h){var i,j,k;return b-=e,d-=e,i=f===c?' stroked="false" ':' strokeWeight="'+h+'px" strokeColor="'+f+'" ',j=g===c?' filled="false"':' fillColor="'+g+'" filled="true" ',k='<v:oval  id="jqsshape'+a+'" '+i+j+' style="position:absolute;top:'+d+"px; left:"+b+"px; width:"+e*2+"px; height:"+e*2+'px"></v:oval>',k},_drawPieSlice:function(a,d,e,f,g,h,i,j){var k,l,m,n,o,p,q,r;if(g===h)return"";h-g===2*b.PI&&(g=0,h=2*b.PI),l=d+b.round(b.cos(g)*f),m=e+b.round(b.sin(g)*f),n=d+b.round(b.cos(h)*f),o=e+b.round(b.sin(h)*f);if(l===n&&m===o){if(h-g<b.PI)return"";l=n=d+f,m=o=e}return l===n&&m===o&&h-g<b.PI?"":(k=[d-f,e-f,d+f,e+f,l,m,n,o],p=i===c?' stroked="false" ':' strokeWeight="1px" strokeColor="'+i+'" ',q=j===c?' filled="false"':' fillColor="'+j+'" filled="true" ',r='<v:shape coordorigin="0 0" coordsize="'+this.pixelWidth+" "+this.pixelHeight+'" '+' id="jqsshape'+a+'" '+p+q+' style="position:absolute;left:0px;top:0px;height:'+this.pixelHeight+"px;width:"+this.pixelWidth+'px;padding:0px;margin:0px;" '+' path="m '+d+","+e+" wa "+k.join(", ")+' x e">'+" </v:shape>",r)},_drawRect:function(a,b,c,d,e,f,g){return this._drawShape(a,[[b,c],[b,c+e],[b+d,c+e],[b+d,c],[b,c]],f,g)},reset:function(){this.group.innerHTML=""},appendShape:function(a){var b=this["_draw"+a.type].apply(this,a.args);return this.rendered?this.group.insertAdjacentHTML("beforeEnd",b):this.prerender+=b,this.lastShapeId=a.id,a.id},replaceWithShape:function(a,b){var c=d("#jqsshape"+a),e=this["_draw"+b.type].apply(this,b.args);c[0].outerHTML=e},replaceWithShapes:function(a,b){var c=d("#jqsshape"+a[0]),e="",f=b.length,g;for(g=0;g<f;g++)e+=this["_draw"+b[g].type].apply(this,b[g].args);c[0].outerHTML=e;for(g=1;g<a.length;g++)d("#jqsshape"+a[g]).remove()},insertAfterShape:function(a,b){var c=d("#jqsshape"+a),e=this["_draw"+b.type].apply(this,b.args);c[0].insertAdjacentHTML("afterEnd",e)},removeShapeId:function(a){var b=d("#jqsshape"+a);this.group.removeChild(b[0])},getShapeAt:function(a,b,c){var d=a.id.substr(8);return d},render:function(){this.rendered||(this.group.innerHTML=this.prerender,this.rendered=!0)}})})})(document,Math);
/**
 * JustGage - a handy JavaScript plugin for generating and animating nice & clean dashboard gauges.
 * Copyright (c) 2012 Bojan Djuricic - pindjur(at)gmail(dot)com | http://www.madcog.com
 * Licensed under MIT.
 * Date: 31/07/2012
 * @author Bojan Djuricic  (@Toorshia)
 * @version 1.0
 *
 * http://www.justgage.com
 */

JustGage = function(config)
{

	if(!config.id)
	{
		alert("Missing id parameter for gauge!");
		return false;
	}
	if(!document.getElementById(config.id))
	{
		alert("No element with id: \"" + config.id + "\" found!");
		return false;
	}

	// configurable parameters
	this.config = {
		// id : string
		// this is container element id
		id                  : config.id,

		// value : int
		// value gauge is showing
		value               : (config.value) ? config.value : 0,

		// valueFontColor : string
		// color of label showing current value
		valueFontColor      : (config.valueFontColor) ? config.valueFontColor : "#010101",

		// min : int
		// min value
		min                 : (config.min) ? config.min : 0,

		// max : int
		// max value
		max                 : (config.max) ? config.max : 100,

		// showMinMax : bool
		// hide or display min and max values
		showMinMax          : (config.showMinMax != null) ? config.showMinMax : true,

		// gaugeWidthScale : float
		// width of the gauge element
		gaugeWidthScale     : (config.gaugeWidthScale) ? config.gaugeWidthScale : 1.0,

		// gaugeColor : string
		// background color of gauge element
		gaugeColor          : (config.gaugeColor) ? config.gaugeColor : "#edebeb",

		// label : string
		// text to show below value
		label               : (config.label) ? config.label : "",

		// showInnerShadow : bool
		// give gauge element small amount of inner shadow
		showInnerShadow     : (config.showInnerShadow != null) ? config.showInnerShadow : true,

		// shadowOpacity : int
		// 0 ~ 1
		shadowOpacity       : (config.shadowOpacity) ? config.shadowOpacity : 0.2,

		// shadowSize: int
		// inner shadow size
		shadowSize          : (config.shadowSize) ? config.shadowSize : 5,

		// shadowVerticalOffset : int
		// how much shadow is offset from top
		shadowVerticalOffset: (config.shadowVerticalOffset) ? config.shadowVerticalOffset : 3,

		// levelColors : string[]
		// colors of indicator, from lower to upper, in RGB format
		levelColors         : (config.levelColors) ? config.levelColors : percentColors,

		// levelColorsGradient : bool
		// whether to use gradual color change for value, or sector-based
		levelColorsGradient : (config.levelColorsGradient != null) ? config.levelColorsGradient : true,

		// labelFontColor : string
		// color of label showing label under value
		labelFontColor      : (config.labelFontColor) ? config.labelFontColor : "#b3b3b3",

		// startAnimationTime : int
		// length of initial animation
		startAnimationTime  : (config.startAnimationTime) ? config.startAnimationTime : 700,

		// startAnimationType : string
		// type of initial animation (linear, >, <,  <>, bounce)
		startAnimationType  : (config.startAnimationType) ? config.startAnimationType : ">",

		// refreshAnimationTime : int
		// length of refresh animation
		refreshAnimationTime: (config.refreshAnimationTime) ? config.refreshAnimationTime : 700,

		// refreshAnimationType : string
		// type of refresh animation (linear, >, <,  <>, bounce)
		refreshAnimationType: (config.refreshAnimationType) ? config.refreshAnimationType : ">"
	};

	// overflow values
	if(config.value > this.config.max) this.config.value = this.config.max;
	if(config.value < this.config.min) this.config.value = this.config.min;
	this.originalValue = config.value;

	// canvas
	this.canvas = Raphael(this.config.id, "100%", "100%");

	// canvas dimensions
	//var canvasW = document.getElementById(this.config.id).clientWidth;
	//var canvasH = document.getElementById(this.config.id).clientHeight;
	var canvasW = getStyle(document.getElementById(this.config.id), "width").slice(0, -2) * 1;
	var canvasH = getStyle(document.getElementById(this.config.id), "height").slice(0, -2) * 1;

	// widget dimensions
	var widgetW, widgetH;
	if((canvasW / canvasH) > 1.25)
	{
		widgetW = 1.25 * canvasH;
		widgetH = canvasH;
	}
	else
	{
		widgetW = canvasW;
		widgetH = canvasW / 1.25;
	}

	// delta
	var dx = (canvasW - widgetW) / 2;
	var dy = (canvasH - widgetH) / 2;

	// value
	var valueFontSize = ((widgetH / 6.4) > 16) ? (widgetH / 6.4) : 16;
	var valueX = dx + widgetW / 2;
	var valueY = dy + widgetH / 1.4;

	// label
	var labelFontSize = ((widgetH / 16) > 10) ? (widgetH / 16) : 10;
	var labelX = dx + widgetW / 2;
	//var labelY = dy + widgetH / 1.126760563380282;
	var labelY = valueY + valueFontSize / 2 + 6;

	// min
	var minFontSize = ((widgetH / 16) > 10) ? (widgetH / 16) : 10;
	var minX = dx + (widgetW / 10) + (widgetW / 6.666666666666667 * this.config.gaugeWidthScale) / 2;
	var minY = dy + widgetH / 1.126760563380282;

	// max
	var maxFontSize = ((widgetH / 16) > 10) ? (widgetH / 16) : 10;
	var maxX = dx + widgetW - (widgetW / 10) - (widgetW / 6.666666666666667 * this.config.gaugeWidthScale) / 2;
	var maxY = dy + widgetH / 1.126760563380282;

	// parameters
	this.params = {
		canvasW      : canvasW,
		canvasH      : canvasH,
		widgetW      : widgetW,
		widgetH      : widgetH,
		dx           : dx,
		dy           : dy,
		valueFontSize: valueFontSize,
		valueX       : valueX,
		valueY       : valueY,
		labelFontSize: labelFontSize,
		labelX       : labelX,
		labelY       : labelY,
		minFontSize  : minFontSize,
		minX         : minX,
		minY         : minY,
		maxFontSize  : maxFontSize,
		maxX         : maxX,
		maxY         : maxY
	};

	// pki - custom attribute for generating gauge paths
	this.canvas.customAttributes.pki = function(value, min, max, w, h, dx, dy, gws)
	{

		var alpha = (1 - (value - min) / (max - min)) * Math.PI , Ro = w / 2 - w / 10, Ri = Ro - w / 6.666666666666667 * gws,

			Cx = w / 2 + dx, Cy = h / 1.25 + dy,

			Xo = w / 2 + dx + Ro * Math.cos(alpha), Yo = h - (h - Cy) + dy - Ro * Math.sin(alpha), Xi = w / 2 + dx + Ri * Math.cos(alpha), Yi = h - (h - Cy) + dy - Ri * Math.sin(alpha), path;

		path += "M" + (Cx - Ri) + "," + Cy + " ";
		path += "L" + (Cx - Ro) + "," + Cy + " ";
		path += "A" + Ro + "," + Ro + " 0 0,1 " + Xo + "," + Yo + " ";
		path += "L" + Xi + "," + Yi + " ";
		path += "A" + Ri + "," + Ri + " 0 0,0 " + (Cx - Ri) + "," + Cy + " ";
		path += "z ";
		return { path: path };
	}

	// gauge
	this.gauge = this.canvas.path().attr({
		"stroke": "none",
		"fill"  : this.config.gaugeColor,
		pki     : [this.config.max, this.config.min, this.config.max, this.params.widgetW, this.params.widgetH,
		           this.params.dx, this.params.dy, this.config.gaugeWidthScale]
	});
	this.gauge.id = this.config.id + "-gauge";

	// level
	this.level = this.canvas.path().attr({
		"stroke": "none",
		"fill"  : getColorForPercentage((this.config.value - this.config.min) / (this.config.max - this.config.min), this.config.levelColors, this.config.levelColorsGradient),
		pki     : [this.config.min, this.config.min, this.config.max, this.params.widgetW, this.params.widgetH,
		           this.params.dx, this.params.dy, this.config.gaugeWidthScale]
	});
	this.level.id = this.config.id + "-level";

	// value
	this.txtValue = this.canvas.text(this.params.valueX, this.params.valueY, this.originalValue);
	this.txtValue.attr({
		"font-size"   : this.params.valueFontSize,
		"font-weight" : "bold",
		"font-family" : "Arial",
		"fill"        : this.config.valueFontColor,
		"fill-opacity": "0"
	});
	this.txtValue.id = this.config.id + "-txtvalue";

	// label
	this.txtLabel = this.canvas.text(this.params.labelX, this.params.labelY, this.config.label);
	this.txtLabel.attr({
		"font-size"   : this.params.labelFontSize,
		"font-weight" : "normal",
		"font-family" : "Arial",
		"fill"        : this.config.labelFontColor,
		"fill-opacity": "0"
	});
	this.txtLabel.id = this.config.id + "-txtlabel";

	// min
	this.txtMin = this.canvas.text(this.params.minX, this.params.minY, this.config.min);
	this.txtMin.attr({
		"font-size"   : this.params.minFontSize,
		"font-weight" : "normal",
		"font-family" : "Arial",
		"fill"        : this.config.labelFontColor,
		"fill-opacity": (this.config.showMinMax == true) ? "1" : "0"
	});
	this.txtMin.id = this.config.id + "-txtmin";

	// max
	this.txtMax = this.canvas.text(this.params.maxX, this.params.maxY, this.config.max);
	this.txtMax.attr({
		"font-size"   : this.params.maxFontSize,
		"font-weight" : "normal",
		"font-family" : "Arial",
		"fill"        : this.config.labelFontColor,
		"fill-opacity": (this.config.showMinMax == true) ? "1" : "0"
	});
	this.txtMax.id = this.config.id + "-txtmax";

	var defs = this.canvas.canvas.childNodes[1];
	var svg = "http://www.w3.org/2000/svg";


	if(ie < 9)
	{
		onCreateElementNsReady(function()
		{
			this.generateShadow();
		});
	}
	else
	{
		this.generateShadow(svg, defs);
	}

	// animate
	this.level.animate({pki: [this.config.value, this.config.min, this.config.max, this.params.widgetW,
	                          this.params.widgetH, this.params.dx, this.params.dy, this.config.gaugeWidthScale
	]}, this.config.startAnimationTime, this.config.startAnimationType);

	this.txtValue.animate({"fill-opacity": "1"}, this.config.startAnimationTime, this.config.startAnimationType);
	this.txtLabel.animate({"fill-opacity": "1"}, this.config.startAnimationTime, this.config.startAnimationType);
};

// refresh gauge level
JustGage.prototype.refresh = function(val)
{
	// overflow values
	originalVal = val;
	if(val > this.config.max)
	{
		val = this.config.max;
	}
	if(val < this.config.min)
	{
		val = this.config.min;
	}

	var color = getColorForPercentage((val - this.config.min) / (this.config.max - this.config.min), this.config.levelColors, this.config.levelColorsGradient);
	this.canvas.getById(this.config.id + "-txtvalue").attr({"text": originalVal});
	this.canvas.getById(this.config.id + "-level").animate({pki                                       : [val,
	                                                                                                     this.config.min,
	                                                                                                     this.config.max,
	                                                                                                     this.params.widgetW,
	                                                                                                     this.params.widgetH,
	                                                                                                     this.params.dx,
	                                                                                                     this.params.dy,
	                                                                                                     this.config.gaugeWidthScale
	], "fill"                                                                                         : color}, this.config.refreshAnimationTime, this.config.refreshAnimationType);
};

var percentColors = [
	"#a9d70b", "#f9c802", "#ff0000"
]

JustGage.prototype.generateShadow = function(svg, defs)
{
	// FILTER
	var gaussFilter = document.createElementNS(svg, "filter");
	gaussFilter.setAttribute("id", this.config.id + "-inner-shadow");
	defs.appendChild(gaussFilter);

	// offset
	var feOffset = document.createElementNS(svg, "feOffset");
	feOffset.setAttribute("dx", 0);
	feOffset.setAttribute("dy", this.config.shadowVerticalOffset);
	gaussFilter.appendChild(feOffset);

	// blur
	var feGaussianBlur = document.createElementNS(svg, "feGaussianBlur");
	feGaussianBlur.setAttribute("result", "offset-blur");
	feGaussianBlur.setAttribute("stdDeviation", this.config.shadowSize);
	gaussFilter.appendChild(feGaussianBlur);

	// composite 1
	var feComposite1 = document.createElementNS(svg, "feComposite");
	feComposite1.setAttribute("operator", "out");
	feComposite1.setAttribute("in", "SourceGraphic");
	feComposite1.setAttribute("in2", "offset-blur");
	feComposite1.setAttribute("result", "inverse");
	gaussFilter.appendChild(feComposite1);

	// flood
	var feFlood = document.createElementNS(svg, "feFlood");
	feFlood.setAttribute("flood-color", "black");
	feFlood.setAttribute("flood-opacity", this.config.shadowOpacity);
	feFlood.setAttribute("result", "color");
	gaussFilter.appendChild(feFlood);

	// composite 2
	var feComposite2 = document.createElementNS(svg, "feComposite");
	feComposite2.setAttribute("operator", "in");
	feComposite2.setAttribute("in", "color");
	feComposite2.setAttribute("in2", "inverse");
	feComposite2.setAttribute("result", "shadow");
	gaussFilter.appendChild(feComposite2);

	// composite 3
	var feComposite3 = document.createElementNS(svg, "feComposite");
	feComposite3.setAttribute("operator", "over");
	feComposite3.setAttribute("in", "shadow");
	feComposite3.setAttribute("in2", "SourceGraphic");
	gaussFilter.appendChild(feComposite3);

	// set shadow
	if(this.config.showInnerShadow == true)
	{
		this.canvas.canvas.childNodes[2].setAttribute("filter", "url(#" + this.config.id + "-inner-shadow)");
		this.canvas.canvas.childNodes[3].setAttribute("filter", "url(#" + this.config.id + "-inner-shadow)");
	}
}

var getColorForPercentage = function(pct, col, grad)
{

	var no = col.length;
	if(no === 1) return col[0];
	var inc = (grad) ? (1 / (no - 1)) : (1 / no);
	var colors = new Array();
	for(var i = 0; i < col.length; i++)
	{
		var percentage = (grad) ? (inc * i) : (inc * (i + 1));
		var rval = parseInt((cutHex(col[i])).substring(0, 2), 16);
		var gval = parseInt((cutHex(col[i])).substring(2, 4), 16);
		var bval = parseInt((cutHex(col[i])).substring(4, 6), 16);
		colors[i] = { pct: percentage, color: { r: rval, g: gval, b: bval  } };
	}

	if(pct == 0) return 'rgb(' + [colors[0].color.r, colors[0].color.g, colors[0].color.b].join(',') + ')';
	for(var i = 0; i < colors.length; i++)
	{
		if(pct <= colors[i].pct)
		{
			if(grad == true)
			{
				var lower = colors[i - 1];
				var upper = colors[i];
				var range = upper.pct - lower.pct;
				var rangePct = (pct - lower.pct) / range;
				var pctLower = 1 - rangePct;
				var pctUpper = rangePct;
				var color = {
					r: Math.floor(lower.color.r * pctLower + upper.color.r * pctUpper),
					g: Math.floor(lower.color.g * pctLower + upper.color.g * pctUpper),
					b: Math.floor(lower.color.b * pctLower + upper.color.b * pctUpper)
				};
				return 'rgb(' + [color.r, color.g, color.b].join(',') + ')';
			}
			else
			{
				return 'rgb(' + [colors[i].color.r, colors[i].color.g, colors[i].color.b].join(',') + ')';
			}
		}
	}
}

function getRandomInt(min, max)
{
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function cutHex(str)
{
	return (str.charAt(0) == "#") ? str.substring(1, 7) : str
}

function getStyle(oElm, strCssRule)
{
	var strValue = "";
	if(document.defaultView && document.defaultView.getComputedStyle)
	{
		strValue = document.defaultView.getComputedStyle(oElm, "").getPropertyValue(strCssRule);
	}
	else if(oElm.currentStyle)
	{
		strCssRule = strCssRule.replace(/\-(\w)/g, function(strMatch, p1)
		{
			return p1.toUpperCase();
		});
		strValue = oElm.currentStyle[strCssRule];
	}
	return strValue;
}

function onCreateElementNsReady(func)
{
	if(document.createElementNS != undefined)
	{
		func();
	}
	else
	{
		setTimeout(function()
		{
			onCreateElementNsReady(func);
		}, 100);
	}
}

// ----------------------------------------------------------
// A short snippet for detecting versions of IE in JavaScript
// without resorting to user-agent sniffing
// ----------------------------------------------------------
// If you're not in IE (or IE version is less than 5) then:
// ie === undefined
// If you're in IE (>=5) then you can determine which version:
// ie === 7; // IE7
// Thus, to detect IE:
// if (ie) {}
// And to detect the version:
// ie === 6 // IE6
// ie > 7 // IE8, IE9 ...
// ie < 9 // Anything less than IE9
// ----------------------------------------------------------

// UPDATE: Now using Live NodeList idea from @jdalton

var ie = (function()
{

	var undef, v = 3, div = document.createElement('div'), all = div.getElementsByTagName('i');

	while(div.innerHTML = '<!--[if gt IE ' + (++v) + ']><i></i><![endif]-->', all[0]);

	return v > 4 ? v : undef;

}());
// +--------------------------------------------------------------------+ \\
// � Rapha�l 2.1.0 - JavaScript Vector Library                          � \\
// +--------------------------------------------------------------------� \\
// � Copyright � 2008-2012 Dmitry Baranovskiy (http://raphaeljs.com)    � \\
// � Copyright � 2008-2012 Sencha Labs (http://sencha.com)              � \\
// +--------------------------------------------------------------------� \\
// � Licensed under the MIT (http://raphaeljs.com/license.html) license.� \\
// +--------------------------------------------------------------------+ \\

(function(a){var b="0.3.4",c="hasOwnProperty",d=/[\.\/]/,e="*",f=function(){},g=function(a,b){return a-b},h,i,j={n:{}},k=function(a,b){var c=j,d=i,e=Array.prototype.slice.call(arguments,2),f=k.listeners(a),l=0,m=!1,n,o=[],p={},q=[],r=h,s=[];h=a,i=0;for(var t=0,u=f.length;t<u;t++)"zIndex"in f[t]&&(o.push(f[t].zIndex),f[t].zIndex<0&&(p[f[t].zIndex]=f[t]));o.sort(g);while(o[l]<0){n=p[o[l++]],q.push(n.apply(b,e));if(i){i=d;return q}}for(t=0;t<u;t++){n=f[t];if("zIndex"in n)if(n.zIndex==o[l]){q.push(n.apply(b,e));if(i)break;do{l++,n=p[o[l]],n&&q.push(n.apply(b,e));if(i)break}while(n)}else p[n.zIndex]=n;else{q.push(n.apply(b,e));if(i)break}}i=d,h=r;return q.length?q:null};k.listeners=function(a){var b=a.split(d),c=j,f,g,h,i,k,l,m,n,o=[c],p=[];for(i=0,k=b.length;i<k;i++){n=[];for(l=0,m=o.length;l<m;l++){c=o[l].n,g=[c[b[i]],c[e]],h=2;while(h--)f=g[h],f&&(n.push(f),p=p.concat(f.f||[]))}o=n}return p},k.on=function(a,b){var c=a.split(d),e=j;for(var g=0,h=c.length;g<h;g++)e=e.n,!e[c[g]]&&(e[c[g]]={n:{}}),e=e[c[g]];e.f=e.f||[];for(g=0,h=e.f.length;g<h;g++)if(e.f[g]==b)return f;e.f.push(b);return function(a){+a==+a&&(b.zIndex=+a)}},k.stop=function(){i=1},k.nt=function(a){if(a)return(new RegExp("(?:\\.|\\/|^)"+a+"(?:\\.|\\/|$)")).test(h);return h},k.off=k.unbind=function(a,b){var f=a.split(d),g,h,i,k,l,m,n,o=[j];for(k=0,l=f.length;k<l;k++)for(m=0;m<o.length;m+=i.length-2){i=[m,1],g=o[m].n;if(f[k]!=e)g[f[k]]&&i.push(g[f[k]]);else for(h in g)g[c](h)&&i.push(g[h]);o.splice.apply(o,i)}for(k=0,l=o.length;k<l;k++){g=o[k];while(g.n){if(b){if(g.f){for(m=0,n=g.f.length;m<n;m++)if(g.f[m]==b){g.f.splice(m,1);break}!g.f.length&&delete g.f}for(h in g.n)if(g.n[c](h)&&g.n[h].f){var p=g.n[h].f;for(m=0,n=p.length;m<n;m++)if(p[m]==b){p.splice(m,1);break}!p.length&&delete g.n[h].f}}else{delete g.f;for(h in g.n)g.n[c](h)&&g.n[h].f&&delete g.n[h].f}g=g.n}}},k.once=function(a,b){var c=function(){var d=b.apply(this,arguments);k.unbind(a,c);return d};return k.on(a,c)},k.version=b,k.toString=function(){return"You are running Eve "+b},typeof module!="undefined"&&module.exports?module.exports=k:typeof define!="undefined"?define("eve",[],function(){return k}):a.eve=k})(this),function(){function cF(a){for(var b=0;b<cy.length;b++)cy[b].el.paper==a&&cy.splice(b--,1)}function cE(b,d,e,f,h,i){e=Q(e);var j,k,l,m=[],o,p,q,t=b.ms,u={},v={},w={};if(f)for(y=0,z=cy.length;y<z;y++){var x=cy[y];if(x.el.id==d.id&&x.anim==b){x.percent!=e?(cy.splice(y,1),l=1):k=x,d.attr(x.totalOrigin);break}}else f=+v;for(var y=0,z=b.percents.length;y<z;y++){if(b.percents[y]==e||b.percents[y]>f*b.top){e=b.percents[y],p=b.percents[y-1]||0,t=t/b.top*(e-p),o=b.percents[y+1],j=b.anim[e];break}f&&d.attr(b.anim[b.percents[y]])}if(!!j){if(!k){for(var A in j)if(j[g](A))if(U[g](A)||d.paper.customAttributes[g](A)){u[A]=d.attr(A),u[A]==null&&(u[A]=T[A]),v[A]=j[A];switch(U[A]){case C:w[A]=(v[A]-u[A])/t;break;case"colour":u[A]=a.getRGB(u[A]);var B=a.getRGB(v[A]);w[A]={r:(B.r-u[A].r)/t,g:(B.g-u[A].g)/t,b:(B.b-u[A].b)/t};break;case"path":var D=bR(u[A],v[A]),E=D[1];u[A]=D[0],w[A]=[];for(y=0,z=u[A].length;y<z;y++){w[A][y]=[0];for(var F=1,G=u[A][y].length;F<G;F++)w[A][y][F]=(E[y][F]-u[A][y][F])/t}break;case"transform":var H=d._,I=ca(H[A],v[A]);if(I){u[A]=I.from,v[A]=I.to,w[A]=[],w[A].real=!0;for(y=0,z=u[A].length;y<z;y++){w[A][y]=[u[A][y][0]];for(F=1,G=u[A][y].length;F<G;F++)w[A][y][F]=(v[A][y][F]-u[A][y][F])/t}}else{var J=d.matrix||new cb,K={_:{transform:H.transform},getBBox:function(){return d.getBBox(1)}};u[A]=[J.a,J.b,J.c,J.d,J.e,J.f],b$(K,v[A]),v[A]=K._.transform,w[A]=[(K.matrix.a-J.a)/t,(K.matrix.b-J.b)/t,(K.matrix.c-J.c)/t,(K.matrix.d-J.d)/t,(K.matrix.e-J.e)/t,(K.matrix.f-J.f)/t]}break;case"csv":var L=r(j[A])[s](c),M=r(u[A])[s](c);if(A=="clip-rect"){u[A]=M,w[A]=[],y=M.length;while(y--)w[A][y]=(L[y]-u[A][y])/t}v[A]=L;break;default:L=[][n](j[A]),M=[][n](u[A]),w[A]=[],y=d.paper.customAttributes[A].length;while(y--)w[A][y]=((L[y]||0)-(M[y]||0))/t}}var O=j.easing,P=a.easing_formulas[O];if(!P){P=r(O).match(N);if(P&&P.length==5){var R=P;P=function(a){return cC(a,+R[1],+R[2],+R[3],+R[4],t)}}else P=bf}q=j.start||b.start||+(new Date),x={anim:b,percent:e,timestamp:q,start:q+(b.del||0),status:0,initstatus:f||0,stop:!1,ms:t,easing:P,from:u,diff:w,to:v,el:d,callback:j.callback,prev:p,next:o,repeat:i||b.times,origin:d.attr(),totalOrigin:h},cy.push(x);if(f&&!k&&!l){x.stop=!0,x.start=new Date-t*f;if(cy.length==1)return cA()}l&&(x.start=new Date-x.ms*f),cy.length==1&&cz(cA)}else k.initstatus=f,k.start=new Date-k.ms*f;eve("raphael.anim.start."+d.id,d,b)}}function cD(a,b){var c=[],d={};this.ms=b,this.times=1;if(a){for(var e in a)a[g](e)&&(d[Q(e)]=a[e],c.push(Q(e)));c.sort(bd)}this.anim=d,this.top=c[c.length-1],this.percents=c}function cC(a,b,c,d,e,f){function o(a,b){var c,d,e,f,j,k;for(e=a,k=0;k<8;k++){f=m(e)-a;if(z(f)<b)return e;j=(3*i*e+2*h)*e+g;if(z(j)<1e-6)break;e=e-f/j}c=0,d=1,e=a;if(e<c)return c;if(e>d)return d;while(c<d){f=m(e);if(z(f-a)<b)return e;a>f?c=e:d=e,e=(d-c)/2+c}return e}function n(a,b){var c=o(a,b);return((l*c+k)*c+j)*c}function m(a){return((i*a+h)*a+g)*a}var g=3*b,h=3*(d-b)-g,i=1-g-h,j=3*c,k=3*(e-c)-j,l=1-j-k;return n(a,1/(200*f))}function cq(){return this.x+q+this.y+q+this.width+" � "+this.height}function cp(){return this.x+q+this.y}function cb(a,b,c,d,e,f){a!=null?(this.a=+a,this.b=+b,this.c=+c,this.d=+d,this.e=+e,this.f=+f):(this.a=1,this.b=0,this.c=0,this.d=1,this.e=0,this.f=0)}function bH(b,c,d){b=a._path2curve(b),c=a._path2curve(c);var e,f,g,h,i,j,k,l,m,n,o=d?0:[];for(var p=0,q=b.length;p<q;p++){var r=b[p];if(r[0]=="M")e=i=r[1],f=j=r[2];else{r[0]=="C"?(m=[e,f].concat(r.slice(1)),e=m[6],f=m[7]):(m=[e,f,e,f,i,j,i,j],e=i,f=j);for(var s=0,t=c.length;s<t;s++){var u=c[s];if(u[0]=="M")g=k=u[1],h=l=u[2];else{u[0]=="C"?(n=[g,h].concat(u.slice(1)),g=n[6],h=n[7]):(n=[g,h,g,h,k,l,k,l],g=k,h=l);var v=bG(m,n,d);if(d)o+=v;else{for(var w=0,x=v.length;w<x;w++)v[w].segment1=p,v[w].segment2=s,v[w].bez1=m,v[w].bez2=n;o=o.concat(v)}}}}}return o}function bG(b,c,d){var e=a.bezierBBox(b),f=a.bezierBBox(c);if(!a.isBBoxIntersect(e,f))return d?0:[];var g=bB.apply(0,b),h=bB.apply(0,c),i=~~(g/5),j=~~(h/5),k=[],l=[],m={},n=d?0:[];for(var o=0;o<i+1;o++){var p=a.findDotsAtSegment.apply(a,b.concat(o/i));k.push({x:p.x,y:p.y,t:o/i})}for(o=0;o<j+1;o++)p=a.findDotsAtSegment.apply(a,c.concat(o/j)),l.push({x:p.x,y:p.y,t:o/j});for(o=0;o<i;o++)for(var q=0;q<j;q++){var r=k[o],s=k[o+1],t=l[q],u=l[q+1],v=z(s.x-r.x)<.001?"y":"x",w=z(u.x-t.x)<.001?"y":"x",x=bD(r.x,r.y,s.x,s.y,t.x,t.y,u.x,u.y);if(x){if(m[x.x.toFixed(4)]==x.y.toFixed(4))continue;m[x.x.toFixed(4)]=x.y.toFixed(4);var y=r.t+z((x[v]-r[v])/(s[v]-r[v]))*(s.t-r.t),A=t.t+z((x[w]-t[w])/(u[w]-t[w]))*(u.t-t.t);y>=0&&y<=1&&A>=0&&A<=1&&(d?n++:n.push({x:x.x,y:x.y,t1:y,t2:A}))}}return n}function bF(a,b){return bG(a,b,1)}function bE(a,b){return bG(a,b)}function bD(a,b,c,d,e,f,g,h){if(!(x(a,c)<y(e,g)||y(a,c)>x(e,g)||x(b,d)<y(f,h)||y(b,d)>x(f,h))){var i=(a*d-b*c)*(e-g)-(a-c)*(e*h-f*g),j=(a*d-b*c)*(f-h)-(b-d)*(e*h-f*g),k=(a-c)*(f-h)-(b-d)*(e-g);if(!k)return;var l=i/k,m=j/k,n=+l.toFixed(2),o=+m.toFixed(2);if(n<+y(a,c).toFixed(2)||n>+x(a,c).toFixed(2)||n<+y(e,g).toFixed(2)||n>+x(e,g).toFixed(2)||o<+y(b,d).toFixed(2)||o>+x(b,d).toFixed(2)||o<+y(f,h).toFixed(2)||o>+x(f,h).toFixed(2))return;return{x:l,y:m}}}function bC(a,b,c,d,e,f,g,h,i){if(!(i<0||bB(a,b,c,d,e,f,g,h)<i)){var j=1,k=j/2,l=j-k,m,n=.01;m=bB(a,b,c,d,e,f,g,h,l);while(z(m-i)>n)k/=2,l+=(m<i?1:-1)*k,m=bB(a,b,c,d,e,f,g,h,l);return l}}function bB(a,b,c,d,e,f,g,h,i){i==null&&(i=1),i=i>1?1:i<0?0:i;var j=i/2,k=12,l=[-0.1252,.1252,-0.3678,.3678,-0.5873,.5873,-0.7699,.7699,-0.9041,.9041,-0.9816,.9816],m=[.2491,.2491,.2335,.2335,.2032,.2032,.1601,.1601,.1069,.1069,.0472,.0472],n=0;for(var o=0;o<k;o++){var p=j*l[o]+j,q=bA(p,a,c,e,g),r=bA(p,b,d,f,h),s=q*q+r*r;n+=m[o]*w.sqrt(s)}return j*n}function bA(a,b,c,d,e){var f=-3*b+9*c-9*d+3*e,g=a*f+6*b-12*c+6*d;return a*g-3*b+3*c}function by(a,b){var c=[];for(var d=0,e=a.length;e-2*!b>d;d+=2){var f=[{x:+a[d-2],y:+a[d-1]},{x:+a[d],y:+a[d+1]},{x:+a[d+2],y:+a[d+3]},{x:+a[d+4],y:+a[d+5]}];b?d?e-4==d?f[3]={x:+a[0],y:+a[1]}:e-2==d&&(f[2]={x:+a[0],y:+a[1]},f[3]={x:+a[2],y:+a[3]}):f[0]={x:+a[e-2],y:+a[e-1]}:e-4==d?f[3]=f[2]:d||(f[0]={x:+a[d],y:+a[d+1]}),c.push(["C",(-f[0].x+6*f[1].x+f[2].x)/6,(-f[0].y+6*f[1].y+f[2].y)/6,(f[1].x+6*f[2].x-f[3].x)/6,(f[1].y+6*f[2].y-f[3].y)/6,f[2].x,f[2].y])}return c}function bx(){return this.hex}function bv(a,b,c){function d(){var e=Array.prototype.slice.call(arguments,0),f=e.join("?"),h=d.cache=d.cache||{},i=d.count=d.count||[];if(h[g](f)){bu(i,f);return c?c(h[f]):h[f]}i.length>=1e3&&delete h[i.shift()],i.push(f),h[f]=a[m](b,e);return c?c(h[f]):h[f]}return d}function bu(a,b){for(var c=0,d=a.length;c<d;c++)if(a[c]===b)return a.push(a.splice(c,1)[0])}function bm(a){if(Object(a)!==a)return a;var b=new a.constructor;for(var c in a)a[g](c)&&(b[c]=bm(a[c]));return b}function a(c){if(a.is(c,"function"))return b?c():eve.on("raphael.DOMload",c);if(a.is(c,E))return a._engine.create[m](a,c.splice(0,3+a.is(c[0],C))).add(c);var d=Array.prototype.slice.call(arguments,0);if(a.is(d[d.length-1],"function")){var e=d.pop();return b?e.call(a._engine.create[m](a,d)):eve.on("raphael.DOMload",function(){e.call(a._engine.create[m](a,d))})}return a._engine.create[m](a,arguments)}a.version="2.1.0",a.eve=eve;var b,c=/[, ]+/,d={circle:1,rect:1,path:1,ellipse:1,text:1,image:1},e=/\{(\d+)\}/g,f="prototype",g="hasOwnProperty",h={doc:document,win:window},i={was:Object.prototype[g].call(h.win,"Raphael"),is:h.win.Raphael},j=function(){this.ca=this.customAttributes={}},k,l="appendChild",m="apply",n="concat",o="createTouch"in h.doc,p="",q=" ",r=String,s="split",t="click dblclick mousedown mousemove mouseout mouseover mouseup touchstart touchmove touchend touchcancel"[s](q),u={mousedown:"touchstart",mousemove:"touchmove",mouseup:"touchend"},v=r.prototype.toLowerCase,w=Math,x=w.max,y=w.min,z=w.abs,A=w.pow,B=w.PI,C="number",D="string",E="array",F="toString",G="fill",H=Object.prototype.toString,I={},J="push",K=a._ISURL=/^url\(['"]?([^\)]+?)['"]?\)$/i,L=/^\s*((#[a-f\d]{6})|(#[a-f\d]{3})|rgba?\(\s*([\d\.]+%?\s*,\s*[\d\.]+%?\s*,\s*[\d\.]+%?(?:\s*,\s*[\d\.]+%?)?)\s*\)|hsba?\(\s*([\d\.]+(?:deg|\xb0|%)?\s*,\s*[\d\.]+%?\s*,\s*[\d\.]+(?:%?\s*,\s*[\d\.]+)?)%?\s*\)|hsla?\(\s*([\d\.]+(?:deg|\xb0|%)?\s*,\s*[\d\.]+%?\s*,\s*[\d\.]+(?:%?\s*,\s*[\d\.]+)?)%?\s*\))\s*$/i,M={NaN:1,Infinity:1,"-Infinity":1},N=/^(?:cubic-)?bezier\(([^,]+),([^,]+),([^,]+),([^\)]+)\)/,O=w.round,P="setAttribute",Q=parseFloat,R=parseInt,S=r.prototype.toUpperCase,T=a._availableAttrs={"arrow-end":"none","arrow-start":"none",blur:0,"clip-rect":"0 0 1e9 1e9",cursor:"default",cx:0,cy:0,fill:"#fff","fill-opacity":1,font:'10px "Arial"',"font-family":'"Arial"',"font-size":"10","font-style":"normal","font-weight":400,gradient:0,height:0,href:"http://raphaeljs.com/","letter-spacing":0,opacity:1,path:"M0,0",r:0,rx:0,ry:0,src:"",stroke:"#000","stroke-dasharray":"","stroke-linecap":"butt","stroke-linejoin":"butt","stroke-miterlimit":0,"stroke-opacity":1,"stroke-width":1,target:"_blank","text-anchor":"middle",title:"Raphael",transform:"",width:0,x:0,y:0},U=a._availableAnimAttrs={blur:C,"clip-rect":"csv",cx:C,cy:C,fill:"colour","fill-opacity":C,"font-size":C,height:C,opacity:C,path:"path",r:C,rx:C,ry:C,stroke:"colour","stroke-opacity":C,"stroke-width":C,transform:"transform",width:C,x:C,y:C},V=/[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]/g,W=/[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*/,X={hs:1,rg:1},Y=/,?([achlmqrstvxz]),?/gi,Z=/([achlmrqstvz])[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029,]*((-?\d*\.?\d*(?:e[\-+]?\d+)?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*)+)/ig,$=/([rstm])[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029,]*((-?\d*\.?\d*(?:e[\-+]?\d+)?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*)+)/ig,_=/(-?\d*\.?\d*(?:e[\-+]?\d+)?)[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,?[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*/ig,ba=a._radial_gradient=/^r(?:\(([^,]+?)[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*,[\x09\x0a\x0b\x0c\x0d\x20\xa0\u1680\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\u2028\u2029]*([^\)]+?)\))?/,bb={},bc=function(a,b){return a.key-b.key},bd=function(a,b){return Q(a)-Q(b)},be=function(){},bf=function(a){return a},bg=a._rectPath=function(a,b,c,d,e){if(e)return[["M",a+e,b],["l",c-e*2,0],["a",e,e,0,0,1,e,e],["l",0,d-e*2],["a",e,e,0,0,1,-e,e],["l",e*2-c,0],["a",e,e,0,0,1,-e,-e],["l",0,e*2-d],["a",e,e,0,0,1,e,-e],["z"]];return[["M",a,b],["l",c,0],["l",0,d],["l",-c,0],["z"]]},bh=function(a,b,c,d){d==null&&(d=c);return[["M",a,b],["m",0,-d],["a",c,d,0,1,1,0,2*d],["a",c,d,0,1,1,0,-2*d],["z"]]},bi=a._getPath={path:function(a){return a.attr("path")},circle:function(a){var b=a.attrs;return bh(b.cx,b.cy,b.r)},ellipse:function(a){var b=a.attrs;return bh(b.cx,b.cy,b.rx,b.ry)},rect:function(a){var b=a.attrs;return bg(b.x,b.y,b.width,b.height,b.r)},image:function(a){var b=a.attrs;return bg(b.x,b.y,b.width,b.height)},text:function(a){var b=a._getBBox();return bg(b.x,b.y,b.width,b.height)}},bj=a.mapPath=function(a,b){if(!b)return a;var c,d,e,f,g,h,i;a=bR(a);for(e=0,g=a.length;e<g;e++){i=a[e];for(f=1,h=i.length;f<h;f+=2)c=b.x(i[f],i[f+1]),d=b.y(i[f],i[f+1]),i[f]=c,i[f+1]=d}return a};a._g=h,a.type=h.win.SVGAngle||h.doc.implementation.hasFeature("http://www.w3.org/TR/SVG11/feature#BasicStructure","1.1")?"SVG":"VML";if(a.type=="VML"){var bk=h.doc.createElement("div"),bl;bk.innerHTML='<v:shape adj="1"/>',bl=bk.firstChild,bl.style.behavior="url(#default#VML)";if(!bl||typeof bl.adj!="object")return a.type=p;bk=null}a.svg=!(a.vml=a.type=="VML"),a._Paper=j,a.fn=k=j.prototype=a.prototype,a._id=0,a._oid=0,a.is=function(a,b){b=v.call(b);if(b=="finite")return!M[g](+a);if(b=="array")return a instanceof Array;return b=="null"&&a===null||b==typeof a&&a!==null||b=="object"&&a===Object(a)||b=="array"&&Array.isArray&&Array.isArray(a)||H.call(a).slice(8,-1).toLowerCase()==b},a.angle=function(b,c,d,e,f,g){if(f==null){var h=b-d,i=c-e;if(!h&&!i)return 0;return(180+w.atan2(-i,-h)*180/B+360)%360}return a.angle(b,c,f,g)-a.angle(d,e,f,g)},a.rad=function(a){return a%360*B/180},a.deg=function(a){return a*180/B%360},a.snapTo=function(b,c,d){d=a.is(d,"finite")?d:10;if(a.is(b,E)){var e=b.length;while(e--)if(z(b[e]-c)<=d)return b[e]}else{b=+b;var f=c%b;if(f<d)return c-f;if(f>b-d)return c-f+b}return c};var bn=a.createUUID=function(a,b){return function(){return"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(a,b).toUpperCase()}}(/[xy]/g,function(a){var b=w.random()*16|0,c=a=="x"?b:b&3|8;return c.toString(16)});a.setWindow=function(b){eve("raphael.setWindow",a,h.win,b),h.win=b,h.doc=h.win.document,a._engine.initWin&&a._engine.initWin(h.win)};var bo=function(b){if(a.vml){var c=/^\s+|\s+$/g,d;try{var e=new ActiveXObject("htmlfile");e.write("<body>"),e.close(),d=e.body}catch(f){d=createPopup().document.body}var g=d.createTextRange();bo=bv(function(a){try{d.style.color=r(a).replace(c,p);var b=g.queryCommandValue("ForeColor");b=(b&255)<<16|b&65280|(b&16711680)>>>16;return"#"+("000000"+b.toString(16)).slice(-6)}catch(e){return"none"}})}else{var i=h.doc.createElement("i");i.title="Rapha�l Colour Picker",i.style.display="none",h.doc.body.appendChild(i),bo=bv(function(a){i.style.color=a;return h.doc.defaultView.getComputedStyle(i,p).getPropertyValue("color")})}return bo(b)},bp=function(){return"hsb("+[this.h,this.s,this.b]+")"},bq=function(){return"hsl("+[this.h,this.s,this.l]+")"},br=function(){return this.hex},bs=function(b,c,d){c==null&&a.is(b,"object")&&"r"in b&&"g"in b&&"b"in b&&(d=b.b,c=b.g,b=b.r);if(c==null&&a.is(b,D)){var e=a.getRGB(b);b=e.r,c=e.g,d=e.b}if(b>1||c>1||d>1)b/=255,c/=255,d/=255;return[b,c,d]},bt=function(b,c,d,e){b*=255,c*=255,d*=255;var f={r:b,g:c,b:d,hex:a.rgb(b,c,d),toString:br};a.is(e,"finite")&&(f.opacity=e);return f};a.color=function(b){var c;a.is(b,"object")&&"h"in b&&"s"in b&&"b"in b?(c=a.hsb2rgb(b),b.r=c.r,b.g=c.g,b.b=c.b,b.hex=c.hex):a.is(b,"object")&&"h"in b&&"s"in b&&"l"in b?(c=a.hsl2rgb(b),b.r=c.r,b.g=c.g,b.b=c.b,b.hex=c.hex):(a.is(b,"string")&&(b=a.getRGB(b)),a.is(b,"object")&&"r"in b&&"g"in b&&"b"in b?(c=a.rgb2hsl(b),b.h=c.h,b.s=c.s,b.l=c.l,c=a.rgb2hsb(b),b.v=c.b):(b={hex:"none"},b.r=b.g=b.b=b.h=b.s=b.v=b.l=-1)),b.toString=br;return b},a.hsb2rgb=function(a,b,c,d){this.is(a,"object")&&"h"in a&&"s"in a&&"b"in a&&(c=a.b,b=a.s,a=a.h,d=a.o),a*=360;var e,f,g,h,i;a=a%360/60,i=c*b,h=i*(1-z(a%2-1)),e=f=g=c-i,a=~~a,e+=[i,h,0,0,h,i][a],f+=[h,i,i,h,0,0][a],g+=[0,0,h,i,i,h][a];return bt(e,f,g,d)},a.hsl2rgb=function(a,b,c,d){this.is(a,"object")&&"h"in a&&"s"in a&&"l"in a&&(c=a.l,b=a.s,a=a.h);if(a>1||b>1||c>1)a/=360,b/=100,c/=100;a*=360;var e,f,g,h,i;a=a%360/60,i=2*b*(c<.5?c:1-c),h=i*(1-z(a%2-1)),e=f=g=c-i/2,a=~~a,e+=[i,h,0,0,h,i][a],f+=[h,i,i,h,0,0][a],g+=[0,0,h,i,i,h][a];return bt(e,f,g,d)},a.rgb2hsb=function(a,b,c){c=bs(a,b,c),a=c[0],b=c[1],c=c[2];var d,e,f,g;f=x(a,b,c),g=f-y(a,b,c),d=g==0?null:f==a?(b-c)/g:f==b?(c-a)/g+2:(a-b)/g+4,d=(d+360)%6*60/360,e=g==0?0:g/f;return{h:d,s:e,b:f,toString:bp}},a.rgb2hsl=function(a,b,c){c=bs(a,b,c),a=c[0],b=c[1],c=c[2];var d,e,f,g,h,i;g=x(a,b,c),h=y(a,b,c),i=g-h,d=i==0?null:g==a?(b-c)/i:g==b?(c-a)/i+2:(a-b)/i+4,d=(d+360)%6*60/360,f=(g+h)/2,e=i==0?0:f<.5?i/(2*f):i/(2-2*f);return{h:d,s:e,l:f,toString:bq}},a._path2string=function(){return this.join(",").replace(Y,"$1")};var bw=a._preload=function(a,b){var c=h.doc.createElement("img");c.style.cssText="position:absolute;left:-9999em;top:-9999em",c.onload=function(){b.call(this),this.onload=null,h.doc.body.removeChild(this)},c.onerror=function(){h.doc.body.removeChild(this)},h.doc.body.appendChild(c),c.src=a};a.getRGB=bv(function(b){if(!b||!!((b=r(b)).indexOf("-")+1))return{r:-1,g:-1,b:-1,hex:"none",error:1,toString:bx};if(b=="none")return{r:-1,g:-1,b:-1,hex:"none",toString:bx};!X[g](b.toLowerCase().substring(0,2))&&b.charAt()!="#"&&(b=bo(b));var c,d,e,f,h,i,j,k=b.match(L);if(k){k[2]&&(f=R(k[2].substring(5),16),e=R(k[2].substring(3,5),16),d=R(k[2].substring(1,3),16)),k[3]&&(f=R((i=k[3].charAt(3))+i,16),e=R((i=k[3].charAt(2))+i,16),d=R((i=k[3].charAt(1))+i,16)),k[4]&&(j=k[4][s](W),d=Q(j[0]),j[0].slice(-1)=="%"&&(d*=2.55),e=Q(j[1]),j[1].slice(-1)=="%"&&(e*=2.55),f=Q(j[2]),j[2].slice(-1)=="%"&&(f*=2.55),k[1].toLowerCase().slice(0,4)=="rgba"&&(h=Q(j[3])),j[3]&&j[3].slice(-1)=="%"&&(h/=100));if(k[5]){j=k[5][s](W),d=Q(j[0]),j[0].slice(-1)=="%"&&(d*=2.55),e=Q(j[1]),j[1].slice(-1)=="%"&&(e*=2.55),f=Q(j[2]),j[2].slice(-1)=="%"&&(f*=2.55),(j[0].slice(-3)=="deg"||j[0].slice(-1)=="�")&&(d/=360),k[1].toLowerCase().slice(0,4)=="hsba"&&(h=Q(j[3])),j[3]&&j[3].slice(-1)=="%"&&(h/=100);return a.hsb2rgb(d,e,f,h)}if(k[6]){j=k[6][s](W),d=Q(j[0]),j[0].slice(-1)=="%"&&(d*=2.55),e=Q(j[1]),j[1].slice(-1)=="%"&&(e*=2.55),f=Q(j[2]),j[2].slice(-1)=="%"&&(f*=2.55),(j[0].slice(-3)=="deg"||j[0].slice(-1)=="�")&&(d/=360),k[1].toLowerCase().slice(0,4)=="hsla"&&(h=Q(j[3])),j[3]&&j[3].slice(-1)=="%"&&(h/=100);return a.hsl2rgb(d,e,f,h)}k={r:d,g:e,b:f,toString:bx},k.hex="#"+(16777216|f|e<<8|d<<16).toString(16).slice(1),a.is(h,"finite")&&(k.opacity=h);return k}return{r:-1,g:-1,b:-1,hex:"none",error:1,toString:bx}},a),a.hsb=bv(function(b,c,d){return a.hsb2rgb(b,c,d).hex}),a.hsl=bv(function(b,c,d){return a.hsl2rgb(b,c,d).hex}),a.rgb=bv(function(a,b,c){return"#"+(16777216|c|b<<8|a<<16).toString(16).slice(1)}),a.getColor=function(a){var b=this.getColor.start=this.getColor.start||{h:0,s:1,b:a||.75},c=this.hsb2rgb(b.h,b.s,b.b);b.h+=.075,b.h>1&&(b.h=0,b.s-=.2,b.s<=0&&(this.getColor.start={h:0,s:1,b:b.b}));return c.hex},a.getColor.reset=function(){delete this.start},a.parsePathString=function(b){if(!b)return null;var c=bz(b);if(c.arr)return bJ(c.arr);var d={a:7,c:6,h:1,l:2,m:2,r:4,q:4,s:4,t:2,v:1,z:0},e=[];a.is(b,E)&&a.is(b[0],E)&&(e=bJ(b)),e.length||r(b).replace(Z,function(a,b,c){var f=[],g=b.toLowerCase();c.replace(_,function(a,b){b&&f.push(+b)}),g=="m"&&f.length>2&&(e.push([b][n](f.splice(0,2))),g="l",b=b=="m"?"l":"L");if(g=="r")e.push([b][n](f));else while(f.length>=d[g]){e.push([b][n](f.splice(0,d[g])));if(!d[g])break}}),e.toString=a._path2string,c.arr=bJ(e);return e},a.parseTransformString=bv(function(b){if(!b)return null;var c={r:3,s:4,t:2,m:6},d=[];a.is(b,E)&&a.is(b[0],E)&&(d=bJ(b)),d.length||r(b).replace($,function(a,b,c){var e=[],f=v.call(b);c.replace(_,function(a,b){b&&e.push(+b)}),d.push([b][n](e))}),d.toString=a._path2string;return d});var bz=function(a){var b=bz.ps=bz.ps||{};b[a]?b[a].sleep=100:b[a]={sleep:100},setTimeout(function(){for(var c in b)b[g](c)&&c!=a&&(b[c].sleep--,!b[c].sleep&&delete b[c])});return b[a]};a.findDotsAtSegment=function(a,b,c,d,e,f,g,h,i){var j=1-i,k=A(j,3),l=A(j,2),m=i*i,n=m*i,o=k*a+l*3*i*c+j*3*i*i*e+n*g,p=k*b+l*3*i*d+j*3*i*i*f+n*h,q=a+2*i*(c-a)+m*(e-2*c+a),r=b+2*i*(d-b)+m*(f-2*d+b),s=c+2*i*(e-c)+m*(g-2*e+c),t=d+2*i*(f-d)+m*(h-2*f+d),u=j*a+i*c,v=j*b+i*d,x=j*e+i*g,y=j*f+i*h,z=90-w.atan2(q-s,r-t)*180/B;(q>s||r<t)&&(z+=180);return{x:o,y:p,m:{x:q,y:r},n:{x:s,y:t},start:{x:u,y:v},end:{x:x,y:y},alpha:z}},a.bezierBBox=function(b,c,d,e,f,g,h,i){a.is(b,"array")||(b=[b,c,d,e,f,g,h,i]);var j=bQ.apply(null,b);return{x:j.min.x,y:j.min.y,x2:j.max.x,y2:j.max.y,width:j.max.x-j.min.x,height:j.max.y-j.min.y}},a.isPointInsideBBox=function(a,b,c){return b>=a.x&&b<=a.x2&&c>=a.y&&c<=a.y2},a.isBBoxIntersect=function(b,c){var d=a.isPointInsideBBox;return d(c,b.x,b.y)||d(c,b.x2,b.y)||d(c,b.x,b.y2)||d(c,b.x2,b.y2)||d(b,c.x,c.y)||d(b,c.x2,c.y)||d(b,c.x,c.y2)||d(b,c.x2,c.y2)||(b.x<c.x2&&b.x>c.x||c.x<b.x2&&c.x>b.x)&&(b.y<c.y2&&b.y>c.y||c.y<b.y2&&c.y>b.y)},a.pathIntersection=function(a,b){return bH(a,b)},a.pathIntersectionNumber=function(a,b){return bH(a,b,1)},a.isPointInsidePath=function(b,c,d){var e=a.pathBBox(b);return a.isPointInsideBBox(e,c,d)&&bH(b,[["M",c,d],["H",e.x2+10]],1)%2==1},a._removedFactory=function(a){return function(){eve("raphael.log",null,"Rapha�l: you are calling to method �"+a+"� of removed object",a)}};var bI=a.pathBBox=function(a){var b=bz(a);if(b.bbox)return b.bbox;if(!a)return{x:0,y:0,width:0,height:0,x2:0,y2:0};a=bR(a);var c=0,d=0,e=[],f=[],g;for(var h=0,i=a.length;h<i;h++){g=a[h];if(g[0]=="M")c=g[1],d=g[2],e.push(c),f.push(d);else{var j=bQ(c,d,g[1],g[2],g[3],g[4],g[5],g[6]);e=e[n](j.min.x,j.max.x),f=f[n](j.min.y,j.max.y),c=g[5],d=g[6]}}var k=y[m](0,e),l=y[m](0,f),o=x[m](0,e),p=x[m](0,f),q={x:k,y:l,x2:o,y2:p,width:o-k,height:p-l};b.bbox=bm(q);return q},bJ=function(b){var c=bm(b);c.toString=a._path2string;return c},bK=a._pathToRelative=function(b){var c=bz(b);if(c.rel)return bJ(c.rel);if(!a.is(b,E)||!a.is(b&&b[0],E))b=a.parsePathString(b);var d=[],e=0,f=0,g=0,h=0,i=0;b[0][0]=="M"&&(e=b[0][1],f=b[0][2],g=e,h=f,i++,d.push(["M",e,f]));for(var j=i,k=b.length;j<k;j++){var l=d[j]=[],m=b[j];if(m[0]!=v.call(m[0])){l[0]=v.call(m[0]);switch(l[0]){case"a":l[1]=m[1],l[2]=m[2],l[3]=m[3],l[4]=m[4],l[5]=m[5],l[6]=+(m[6]-e).toFixed(3),l[7]=+(m[7]-f).toFixed(3);break;case"v":l[1]=+(m[1]-f).toFixed(3);break;case"m":g=m[1],h=m[2];default:for(var n=1,o=m.length;n<o;n++)l[n]=+(m[n]-(n%2?e:f)).toFixed(3)}}else{l=d[j]=[],m[0]=="m"&&(g=m[1]+e,h=m[2]+f);for(var p=0,q=m.length;p<q;p++)d[j][p]=m[p]}var r=d[j].length;switch(d[j][0]){case"z":e=g,f=h;break;case"h":e+=+d[j][r-1];break;case"v":f+=+d[j][r-1];break;default:e+=+d[j][r-2],f+=+d[j][r-1]}}d.toString=a._path2string,c.rel=bJ(d);return d},bL=a._pathToAbsolute=function(b){var c=bz(b);if(c.abs)return bJ(c.abs);if(!a.is(b,E)||!a.is(b&&b[0],E))b=a.parsePathString(b);if(!b||!b.length)return[["M",0,0]];var d=[],e=0,f=0,g=0,h=0,i=0;b[0][0]=="M"&&(e=+b[0][1],f=+b[0][2],g=e,h=f,i++,d[0]=["M",e,f]);var j=b.length==3&&b[0][0]=="M"&&b[1][0].toUpperCase()=="R"&&b[2][0].toUpperCase()=="Z";for(var k,l,m=i,o=b.length;m<o;m++){d.push(k=[]),l=b[m];if(l[0]!=S.call(l[0])){k[0]=S.call(l[0]);switch(k[0]){case"A":k[1]=l[1],k[2]=l[2],k[3]=l[3],k[4]=l[4],k[5]=l[5],k[6]=+(l[6]+e),k[7]=+(l[7]+f);break;case"V":k[1]=+l[1]+f;break;case"H":k[1]=+l[1]+e;break;case"R":var p=[e,f][n](l.slice(1));for(var q=2,r=p.length;q<r;q++)p[q]=+p[q]+e,p[++q]=+p[q]+f;d.pop(),d=d[n](by(p,j));break;case"M":g=+l[1]+e,h=+l[2]+f;default:for(q=1,r=l.length;q<r;q++)k[q]=+l[q]+(q%2?e:f)}}else if(l[0]=="R")p=[e,f][n](l.slice(1)),d.pop(),d=d[n](by(p,j)),k=["R"][n](l.slice(-2));else for(var s=0,t=l.length;s<t;s++)k[s]=l[s];switch(k[0]){case"Z":e=g,f=h;break;case"H":e=k[1];break;case"V":f=k[1];break;case"M":g=k[k.length-2],h=k[k.length-1];default:e=k[k.length-2],f=k[k.length-1]}}d.toString=a._path2string,c.abs=bJ(d);return d},bM=function(a,b,c,d){return[a,b,c,d,c,d]},bN=function(a,b,c,d,e,f){var g=1/3,h=2/3;return[g*a+h*c,g*b+h*d,g*e+h*c,g*f+h*d,e,f]},bO=function(a,b,c,d,e,f,g,h,i,j){var k=B*120/180,l=B/180*(+e||0),m=[],o,p=bv(function(a,b,c){var d=a*w.cos(c)-b*w.sin(c),e=a*w.sin(c)+b*w.cos(c);return{x:d,y:e}});if(!j){o=p(a,b,-l),a=o.x,b=o.y,o=p(h,i,-l),h=o.x,i=o.y;var q=w.cos(B/180*e),r=w.sin(B/180*e),t=(a-h)/2,u=(b-i)/2,v=t*t/(c*c)+u*u/(d*d);v>1&&(v=w.sqrt(v),c=v*c,d=v*d);var x=c*c,y=d*d,A=(f==g?-1:1)*w.sqrt(z((x*y-x*u*u-y*t*t)/(x*u*u+y*t*t))),C=A*c*u/d+(a+h)/2,D=A*-d*t/c+(b+i)/2,E=w.asin(((b-D)/d).toFixed(9)),F=w.asin(((i-D)/d).toFixed(9));E=a<C?B-E:E,F=h<C?B-F:F,E<0&&(E=B*2+E),F<0&&(F=B*2+F),g&&E>F&&(E=E-B*2),!g&&F>E&&(F=F-B*2)}else E=j[0],F=j[1],C=j[2],D=j[3];var G=F-E;if(z(G)>k){var H=F,I=h,J=i;F=E+k*(g&&F>E?1:-1),h=C+c*w.cos(F),i=D+d*w.sin(F),m=bO(h,i,c,d,e,0,g,I,J,[F,H,C,D])}G=F-E;var K=w.cos(E),L=w.sin(E),M=w.cos(F),N=w.sin(F),O=w.tan(G/4),P=4/3*c*O,Q=4/3*d*O,R=[a,b],S=[a+P*L,b-Q*K],T=[h+P*N,i-Q*M],U=[h,i];S[0]=2*R[0]-S[0],S[1]=2*R[1]-S[1];if(j)return[S,T,U][n](m);m=[S,T,U][n](m).join()[s](",");var V=[];for(var W=0,X=m.length;W<X;W++)V[W]=W%2?p(m[W-1],m[W],l).y:p(m[W],m[W+1],l).x;return V},bP=function(a,b,c,d,e,f,g,h,i){var j=1-i;return{x:A(j,3)*a+A(j,2)*3*i*c+j*3*i*i*e+A(i,3)*g,y:A(j,3)*b+A(j,2)*3*i*d+j*3*i*i*f+A(i,3)*h}},bQ=bv(function(a,b,c,d,e,f,g,h){var i=e-2*c+a-(g-2*e+c),j=2*(c-a)-2*(e-c),k=a-c,l=(-j+w.sqrt(j*j-4*i*k))/2/i,n=(-j-w.sqrt(j*j-4*i*k))/2/i,o=[b,h],p=[a,g],q;z(l)>"1e12"&&(l=.5),z(n)>"1e12"&&(n=.5),l>0&&l<1&&(q=bP(a,b,c,d,e,f,g,h,l),p.push(q.x),o.push(q.y)),n>0&&n<1&&(q=bP(a,b,c,d,e,f,g,h,n),p.push(q.x),o.push(q.y)),i=f-2*d+b-(h-2*f+d),j=2*(d-b)-2*(f-d),k=b-d,l=(-j+w.sqrt(j*j-4*i*k))/2/i,n=(-j-w.sqrt(j*j-4*i*k))/2/i,z(l)>"1e12"&&(l=.5),z(n)>"1e12"&&(n=.5),l>0&&l<1&&(q=bP(a,b,c,d,e,f,g,h,l),p.push(q.x),o.push(q.y)),n>0&&n<1&&(q=bP(a,b,c,d,e,f,g,h,n),p.push(q.x),o.push(q.y));return{min:{x:y[m](0,p),y:y[m](0,o)},max:{x:x[m](0,p),y:x[m](0,o)}}}),bR=a._path2curve=bv(function(a,b){var c=!b&&bz(a);if(!b&&c.curve)return bJ(c.curve);var d=bL(a),e=b&&bL(b),f={x:0,y:0,bx:0,by:0,X:0,Y:0,qx:null,qy:null},g={x:0,y:0,bx:0,by:0,X:0,Y:0,qx:null,qy:null},h=function(a,b){var c,d;if(!a)return["C",b.x,b.y,b.x,b.y,b.x,b.y];!(a[0]in{T:1,Q:1})&&(b.qx=b.qy=null);switch(a[0]){case"M":b.X=a[1],b.Y=a[2];break;case"A":a=["C"][n](bO[m](0,[b.x,b.y][n](a.slice(1))));break;case"S":c=b.x+(b.x-(b.bx||b.x)),d=b.y+(b.y-(b.by||b.y)),a=["C",c,d][n](a.slice(1));break;case"T":b.qx=b.x+(b.x-(b.qx||b.x)),b.qy=b.y+(b.y-(b.qy||b.y)),a=["C"][n](bN(b.x,b.y,b.qx,b.qy,a[1],a[2]));break;case"Q":b.qx=a[1],b.qy=a[2],a=["C"][n](bN(b.x,b.y,a[1],a[2],a[3],a[4]));break;case"L":a=["C"][n](bM(b.x,b.y,a[1],a[2]));break;case"H":a=["C"][n](bM(b.x,b.y,a[1],b.y));break;case"V":a=["C"][n](bM(b.x,b.y,b.x,a[1]));break;case"Z":a=["C"][n](bM(b.x,b.y,b.X,b.Y))}return a},i=function(a,b){if(a[b].length>7){a[b].shift();var c=a[b];while(c.length)a.splice(b++,0,["C"][n](c.splice(0,6)));a.splice(b,1),l=x(d.length,e&&e.length||0)}},j=function(a,b,c,f,g){a&&b&&a[g][0]=="M"&&b[g][0]!="M"&&(b.splice(g,0,["M",f.x,f.y]),c.bx=0,c.by=0,c.x=a[g][1],c.y=a[g][2],l=x(d.length,e&&e.length||0))};for(var k=0,l=x(d.length,e&&e.length||0);k<l;k++){d[k]=h(d[k],f),i(d,k),e&&(e[k]=h(e[k],g)),e&&i(e,k),j(d,e,f,g,k),j(e,d,g,f,k);var o=d[k],p=e&&e[k],q=o.length,r=e&&p.length;f.x=o[q-2],f.y=o[q-1],f.bx=Q(o[q-4])||f.x,f.by=Q(o[q-3])||f.y,g.bx=e&&(Q(p[r-4])||g.x),g.by=e&&(Q(p[r-3])||g.y),g.x=e&&p[r-2],g.y=e&&p[r-1]}e||(c.curve=bJ(d));return e?[d,e]:d},null,bJ),bS=a._parseDots=bv(function(b){var c=[];for(var d=0,e=b.length;d<e;d++){var f={},g=b[d].match(/^([^:]*):?([\d\.]*)/);f.color=a.getRGB(g[1]);if(f.color.error)return null;f.color=f.color.hex,g[2]&&(f.offset=g[2]+"%"),c.push(f)}for(d=1,e=c.length-1;d<e;d++)if(!c[d].offset){var h=Q(c[d-1].offset||0),i=0;for(var j=d+1;j<e;j++)if(c[j].offset){i=c[j].offset;break}i||(i=100,j=e),i=Q(i);var k=(i-h)/(j-d+1);for(;d<j;d++)h+=k,c[d].offset=h+"%"}return c}),bT=a._tear=function(a,b){a==b.top&&(b.top=a.prev),a==b.bottom&&(b.bottom=a.next),a.next&&(a.next.prev=a.prev),a.prev&&(a.prev.next=a.next)},bU=a._tofront=function(a,b){b.top!==a&&(bT(a,b),a.next=null,a.prev=b.top,b.top.next=a,b.top=a)},bV=a._toback=function(a,b){b.bottom!==a&&(bT(a,b),a.next=b.bottom,a.prev=null,b.bottom.prev=a,b.bottom=a)},bW=a._insertafter=function(a,b,c){bT(a,c),b==c.top&&(c.top=a),b.next&&(b.next.prev=a),a.next=b.next,a.prev=b,b.next=a},bX=a._insertbefore=function(a,b,c){bT(a,c),b==c.bottom&&(c.bottom=a),b.prev&&(b.prev.next=a),a.prev=b.prev,b.prev=a,a.next=b},bY=a.toMatrix=function(a,b){var c=bI(a),d={_:{transform:p},getBBox:function(){return c}};b$(d,b);return d.matrix},bZ=a.transformPath=function(a,b){return bj(a,bY(a,b))},b$=a._extractTransform=function(b,c){if(c==null)return b._.transform;c=r(c).replace(/\.{3}|\u2026/g,b._.transform||p);var d=a.parseTransformString(c),e=0,f=0,g=0,h=1,i=1,j=b._,k=new cb;j.transform=d||[];if(d)for(var l=0,m=d.length;l<m;l++){var n=d[l],o=n.length,q=r(n[0]).toLowerCase(),s=n[0]!=q,t=s?k.invert():0,u,v,w,x,y;q=="t"&&o==3?s?(u=t.x(0,0),v=t.y(0,0),w=t.x(n[1],n[2]),x=t.y(n[1],n[2]),k.translate(w-u,x-v)):k.translate(n[1],n[2]):q=="r"?o==2?(y=y||b.getBBox(1),k.rotate(n[1],y.x+y.width/2,y.y+y.height/2),e+=n[1]):o==4&&(s?(w=t.x(n[2],n[3]),x=t.y(n[2],n[3]),k.rotate(n[1],w,x)):k.rotate(n[1],n[2],n[3]),e+=n[1]):q=="s"?o==2||o==3?(y=y||b.getBBox(1),k.scale(n[1],n[o-1],y.x+y.width/2,y.y+y.height/2),h*=n[1],i*=n[o-1]):o==5&&(s?(w=t.x(n[3],n[4]),x=t.y(n[3],n[4]),k.scale(n[1],n[2],w,x)):k.scale(n[1],n[2],n[3],n[4]),h*=n[1],i*=n[2]):q=="m"&&o==7&&k.add(n[1],n[2],n[3],n[4],n[5],n[6]),j.dirtyT=1,b.matrix=k}b.matrix=k,j.sx=h,j.sy=i,j.deg=e,j.dx=f=k.e,j.dy=g=k.f,h==1&&i==1&&!e&&j.bbox?(j.bbox.x+=+f,j.bbox.y+=+g):j.dirtyT=1},b_=function(a){var b=a[0];switch(b.toLowerCase()){case"t":return[b,0,0];case"m":return[b,1,0,0,1,0,0];case"r":return a.length==4?[b,0,a[2],a[3]]:[b,0];case"s":return a.length==5?[b,1,1,a[3],a[4]]:a.length==3?[b,1,1]:[b,1]}},ca=a._equaliseTransform=function(b,c){c=r(c).replace(/\.{3}|\u2026/g,b),b=a.parseTransformString(b)||[],c=a.parseTransformString(c)||[];var d=x(b.length,c.length),e=[],f=[],g=0,h,i,j,k;for(;g<d;g++){j=b[g]||b_(c[g]),k=c[g]||b_(j);if(j[0]!=k[0]||j[0].toLowerCase()=="r"&&(j[2]!=k[2]||j[3]!=k[3])||j[0].toLowerCase()=="s"&&(j[3]!=k[3]||j[4]!=k[4]))return;e[g]=[],f[g]=[];for(h=0,i=x(j.length,k.length);h<i;h++)h in j&&(e[g][h]=j[h]),h in k&&(f[g][h]=k[h])}return{from:e,to:f}};a._getContainer=function(b,c,d,e){var f;f=e==null&&!a.is(b,"object")?h.doc.getElementById(b):b;if(f!=null){if(f.tagName)return c==null?{container:f,width:f.style.pixelWidth||f.offsetWidth,height:f.style.pixelHeight||f.offsetHeight}:{container:f,width:c,height:d};return{container:1,x:b,y:c,width:d,height:e}}},a.pathToRelative=bK,a._engine={},a.path2curve=bR,a.matrix=function(a,b,c,d,e,f){return new cb(a,b,c,d,e,f)},function(b){function d(a){var b=w.sqrt(c(a));a[0]&&(a[0]/=b),a[1]&&(a[1]/=b)}function c(a){return a[0]*a[0]+a[1]*a[1]}b.add=function(a,b,c,d,e,f){var g=[[],[],[]],h=[[this.a,this.c,this.e],[this.b,this.d,this.f],[0,0,1]],i=[[a,c,e],[b,d,f],[0,0,1]],j,k,l,m;a&&a instanceof cb&&(i=[[a.a,a.c,a.e],[a.b,a.d,a.f],[0,0,1]]);for(j=0;j<3;j++)for(k=0;k<3;k++){m=0;for(l=0;l<3;l++)m+=h[j][l]*i[l][k];g[j][k]=m}this.a=g[0][0],this.b=g[1][0],this.c=g[0][1],this.d=g[1][1],this.e=g[0][2],this.f=g[1][2]},b.invert=function(){var a=this,b=a.a*a.d-a.b*a.c;return new cb(a.d/b,-a.b/b,-a.c/b,a.a/b,(a.c*a.f-a.d*a.e)/b,(a.b*a.e-a.a*a.f)/b)},b.clone=function(){return new cb(this.a,this.b,this.c,this.d,this.e,this.f)},b.translate=function(a,b){this.add(1,0,0,1,a,b)},b.scale=function(a,b,c,d){b==null&&(b=a),(c||d)&&this.add(1,0,0,1,c,d),this.add(a,0,0,b,0,0),(c||d)&&this.add(1,0,0,1,-c,-d)},b.rotate=function(b,c,d){b=a.rad(b),c=c||0,d=d||0;var e=+w.cos(b).toFixed(9),f=+w.sin(b).toFixed(9);this.add(e,f,-f,e,c,d),this.add(1,0,0,1,-c,-d)},b.x=function(a,b){return a*this.a+b*this.c+this.e},b.y=function(a,b){return a*this.b+b*this.d+this.f},b.get=function(a){return+this[r.fromCharCode(97+a)].toFixed(4)},b.toString=function(){return a.svg?"matrix("+[this.get(0),this.get(1),this.get(2),this.get(3),this.get(4),this.get(5)].join()+")":[this.get(0),this.get(2),this.get(1),this.get(3),0,0].join()},b.toFilter=function(){return"progid:DXImageTransform.Microsoft.Matrix(M11="+this.get(0)+", M12="+this.get(2)+", M21="+this.get(1)+", M22="+this.get(3)+", Dx="+this.get(4)+", Dy="+this.get(5)+", sizingmethod='auto expand')"},b.offset=function(){return[this.e.toFixed(4),this.f.toFixed(4)]},b.split=function(){var b={};b.dx=this.e,b.dy=this.f;var e=[[this.a,this.c],[this.b,this.d]];b.scalex=w.sqrt(c(e[0])),d(e[0]),b.shear=e[0][0]*e[1][0]+e[0][1]*e[1][1],e[1]=[e[1][0]-e[0][0]*b.shear,e[1][1]-e[0][1]*b.shear],b.scaley=w.sqrt(c(e[1])),d(e[1]),b.shear/=b.scaley;var f=-e[0][1],g=e[1][1];g<0?(b.rotate=a.deg(w.acos(g)),f<0&&(b.rotate=360-b.rotate)):b.rotate=a.deg(w.asin(f)),b.isSimple=!+b.shear.toFixed(9)&&(b.scalex.toFixed(9)==b.scaley.toFixed(9)||!b.rotate),b.isSuperSimple=!+b.shear.toFixed(9)&&b.scalex.toFixed(9)==b.scaley.toFixed(9)&&!b.rotate,b.noRotation=!+b.shear.toFixed(9)&&!b.rotate;return b},b.toTransformString=function(a){var b=a||this[s]();if(b.isSimple){b.scalex=+b.scalex.toFixed(4),b.scaley=+b.scaley.toFixed(4),b.rotate=+b.rotate.toFixed(4);return(b.dx||b.dy?"t"+[b.dx,b.dy]:p)+(b.scalex!=1||b.scaley!=1?"s"+[b.scalex,b.scaley,0,0]:p)+(b.rotate?"r"+[b.rotate,0,0]:p)}return"m"+[this.get(0),this.get(1),this.get(2),this.get(3),this.get(4),this.get(5)]}}(cb.prototype);var cc=navigator.userAgent.match(/Version\/(.*?)\s/)||navigator.userAgent.match(/Chrome\/(\d+)/);navigator.vendor=="Apple Computer, Inc."&&(cc&&cc[1]<4||navigator.platform.slice(0,2)=="iP")||navigator.vendor=="Google Inc."&&cc&&cc[1]<8?k.safari=function(){var a=this.rect(-99,-99,this.width+99,this.height+99).attr({stroke:"none"});setTimeout(function(){a.remove()})}:k.safari=be;var cd=function(){this.returnValue=!1},ce=function(){return this.originalEvent.preventDefault()},cf=function(){this.cancelBubble=!0},cg=function(){return this.originalEvent.stopPropagation()},ch=function(){if(h.doc.addEventListener)return function(a,b,c,d){var e=o&&u[b]?u[b]:b,f=function(e){var f=h.doc.documentElement.scrollTop||h.doc.body.scrollTop,i=h.doc.documentElement.scrollLeft||h.doc.body.scrollLeft,j=e.clientX+i,k=e.clientY+f;if(o&&u[g](b))for(var l=0,m=e.targetTouches&&e.targetTouches.length;l<m;l++)if(e.targetTouches[l].target==a){var n=e;e=e.targetTouches[l],e.originalEvent=n,e.preventDefault=ce,e.stopPropagation=cg;break}return c.call(d,e,j,k)};a.addEventListener(e,f,!1);return function(){a.removeEventListener(e,f,!1);return!0}};if(h.doc.attachEvent)return function(a,b,c,d){var e=function(a){a=a||h.win.event;var b=h.doc.documentElement.scrollTop||h.doc.body.scrollTop,e=h.doc.documentElement.scrollLeft||h.doc.body.scrollLeft,f=a.clientX+e,g=a.clientY+b;a.preventDefault=a.preventDefault||cd,a.stopPropagation=a.stopPropagation||cf;return c.call(d,a,f,g)};a.attachEvent("on"+b,e);var f=function(){a.detachEvent("on"+b,e);return!0};return f}}(),ci=[],cj=function(a){var b=a.clientX,c=a.clientY,d=h.doc.documentElement.scrollTop||h.doc.body.scrollTop,e=h.doc.documentElement.scrollLeft||h.doc.body.scrollLeft,f,g=ci.length;while(g--){f=ci[g];if(o){var i=a.touches.length,j;while(i--){j=a.touches[i];if(j.identifier==f.el._drag.id){b=j.clientX,c=j.clientY,(a.originalEvent?a.originalEvent:a).preventDefault();break}}}else a.preventDefault();var k=f.el.node,l,m=k.nextSibling,n=k.parentNode,p=k.style.display;h.win.opera&&n.removeChild(k),k.style.display="none",l=f.el.paper.getElementByPoint(b,c),k.style.display=p,h.win.opera&&(m?n.insertBefore(k,m):n.appendChild(k)),l&&eve("raphael.drag.over."+f.el.id,f.el,l),b+=e,c+=d,eve("raphael.drag.move."+f.el.id,f.move_scope||f.el,b-f.el._drag.x,c-f.el._drag.y,b,c,a)}},ck=function(b){a.unmousemove(cj).unmouseup(ck);var c=ci.length,d;while(c--)d=ci[c],d.el._drag={},eve("raphael.drag.end."+d.el.id,d.end_scope||d.start_scope||d.move_scope||d.el,b);ci=[]},cl=a.el={};for(var cm=t.length;cm--;)(function(b){a[b]=cl[b]=function(c,d){a.is(c,"function")&&(this.events=this.events||[],this.events.push({name:b,f:c,unbind:ch(this.shape||this.node||h.doc,b,c,d||this)}));return this},a["un"+b]=cl["un"+b]=function(a){var c=this.events||[],d=c.length;while(d--)if(c[d].name==b&&c[d].f==a){c[d].unbind(),c.splice(d,1),!c.length&&delete this.events;return this}return this}})(t[cm]);cl.data=function(b,c){var d=bb[this.id]=bb[this.id]||{};if(arguments.length==1){if(a.is(b,"object")){for(var e in b)b[g](e)&&this.data(e,b[e]);return this}eve("raphael.data.get."+this.id,this,d[b],b);return d[b]}d[b]=c,eve("raphael.data.set."+this.id,this,c,b);return this},cl.removeData=function(a){a==null?bb[this.id]={}:bb[this.id]&&delete bb[this.id][a];return this},cl.hover=function(a,b,c,d){return this.mouseover(a,c).mouseout(b,d||c)},cl.unhover=function(a,b){return this.unmouseover(a).unmouseout(b)};var cn=[];cl.drag=function(b,c,d,e,f,g){function i(i){(i.originalEvent||i).preventDefault();var j=h.doc.documentElement.scrollTop||h.doc.body.scrollTop,k=h.doc.documentElement.scrollLeft||h.doc.body.scrollLeft;this._drag.x=i.clientX+k,this._drag.y=i.clientY+j,this._drag.id=i.identifier,!ci.length&&a.mousemove(cj).mouseup(ck),ci.push({el:this,move_scope:e,start_scope:f,end_scope:g}),c&&eve.on("raphael.drag.start."+this.id,c),b&&eve.on("raphael.drag.move."+this.id,b),d&&eve.on("raphael.drag.end."+this.id,d),eve("raphael.drag.start."+this.id,f||e||this,i.clientX+k,i.clientY+j,i)}this._drag={},cn.push({el:this,start:i}),this.mousedown(i);return this},cl.onDragOver=function(a){a?eve.on("raphael.drag.over."+this.id,a):eve.unbind("raphael.drag.over."+this.id)},cl.undrag=function(){var b=cn.length;while(b--)cn[b].el==this&&(this.unmousedown(cn[b].start),cn.splice(b,1),eve.unbind("raphael.drag.*."+this.id));!cn.length&&a.unmousemove(cj).unmouseup(ck)},k.circle=function(b,c,d){var e=a._engine.circle(this,b||0,c||0,d||0);this.__set__&&this.__set__.push(e);return e},k.rect=function(b,c,d,e,f){var g=a._engine.rect(this,b||0,c||0,d||0,e||0,f||0);this.__set__&&this.__set__.push(g);return g},k.ellipse=function(b,c,d,e){var f=a._engine.ellipse(this,b||0,c||0,d||0,e||0);this.__set__&&this.__set__.push(f);return f},k.path=function(b){b&&!a.is(b,D)&&!a.is(b[0],E)&&(b+=p);var c=a._engine.path(a.format[m](a,arguments),this);this.__set__&&this.__set__.push(c);return c},k.image=function(b,c,d,e,f){var g=a._engine.image(this,b||"about:blank",c||0,d||0,e||0,f||0);this.__set__&&this.__set__.push(g);return g},k.text=function(b,c,d){var e=a._engine.text(this,b||0,c||0,r(d));this.__set__&&this.__set__.push(e);return e},k.set=function(b){!a.is(b,"array")&&(b=Array.prototype.splice.call(arguments,0,arguments.length));var c=new cG(b);this.__set__&&this.__set__.push(c);return c},k.setStart=function(a){this.__set__=a||this.set()},k.setFinish=function(a){var b=this.__set__;delete this.__set__;return b},k.setSize=function(b,c){return a._engine.setSize.call(this,b,c)},k.setViewBox=function(b,c,d,e,f){return a._engine.setViewBox.call(this,b,c,d,e,f)},k.top=k.bottom=null,k.raphael=a;var co=function(a){var b=a.getBoundingClientRect(),c=a.ownerDocument,d=c.body,e=c.documentElement,f=e.clientTop||d.clientTop||0,g=e.clientLeft||d.clientLeft||0,i=b.top+(h.win.pageYOffset||e.scrollTop||d.scrollTop)-f,j=b.left+(h.win.pageXOffset||e.scrollLeft||d.scrollLeft)-g;return{y:i,x:j}};k.getElementByPoint=function(a,b){var c=this,d=c.canvas,e=h.doc.elementFromPoint(a,b);if(h.win.opera&&e.tagName=="svg"){var f=co(d),g=d.createSVGRect();g.x=a-f.x,g.y=b-f.y,g.width=g.height=1;var i=d.getIntersectionList(g,null);i.length&&(e=i[i.length-1])}if(!e)return null;while(e.parentNode&&e!=d.parentNode&&!e.raphael)e=e.parentNode;e==c.canvas.parentNode&&(e=d),e=e&&e.raphael?c.getById(e.raphaelid):null;return e},k.getById=function(a){var b=this.bottom;while(b){if(b.id==a)return b;b=b.next}return null},k.forEach=function(a,b){var c=this.bottom;while(c){if(a.call(b,c)===!1)return this;c=c.next}return this},k.getElementsByPoint=function(a,b){var c=this.set();this.forEach(function(d){d.isPointInside(a,b)&&c.push(d)});return c},cl.isPointInside=function(b,c){var d=this.realPath=this.realPath||bi[this.type](this);return a.isPointInsidePath(d,b,c)},cl.getBBox=function(a){if(this.removed)return{};var b=this._;if(a){if(b.dirty||!b.bboxwt)this.realPath=bi[this.type](this),b.bboxwt=bI(this.realPath),b.bboxwt.toString=cq,b.dirty=0;return b.bboxwt}if(b.dirty||b.dirtyT||!b.bbox){if(b.dirty||!this.realPath)b.bboxwt=0,this.realPath=bi[this.type](this);b.bbox=bI(bj(this.realPath,this.matrix)),b.bbox.toString=cq,b.dirty=b.dirtyT=0}return b.bbox},cl.clone=function(){if(this.removed)return null;var a=this.paper[this.type]().attr(this.attr());this.__set__&&this.__set__.push(a);return a},cl.glow=function(a){if(this.type=="text")return null;a=a||{};var b={width:(a.width||10)+(+this.attr("stroke-width")||1),fill:a.fill||!1,opacity:a.opacity||.5,offsetx:a.offsetx||0,offsety:a.offsety||0,color:a.color||"#000"},c=b.width/2,d=this.paper,e=d.set(),f=this.realPath||bi[this.type](this);f=this.matrix?bj(f,this.matrix):f;for(var g=1;g<c+1;g++)e.push(d.path(f).attr({stroke:b.color,fill:b.fill?b.color:"none","stroke-linejoin":"round","stroke-linecap":"round","stroke-width":+(b.width/c*g).toFixed(3),opacity:+(b.opacity/c).toFixed(3)}));return e.insertBefore(this).translate(b.offsetx,b.offsety)};var cr={},cs=function(b,c,d,e,f,g,h,i,j){return j==null?bB(b,c,d,e,f,g,h,i):a.findDotsAtSegment(b,c,d,e,f,g,h,i,bC(b,c,d,e,f,g,h,i,j))},ct=function(b,c){return function(d,e,f){d=bR(d);var g,h,i,j,k="",l={},m,n=0;for(var o=0,p=d.length;o<p;o++){i=d[o];if(i[0]=="M")g=+i[1],h=+i[2];else{j=cs(g,h,i[1],i[2],i[3],i[4],i[5],i[6]);if(n+j>e){if(c&&!l.start){m=cs(g,h,i[1],i[2],i[3],i[4],i[5],i[6],e-n),k+=["C"+m.start.x,m.start.y,m.m.x,m.m.y,m.x,m.y];if(f)return k;l.start=k,k=["M"+m.x,m.y+"C"+m.n.x,m.n.y,m.end.x,m.end.y,i[5],i[6]].join(),n+=j,g=+i[5],h=+i[6];continue}if(!b&&!c){m=cs(g,h,i[1],i[2],i[3],i[4],i[5],i[6],e-n);return{x:m.x,y:m.y,alpha:m.alpha}}}n+=j,g=+i[5],h=+i[6]}k+=i.shift()+i}l.end=k,m=b?n:c?l:a.findDotsAtSegment(g,h,i[0],i[1],i[2],i[3],i[4],i[5],1),m.alpha&&(m={x:m.x,y:m.y,alpha:m.alpha});return m}},cu=ct(1),cv=ct(),cw=ct(0,1);a.getTotalLength=cu,a.getPointAtLength=cv,a.getSubpath=function(a,b,c){if(this.getTotalLength(a)-c<1e-6)return cw(a,b).end;var d=cw(a,c,1);return b?cw(d,b).end:d},cl.getTotalLength=function(){if(this.type=="path"){if(this.node.getTotalLength)return this.node.getTotalLength();return cu(this.attrs.path)}},cl.getPointAtLength=function(a){if(this.type=="path")return cv(this.attrs.path,a)},cl.getSubpath=function(b,c){if(this.type=="path")return a.getSubpath(this.attrs.path,b,c)};var cx=a.easing_formulas={linear:function(a){return a},"<":function(a){return A(a,1.7)},">":function(a){return A(a,.48)},"<>":function(a){var b=.48-a/1.04,c=w.sqrt(.1734+b*b),d=c-b,e=A(z(d),1/3)*(d<0?-1:1),f=-c-b,g=A(z(f),1/3)*(f<0?-1:1),h=e+g+.5;return(1-h)*3*h*h+h*h*h},backIn:function(a){var b=1.70158;return a*a*((b+1)*a-b)},backOut:function(a){a=a-1;var b=1.70158;return a*a*((b+1)*a+b)+1},elastic:function(a){if(a==!!a)return a;return A(2,-10*a)*w.sin((a-.075)*2*B/.3)+1},bounce:function(a){var b=7.5625,c=2.75,d;a<1/c?d=b*a*a:a<2/c?(a-=1.5/c,d=b*a*a+.75):a<2.5/c?(a-=2.25/c,d=b*a*a+.9375):(a-=2.625/c,d=b*a*a+.984375);return d}};cx.easeIn=cx["ease-in"]=cx["<"],cx.easeOut=cx["ease-out"]=cx[">"],cx.easeInOut=cx["ease-in-out"]=cx["<>"],cx["back-in"]=cx.backIn,cx["back-out"]=cx.backOut;var cy=[],cz=window.requestAnimationFrame||window.webkitRequestAnimationFrame||window.mozRequestAnimationFrame||window.oRequestAnimationFrame||window.msRequestAnimationFrame||function(a){setTimeout(a,16)},cA=function(){var b=+(new Date),c=0;for(;c<cy.length;c++){var d=cy[c];if(d.el.removed||d.paused)continue;var e=b-d.start,f=d.ms,h=d.easing,i=d.from,j=d.diff,k=d.to,l=d.t,m=d.el,o={},p,r={},s;d.initstatus?(e=(d.initstatus*d.anim.top-d.prev)/(d.percent-d.prev)*f,d.status=d.initstatus,delete d.initstatus,d.stop&&cy.splice(c--,1)):d.status=(d.prev+(d.percent-d.prev)*(e/f))/d.anim.top;if(e<0)continue;if(e<f){var t=h(e/f);for(var u in i)if(i[g](u)){switch(U[u]){case C:p=+i[u]+t*f*j[u];break;case"colour":p="rgb("+[cB(O(i[u].r+t*f*j[u].r)),cB(O(i[u].g+t*f*j[u].g)),cB(O(i[u].b+t*f*j[u].b))].join(",")+")";break;case"path":p=[];for(var v=0,w=i[u].length;v<w;v++){p[v]=[i[u][v][0]];for(var x=1,y=i[u][v].length;x<y;x++)p[v][x]=+i[u][v][x]+t*f*j[u][v][x];p[v]=p[v].join(q)}p=p.join(q);break;case"transform":if(j[u].real){p=[];for(v=0,w=i[u].length;v<w;v++){p[v]=[i[u][v][0]];for(x=1,y=i[u][v].length;x<y;x++)p[v][x]=i[u][v][x]+t*f*j[u][v][x]}}else{var z=function(a){return+i[u][a]+t*f*j[u][a]};p=[["m",z(0),z(1),z(2),z(3),z(4),z(5)]]}break;case"csv":if(u=="clip-rect"){p=[],v=4;while(v--)p[v]=+i[u][v]+t*f*j[u][v]}break;default:var A=[][n](i[u]);p=[],v=m.paper.customAttributes[u].length;while(v--)p[v]=+A[v]+t*f*j[u][v]}o[u]=p}m.attr(o),function(a,b,c){setTimeout(function(){eve("raphael.anim.frame."+a,b,c)})}(m.id,m,d.anim)}else{(function(b,c,d){setTimeout(function(){eve("raphael.anim.frame."+c.id,c,d),eve("raphael.anim.finish."+c.id,c,d),a.is(b,"function")&&b.call(c)})})(d.callback,m,d.anim),m.attr(k),cy.splice(c--,1);if(d.repeat>1&&!d.next){for(s in k)k[g](s)&&(r[s]=d.totalOrigin[s]);d.el.attr(r),cE(d.anim,d.el,d.anim.percents[0],null,d.totalOrigin,d.repeat-1)}d.next&&!d.stop&&cE(d.anim,d.el,d.next,null,d.totalOrigin,d.repeat)}}a.svg&&m&&m.paper&&m.paper.safari(),cy.length&&cz(cA)},cB=function(a){return a>255?255:a<0?0:a};cl.animateWith=function(b,c,d,e,f,g){var h=this;if(h.removed){g&&g.call(h);return h}var i=d instanceof cD?d:a.animation(d,e,f,g),j,k;cE(i,h,i.percents[0],null,h.attr());for(var l=0,m=cy.length;l<m;l++)if(cy[l].anim==c&&cy[l].el==b){cy[m-1].start=cy[l].start;break}return h},cl.onAnimation=function(a){a?eve.on("raphael.anim.frame."+this.id,a):eve.unbind("raphael.anim.frame."+this.id);return this},cD.prototype.delay=function(a){var b=new cD(this.anim,this.ms);b.times=this.times,b.del=+a||0;return b},cD.prototype.repeat=function(a){var b=new cD(this.anim,this.ms);b.del=this.del,b.times=w.floor(x(a,0))||1;return b},a.animation=function(b,c,d,e){if(b instanceof cD)return b;if(a.is(d,"function")||!d)e=e||d||null,d=null;b=Object(b),c=+c||0;var f={},h,i;for(i in b)b[g](i)&&Q(i)!=i&&Q(i)+"%"!=i&&(h=!0,f[i]=b[i]);if(!h)return new cD(b,c);d&&(f.easing=d),e&&(f.callback=e);return new cD({100:f},c)},cl.animate=function(b,c,d,e){var f=this;if(f.removed){e&&e.call(f);return f}var g=b instanceof cD?b:a.animation(b,c,d,e);cE(g,f,g.percents[0],null,f.attr());return f},cl.setTime=function(a,b){a&&b!=null&&this.status(a,y(b,a.ms)/a.ms);return this},cl.status=function(a,b){var c=[],d=0,e,f;if(b!=null){cE(a,this,-1,y(b,1));return this}e=cy.length;for(;d<e;d++){f=cy[d];if(f.el.id==this.id&&(!a||f.anim==a)){if(a)return f.status;c.push({anim:f.anim,status:f.status})}}if(a)return 0;return c},cl.pause=function(a){for(var b=0;b<cy.length;b++)cy[b].el.id==this.id&&(!a||cy[b].anim==a)&&eve("raphael.anim.pause."+this.id,this,cy[b].anim)!==!1&&(cy[b].paused=!0);return this},cl.resume=function(a){for(var b=0;b<cy.length;b++)if(cy[b].el.id==this.id&&(!a||cy[b].anim==a)){var c=cy[b];eve("raphael.anim.resume."+this.id,this,c.anim)!==!1&&(delete c.paused,this.status(c.anim,c.status))}return this},cl.stop=function(a){for(var b=0;b<cy.length;b++)cy[b].el.id==this.id&&(!a||cy[b].anim==a)&&eve("raphael.anim.stop."+this.id,this,cy[b].anim)!==!1&&cy.splice(b--,1);return this},eve.on("raphael.remove",cF),eve.on("raphael.clear",cF),cl.toString=function(){return"Rapha�l�s object"};var cG=function(a){this.items=[],this.length=0,this.type="set";if(a)for(var b=0,c=a.length;b<c;b++)a[b]&&(a[b].constructor==cl.constructor||a[b].constructor==cG)&&(this[this.items.length]=this.items[this.items.length]=a[b],this.length++)},cH=cG.prototype;cH.push=function(){var a,b;for(var c=0,d=arguments.length;c<d;c++)a=arguments[c],a&&(a.constructor==cl.constructor||a.constructor==cG)&&(b=this.items.length,this[b]=this.items[b]=a,this.length++);return this},cH.pop=function(){this.length&&delete this[this.length--];return this.items.pop()},cH.forEach=function(a,b){for(var c=0,d=this.items.length;c<d;c++)if(a.call(b,this.items[c],c)===!1)return this;return this};for(var cI in cl)cl[g](cI)&&(cH[cI]=function(a){return function(){var b=arguments;return this.forEach(function(c){c[a][m](c,b)})}}(cI));cH.attr=function(b,c){if(b&&a.is(b,E)&&a.is(b[0],"object"))for(var d=0,e=b.length;d<e;d++)this.items[d].attr(b[d]);else for(var f=0,g=this.items.length;f<g;f++)this.items[f].attr(b,c);return this},cH.clear=function(){while(this.length)this.pop()},cH.splice=function(a,b,c){a=a<0?x(this.length+a,0):a,b=x(0,y(this.length-a,b));var d=[],e=[],f=[],g;for(g=2;g<arguments.length;g++)f.push(arguments[g]);for(g=0;g<b;g++)e.push(this[a+g]);for(;g<this.length-a;g++)d.push(this[a+g]);var h=f.length;for(g=0;g<h+d.length;g++)this.items[a+g]=this[a+g]=g<h?f[g]:d[g-h];g=this.items.length=this.length-=b-h;while(this[g])delete this[g++];return new cG(e)},cH.exclude=function(a){for(var b=0,c=this.length;b<c;b++)if(this[b]==a){this.splice(b,1);return!0}},cH.animate=function(b,c,d,e){(a.is(d,"function")||!d)&&(e=d||null);var f=this.items.length,g=f,h,i=this,j;if(!f)return this;e&&(j=function(){!--f&&e.call(i)}),d=a.is(d,D)?d:j;var k=a.animation(b,c,d,j);h=this.items[--g].animate(k);while(g--)this.items[g]&&!this.items[g].removed&&this.items[g].animateWith(h,k,k);return this},cH.insertAfter=function(a){var b=this.items.length;while(b--)this.items[b].insertAfter(a);return this},cH.getBBox=function(){var a=[],b=[],c=[],d=[];for(var e=this.items.length;e--;)if(!this.items[e].removed){var f=this.items[e].getBBox();a.push(f.x),b.push(f.y),c.push(f.x+f.width),d.push(f.y+f.height)}a=y[m](0,a),b=y[m](0,b),c=x[m](0,c),d=x[m](0,d);return{x:a,y:b,x2:c,y2:d,width:c-a,height:d-b}},cH.clone=function(a){a=new cG;for(var b=0,c=this.items.length;b<c;b++)a.push(this.items[b].clone());return a},cH.toString=function(){return"Rapha�l�s set"},a.registerFont=function(a){if(!a.face)return a;this.fonts=this.fonts||{};var b={w:a.w,face:{},glyphs:{}},c=a.face["font-family"];for(var d in a.face)a.face[g](d)&&(b.face[d]=a.face[d]);this.fonts[c]?this.fonts[c].push(b):this.fonts[c]=[b];if(!a.svg){b.face["units-per-em"]=R(a.face["units-per-em"],10);for(var e in a.glyphs)if(a.glyphs[g](e)){var f=a.glyphs[e];b.glyphs[e]={w:f.w,k:{},d:f.d&&"M"+f.d.replace(/[mlcxtrv]/g,function(a){return{l:"L",c:"C",x:"z",t:"m",r:"l",v:"c"}[a]||"M"})+"z"};if(f.k)for(var h in f.k)f[g](h)&&(b.glyphs[e].k[h]=f.k[h])}}return a},k.getFont=function(b,c,d,e){e=e||"normal",d=d||"normal",c=+c||{normal:400,bold:700,lighter:300,bolder:800}[c]||400;if(!!a.fonts){var f=a.fonts[b];if(!f){var h=new RegExp("(^|\\s)"+b.replace(/[^\w\d\s+!~.:_-]/g,p)+"(\\s|$)","i");for(var i in a.fonts)if(a.fonts[g](i)&&h.test(i)){f=a.fonts[i];break}}var j;if(f)for(var k=0,l=f.length;k<l;k++){j=f[k];if(j.face["font-weight"]==c&&(j.face["font-style"]==d||!j.face["font-style"])&&j.face["font-stretch"]==e)break}return j}},k.print=function(b,d,e,f,g,h,i){h=h||"middle",i=x(y(i||0,1),-1);var j=r(e)[s](p),k=0,l=0,m=p,n;a.is(f,e)&&(f=this.getFont(f));if(f){n=(g||16)/f.face["units-per-em"];var o=f.face.bbox[s](c),q=+o[0],t=o[3]-o[1],u=0,v=+o[1]+(h=="baseline"?t+ +f.face.descent:t/2);for(var w=0,z=j.length;w<z;w++){if(j[w]=="\n")k=0,B=0,l=0,u+=t;else{var A=l&&f.glyphs[j[w-1]]||{},B=f.glyphs[j[w]];k+=l?(A.w||f.w)+(A.k&&A.k[j[w]]||0)+f.w*i:0,l=1}B&&B.d&&(m+=a.transformPath(B.d,["t",k*n,u*n,"s",n,n,q,v,"t",(b-q)/n,(d-v)/n]))}}return this.path(m).attr({fill:"#000",stroke:"none"})},k.add=function(b){if(a.is(b,"array")){var c=this.set(),e=0,f=b.length,h;for(;e<f;e++)h=b[e]||{},d[g](h.type)&&c.push(this[h.type]().attr(h))}return c},a.format=function(b,c){var d=a.is(c,E)?[0][n](c):arguments;b&&a.is(b,D)&&d.length-1&&(b=b.replace(e,function(a,b){return d[++b]==null?p:d[b]}));return b||p},a.fullfill=function(){var a=/\{([^\}]+)\}/g,b=/(?:(?:^|\.)(.+?)(?=\[|\.|$|\()|\[('|")(.+?)\2\])(\(\))?/g,c=function(a,c,d){var e=d;c.replace(b,function(a,b,c,d,f){b=b||d,e&&(b in e&&(e=e[b]),typeof e=="function"&&f&&(e=e()))}),e=(e==null||e==d?a:e)+"";return e};return function(b,d){return String(b).replace(a,function(a,b){return c(a,b,d)})}}(),a.ninja=function(){i.was?h.win.Raphael=i.is:delete Raphael;return a},a.st=cH,function(b,c,d){function e(){/in/.test(b.readyState)?setTimeout(e,9):a.eve("raphael.DOMload")}b.readyState==null&&b.addEventListener&&(b.addEventListener(c,d=function(){b.removeEventListener(c,d,!1),b.readyState="complete"},!1),b.readyState="loading"),e()}(document,"DOMContentLoaded"),i.was?h.win.Raphael=a:Raphael=a,eve.on("raphael.DOMload",function(){b=!0})}(),window.Raphael.svg&&function(a){var b="hasOwnProperty",c=String,d=parseFloat,e=parseInt,f=Math,g=f.max,h=f.abs,i=f.pow,j=/[, ]+/,k=a.eve,l="",m=" ",n="http://www.w3.org/1999/xlink",o={block:"M5,0 0,2.5 5,5z",classic:"M5,0 0,2.5 5,5 3.5,3 3.5,2z",diamond:"M2.5,0 5,2.5 2.5,5 0,2.5z",open:"M6,1 1,3.5 6,6",oval:"M2.5,0A2.5,2.5,0,0,1,2.5,5 2.5,2.5,0,0,1,2.5,0z"},p={};a.toString=function(){return"Your browser supports SVG.\nYou are running Rapha�l "+this.version};var q=function(d,e){if(e){typeof d=="string"&&(d=q(d));for(var f in e)e[b](f)&&(f.substring(0,6)=="xlink:"?d.setAttributeNS(n,f.substring(6),c(e[f])):d.setAttribute(f,c(e[f])))}else d=a._g.doc.createElementNS("http://www.w3.org/2000/svg",d),d.style&&(d.style.webkitTapHighlightColor="rgba(0,0,0,0)");return d},r=function(b,e){var j="linear",k=b.id+e,m=.5,n=.5,o=b.node,p=b.paper,r=o.style,s=a._g.doc.getElementById(k);if(!s){e=c(e).replace(a._radial_gradient,function(a,b,c){j="radial";if(b&&c){m=d(b),n=d(c);var e=(n>.5)*2-1;i(m-.5,2)+i(n-.5,2)>.25&&(n=f.sqrt(.25-i(m-.5,2))*e+.5)&&n!=.5&&(n=n.toFixed(5)-1e-5*e)}return l}),e=e.split(/\s*\-\s*/);if(j=="linear"){var t=e.shift();t=-d(t);if(isNaN(t))return null;var u=[0,0,f.cos(a.rad(t)),f.sin(a.rad(t))],v=1/(g(h(u[2]),h(u[3]))||1);u[2]*=v,u[3]*=v,u[2]<0&&(u[0]=-u[2],u[2]=0),u[3]<0&&(u[1]=-u[3],u[3]=0)}var w=a._parseDots(e);if(!w)return null;k=k.replace(/[\(\)\s,\xb0#]/g,"_"),b.gradient&&k!=b.gradient.id&&(p.defs.removeChild(b.gradient),delete b.gradient);if(!b.gradient){s=q(j+"Gradient",{id:k}),b.gradient=s,q(s,j=="radial"?{fx:m,fy:n}:{x1:u[0],y1:u[1],x2:u[2],y2:u[3],gradientTransform:b.matrix.invert()}),p.defs.appendChild(s);for(var x=0,y=w.length;x<y;x++)s.appendChild(q("stop",{offset:w[x].offset?w[x].offset:x?"100%":"0%","stop-color":w[x].color||"#fff"}))}}q(o,{fill:"url(#"+k+")",opacity:1,"fill-opacity":1}),r.fill=l,r.opacity=1,r.fillOpacity=1;return 1},s=function(a){var b=a.getBBox(1);q(a.pattern,{patternTransform:a.matrix.invert()+" translate("+b.x+","+b.y+")"})},t=function(d,e,f){if(d.type=="path"){var g=c(e).toLowerCase().split("-"),h=d.paper,i=f?"end":"start",j=d.node,k=d.attrs,m=k["stroke-width"],n=g.length,r="classic",s,t,u,v,w,x=3,y=3,z=5;while(n--)switch(g[n]){case"block":case"classic":case"oval":case"diamond":case"open":case"none":r=g[n];break;case"wide":y=5;break;case"narrow":y=2;break;case"long":x=5;break;case"short":x=2}r=="open"?(x+=2,y+=2,z+=2,u=1,v=f?4:1,w={fill:"none",stroke:k.stroke}):(v=u=x/2,w={fill:k.stroke,stroke:"none"}),d._.arrows?f?(d._.arrows.endPath&&p[d._.arrows.endPath]--,d._.arrows.endMarker&&p[d._.arrows.endMarker]--):(d._.arrows.startPath&&p[d._.arrows.startPath]--,d._.arrows.startMarker&&p[d._.arrows.startMarker]--):d._.arrows={};if(r!="none"){var A="raphael-marker-"+r,B="raphael-marker-"+i+r+x+y;a._g.doc.getElementById(A)?p[A]++:(h.defs.appendChild(q(q("path"),{"stroke-linecap":"round",d:o[r],id:A})),p[A]=1);var C=a._g.doc.getElementById(B),D;C?(p[B]++,D=C.getElementsByTagName("use")[0]):(C=q(q("marker"),{id:B,markerHeight:y,markerWidth:x,orient:"auto",refX:v,refY:y/2}),D=q(q("use"),{"xlink:href":"#"+A,transform:(f?"rotate(180 "+x/2+" "+y/2+") ":l)+"scale("+x/z+","+y/z+")","stroke-width":(1/((x/z+y/z)/2)).toFixed(4)}),C.appendChild(D),h.defs.appendChild(C),p[B]=1),q(D,w);var F=u*(r!="diamond"&&r!="oval");f?(s=d._.arrows.startdx*m||0,t=a.getTotalLength(k.path)-F*m):(s=F*m,t=a.getTotalLength(k.path)-(d._.arrows.enddx*m||0)),w={},w["marker-"+i]="url(#"+B+")";if(t||s)w.d=Raphael.getSubpath(k.path,s,t);q(j,w),d._.arrows[i+"Path"]=A,d._.arrows[i+"Marker"]=B,d._.arrows[i+"dx"]=F,d._.arrows[i+"Type"]=r,d._.arrows[i+"String"]=e}else f?(s=d._.arrows.startdx*m||0,t=a.getTotalLength(k.path)-s):(s=0,t=a.getTotalLength(k.path)-(d._.arrows.enddx*m||0)),d._.arrows[i+"Path"]&&q(j,{d:Raphael.getSubpath(k.path,s,t)}),delete d._.arrows[i+"Path"],delete d._.arrows[i+"Marker"],delete d._.arrows[i+"dx"],delete d._.arrows[i+"Type"],delete d._.arrows[i+"String"];for(w in p)if(p[b](w)&&!p[w]){var G=a._g.doc.getElementById(w);G&&G.parentNode.removeChild(G)}}},u={"":[0],none:[0],"-":[3,1],".":[1,1],"-.":[3,1,1,1],"-..":[3,1,1,1,1,1],". ":[1,3],"- ":[4,3],"--":[8,3],"- .":[4,3,1,3],"--.":[8,3,1,3],"--..":[8,3,1,3,1,3]},v=function(a,b,d){b=u[c(b).toLowerCase()];if(b){var e=a.attrs["stroke-width"]||"1",f={round:e,square:e,butt:0}[a.attrs["stroke-linecap"]||d["stroke-linecap"]]||0,g=[],h=b.length;while(h--)g[h]=b[h]*e+(h%2?1:-1)*f;q(a.node,{"stroke-dasharray":g.join(",")})}},w=function(d,f){var i=d.node,k=d.attrs,m=i.style.visibility;i.style.visibility="hidden";for(var o in f)if(f[b](o)){if(!a._availableAttrs[b](o))continue;var p=f[o];k[o]=p;switch(o){case"blur":d.blur(p);break;case"href":case"title":case"target":var u=i.parentNode;if(u.tagName.toLowerCase()!="a"){var w=q("a");u.insertBefore(w,i),w.appendChild(i),u=w}o=="target"?u.setAttributeNS(n,"show",p=="blank"?"new":p):u.setAttributeNS(n,o,p);break;case"cursor":i.style.cursor=p;break;case"transform":d.transform(p);break;case"arrow-start":t(d,p);break;case"arrow-end":t(d,p,1);break;case"clip-rect":var x=c(p).split(j);if(x.length==4){d.clip&&d.clip.parentNode.parentNode.removeChild(d.clip.parentNode);var z=q("clipPath"),A=q("rect");z.id=a.createUUID(),q(A,{x:x[0],y:x[1],width:x[2],height:x[3]}),z.appendChild(A),d.paper.defs.appendChild(z),q(i,{"clip-path":"url(#"+z.id+")"}),d.clip=A}if(!p){var B=i.getAttribute("clip-path");if(B){var C=a._g.doc.getElementById(B.replace(/(^url\(#|\)$)/g,l));C&&C.parentNode.removeChild(C),q(i,{"clip-path":l}),delete d.clip}}break;case"path":d.type=="path"&&(q(i,{d:p?k.path=a._pathToAbsolute(p):"M0,0"}),d._.dirty=1,d._.arrows&&("startString"in d._.arrows&&t(d,d._.arrows.startString),"endString"in d._.arrows&&t(d,d._.arrows.endString,1)));break;case"width":i.setAttribute(o,p),d._.dirty=1;if(k.fx)o="x",p=k.x;else break;case"x":k.fx&&(p=-k.x-(k.width||0));case"rx":if(o=="rx"&&d.type=="rect")break;case"cx":i.setAttribute(o,p),d.pattern&&s(d),d._.dirty=1;break;case"height":i.setAttribute(o,p),d._.dirty=1;if(k.fy)o="y",p=k.y;else break;case"y":k.fy&&(p=-k.y-(k.height||0));case"ry":if(o=="ry"&&d.type=="rect")break;case"cy":i.setAttribute(o,p),d.pattern&&s(d),d._.dirty=1;break;case"r":d.type=="rect"?q(i,{rx:p,ry:p}):i.setAttribute(o,p),d._.dirty=1;break;case"src":d.type=="image"&&i.setAttributeNS(n,"href",p);break;case"stroke-width":if(d._.sx!=1||d._.sy!=1)p/=g(h(d._.sx),h(d._.sy))||1;d.paper._vbSize&&(p*=d.paper._vbSize),i.setAttribute(o,p),k["stroke-dasharray"]&&v(d,k["stroke-dasharray"],f),d._.arrows&&("startString"in d._.arrows&&t(d,d._.arrows.startString),"endString"in d._.arrows&&t(d,d._.arrows.endString,1));break;case"stroke-dasharray":v(d,p,f);break;case"fill":var D=c(p).match(a._ISURL);if(D){z=q("pattern");var F=q("image");z.id=a.createUUID(),q(z,{x:0,y:0,patternUnits:"userSpaceOnUse",height:1,width:1}),q(F,{x:0,y:0,"xlink:href":D[1]}),z.appendChild(F),function(b){a._preload(D[1],function(){var a=this.offsetWidth,c=this.offsetHeight;q(b,{width:a,height:c}),q(F,{width:a,height:c}),d.paper.safari()})}(z),d.paper.defs.appendChild(z),q(i,{fill:"url(#"+z.id+")"}),d.pattern=z,d.pattern&&s(d);break}var G=a.getRGB(p);if(!G.error)delete f.gradient,delete k.gradient,!a.is(k.opacity,"undefined")&&a.is(f.opacity,"undefined")&&q(i,{opacity:k.opacity}),!a.is(k["fill-opacity"],"undefined")&&a.is(f["fill-opacity"],"undefined")&&q(i,{"fill-opacity":k["fill-opacity"]});else if((d.type=="circle"||d.type=="ellipse"||c(p).charAt()!="r")&&r(d,p)){if("opacity"in k||"fill-opacity"in k){var H=a._g.doc.getElementById(i.getAttribute("fill").replace(/^url\(#|\)$/g,l));if(H){var I=H.getElementsByTagName("stop");q(I[I.length-1],{"stop-opacity":("opacity"in k?k.opacity:1)*("fill-opacity"in k?k["fill-opacity"]:1)})}}k.gradient=p,k.fill="none";break}G[b]("opacity")&&q(i,{"fill-opacity":G.opacity>1?G.opacity/100:G.opacity});case"stroke":G=a.getRGB(p),i.setAttribute(o,G.hex),o=="stroke"&&G[b]("opacity")&&q(i,{"stroke-opacity":G.opacity>1?G.opacity/100:G.opacity}),o=="stroke"&&d._.arrows&&("startString"in d._.arrows&&t(d,d._.arrows.startString),"endString"in d._.arrows&&t(d,d._.arrows.endString,1));break;case"gradient":(d.type=="circle"||d.type=="ellipse"||c(p).charAt()!="r")&&r(d,p);break;case"opacity":k.gradient&&!k[b]("stroke-opacity")&&q(i,{"stroke-opacity":p>1?p/100:p});case"fill-opacity":if(k.gradient){H=a._g.doc.getElementById(i.getAttribute("fill").replace(/^url\(#|\)$/g,l)),H&&(I=H.getElementsByTagName("stop"),q(I[I.length-1],{"stop-opacity":p}));break};default:o=="font-size"&&(p=e(p,10)+"px");var J=o.replace(/(\-.)/g,function(a){return a.substring(1).toUpperCase()});i.style[J]=p,d._.dirty=1,i.setAttribute(o,p)}}y(d,f),i.style.visibility=m},x=1.2,y=function(d,f){if(d.type=="text"&&!!(f[b]("text")||f[b]("font")||f[b]("font-size")||f[b]("x")||f[b]("y"))){var g=d.attrs,h=d.node,i=h.firstChild?e(a._g.doc.defaultView.getComputedStyle(h.firstChild,l).getPropertyValue("font-size"),10):10;if(f[b]("text")){g.text=f.text;while(h.firstChild)h.removeChild(h.firstChild);var j=c(f.text).split("\n"),k=[],m;for(var n=0,o=j.length;n<o;n++)m=q("tspan"),n&&q(m,{dy:i*x,x:g.x}),m.appendChild(a._g.doc.createTextNode(j[n])),h.appendChild(m),k[n]=m}else{k=h.getElementsByTagName("tspan");for(n=0,o=k.length;n<o;n++)n?q(k[n],{dy:i*x,x:g.x}):q(k[0],{dy:0})}q(h,{x:g.x,y:g.y}),d._.dirty=1;var p=d._getBBox(),r=g.y-(p.y+p.height/2);r&&a.is(r,"finite")&&q(k[0],{dy:r})}},z=function(b,c){var d=0,e=0;this[0]=this.node=b,b.raphael=!0,this.id=a._oid++,b.raphaelid=this.id,this.matrix=a.matrix(),this.realPath=null,this.paper=c,this.attrs=this.attrs||{},this._={transform:[],sx:1,sy:1,deg:0,dx:0,dy:0,dirty:1},!c.bottom&&(c.bottom=this),this.prev=c.top,c.top&&(c.top.next=this),c.top=this,this.next=null},A=a.el;z.prototype=A,A.constructor=z,a._engine.path=function(a,b){var c=q("path");b.canvas&&b.canvas.appendChild(c);var d=new z(c,b);d.type="path",w(d,{fill:"none",stroke:"#000",path:a});return d},A.rotate=function(a,b,e){if(this.removed)return this;a=c(a).split(j),a.length-1&&(b=d(a[1]),e=d(a[2])),a=d(a[0]),e==null&&(b=e);if(b==null||e==null){var f=this.getBBox(1);b=f.x+f.width/2,e=f.y+f.height/2}this.transform(this._.transform.concat([["r",a,b,e]]));return this},A.scale=function(a,b,e,f){if(this.removed)return this;a=c(a).split(j),a.length-1&&(b=d(a[1]),e=d(a[2]),f=d(a[3])),a=d(a[0]),b==null&&(b=a),f==null&&(e=f);if(e==null||f==null)var g=this.getBBox(1);e=e==null?g.x+g.width/2:e,f=f==null?g.y+g.height/2:f,this.transform(this._.transform.concat([["s",a,b,e,f]]));return this},A.translate=function(a,b){if(this.removed)return this;a=c(a).split(j),a.length-1&&(b=d(a[1])),a=d(a[0])||0,b=+b||0,this.transform(this._.transform.concat([["t",a,b]]));return this},A.transform=function(c){var d=this._;if(c==null)return d.transform;a._extractTransform(this,c),this.clip&&q(this.clip,{transform:this.matrix.invert()}),this.pattern&&s(this),this.node&&q(this.node,{transform:this.matrix});if(d.sx!=1||d.sy!=1){var e=this.attrs[b]("stroke-width")?this.attrs["stroke-width"]:1;this.attr({"stroke-width":e})}return this},A.hide=function(){!this.removed&&this.paper.safari(this.node.style.display="none");return this},A.show=function(){!this.removed&&this.paper.safari(this.node.style.display="");return this},A.remove=function(){if(!this.removed&&!!this.node.parentNode){var b=this.paper;b.__set__&&b.__set__.exclude(this),k.unbind("raphael.*.*."+this.id),this.gradient&&b.defs.removeChild(this.gradient),a._tear(this,b),this.node.parentNode.tagName.toLowerCase()=="a"?this.node.parentNode.parentNode.removeChild(this.node.parentNode):this.node.parentNode.removeChild(this.node);for(var c in this)this[c]=typeof this[c]=="function"?a._removedFactory(c):null;this.removed=!0}},A._getBBox=function(){if(this.node.style.display=="none"){this.show();var a=!0}var b={};try{b=this.node.getBBox()}catch(c){}finally{b=b||{}}a&&this.hide();return b},A.attr=function(c,d){if(this.removed)return this;if(c==null){var e={};for(var f in this.attrs)this.attrs[b](f)&&(e[f]=this.attrs[f]);e.gradient&&e.fill=="none"&&(e.fill=e.gradient)&&delete e.gradient,e.transform=this._.transform;return e}if(d==null&&a.is(c,"string")){if(c=="fill"&&this.attrs.fill=="none"&&this.attrs.gradient)return this.attrs.gradient;if(c=="transform")return this._.transform;var g=c.split(j),h={};for(var i=0,l=g.length;i<l;i++)c=g[i],c in this.attrs?h[c]=this.attrs[c]:a.is(this.paper.customAttributes[c],"function")?h[c]=this.paper.customAttributes[c].def:h[c]=a._availableAttrs[c];return l-1?h:h[g[0]]}if(d==null&&a.is(c,"array")){h={};for(i=0,l=c.length;i<l;i++)h[c[i]]=this.attr(c[i]);return h}if(d!=null){var m={};m[c]=d}else c!=null&&a.is(c,"object")&&(m=c);for(var n in m)k("raphael.attr."+n+"."+this.id,this,m[n]);for(n in this.paper.customAttributes)if(this.paper.customAttributes[b](n)&&m[b](n)&&a.is(this.paper.customAttributes[n],"function")){var o=this.paper.customAttributes[n].apply(this,[].concat(m[n]));this.attrs[n]=m[n];for(var p in o)o[b](p)&&(m[p]=o[p])}w(this,m);return this},A.toFront=function(){if(this.removed)return this;this.node.parentNode.tagName.toLowerCase()=="a"?this.node.parentNode.parentNode.appendChild(this.node.parentNode):this.node.parentNode.appendChild(this.node);var b=this.paper;b.top!=this&&a._tofront(this,b);return this},A.toBack=function(){if(this.removed)return this;var b=this.node.parentNode;b.tagName.toLowerCase()=="a"?b.parentNode.insertBefore(this.node.parentNode,this.node.parentNode.parentNode.firstChild):b.firstChild!=this.node&&b.insertBefore(this.node,this.node.parentNode.firstChild),a._toback(this,this.paper);var c=this.paper;return this},A.insertAfter=function(b){if(this.removed)return this;var c=b.node||b[b.length-1].node;c.nextSibling?c.parentNode.insertBefore(this.node,c.nextSibling):c.parentNode.appendChild(this.node),a._insertafter(this,b,this.paper);return this},A.insertBefore=function(b){if(this.removed)return this;var c=b.node||b[0].node;c.parentNode.insertBefore(this.node,c),a._insertbefore(this,b,this.paper);return this},A.blur=function(b){var c=this;if(+b!==0){var d=q("filter"),e=q("feGaussianBlur");c.attrs.blur=b,d.id=a.createUUID(),q(e,{stdDeviation:+b||1.5}),d.appendChild(e),c.paper.defs.appendChild(d),c._blur=d,q(c.node,{filter:"url(#"+d.id+")"})}else c._blur&&(c._blur.parentNode.removeChild(c._blur),delete c._blur,delete c.attrs.blur),c.node.removeAttribute("filter")},a._engine.circle=function(a,b,c,d){var e=q("circle");a.canvas&&a.canvas.appendChild(e);var f=new z(e,a);f.attrs={cx:b,cy:c,r:d,fill:"none",stroke:"#000"},f.type="circle",q(e,f.attrs);return f},a._engine.rect=function(a,b,c,d,e,f){var g=q("rect");a.canvas&&a.canvas.appendChild(g);var h=new z(g,a);h.attrs={x:b,y:c,width:d,height:e,r:f||0,rx:f||0,ry:f||0,fill:"none",stroke:"#000"},h.type="rect",q(g,h.attrs);return h},a._engine.ellipse=function(a,b,c,d,e){var f=q("ellipse");a.canvas&&a.canvas.appendChild(f);var g=new z(f,a);g.attrs={cx:b,cy:c,rx:d,ry:e,fill:"none",stroke:"#000"},g.type="ellipse",q(f,g.attrs);return g},a._engine.image=function(a,b,c,d,e,f){var g=q("image");q(g,{x:c,y:d,width:e,height:f,preserveAspectRatio:"none"}),g.setAttributeNS(n,"href",b),a.canvas&&a.canvas.appendChild(g);var h=new z(g,a);h.attrs={x:c,y:d,width:e,height:f,src:b},h.type="image";return h},a._engine.text=function(b,c,d,e){var f=q("text");b.canvas&&b.canvas.appendChild(f);var g=new z(f,b);g.attrs={x:c,y:d,"text-anchor":"middle",text:e,font:a._availableAttrs.font,stroke:"none",fill:"#000"},g.type="text",w(g,g.attrs);return g},a._engine.setSize=function(a,b){this.width=a||this.width,this.height=b||this.height,this.canvas.setAttribute("width",this.width),this.canvas.setAttribute("height",this.height),this._viewBox&&this.setViewBox.apply(this,this._viewBox);return this},a._engine.create=function(){var b=a._getContainer.apply(0,arguments),c=b&&b.container,d=b.x,e=b.y,f=b.width,g=b.height;if(!c)throw new Error("SVG container not found.");var h=q("svg"),i="overflow:hidden;",j;d=d||0,e=e||0,f=f||512,g=g||342,q(h,{height:g,version:1.1,width:f,xmlns:"http://www.w3.org/2000/svg"}),c==1?(h.style.cssText=i+"position:absolute;left:"+d+"px;top:"+e+"px",a._g.doc.body.appendChild(h),j=1):(h.style.cssText=i+"position:relative",c.firstChild?c.insertBefore(h,c.firstChild):c.appendChild(h)),c=new a._Paper,c.width=f,c.height=g,c.canvas=h,c.clear(),c._left=c._top=0,j&&(c.renderfix=function(){}),c.renderfix();return c},a._engine.setViewBox=function(a,b,c,d,e){k("raphael.setViewBox",this,this._viewBox,[a,b,c,d,e]);var f=g(c/this.width,d/this.height),h=this.top,i=e?"meet":"xMinYMin",j,l;a==null?(this._vbSize&&(f=1),delete this._vbSize,j="0 0 "+this.width+m+this.height):(this._vbSize=f,j=a+m+b+m+c+m+d),q(this.canvas,{viewBox:j,preserveAspectRatio:i});while(f&&h)l="stroke-width"in h.attrs?h.attrs["stroke-width"]:1,h.attr({"stroke-width":l}),h._.dirty=1,h._.dirtyT=1,h=h.prev;this._viewBox=[a,b,c,d,!!e];return this},a.prototype.renderfix=function(){var a=this.canvas,b=a.style,c;try{c=a.getScreenCTM()||a.createSVGMatrix()}catch(d){c=a.createSVGMatrix()}var e=-c.e%1,f=-c.f%1;if(e||f)e&&(this._left=(this._left+e)%1,b.left=this._left+"px"),f&&(this._top=(this._top+f)%1,b.top=this._top+"px")},a.prototype.clear=function(){a.eve("raphael.clear",this);var b=this.canvas;while(b.firstChild)b.removeChild(b.firstChild);this.bottom=this.top=null,(this.desc=q("desc")).appendChild(a._g.doc.createTextNode("Created with Rapha�l "+a.version)),b.appendChild(this.desc),b.appendChild(this.defs=q("defs"))},a.prototype.remove=function(){k("raphael.remove",this),this.canvas.parentNode&&this.canvas.parentNode.removeChild(this.canvas);for(var b in this)this[b]=typeof this[b]=="function"?a._removedFactory(b):null};var B=a.st;for(var C in A)A[b](C)&&!B[b](C)&&(B[C]=function(a){return function(){var b=arguments;return this.forEach(function(c){c[a].apply(c,b)})}}(C))}(window.Raphael),window.Raphael.vml&&function(a){var b="hasOwnProperty",c=String,d=parseFloat,e=Math,f=e.round,g=e.max,h=e.min,i=e.abs,j="fill",k=/[, ]+/,l=a.eve,m=" progid:DXImageTransform.Microsoft",n=" ",o="",p={M:"m",L:"l",C:"c",Z:"x",m:"t",l:"r",c:"v",z:"x"},q=/([clmz]),?([^clmz]*)/gi,r=/ progid:\S+Blur\([^\)]+\)/g,s=/-?[^,\s-]+/g,t="position:absolute;left:0;top:0;width:1px;height:1px",u=21600,v={path:1,rect:1,image:1},w={circle:1,ellipse:1},x=function(b){var d=/[ahqstv]/ig,e=a._pathToAbsolute;c(b).match(d)&&(e=a._path2curve),d=/[clmz]/g;if(e==a._pathToAbsolute&&!c(b).match(d)){var g=c(b).replace(q,function(a,b,c){var d=[],e=b.toLowerCase()=="m",g=p[b];c.replace(s,function(a){e&&d.length==2&&(g+=d+p[b=="m"?"l":"L"],d=[]),d.push(f(a*u))});return g+d});return g}var h=e(b),i,j;g=[];for(var k=0,l=h.length;k<l;k++){i=h[k],j=h[k][0].toLowerCase(),j=="z"&&(j="x");for(var m=1,r=i.length;m<r;m++)j+=f(i[m]*u)+(m!=r-1?",":o);g.push(j)}return g.join(n)},y=function(b,c,d){var e=a.matrix();e.rotate(-b,.5,.5);return{dx:e.x(c,d),dy:e.y(c,d)}},z=function(a,b,c,d,e,f){var g=a._,h=a.matrix,k=g.fillpos,l=a.node,m=l.style,o=1,p="",q,r=u/b,s=u/c;m.visibility="hidden";if(!!b&&!!c){l.coordsize=i(r)+n+i(s),m.rotation=f*(b*c<0?-1:1);if(f){var t=y(f,d,e);d=t.dx,e=t.dy}b<0&&(p+="x"),c<0&&(p+=" y")&&(o=-1),m.flip=p,l.coordorigin=d*-r+n+e*-s;if(k||g.fillsize){var v=l.getElementsByTagName(j);v=v&&v[0],l.removeChild(v),k&&(t=y(f,h.x(k[0],k[1]),h.y(k[0],k[1])),v.position=t.dx*o+n+t.dy*o),g.fillsize&&(v.size=g.fillsize[0]*i(b)+n+g.fillsize[1]*i(c)),l.appendChild(v)}m.visibility="visible"}};a.toString=function(){return"Your browser doesn�t support SVG. Falling down to VML.\nYou are running Rapha�l "+this.version};var A=function(a,b,d){var e=c(b).toLowerCase().split("-"),f=d?"end":"start",g=e.length,h="classic",i="medium",j="medium";while(g--)switch(e[g]){case"block":case"classic":case"oval":case"diamond":case"open":case"none":h=e[g];break;case"wide":case"narrow":j=e[g];break;case"long":case"short":i=e[g]}var k=a.node.getElementsByTagName("stroke")[0];k[f+"arrow"]=h,k[f+"arrowlength"]=i,k[f+"arrowwidth"]=j},B=function(e,i){e.attrs=e.attrs||{};var l=e.node,m=e.attrs,p=l.style,q,r=v[e.type]&&(i.x!=m.x||i.y!=m.y||i.width!=m.width||i.height!=m.height||i.cx!=m.cx||i.cy!=m.cy||i.rx!=m.rx||i.ry!=m.ry||i.r!=m.r),s=w[e.type]&&(m.cx!=i.cx||m.cy!=i.cy||m.r!=i.r||m.rx!=i.rx||m.ry!=i.ry),t=e;for(var y in i)i[b](y)&&(m[y]=i[y]);r&&(m.path=a._getPath[e.type](e),e._.dirty=1),i.href&&(l.href=i.href),i.title&&(l.title=i.title),i.target&&(l.target=i.target),i.cursor&&(p.cursor=i.cursor),"blur"in i&&e.blur(i.blur);if(i.path&&e.type=="path"||r)l.path=x(~c(m.path).toLowerCase().indexOf("r")?a._pathToAbsolute(m.path):m.path),e.type=="image"&&(e._.fillpos=[m.x,m.y],e._.fillsize=[m.width,m.height],z(e,1,1,0,0,0));"transform"in i&&e.transform(i.transform);if(s){var B=+m.cx,D=+m.cy,E=+m.rx||+m.r||0,G=+m.ry||+m.r||0;l.path=a.format("ar{0},{1},{2},{3},{4},{1},{4},{1}x",f((B-E)*u),f((D-G)*u),f((B+E)*u),f((D+G)*u),f(B*u))}if("clip-rect"in i){var H=c(i["clip-rect"]).split(k);if(H.length==4){H[2]=+H[2]+ +H[0],H[3]=+H[3]+ +H[1];var I=l.clipRect||a._g.doc.createElement("div"),J=I.style;J.clip=a.format("rect({1}px {2}px {3}px {0}px)",H),l.clipRect||(J.position="absolute",J.top=0,J.left=0,J.width=e.paper.width+"px",J.height=e.paper.height+"px",l.parentNode.insertBefore(I,l),I.appendChild(l),l.clipRect=I)}i["clip-rect"]||l.clipRect&&(l.clipRect.style.clip="auto")}if(e.textpath){var K=e.textpath.style;i.font&&(K.font=i.font),i["font-family"]&&(K.fontFamily='"'+i["font-family"].split(",")[0].replace(/^['"]+|['"]+$/g,o)+'"'),i["font-size"]&&(K.fontSize=i["font-size"]),i["font-weight"]&&(K.fontWeight=i["font-weight"]),i["font-style"]&&(K.fontStyle=i["font-style"])}"arrow-start"in i&&A(t,i["arrow-start"]),"arrow-end"in i&&A(t,i["arrow-end"],1);if(i.opacity!=null||i["stroke-width"]!=null||i.fill!=null||i.src!=null||i.stroke!=null||i["stroke-width"]!=null||i["stroke-opacity"]!=null||i["fill-opacity"]!=null||i["stroke-dasharray"]!=null||i["stroke-miterlimit"]!=null||i["stroke-linejoin"]!=null||i["stroke-linecap"]!=null){var L=l.getElementsByTagName(j),M=!1;L=L&&L[0],!L&&(M=L=F(j)),e.type=="image"&&i.src&&(L.src=i.src),i.fill&&(L.on=!0);if(L.on==null||i.fill=="none"||i.fill===null)L.on=!1;if(L.on&&i.fill){var N=c(i.fill).match(a._ISURL);if(N){L.parentNode==l&&l.removeChild(L),L.rotate=!0,L.src=N[1],L.type="tile";var O=e.getBBox(1);L.position=O.x+n+O.y,e._.fillpos=[O.x,O.y],a._preload(N[1],function(){e._.fillsize=[this.offsetWidth,this.offsetHeight]})}else L.color=a.getRGB(i.fill).hex,L.src=o,L.type="solid",a.getRGB(i.fill).error&&(t.type in{circle:1,ellipse:1}||c(i.fill).charAt()!="r")&&C(t,i.fill,L)&&(m.fill="none",m.gradient=i.fill,L.rotate=!1)}if("fill-opacity"in i||"opacity"in i){var P=((+m["fill-opacity"]+1||2)-1)*((+m.opacity+1||2)-1)*((+a.getRGB(i.fill).o+1||2)-1);P=h(g(P,0),1),L.opacity=P,L.src&&(L.color="none")}l.appendChild(L);var Q=l.getElementsByTagName("stroke")&&l.getElementsByTagName("stroke")[0],T=!1;!Q&&(T=Q=F("stroke"));if(i.stroke&&i.stroke!="none"||i["stroke-width"]||i["stroke-opacity"]!=null||i["stroke-dasharray"]||i["stroke-miterlimit"]||i["stroke-linejoin"]||i["stroke-linecap"])Q.on=!0;(i.stroke=="none"||i.stroke===null||Q.on==null||i.stroke==0||i["stroke-width"]==0)&&(Q.on=!1);var U=a.getRGB(i.stroke);Q.on&&i.stroke&&(Q.color=U.hex),P=((+m["stroke-opacity"]+1||2)-1)*((+m.opacity+1||2)-1)*((+U.o+1||2)-1);var V=(d(i["stroke-width"])||1)*.75;P=h(g(P,0),1),i["stroke-width"]==null&&(V=m["stroke-width"]),i["stroke-width"]&&(Q.weight=V),V&&V<1&&(P*=V)&&(Q.weight=1),Q.opacity=P,i["stroke-linejoin"]&&(Q.joinstyle=i["stroke-linejoin"]||"miter"),Q.miterlimit=i["stroke-miterlimit"]||8,i["stroke-linecap"]&&(Q.endcap=i["stroke-linecap"]=="butt"?"flat":i["stroke-linecap"]=="square"?"square":"round");if(i["stroke-dasharray"]){var W={"-":"shortdash",".":"shortdot","-.":"shortdashdot","-..":"shortdashdotdot",". ":"dot","- ":"dash","--":"longdash","- .":"dashdot","--.":"longdashdot","--..":"longdashdotdot"};Q.dashstyle=W[b](i["stroke-dasharray"])?W[i["stroke-dasharray"]]:o}T&&l.appendChild(Q)}if(t.type=="text"){t.paper.canvas.style.display=o;var X=t.paper.span,Y=100,Z=m.font&&m.font.match(/\d+(?:\.\d*)?(?=px)/);p=X.style,m.font&&(p.font=m.font),m["font-family"]&&(p.fontFamily=m["font-family"]),m["font-weight"]&&(p.fontWeight=m["font-weight"]),m["font-style"]&&(p.fontStyle=m["font-style"]),Z=d(m["font-size"]||Z&&Z[0])||10,p.fontSize=Z*Y+"px",t.textpath.string&&(X.innerHTML=c(t.textpath.string).replace(/</g,"&#60;").replace(/&/g,"&#38;").replace(/\n/g,"<br>"));var $=X.getBoundingClientRect();t.W=m.w=($.right-$.left)/Y,t.H=m.h=($.bottom-$.top)/Y,t.X=m.x,t.Y=m.y+t.H/2,("x"in i||"y"in i)&&(t.path.v=a.format("m{0},{1}l{2},{1}",f(m.x*u),f(m.y*u),f(m.x*u)+1));var _=["x","y","text","font","font-family","font-weight","font-style","font-size"];for(var ba=0,bb=_.length;ba<bb;ba++)if(_[ba]in i){t._.dirty=1;break}switch(m["text-anchor"]){case"start":t.textpath.style["v-text-align"]="left",t.bbx=t.W/2;break;case"end":t.textpath.style["v-text-align"]="right",t.bbx=-t.W/2;break;default:t.textpath.style["v-text-align"]="center",t.bbx=0}t.textpath.style["v-text-kern"]=!0}},C=function(b,f,g){b.attrs=b.attrs||{};var h=b.attrs,i=Math.pow,j,k,l="linear",m=".5 .5";b.attrs.gradient=f,f=c(f).replace(a._radial_gradient,function(a,b,c){l="radial",b&&c&&(b=d(b),c=d(c),i(b-.5,2)+i(c-.5,2)>.25&&(c=e.sqrt(.25-i(b-.5,2))*((c>.5)*2-1)+.5),m=b+n+c);return o}),f=f.split(/\s*\-\s*/);if(l=="linear"){var p=f.shift();p=-d(p);if(isNaN(p))return null}var q=a._parseDots(f);if(!q)return null;b=b.shape||b.node;if(q.length){b.removeChild(g),g.on=!0,g.method="none",g.color=q[0].color,g.color2=q[q.length-1].color;var r=[];for(var s=0,t=q.length;s<t;s++)q[s].offset&&r.push(q[s].offset+n+q[s].color);g.colors=r.length?r.join():"0% "+g.color,l=="radial"?(g.type="gradientTitle",g.focus="100%",g.focussize="0 0",g.focusposition=m,g.angle=0):(g.type="gradient",g.angle=(270-p)%360),b.appendChild(g)}return 1},D=function(b,c){this[0]=this.node=b,b.raphael=!0,this.id=a._oid++,b.raphaelid=this.id,this.X=0,this.Y=0,this.attrs={},this.paper=c,this.matrix=a.matrix(),this._={transform:[],sx:1,sy:1,dx:0,dy:0,deg:0,dirty:1,dirtyT:1},!c.bottom&&(c.bottom=this),this.prev=c.top,c.top&&(c.top.next=this),c.top=this,this.next=null},E=a.el;D.prototype=E,E.constructor=D,E.transform=function(b){if(b==null)return this._.transform;var d=this.paper._viewBoxShift,e=d?"s"+[d.scale,d.scale]+"-1-1t"+[d.dx,d.dy]:o,f;d&&(f=b=c(b).replace(/\.{3}|\u2026/g,this._.transform||o)),a._extractTransform(this,e+b);var g=this.matrix.clone(),h=this.skew,i=this.node,j,k=~c(this.attrs.fill).indexOf("-"),l=!c(this.attrs.fill).indexOf("url(");g.translate(-0.5,-0.5);if(l||k||this.type=="image"){h.matrix="1 0 0 1",h.offset="0 0",j=g.split();if(k&&j.noRotation||!j.isSimple){i.style.filter=g.toFilter();var m=this.getBBox(),p=this.getBBox(1),q=m.x-p.x,r=m.y-p.y;i.coordorigin=q*-u+n+r*-u,z(this,1,1,q,r,0)}else i.style.filter=o,z(this,j.scalex,j.scaley,j.dx,j.dy,j.rotate)}else i.style.filter=o,h.matrix=c(g),h.offset=g.offset();f&&(this._.transform=f);return this},E.rotate=function(a,b,e){if(this.removed)return this;if(a!=null){a=c(a).split(k),a.length-1&&(b=d(a[1]),e=d(a[2])),a=d(a[0]),e==null&&(b=e);if(b==null||e==null){var f=this.getBBox(1);b=f.x+f.width/2,e=f.y+f.height/2}this._.dirtyT=1,this.transform(this._.transform.concat([["r",a,b,e]]));return this}},E.translate=function(a,b){if(this.removed)return this;a=c(a).split(k),a.length-1&&(b=d(a[1])),a=d(a[0])||0,b=+b||0,this._.bbox&&(this._.bbox.x+=a,this._.bbox.y+=b),this.transform(this._.transform.concat([["t",a,b]]));return this},E.scale=function(a,b,e,f){if(this.removed)return this;a=c(a).split(k),a.length-1&&(b=d(a[1]),e=d(a[2]),f=d(a[3]),isNaN(e)&&(e=null),isNaN(f)&&(f=null)),a=d(a[0]),b==null&&(b=a),f==null&&(e=f);if(e==null||f==null)var g=this.getBBox(1);e=e==null?g.x+g.width/2:e,f=f==null?g.y+g.height/2:f,this.transform(this._.transform.concat([["s",a,b,e,f]])),this._.dirtyT=1;return this},E.hide=function(){!this.removed&&(this.node.style.display="none");return this},E.show=function(){!this.removed&&(this.node.style.display=o);return this},E._getBBox=function(){if(this.removed)return{};return{x:this.X+(this.bbx||0)-this.W/2,y:this.Y-this.H,width:this.W,height:this.H}},E.remove=function(){if(!this.removed&&!!this.node.parentNode){this.paper.__set__&&this.paper.__set__.exclude(this),a.eve.unbind("raphael.*.*."+this.id),a._tear(this,this.paper),this.node.parentNode.removeChild(this.node),this.shape&&this.shape.parentNode.removeChild(this.shape);for(var b in this)this[b]=typeof this[b]=="function"?a._removedFactory(b):null;this.removed=!0}},E.attr=function(c,d){if(this.removed)return this;if(c==null){var e={};for(var f in this.attrs)this.attrs[b](f)&&(e[f]=this.attrs[f]);e.gradient&&e.fill=="none"&&(e.fill=e.gradient)&&delete e.gradient,e.transform=this._.transform;return e}if(d==null&&a.is(c,"string")){if(c==j&&this.attrs.fill=="none"&&this.attrs.gradient)return this.attrs.gradient;var g=c.split(k),h={};for(var i=0,m=g.length;i<m;i++)c=g[i],c in this.attrs?h[c]=this.attrs[c]:a.is(this.paper.customAttributes[c],"function")?h[c]=this.paper.customAttributes[c].def:h[c]=a._availableAttrs[c];return m-1?h:h[g[0]]}if(this.attrs&&d==null&&a.is(c,"array")){h={};for(i=0,m=c.length;i<m;i++)h[c[i]]=this.attr(c[i]);return h}var n;d!=null&&(n={},n[c]=d),d==null&&a.is(c,"object")&&(n=c);for(var o in n)l("raphael.attr."+o+"."+this.id,this,n[o]);if(n){for(o in this.paper.customAttributes)if(this.paper.customAttributes[b](o)&&n[b](o)&&a.is(this.paper.customAttributes[o],"function")){var p=this.paper.customAttributes[o].apply(this,[].concat(n[o]));this.attrs[o]=n[o];for(var q in p)p[b](q)&&(n[q]=p[q])}n.text&&this.type=="text"&&(this.textpath.string=n.text),B(this,n)}return this},E.toFront=function(){!this.removed&&this.node.parentNode.appendChild(this.node),this.paper&&this.paper.top!=this&&a._tofront(this,this.paper);return this},E.toBack=function(){if(this.removed)return this;this.node.parentNode.firstChild!=this.node&&(this.node.parentNode.insertBefore(this.node,this.node.parentNode.firstChild),a._toback(this,this.paper));return this},E.insertAfter=function(b){if(this.removed)return this;b.constructor==a.st.constructor&&(b=b[b.length-1]),b.node.nextSibling?b.node.parentNode.insertBefore(this.node,b.node.nextSibling):b.node.parentNode.appendChild(this.node),a._insertafter(this,b,this.paper);return this},E.insertBefore=function(b){if(this.removed)return this;b.constructor==a.st.constructor&&(b=b[0]),b.node.parentNode.insertBefore(this.node,b.node),a._insertbefore(this,b,this.paper);return this},E.blur=function(b){var c=this.node.runtimeStyle,d=c.filter;d=d.replace(r,o),+b!==0?(this.attrs.blur=b,c.filter=d+n+m+".Blur(pixelradius="+(+b||1.5)+")",c.margin=a.format("-{0}px 0 0 -{0}px",f(+b||1.5))):(c.filter=d,c.margin=0,delete this.attrs.blur)},a._engine.path=function(a,b){var c=F("shape");c.style.cssText=t,c.coordsize=u+n+u,c.coordorigin=b.coordorigin;var d=new D(c,b),e={fill:"none",stroke:"#000"};a&&(e.path=a),d.type="path",d.path=[],d.Path=o,B(d,e),b.canvas.appendChild(c);var f=F("skew");f.on=!0,c.appendChild(f),d.skew=f,d.transform(o);return d},a._engine.rect=function(b,c,d,e,f,g){var h=a._rectPath(c,d,e,f,g),i=b.path(h),j=i.attrs;i.X=j.x=c,i.Y=j.y=d,i.W=j.width=e,i.H=j.height=f,j.r=g,j.path=h,i.type="rect";return i},a._engine.ellipse=function(a,b,c,d,e){var f=a.path(),g=f.attrs;f.X=b-d,f.Y=c-e,f.W=d*2,f.H=e*2,f.type="ellipse",B(f,{cx:b,cy:c,rx:d,ry:e});return f},a._engine.circle=function(a,b,c,d){var e=a.path(),f=e.attrs;e.X=b-d,e.Y=c-d,e.W=e.H=d*2,e.type="circle",B(e,{cx:b,cy:c,r:d});return e},a._engine.image=function(b,c,d,e,f,g){var h=a._rectPath(d,e,f,g),i=b.path(h).attr({stroke:"none"}),k=i.attrs,l=i.node,m=l.getElementsByTagName(j)[0];k.src=c,i.X=k.x=d,i.Y=k.y=e,i.W=k.width=f,i.H=k.height=g,k.path=h,i.type="image",m.parentNode==l&&l.removeChild(m),m.rotate=!0,m.src=c,m.type="tile",i._.fillpos=[d,e],i._.fillsize=[f,g],l.appendChild(m),z(i,1,1,0,0,0);return i},a._engine.text=function(b,d,e,g){var h=F("shape"),i=F("path"),j=F("textpath");d=d||0,e=e||0,g=g||"",i.v=a.format("m{0},{1}l{2},{1}",f(d*u),f(e*u),f(d*u)+1),i.textpathok=!0,j.string=c(g),j.on=!0,h.style.cssText=t,h.coordsize=u+n+u,h.coordorigin="0 0";var k=new D(h,b),l={fill:"#000",stroke:"none",font:a._availableAttrs.font,text:g};k.shape=h,k.path=i,k.textpath=j,k.type="text",k.attrs.text=c(g),k.attrs.x=d,k.attrs.y=e,k.attrs.w=1,k.attrs.h=1,B(k,l),h.appendChild(j),h.appendChild(i),b.canvas.appendChild(h);var m=F("skew");m.on=!0,h.appendChild(m),k.skew=m,k.transform(o);return k},a._engine.setSize=function(b,c){var d=this.canvas.style;this.width=b,this.height=c,b==+b&&(b+="px"),c==+c&&(c+="px"),d.width=b,d.height=c,d.clip="rect(0 "+b+" "+c+" 0)",this._viewBox&&a._engine.setViewBox.apply(this,this._viewBox);return this},a._engine.setViewBox=function(b,c,d,e,f){a.eve("raphael.setViewBox",this,this._viewBox,[b,c,d,e,f]);var h=this.width,i=this.height,j=1/g(d/h,e/i),k,l;f&&(k=i/e,l=h/d,d*k<h&&(b-=(h-d*k)/2/k),e*l<i&&(c-=(i-e*l)/2/l)),this._viewBox=[b,c,d,e,!!f],this._viewBoxShift={dx:-b,dy:-c,scale:j},this.forEach(function(a){a.transform("...")});return this};var F;a._engine.initWin=function(a){var b=a.document;b.createStyleSheet().addRule(".rvml","behavior:url(#default#VML)");try{!b.namespaces.rvml&&b.namespaces.add("rvml","urn:schemas-microsoft-com:vml"),F=function(a){return b.createElement("<rvml:"+a+' class="rvml">')}}catch(c){F=function(a){return b.createElement("<"+a+' xmlns="urn:schemas-microsoft.com:vml" class="rvml">')}}},a._engine.initWin(a._g.win),a._engine.create=function(){var b=a._getContainer.apply(0,arguments),c=b.container,d=b.height,e,f=b.width,g=b.x,h=b.y;if(!c)throw new Error("VML container not found.");var i=new a._Paper,j=i.canvas=a._g.doc.createElement("div"),k=j.style;g=g||0,h=h||0,f=f||512,d=d||342,i.width=f,i.height=d,f==+f&&(f+="px"),d==+d&&(d+="px"),i.coordsize=u*1e3+n+u*1e3,i.coordorigin="0 0",i.span=a._g.doc.createElement("span"),i.span.style.cssText="position:absolute;left:-9999em;top:-9999em;padding:0;margin:0;line-height:1;",j.appendChild(i.span),k.cssText=a.format("top:0;left:0;width:{0};height:{1};display:inline-block;position:relative;clip:rect(0 {0} {1} 0);overflow:hidden",f,d),c==1?(a._g.doc.body.appendChild(j),k.left=g+"px",k.top=h+"px",k.position="absolute"):c.firstChild?c.insertBefore(j,c.firstChild):c.appendChild(j),i.renderfix=function(){};return i},a.prototype.clear=function(){a.eve("raphael.clear",this),this.canvas.innerHTML=o,this.span=a._g.doc.createElement("span"),this.span.style.cssText="position:absolute;left:-9999em;top:-9999em;padding:0;margin:0;line-height:1;display:inline;",this.canvas.appendChild(this.span),this.bottom=this.top=null},a.prototype.remove=function(){a.eve("raphael.remove",this),this.canvas.parentNode.removeChild(this.canvas);for(var b in this)this[b]=typeof this[b]=="function"?a._removedFactory(b):null;return!0};var G=a.st;for(var H in E)E[b](H)&&!G[b](H)&&(G[H]=function(a){return function(){var b=arguments;return this.forEach(function(c){c[a].apply(c,b)})}}(H))}(window.Raphael)
// Original code shared in the public domain on the 'net by <anonymous>
// Further work by vjt@openssl.it - http://sindro.me/
//
// Project home page: http://github.com/vjt/canvas-speedometer
//
function Speedometer(Element) {
  var options = arguments[1] || {};

  var Container = document.getElementById(Element || 'speedometer');

  if (!Container) throw ('No container found!'); // XXX

  // Container CSS inspection to get computed size
  var ContainerStyle = TBE.GetElementComputedStyle (Container);
  var Size = Math.min (
    parseInt (ContainerStyle.width),
    parseInt (ContainerStyle.height)
  );

  if (!Size) throw ('Cannot get container dimensions!');

  // Customization
  var MinValue = options.min   || 0.0;
  var MaxValue = options.max   || 100.0;
  var CurValue = options.value || MinValue;

  // Threshold
  var Threshold   = options.threshold      || 50.0;
  var ThreshPivot = options.thresholdPivot || 35.0;

  // Meter, and correct user coords (cartesian) to the canvas std plane coords
  var MeterFromAngle = (options.meterFromAngle || -135.0) - 90.0;
  var MeterToAngle   = (options.meterToAngle   ||  135.0) - 90.0;
  var MeterRimAngle  = MeterToAngle - MeterFromAngle;

  var MeterTicksCount = options.meterTicksCount || 10;
  var MeterMarksCount = options.meterMarksCount || 3;
  var MeterGapScale   = (options.meterGapScale || 10) / 100.0;
  if (MeterGapScale > 1) MeterGapScale = 1;

  // Glossy?
  var Glossy = options.glossy == undefined ? true : Boolean (options.glossy);

  // Enable digital display?
  var Display = options.display == undefined ? true : Boolean (options.display);

  // Enable center rim?
  var CenterRimScale = options.centerRimScale == undefined ?
                       0.3 : Float (options.centerRimScale);
  var CenterScale    = options.center == undefined ?
                       0.25 : Float (options.centerScale);

  // Theming
  if (!Speedometer.themes['default'])
    throw ('Default theme missing! Please load themes/default.js');

  var theme = Speedometer.themes[options.theme] || Speedometer.themes['default'];

  for (key in Speedometer.themes['default'])
    if (theme[key] == undefined)
      theme[key] = Speedometer.themes['default'][key];

  var Color = {
    dial  : theme.dial,
    rim   : theme.rim,
    rimArc: theme.rimArc,
    thresh: theme.thresh,
    center: theme.center,
    nose  : theme.nose,
    hand  : {
      main   : theme.hand,
      shine  : theme.handShine,
      shineTo: theme.handShineTo,
    },
    meter : {
      ticks  : theme.ticks,
      marks  : theme.marks,
      strings: theme.strings,
      font   : theme.font
    },
    digits: theme.digits
  };

  // Private stuff.
  //
  var Canvas = {
    background: TBE.CreateSquareCanvasElement (Size),
    foreground: TBE.CreateSquareCanvasElement (Size),
    hand      : TBE.CreateSquareCanvasElement (Size),
    meter     : TBE.CreateSquareCanvasElement (Size),
    digits    : TBE.CreateSquareCanvasElement (Size)
  };

  var Context = {
    background: TBE.GetElement2DContext (Canvas.background),
    foreground: TBE.GetElement2DContext (Canvas.foreground),
    hand      : TBE.GetElement2DContext (Canvas.hand),
    meter     : TBE.GetElement2DContext (Canvas.meter)
  };

  var Position = (function (o) {
    this.x  = Size * 0.05;
    this.y  = Size * 0.05;
    this.w  = Size - this.x * 2;
    this.h  = Size - this.y * 2;
    this.cx = this.w / 2 + this.x;
    this.cy = this.h / 2 + this.y;

    return this;
  }).apply({});

  if (Display)
  {
    Display = new DigitalDisplay ({
      element: Canvas.digits,
      placeholders: Color.dial,
      digits: Color.digits,
      width: Size
    });
  }

  // Now append the canvases into the given container
  //
  Container.appendChild (Canvas.background);
  Container.appendChild (Canvas.meter);
  Container.appendChild (Canvas.digits); // TODO move in DigitalDisplay
  Container.appendChild (Canvas.hand);
  Container.appendChild (Canvas.foreground);

  //
  // Initialization done!

  // Draw everything (still to be refactored)
  //
  this.draw = function ()
  {
    if (Context.background && Context.foreground && Context.hand)
    {
      this.drawBackground ();
      this.drawCenter ();
      this.drawGloss ();

      this.drawMeter ();
      this.drawHand ();

      if (Display)
        Display.drawNumber (CurValue, MaxValue.toString().length, Position.h / 1.2, Size / 9);
    }
  }

  ////////////////////
  // Update functions

  // Clip the given value to max/min
  //
  function clipValue (value)
  {
    if (value >= MaxValue)
      return MaxValue;
    else if (value <= MinValue)
      return MinValue;
    else
      return value;
  }

  // Instantaneously update the speedometer to the given value
  //
  this.update = function (value)
  {
    CurValue = clipValue (value);

    if (Context.hand)
    {
      TBE.ClearCanvas (Canvas.hand);
      this.drawHand ();
    }

    if (Display)
    {
      Display.clear ();
      Display.drawNumber (CurValue, MaxValue.toString().length, Position.h / 1.2, Size / 9);
    }

    return CurValue;
  }

  this.rescale = function (val) {
    MaxValue = val;

    if (Context.meter)
    {
      TBE.ClearCanvas (Canvas.meter);
      this.drawMeter ();
    }

    this.update (CurValue);
  }

  function dispatchAnimationEndedEvent ()
  {
    var evt = document.createEvent ('UIEvent');

    evt.initUIEvent ('speedometer:animateend',
                     /* bubbles = */ false,
                     /* cancelable = */ false,
                     /* defaultView = */ window,
                     /* detail = */ CurValue);

    Container.dispatchEvent (evt);
  }

  var listeners = {};
  this.addEventListener = function (evt, func)
  {
    if (listeners[func] == undefined)
    {
      //console.log ("adding " + evt + " listener with " + func);
      Container.addEventListener (evt, func, false);
      listeners[func] = evt;
      return true;
    }
    return false;
  }

  this.removeEventListener = function (evt, func)
  {
    if (listeners[func])
    {
      //console.log ("removing " + evt + " listener with " + func);
      Container.removeEventListener (evt, func, false);
      delete listeners[func];
      return true;
    }
    return false;
  }

  this.removeAllListeners = function ()
  {
    for (func in listeners)
      this.removeEventListener (listeners[func], func);
  }

  var animateCallback = null;
  this.animatedUpdate = function (value, time, callback)
  {
    var FPS = 25, incr, speedometer = this;

    if (animateCallback)
      throw ('Animation already running!');

    value = clipValue (value);
    if (value == CurValue || time <= 0.0)
      throw ('Invalid parameters (value: ' + value + ', time: ' + time + ')');

    if (callback)
      this.addEventListener ('speedometer:animateend', callback, false);

    incr = (value - CurValue) / FPS / (time/1000);

    animateCallback = function ()
    {
      var done = Math.abs (CurValue - value) < Math.abs (incr);
      if (!animateCallback || done)
      {
        speedometer.stopAnimation ();

        if (done)
        {
          speedometer.update (value);
          dispatchAnimationEndedEvent ();
        }
      }
      else
      {
        speedometer.update (CurValue + incr);
        setTimeout (animateCallback, 1000 / FPS);
      }
    };

    animateCallback.call ();
  }

  this.animatedRescale = function (value, time, callback)
  {
    var FPS = 25, incr, speedometer = this;

    if (animateCallback)
      throw ('Animation already running!');

    if (value == MaxValue || value <= MinValue || time <= 0.0)
      throw ('Invalid parameters (value: ' + value + ', time: ' + time + ')');

    if (callback)
      this.addEventListener ('speedometer:animateend', callback, false);

    incr = (value - MaxValue) / FPS / (time/1000);

    animateCallback = function ()
    {
      var done = Math.abs (MaxValue - value) < Math.abs (incr);
      if (!animateCallback || done)
      {
        speedometer.stopAnimation ();

        if (done)
        {
          speedometer.rescale (value);
          dispatchAnimationEndedEvent ();
        }
      }
      else
      {
        speedometer.rescale(MaxValue + incr);
        setTimeout (animateCallback, 1000 / FPS);
      }
    };

    animateCallback.call ();
  }

  this.stopAnimation = function ()
  {
    animateCallback = null;
  }

  // Getters
  //
  this.value = function ()
  {
    return CurValue;
  }

  this.min = function ()
  {
    return MinValue;
  }

  this.max = function ()
  {
    return MaxValue;
  }

  this.drawMeter = function ()
  {
    var cx = Position.cx, cy = Position.cy;

    var context = Context.meter;

    var gap = (Size * (MeterGapScale + 0.5) * 0.03);

    var radius = (Size - gap) / 2 - gap * 5;
    var totalAngle = MeterToAngle - MeterFromAngle;

    var currentAngle, angleIncr;
    var incValue = (MaxValue - MinValue) / MeterTicksCount;

    function drawMark (angle, options)
    {
      var x0 = (cx + radius * Math.cos (angle));
      var y0 = (cy + radius * Math.sin (angle));
      var x1 = (cx + (radius - options.size) * Math.cos (angle));
      var y1 = (cy + (radius - options.size) * Math.sin (angle));

      context.strokeStyle = options.color;
      context.lineWidth = options.width;
      context.moveTo (x0, y0);
      context.lineTo (x1, y1);
    }

    function drawString (value, options)
    {
      // Draw Strings
      tx = cx + (radius - options.offset) * Math.cos (options.angle);
      ty = cy + gap / 2 + (radius - options.offset) * Math.sin (options.angle);

      context.fillStyle = options.color;
      context.textAlign = 'center';

      context.font = Math.round (options.size) + 'pt ' + Color.meter.font;
      context.textAlignment = 'center';
      context.fillText (value, tx, ty);
    }

    angleIncr = TBE.Deg2Rad (totalAngle / MeterTicksCount);
    currentAngle = TBE.Deg2Rad (MeterFromAngle);
    context.beginPath ();
    for (i = 0; i <= MeterTicksCount; i++)
    {
      // Draw thick mark and increment angle
      drawMark (currentAngle, {
        size: Size / 20,
        width: Size / 50,
        color: Color.meter.ticks
      });

      // Draw string and increment ruler value
      drawString (MinValue + Math.round (incValue * i), {
        angle: currentAngle,
        color: Color.meter.strings,
        offset: Size / 10,
        size: Size / 23
      });

      currentAngle += angleIncr;
    }
    context.stroke ();

    angleIncr = TBE.Deg2Rad (totalAngle / MeterTicksCount / (MeterMarksCount + 1));
    currentAngle = TBE.Deg2Rad (MeterFromAngle);
    context.beginPath ();
    for (i = 0; i < (MeterMarksCount + 1) * MeterTicksCount; i++)
    {
      // Draw thin mark if not overlapping a thick mark
      if (i % (MeterMarksCount + 1) != 0)
        drawMark (currentAngle, {size: Size / 50, width: Size / 100, color: Color.meter.marks});

      currentAngle += angleIncr;
    }
    context.stroke ();
  }

  this.drawGloss = function ()
  {
    if (!Glossy)
      return;

    var context = Context.foreground;

    // Draw dial glossiness
    //
    var rX = Size * 0.15;
    var rY = Position.y + Size * 0.07;
    var rW = Size * 0.70;
    var rH = Size * 0.65;

    var g1 = context.createLinearGradient (0, 0, 0, rY+rH);
    g1.addColorStop (0, 'rgba(255,255,255,1.0)');
    g1.addColorStop (1, 'rgba(255,255,255, 0.0)');

    context.fillStyle = g1;
    context.fillEllipse (rX, rY, rW, rH);

    if (!Display)
      return;

    // Draw display glossiness
    //
    rX = Size * 0.30;
    rY = Position.y + Size * 0.70;
    rW = Size * 0.40;
    rH = Size * 0.15;

    var g2 = context.createLinearGradient (0, rY, 0, rY + rH);
    g2.addColorStop (0, 'rgba(255,255,255,0.0)');
    g2.addColorStop (0.25, 'rgba(255,255,255,0.0)');
    g2.addColorStop (1, 'rgba(255,255,255,1.0)');

    context.fillStyle = g2;
    context.fillEllipse (rX, rY, rW, rH);
  }

  this.drawCenter = function ()
  {
    var cx = Position.cx, cy = Position.cy;

    var context = Context.foreground;

    var shift;

    if (CenterRimScale > 0 && CenterRimScale > CenterScale)
    {
      shift = CenterRimScale * (Size / 2);

      var rX = cx - (shift / 2);
      var rY = cy - (shift / 2);
      var rW = shift;
      var rH = shift;

      var g1 = context.createLinearGradient (0, rY, 0, rY + rH);
      g1.addColorStop (0, Color.center);
      g1.addColorStop (0.5, Color.center);
      g1.addColorStop (1, Color.dial);

      context.fillStyle = g1;
      context.fillEllipse (rX, rY, rW, rH);
    }

    if (CenterScale > 0)
    {
      shift = CenterScale * (Size / 2);

      rX = cx - (shift / 2);
      rY = cy - (shift / 2);
      rW = shift;
      rH = shift;

      var g2 = context.createLinearGradient (rX, rY, rW + rX, rY + rH);
      g2.addColorStop (0, Color.nose);
      g2.addColorStop (1, Color.center);

      context.fillStyle = g2;
      context.fillEllipse (rX, rY, rW, rH);
    }
  }

  this.drawHand = function ()
  {
    var cx = Position.cx, cy = Position.cy;

    var context = Context.hand;

    var radius = Size / 2 - (Size * 0.12);

    var val = MaxValue - MinValue;
    val = (MaxValue * (CurValue - MinValue)) / val;
    val = ((MeterToAngle - MeterFromAngle) * val) / MaxValue;
    val += MeterFromAngle;

    var angle = TBE.Deg2Rad (val);
    var gradientAngle = angle;

    // Fill Polygon
    var pts = new Array(5 * 2);

    pts[0*2+0] = cx + radius * Math.cos (angle);
    pts[0*2+1] = cy + radius * Math.sin (angle);

    pts[4*2+0] = cx + radius * Math.cos (angle - 0.02);
    pts[4*2+1] = cy + radius * Math.sin (angle - 0.02);

    angle = TBE.Deg2Rad (val + 20);
    pts[1*2+0] = cx + (Size * 0.09) * Math.cos (angle);
    pts[1*2+1] = cy + (Size * 0.09) * Math.sin (angle);

    pts[2*2+0] = cx;
    pts[2*2+1] = cy;

    angle = TBE.Deg2Rad (val - 20);
    pts[3*2+0] = cx + (Size * 0.09) * Math.cos (angle);
    pts[3*2+1] = cy + (Size * 0.09) * Math.sin (angle);

    context.fillStyle = Color.hand.main;
    context.fillPolygon (pts);

    // Draw Shine
    pts = new Array (3 * 2);

    angle = TBE.Deg2Rad (val);
    pts[0*2+0] = cx + radius * Math.cos (angle);
    pts[0*2+1] = cy + radius * Math.sin (angle);

    angle = TBE.Deg2Rad (val + 20);
    pts[1*2+0] = cx + (Size * 0.09) * Math.cos (angle);
    pts[1*2+1] = cy + (Size * 0.09) * Math.sin (angle);

    pts[2*2+0] = cx;
    pts[2*2+1] = cy;

    var g1 = context.createLinearGradient (0, 0, cx, cy);
    g1.addColorStop (0, Color.hand.shine);
    g1.addColorStop (1, Color.hand.shineTo);

    context.fillStyle = g1;
    context.fillPolygon (pts);
  }

  this.drawBackground = function ()
  {
    var x = Position.x, y = Position.y,
        w = Position.w, h = Position.h;

    var context = Context.background;

    // Draw background color
    context.fillStyle = Color.dial;
    context.ellipse (x, y, w, h);
    context.globalAlpha = 0.45;
    context.fill ();

    // Draw Rim
    context.strokeStyle = Color.rim;
    context.lineWidth = w * 0.03;
    context.ellipse (x, y, w, h);
    context.globalAlpha = 1.0;
    context.stroke ();

    // Draw Colored Rim
    context.strokeStyle = Color.rimArc;
    context.lineWidth = Size / 40;
    var gap = Size * 0.03;

    context.strokeBoxedArc (x + gap, y + gap, w - gap * 2, h - gap * 2,
                            TBE.Deg2Rad (MeterFromAngle), TBE.Deg2Rad (MeterRimAngle),
                            /* counterclockwise = */ false);

    // Draw Threshold
    context.strokeStyle = Color.thresh;
    context.lineWidth = Size / 50;

    var val = MaxValue - MinValue
    val = (MaxValue * (ThreshPivot - MinValue)) / val;
    val = ((MeterToAngle - MeterFromAngle) * val) / MaxValue;
    val += MeterFromAngle;

    var stAngle = val - ((MeterRimAngle * Threshold) / MaxValue / 2);
    if (stAngle <= MeterFromAngle)
      stAngle = MeterFromAngle;

    var sweepAngle = ((MeterRimAngle * Threshold) / MaxValue);
    if (stAngle + sweepAngle > MeterToAngle)
      sweepAngle = MeterToAngle - stAngle;

    context.strokeBoxedArc (x + gap, y + gap, w - gap * 2, h - gap * 2,
                            TBE.Deg2Rad (stAngle), TBE.Deg2Rad (sweepAngle),
                            /* counterclockwise = */ false);
  }
}; // End of class

// Theming support
Speedometer.themes = {};

// TBE JS library - General utility methods
//
var TBE = {
  CreateCanvasElement: function ()
  {
    var canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    return canvas;
  },

  CreateSquareCanvasElement: function (size)
  {
    var canvas = TBE.CreateCanvasElement ();

    canvas.setAttribute ('width', size);
    canvas.setAttribute ('height', size);

    return canvas;
  },

  // Get a Canvas context, given an element.
  // Accepts either an element ID or a DOM object.
  //
  GetElement2DContext: function (element)
  {
    if (typeof (element) != 'object')
      element = document.getElementById (element);

    if (element && element.getContext)
      return element.getContext('2d');

    return null;
  },

  // Clear a canvas, per w3c specification.
  // Accepts either an element ID or a DOM object.
  //
  ClearCanvas: function (element)
  {
    if (typeof (element) != 'object')
      element = document.getElementById(element);

    if (element)
      element.setAttribute ('width', element.getAttribute ('width'));
  },

  defaultView: null, // Cache defaultView (like jQuery does)
  GetElementComputedStyle: function (element)
  {
    if (!this.defaultView) this.defaultView = document.defaultView; 
    if (this.defaultView && this.defaultView.getComputedStyle)
      return this.defaultView.getComputedStyle (element, null);

    return null;
  },

  // Convert degrees to radians
  //
  Deg2Rad: function (theta)
  {
    return theta * Math.PI / 180.0;
  }
};

Speedometer.themes['default'] = {
  dial       : 'Gray',
  rim        : 'SlateGray',
  rimArc     : 'Gainsboro',
  thresh     : 'LawnGreen',
  center     : 'Black',
  nose       : 'SlateGray',
  hand       : 'Black',
  handShine  : 'SlateGray',
  handShineTo: 'Black',
  ticks      : 'Black',
  marks      : 'Black',
  strings    : 'Black',
  digits     : 'Black',
  font       : 'Sans-Serif'
};

Speedometer.themes.kitsch = {
  dial: 'Green',
  rim: 'Purple',
  thresh: 'Blue',
  center: 'Blue',
  nose: 'Yellow',
  hand: 'Blue',
  handShine: 'LightBlue',
  handShineTo: 'Blue',
  ticks: 'Purple',
  marks: 'White',
  strings: 'Red',
  digits: 'Green',
  font: 'Times'
}

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
freeboard.loadWidgetPlugin({
 
	"type_name"   : "simple_button",
	"display_name": "Button",
    "description" : "A basic button for sending information",



	"fill_size" : false,
	"settings"    : [
		{
			name        : "buttonLabel",
			display_name: "Button Label",
			type        : "text"
		},
		{
			name: "eventTarget",
			display_name: "Event Target",
			type: "data",
			force_data: "dynamic",
			multi_input: true,
			outgoing_parser: true
		},
		{
			name        : "size",
			display_name: "Size",
			type        : "option",
			options     : [
				{
					"name" : "Regular",
					"value": "regular"
				},
				{
					"name" : "Big",
					"value": "big"
				}
			]
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
		newInstanceCallback(new simpleButtonPlugin(settings, updateCallback));
	}
});


var simpleButtonPlugin = function(settings, updateCallback)
{
	var self = this;
	var currentSettings = settings;

	var myButtonElement = $("<input>")
		.attr({
			type:"button",
			value: settings.buttonLabel
		})
		.addClass("widget-button")
		.wrap('<div></div>');

	var submitPayload = {};

	
	self.render = function(containerElement)
	{

		$(containerElement).append(myButtonElement);
		myButtonElement.on( "click", self.onEvent);

	}


	self.getHeight = function()
	{
		if(currentSettings.size == "big")
		{
			return utils.widget.calculateHeight(2);
		}
		else
		{
			return utils.widget.calculateHeight(1);
		}
	}


	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
		myButtonElement.val(newSettings.buttonLabel);
	}


	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		submitPayload = newValue;
	}


	self.onDispose = function()
	{
	}

	self.getValue = function()
	{
	}

	self.onEvent = function() {
		updateCallback(submitPayload);
	}
}
var COLLECTION_GRID_COLUMNS_SETTING_NAME = "columns";
var COLLECTION_GRID_DATA_SETTING_NAME = "data";
var COLLECTION_GRID_PAGE_SIZE = "page_size";
var COLLECTION_GRID_ITEM_COUNT = "item_count";
freeboard.loadWidgetPlugin({

    "type_name": "crudgrid",
    "display_name": "CRUD Grid",
    "description": "An interactive grid for working with a source's data.",
    "external_scripts": [
        "lib/js/thirdparty/jsgrid.min.js"
    ],
    "settings": [
        {
            name: "gridTitle",
            display_name: "Grid Title",
            type: "text"
        },
        {
            name: COLLECTION_GRID_DATA_SETTING_NAME,
            display_name: "Data",
            type: "data",
            force_data: "dynamic",
            incoming_parser: true,
            outgoing_parser: true,
            description: "expected format: [ { \"name\": \"John\", \"age\": 42 }, { \"name\": \"Jane\", \"age\": 43 } ]"
        },
        {
            name: COLLECTION_GRID_COLUMNS_SETTING_NAME,
            display_name: "Columns",
            type: "data",
            force_data: "dynamic",
            incoming_parser: true,
            description: "expected format: [ { \"name\": \"name\", \"type\": \"text\" }, { \"name\": \"age\", \"type\": \"number\" } ]"
        },
        {
            name: COLLECTION_GRID_PAGE_SIZE,
            display_name: "Page Size",
            type: "number",
            description: "Number of items per page. Expected format: Int"
        },
        {
            name: COLLECTION_GRID_ITEM_COUNT,
            display_name: "Item Count",
            type: "number",
            type: "data",
            force_data: "dynamic",
            incoming_parser: true,
            description: "Number of items"
        },
        {
            "name": "sizeInBlocks",
            "display_name": "Size in Blocks",
            "description": "Blocks are 60px, fractions are not allowed. eg: 1.5 will be cast to 2",
            "type": "number",
            // Fractions are allowed. Use this to set the appropriate height for the visualization.
            // This value is in blocks (which is about 60px each).
            "default_value": 4
        },
        {
            name: "container_width",
            display_name: "Container width",
            type: "integer",
            description: "Width of your widget's container as a percentage. Useful when juxtaposing widgets.",
            default_value: "100",
            required: true
        }
    ],
    "default_parsers" : {
        clearblade_collection : {
            incoming : "// Defualt incoming parser for use with a ClearBlade Collection datasource. Format collection data to match widget's expected schema.\n" +
"if(this.datasource === undefined){return;}\n" +
"var fmtData = [];\n" +
"for(var i = 0, len = this.datasource.length; i < len; i++){\n" +
    "fmtData.push(this.datasource[i].data);\n" +
"}\n" +
"return fmtData;",
            outgoing: "// Defualt outgoing parser for use with a ClearBlade Collection datasource. Generates query to update on unique key of \"item_id\".\n"+
"if (this.widget.method !== \""+ utils.constants.PAGE_METHOD +"\") {\n"+
"var query = cb.Query();\n"+
"query.equalTo(\"item_id\", this.widget.data[\"item_id\"])\n"+
"this.widget.query = query;\n"+
"}\n"+
"return this.widget;"
        },
        clearblade_collection_columns :{
            incoming : "// Default parser when used with Collection Columns. Supplies all collection columns and disables editing of 'item_id'\n" +
"if(this.datasource == undefined){return;}\n" +
"var fmtColumns = [];\n"+
"for(var c = 0, len = this.datasource.length; c < len; c++){\n"+
    "var col = {\n"+
        "\"name\": this.datasource[c].ColumnName,\n"+
        "\"type\" : this.datasource[c].ColumnType,\n"+ 
        "\"disabled\" : (this.datasource[c].ColumnName == \"item_id\" ? true : false)\n"+
    "};\n" +
    "fmtColumns.push(col);\n"+
"}\n"+
"return fmtColumns;"
        }
    },

    newInstance: function (settings, newInstanceCallback, updateCallback) {
        newInstanceCallback(new collectionGrid(settings, updateCallback));
    }
});


var collectionGrid = function (settings, updateCallback) {
    var currentSettings = settings;
    var gridDefinition;
    var $widgetHeading = $("<h4>").addClass("widget-heading").text(settings.gridTitle);
    var $gridElement = $("<div>");
    var FIELD_CONTROL_TYPE = "control";
    var ADD_ROW = "Add";

    // Ref for paging
    var currentItems = [];
    var currentItemCount = 100;

    // Ref to be passed
    var currentData = {};
    var currentMethod = "";
    var currentOptions = {
        "paging" : { "pageIndex": 1, "pageSize": currentSettings[COLLECTION_GRID_PAGE_SIZE] },
        "schema" : []
    };

    var gridController = {
        insertItem: function (item) {
            var deferred = $.Deferred();
            currentMethod = utils.constants.INSERT_METHOD;
            updateCallback(item).then(function (newItem) {
                deferred.resolve();
            }, function () {
                deferred.reject();
            });
            return deferred.promise();
        },
        updateItem: function (item) {
            var deferred = $.Deferred();
            currentData = item;
            currentMethod = utils.constants.UPDATE_METHOD;
            updateCallback(item).then(function (resp) {
                deferred.resolve();
            }, function () {
                deferred.reject();
            });
            return deferred.promise();
        },
        deleteItem: function (item) {
            var deferred = $.Deferred();
            currentData = item;
            currentMethod = utils.constants.DELETE_METHOD;
            updateCallback(item).then(function () {
                deferred.resolve();
            }, function () {
                deferred.reject();
            });
            return deferred.promise();
        },
        loadData: function(filter){
            var deferred = $.Deferred();

            if (filter.bypass) {
                deferred.resolve({data: currentItems, itemsCount: currentItemCount});
                setTimeout(function() {
                    $gridElement.jsGrid("render");    
                });
            } else {
                currentOptions.paging = filter;
                currentMethod = utils.constants.PAGE_METHOD;
                updateCallback().then(function (page) {
                    deferred.resolve({"data": currentItems, "itemsCount" : currentItemCount });
                }, function () {
                    deferred.reject();
                });
            }
            
            return deferred.promise();
        }
    }

    //NOTE: this is the dialog used for adding/editing a record
    var showDetailsDialog = function (dialogType, client) {
        var $rowForm = $("<form>");
        var currentField;
        //build up the add/edit row form
        for (var i = 0, len = gridDefinition.fields.length; i < len; i++) {
            if (gridDefinition.fields[i].type !== FIELD_CONTROL_TYPE){
                currentField = $("<div>") 
                    .addClass("form-row")
                    .append($("<div>").addClass("form-label").append("<label>").addClass("control-label").html(gridDefinition.fields[i].name))
                    .append($("<div>").addClass("form-value").append($("<input>")
                        .attr({
                            type: gridDefinition.fields[i].type,
                            placeholder: gridDefinition.fields[i].name
                        })
                        // Disable non-editable fields
                        .prop("disabled", (gridDefinition.fields[i].disabled !== undefined ? gridDefinition.fields[i].disabled : false))
                        .val(client[gridDefinition.fields[i].name])));

                $rowForm.append(currentField);
            }
        }

        //todo: make this not so brittle. perhaps with knockout bindings in the form?
        var updatedRow = {};
        new DialogBox($rowForm, dialogType + " Row", "Save", "Cancel", function () {
            for (var i = 0, len = $rowForm[0].length; i < len; i++) {
                updatedRow[$($rowForm[0][i]).attr("placeholder")] = $($rowForm[0][i]).val();
            }
            saveRow(updatedRow, client, dialogType === ADD_ROW);
        });

    };

    //NOTE: saveRow is used for both creating and updating a record
    var saveRow = function (row, old, isNew) {
        currentData = row; // Set data for insert
        $gridElement.jsGrid(isNew ? "insertItem" : "updateItem", old, row);
    };

    this.render = function (containerElement) {
        this.defineGrid();
        $(containerElement).append([$widgetHeading, $gridElement]);
        //give the grid some time to render before loading data
        setTimeout(function() {
            $gridElement.jsGrid("loadData");    
        });
        
    }

    //used to create the columns in the grid
    this.setFields = function (cols) {
        // Set grid columns
        gridDefinition.fields = cols;
        // Add control column (Add / Delete)
        gridDefinition.fields.push({
            type: FIELD_CONTROL_TYPE,
            modeSwitchButton: false,
            editButton: false,
            headerTemplate: function () {
                return $("<button>").attr("type", "button").text("Add")
                    .on("click", function () {
                        showDetailsDialog(ADD_ROW, {});
                    });
            }
        });
        // Set scheme for CRUD requests
        currentOptions.schema = gridDefinition.fields;
        $gridElement.jsGrid(gridDefinition);    
        
    }

    //used to set the rows for the grid
    this.setRows = function (rows) {
        gridDefinition.data = rows;
        for(var r in rows)
            for(var key  in rows[r])
                rows[r][key] = rows[r][key] + "";
        $gridElement.jsGrid(gridDefinition);
    }

    //todo: figure out if I should add the header height here
    this.getHeight = function () {
        var blocks = currentSettings.sizeInBlocks ? currentSettings.sizeInBlocks : 4.0;
        return utils.widget.calculateHeight(blocks);
    }

    //outgoing parsers need to be supplied with the row in question as well as the type of action (update, create, delete)
    //todo: figure out how to support batch deletions
    this.getValue = function () {
        return {
            data: currentData,
            method: currentMethod,
            options: currentOptions     
        }
    }

    this.defineGrid = function(){
        var heightAdjust = $widgetHeading.text() !== "" ? 40 : 20; // 40 for the header and pagination bar... if no header jsut 20  (sucks, I know)
        gridDefinition = {
            height: (utils.widget.blocksToPixels(this.getHeight()) - heightAdjust) + "px", 
            width: "100%",
            editing: true,
            paging: true,
            pageSize: currentSettings[COLLECTION_GRID_PAGE_SIZE] || 20,
            pageLoading: true,
            noDataContent: "Empty data set",
            controller: gridController,
            rowClick: function (args) {
                showDetailsDialog("Edit", args.item);
            },
            deleteConfirm: function (item) {
                return "Are you sure you want to delete this item?";
            },
            fields: []
        }
    }


    this.onSettingsChanged = function (newSettings) {
        currentSettings = newSettings;
        $widgetHeading.text(currentSettings.gridTitle);
        this.defineGrid();
    }

    //NOTE: since we have two different datasource types (columns and rows) we need to check to see which
    //one we're receiving
    this.onCalculatedValueChanged = function (settingName, newValue) {

        if (settingName === COLLECTION_GRID_COLUMNS_SETTING_NAME) { 
            this.setFields(newValue);    
        }

        if (settingName === COLLECTION_GRID_DATA_SETTING_NAME) {
            // Grid will fetch handle requests 
            currentItems = newValue; 
            setTimeout(function() {
                $gridElement.jsGrid("loadData", {bypass: true});    
            });
        }
        
        if (settingName === COLLECTION_GRID_ITEM_COUNT) { 
            // Perhaps check to see if count has changed... item could have been added or removed
            currentItemCount = newValue; 
        }
    }

    //todo: figure out what we should do here
    this.onDispose = function () {

    }

}
freeboard.loadWidgetPlugin({
	"type_name"   : "mach_d3_plugin",
	"display_name": "D3.js Visualization",
	"description" : "Uses D3.js to visualize data",
	// **external_scripts** : Use the D3.js
	"external_scripts" : [
		"https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.5/d3.min.js"
	],
	"fill_size" : false,
	"settings"    : [
		{
			"name"        	  : "data",
			"display_name"    : "Source",
			"description"  	  : "Bind the widget to a data source.",
			"type"        	  : "data",
			"force_data"      :"dynamic",
			"incoming_parser" : true
		},
		{
			"name"        : "style",
			"display_name": "CSS",
			"description" : "Stylesheet rules to add to the whole page.",
			"type"        : "calculated"
		},
		{
			"name"        : "html",
			"display_name": "HTML",
			"description" : "The HTML to render in the widget.",
			"type"        : "calculated"
		},
		{
			"name"        : "code",
			"display_name": "D3.js Code",
			// We want the js editor so we can edit the d3.js code. However, we will not be accessing any of the data sources here.
			// Assume that there is a property called 'data' passed into the method, which is the result of the 'data' setting above.
			// Write the d3 code to visualize what is in the data argument.
			"description" : "Write the d3.js code to update the visualization.",
			"type"        : "calculated"
		},
		{
			"name"        : "sizeInBlocks",
			"display_name": "Size in Blocks (fractions are allowed)",
			"description" : "Blocks are 60px, fractions are not allowed. eg: 1.5 will be cast to 2",
			"type"        : "number",
			// This value is in blocks (which is about 60px each).
			"default_value" : 1
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
	newInstance   : function(settings, newInstanceCallback)
	{
		newInstanceCallback(new d3WidgetPlugin(settings));
	}
});

// ### D3.js Implementation
//
// -------------------
var d3WidgetPlugin = function(settings)
{
	var self = this;
	var currentSettings = settings;
	var container;
	var dataBU;

	// Create a variable for the created stylesheet:
	var styleSheet = null;

	self.render = function(containerElement)
	{
		// Here we append our text element to the widget container element.
		container = containerElement;

		// Load the settings:
		self.onSettingsChanged(currentSettings);
	}

	self.getHeight = function()
	{
		var blocks = currentSettings.sizeInBlocks ? currentSettings.sizeInBlocks : 1.0;
		return utils.widget.calculateHeight(blocks);
	}

	self.onSettingsChanged = function(newSettings)
	{
		// Normally we'd update our text element with the value we defined in the user settings above (the_text), but there is a special case for settings that are of type **"calculated"** -- see below.
		currentSettings = newSettings;
		currentSettings.sizeInBlocks = utils.widget.calculateHeight(currentSettings.sizeInBlocks);
		// Check whether we specified some html:
		if(currentSettings.html)
		{
			// Insert the html:
			container.innerHTML = currentSettings.html;
		}

		// Check whether we specified a CSS stylesheet for the visualization:
		if(currentSettings.style)
		{
			// Check whether we already have a style for this component:
			if (self.styleSheet)
			{
				// We already have a stylesheet for this component.
				// Remove it:
				// http://www.w3.org/wiki/Dynamic_style_-_manipulating_CSS_with_JavaScript
				var sheetParent = self.styleSheet.parentNode;
				sheetParent.removeChild(self.styleSheet);
			}
			// Now we have removed any stylesheets from before if we had any.

			// Code for dynamically adding stylesheets.
			// http://davidwalsh.name/add-rules-stylesheets
			// http://www.w3.org/wiki/Dynamic_style_-_manipulating_CSS_with_JavaScript
			var createStyleSheet = function() {
				// Create the <style> tag
				var style = document.createElement("style");

				// Add a media (and/or media query) here if you'd like!
				// style.setAttribute("media", "screen")
				// style.setAttribute("media", "only screen and (max-width : 1024px)")

				// WebKit hack :(
				style.appendChild(document.createTextNode(""));

				// Add the <style> element to the page
				document.head.appendChild(style);

				return style;
			};

			// Create a new style sheet:
			self.styleSheet = createStyleSheet();

			// Add the rule to the style sheet:
			self.styleSheet.innerHTML = currentSettings.style;
		}
	}

	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		// Remember we defined "the_text" up above in our settings.
		if(settingName == currentSettings.data[0].dsName)
		{
			// Get the code that we want to run:
			var code = currentSettings.code;

			// Set the data:
			var data = newValue;
			dataBU = data;

			// Evaluate the code:
			eval(code);
		}
	}

	self.onDispose = function()
	{
	}

	self.getValue = function () 
	{
		return dataBU || "";
	}
}
var dialWidgetPlugin = function(settings, updateCallback)
{
	var self = this;
	self.lastMove;
	var currentSettings = settings;
	var controlState;
	var start = {x:0,y:0};
	var offset = {x: 0, y:0};

	var tickArray = [];
	var angle = {
		"min": 0,
		"max": 270,
		"current": 0
	}

	var sensitivity = 10;
	var minLabel = "Low";
	var maxLabel = "High";

	// Widget heading
	var $widgetHeading = $("<h4>").addClass("widget-heading").text(settings.dial_name).css("margin-bottom", "-35px");

	// Knob frame
	var $displayElement = $("<div>").addClass("knob-surround");

		var $knob = $("<div>").addClass("knob")
				.bind("touchstart", function(event){
					start.x = event.originalEvent.touches[0].pageX;
					start.y = event.originalEvent.touches[0].pageY;
				})
				.bind('mousewheel DOMMouseScroll touchmove scroll', function(event){

					var scrollTo = null;
				    if (event.type == 'mousewheel') {
				        scrollTo = (event.originalEvent.wheelDelta * -1);
				    }
				    else if (event.type == 'DOMMouseScroll') {
				        scrollTo = 40 * event.originalEvent.detail;
				    } else if (event.type == 'touchmove'){
				    	offset = {x: 0, y:0};
						offset.x = start.x - event.originalEvent.touches[0].pageX;
						offset.y = start.y - event.originalEvent.touches[0].pageY;
						scrollTo = offset.y;
				    }

				    if (scrollTo) {
				        event.preventDefault();
				        $(this).scrollTop(scrollTo + $(this).scrollTop());
				    }

					if (event.originalEvent.wheelDelta > 0 || event.originalEvent.detail < 0 || offset.y > 0) { self.moveKnob('up');} 
					else { self.moveKnob('down');}
				});
		var $minIndicator = $("<span>").addClass("min").text(minLabel).css("color","green");
		var $maxIndicator = $("<span>").addClass("max").text(maxLabel).css("color","red");
		var $ticks = $("<div>").addClass("ticks");
		for(var i = 0; i < sensitivity; i++){
			var $tick = $("<div>").addClass("widget-tick");
			$ticks.append($tick);
			tickArray.push($tick);
		}

	$displayElement.append([$knob, $minIndicator, $maxIndicator, $ticks]);

	// Value Indicator
	var $valueIndicator = $("<span>")
			.css({
				"display" : "block",
				"margin-top": "-35px",
				"text-align": "center"
			}).text("loading...");


	self.updateSpeed = function(speed) {
		controlState = speed;
		if(settings._datatype !== undefined){
			updateCallback(controlState);
		}
	}

	self.getValue = function() {
		return controlState;
	}

	self.moveKnob = function(direction){
	  self.lastMove = Date.now();
	  if(direction == 'up') {
	    if((angle.current + 2) <= angle.max) {
	      angle.current += 2;
	      self.setAngle();
	    }
	  }
	  
	  else if(direction == 'down') {
	    if((angle.current - 2) >= angle.min) {
	      angle.current -= 2;
	      self.setAngle();
	    }
	  }
	}

	self.setAngle = function(supressCallback) {

		// rotate knob
		$knob.css({
			'-moz-transform':'rotate('+angle.current+'deg)',
			'-webkit-transform':'rotate('+angle.current+'deg)',
			'-o-transform':'rotate('+angle.current+'deg)',
			'-ms-transform':'rotate('+angle.current+'deg)',
			'transform':'rotate('+angle.current+'deg)'
			});

		// highlight ticks
		var activeTicks = (Math.round(angle.current / 30) + 1);
		var i = 0;
		for(i; i < activeTicks; i++){
			tickArray[i].addClass("activetick");
		}
		for(i; i < sensitivity; i++){
			tickArray[i].removeClass("activetick");
		}

		// update % value in text
		var pc = Math.round( (angle.current / angle.max) * 100);
		$valueIndicator.text(pc+'%');
		if(!supressCallback){
			self.updateSpeed(pc);
		}
	}

	self.render = function(containerElement)
	{
		$(containerElement).append([$widgetHeading, $displayElement, $valueIndicator]);
	}

	self.getHeight = function()
	{
		return utils.widget.calculateHeight(8);
	}

	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
		$widgetHeading.text(settings.dial_name);
	}

	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		//only update if it's been half a second this the last time we touched the dial
		//we do this to avoid updating the dial while we are still moving it which results in a jerky dial
		if(Date.now() - 500 >= self.lastMove || !self.lastMove) {
			if(newValue !== undefined){
				angle.current = Math.round( (newValue / 100) * angle.max);
				if(isNaN(angle.current)) {
					console.warn("Received a value that wasn't a number for dial with name of '" + currentSettings.dial_name + "'; Resetting to 0");
					angle.current = 0;
				}
				self.setAngle(true);
			}		
		}
	}

	// **onDispose()** (required) : Same as with datasource plugins.
	self.onDispose = function()
	{
	}
}

freeboard.loadWidgetPlugin({
	// Same stuff here as with datasource plugin.
	"type_name"   : "dial_widget",
	"display_name": "Dial",
    "description" : "A dial that connects to a message topic",
	// **external_scripts** : Any external scripts that should be loaded before the plugin instance is created.
	"external_scripts": [			
		"lib/js/thirdparty/dial.js"
	],
	// **fill_size** : If this is set to true, the widget will fill be allowed to fill the entire space given it, otherwise it will contain an automatic padding of around 10 pixels around it.
	"fill_size" : false,
	"settings"    : [
		{
			"name"        : "dial_name",
			"display_name": "Dial Name",
			"type"        : "text",
			"required"	  : true
		},
		{
			name: "dialVal",
			display_name: "Dial Value",
			type: "data",
			multi_input: true,
			incoming_parser: true,
			outgoing_parser: true
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
		newInstanceCallback(new dialWidgetPlugin(settings, updateCallback));
	}
});
freeboard.loadWidgetPlugin({
 
	"type_name"   : "message_feed",
	"display_name": "Message Feed",

	"fill_size" : false,
	"settings"    : [
		{
			"name"        : "feed_name",
			"display_name": "Feed Name",
			"type"        : "text"
		},
		{
			name: "feedSource",
			display_name: "Feed Source",
			type: "data",
			multi_input: true,
			incoming_parser: true
		},
		{
			"name"        : "size",
			"display_name": "Size",
			"type"        : "option",
			"options"     : [
				{
					"name" : "Small",
					"value": "sm"
				},
				{
					"name" : "Medium",
					"value": "md"
				},
				{
					"name" : "Large",
					"value": "lg"
				},
				{
					"name" : "XL",
					"value": "xl"
				}
			]
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
		newInstanceCallback(new feedWidgetPlugin(settings, updateCallback));
	}
});



 
var feedWidgetPlugin = function(settings, updateCallback)
{
	var self = this;
	//replace spaces with dash so we can retrieve by id later
	settings.formName = settings.feed_name.replace(/\s+/g, '-');
	var currentSettings = settings;
	var mesHis = [];
	var $displayListFrame = $("<div>")
			.attr("id", settings.feed_name)
			.addClass("widget-list-frame");

	var $listTitle = $("<span>")
			.addClass("widget-list-heading")
			.text(settings.feed_name);

	var $displayList = $("<ul>").addClass("lw-list");

	var message = currentSettings.topic_name;

	self.render = function(containerElement)
	{
		$(containerElement).append([$listTitle, $displayListFrame]);
	}


	self.getHeight = function()
	{
		switch(currentSettings.size){
			case "sm": return 1; 
			case "md": return 2; 
			case "lg": return 4; 
			case "xl": return 8; 
		}
	}


	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;

		$displayListFrame.attr("id", currentSettings.feed_name);
		$listTitle.text(currentSettings.feed_name);
	}

	self.populateList = function(){
		$displayList.html('');
		for (var i = mesHis.length-1; i >= 0; i--) {
			var row = $('<li>');
			var val = mesHis[i];
			var col_value = $('<a>')
					.text(val);
			
			row.append(col_value);
			$displayList.append(row);
		}

		$displayListFrame.append($displayList);
	}


	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		mesHis.push(JSON.stringify(newValue));
		if (mesHis.length > 100){
			mesHis.shift();
		}
		self.populateList();
	}

	self.getValue = function()
	{
	}


	self.onDispose = function()
	{
	}
}

freeboard.addStyle('.lw-list li a', "text-color: white; text-size:14px;padding: 5px 30px 5px 10px; display: block;");
freeboard.loadWidgetPlugin({
    type_name: "filterable_list",
    display_name: "Filterable List",
    fill_size: false,
    description: "Easily filter a list based of key/values you care about. Ability to add multiple filter options, and a text search box as well",
    settings: [
        {
            name: "list_name",
            display_name: "List Name",
            type: "text"
        },
        {
            name: "list_data",
            display_name: "List Source",
            type: "data",
            incoming_parser: true,
            multi_input: true
        },
        {
            name: "selected_item",
            display_name: "Selected Item",
            type: "data",
            force_data: "dynamic",
            outgoing_parser: true,
            multi_input: true
        },
        {
            name: "display_attribute",
            display_name: "Display Attribute",
            type: "text",
            description: "The attribute on a provided object that contains the value you want displayed in the list for the object. Defaults to 'name'",
            default_value: "name",
            required: true
        },
        {
            name: "status_attribute",
            display_name: "Status Attribute",
            type: "text",
            description: "Attribute used to display status type styling (If value is true, then background will have green highlighting, if false, then it will be red). Leave blank if you don't care about this."
        },
        {
            name: "filters",
            display_name: "Filters",
            type: "text",
            description: "An array of simple objects that define the drop down filters you would like to have available for this list. The object should look like { someKeyOnYourObject: \"Awesome Key\"}"
        },
        {
            name: "allow_text_filter",
            display_name: "Allow Text Filter",
            type: "boolean",
            description: "Should a text field be display to allow filtering of the list via user input?"
        },
        {
            name: "block_height",
            display_name: "Block Height",
            type: "number",
            default_value: 4
        },
        {
            name: "container_width",
            display_name: "Container Width",
            type: "integer",
            description: "Width of your widget's container as a percentage. Useful when juxtaposing widgets.",
            default_value: 100,
            required: true
        }
    ],
    newInstance: function (settings, newInstanceCallback, updateCallback) {
        newInstanceCallback(new filterableListWidgetPlugin(settings, updateCallback));
    }
});

var filterableListWidgetPlugin = function (settings, updateCallback) {
    var self = this;
    self.rawData = [];
    self.selectedFilters = {};
    self.textFilter = "";
    var currentSettings = settings;
    var activeValue;

    var $activeFilters = $("<div>");
    var $activeList = $("<ul>");

    var $textFilter = $("<input>")
        .addClass("filterable-list-text-filter")
        .css("display", "none")
        .on("change paste keyup", function (event) {
            self.textFilter = event.target.value;
            rebuildList();
        });

    var $activeItem;

    var $titleElement = $("<h2>")
        .addClass("section-title")
        .text(currentSettings.list_name)
        .css("margin-bottom", "3px");

    var buildSelectFilters = function () {
        var $filters = $("<div>").addClass("filterable-list-filter");
        var filters = utils.parseJsonArray(currentSettings.filters);
        for (var x = 0; x < filters.length; x++) {
            //for simplicity the filter object uses the key as they key to filter by, so we have to grab it
            var filterKey;
            for (var prop in filters[x]) {
                if (filters[x].hasOwnProperty(prop)) {
                    filterKey = prop;
                }
            }
            //build a list of possible values for that key
            var possibleOptions = [];
            for (var y = 0; y < self.rawData.length; y++) {
                if (possibleOptions.indexOf(self.rawData[y][filterKey]) === -1) {
                    possibleOptions.push(self.rawData[y][filterKey]);
                }

            }
            //now create the dropdown and populate with options
            var $dropDownContainer = $("<div>").addClass("filterable-list-filter-container").text(filters[x][filterKey]);
            var $dropDown = $("<select>").css({"display": "block"}).on("change", {filterKey: filterKey}, function (event) {
                if (this.value === "") {
                    delete self.selectedFilters[event.data.filterKey];
                } else {
                    self.selectedFilters[event.data.filterKey] = this.value;
                }
                rebuildList();
            });
            $dropDown.append($("<option>").attr("value", "").text(""));
            for (var y = 0; y < possibleOptions.length; y++) {
                $option = $("<option>").attr("value", possibleOptions[y]).text(possibleOptions[y]);
                $dropDown.append($option);
            }
            $filters.append($dropDownContainer.append($dropDown));
        }



        return $filters;
    };

    var buildList = function () {
        var $list = $("<ul>").addClass("filterable-list-list");
        var filteredEdges;
        //if there are no filters selected, just use the whole edge list
        if (_.isEqual(self.selectedFilters, {})) {
            //slice will return a new instance of an array, so that way if we have to splice later we don't alter rawData
            filteredEdges = self.rawData.slice();
        } else {
            filteredEdges = _.where(self.rawData, self.selectedFilters);
        }

        if (self.textFilter !== "") {
            //var newFilteredEdges = [];
            for (var x = filteredEdges.length - 1; x >= 0; x--) {
                if (filteredEdges[x][currentSettings.display_attribute].indexOf(self.textFilter) === -1) {
                    filteredEdges.splice(x, 1);
                }
            }
        }

        for (var x = 0; x < filteredEdges.length; x++) {
            var $listItem = $("<li>");
            if (currentSettings.status_attribute !== undefined && currentSettings.status_attribute !== "") {
                var status = $("<div>").addClass("status");
                if (filteredEdges[x][currentSettings.status_attribute]) {
                    status.addClass("positive");
                } else {
                    status.addClass("negative");
                }
                $listItem.append(status);
            }
            $listItem.append($("<span>").text(filteredEdges[x][currentSettings.display_attribute]));
            $listItem.addClass("filterable-list-list-item")
                .on("click", {item: filteredEdges[x]} , function (event) {
                    event.stopPropagation();
                    activeValue = event.data.item;
                    if ($activeItem) {
                        $activeItem.removeClass("active");
                    }
                    $activeItem = $(this);
                    $activeItem.addClass("active");
                    updateCallback(event.data.item, currentSettings.selected_item);
                });

            $list.append($listItem);
        }

        return $list;
    };

    var rebuildList = function () {
        var $newList = buildList();
        $activeList.replaceWith($newList);
        $activeList = $newList;
    };

    var rebuildFilters = function () {
        var $newFilters = buildSelectFilters();
        $activeFilters.replaceWith($newFilters);
        $activeFilters = $newFilters;
    };

    self.render = function (containerElement) {
        $activeFilters = buildSelectFilters();
        $activeList = buildList();
        if (currentSettings.allow_text_filter) {
            $textFilter.css("display", "initial");
        }
        $(containerElement).append($titleElement, $activeFilters, $textFilter, $activeList).addClass("filterable-list-container");
    };

    self.getHeight = function () {
        return utils.widget.calculateHeight(currentSettings.block_height);
    };

    self.getValue = function () {
        return activeValue;
    };

    self.onCalculatedValueChanged = function (settingName, newValue) {
        if (!_.isEqual(newValue, this.rawData)) {
            this.rawData = newValue;
            rebuildFilters();
            rebuildList();
        }
    };

    self.onSettingsChanged = function (newSettings) {
        currentSettings = newSettings;
        rebuildFilters();
        rebuildList();
        $titleElement.text(currentSettings.list_name);
        if (currentSettings.allow_text_filter) {
            $textFilter.css("display", "initial");
        } else {
            $textFilter.css("display", "none");
        }
    };

};

freeboard.loadWidgetPlugin({
 
	"type_name"   : "flipswitch",
	"display_name": "Flip Switch",
    "description" : "A basic switch for setting on or off states",

	"fill_size" : false,
	"settings"    : [
		{
			name        : "sectionTitle",
			display_name: "Title",
			type        : "text",
			default_value	: "Switch"
		},
		{
			name        : "trueLabel",
			display_name: "True Label",
			type        : "text",
			default_value	: "on"
		},
		{
			name        : "falseLabel",
			display_name: "False Label",
			type        : "text",
			default_value	: "off"
		},
		{
			name: "switchVal",
			display_name: "Switch Value",
			type: "data",
			multi_input: true,
			incoming_parser: true,
			outgoing_parser: true
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
		newInstanceCallback(new flipSwitchPlugin(settings, updateCallback));
	}
});
	

var flipSwitchPlugin = function(settings, updateCallback)
{
	var self = this;
	var ON_CONSTANT = true;
	var OFF_CONSTANT = false;
	var currentSettings = settings;
	var $titleElement = $("<h4>").addClass("widget-heading").text(settings.sectionTitle);
	var currentState = false;
	// Isolate interaction to single switch. Note: this will remain the id if user edits flipswitch title (hash added in event of duplicate titles)
	var hash = Math.floor((Math.random() * 50) + 1) + "";
	var uniqueFlipKey = "flipswitch-"+settings.sectionTitle+hash;

	var $divToggle = $("<div>").addClass("flipswitch");

		var $inputToggle = $("<input>")
							.attr({
								"type":"checkbox",
								"id": uniqueFlipKey,
								"name":"flipswitch"
							})
							.addClass("flipswitch-checkbox");

		var $labelToggle = $("<label>")
							.attr("for", uniqueFlipKey)
							.addClass("flipswitch-label");
			var $innerToggle = $("<div>").addClass("flipswitch-inner");	
				var $spanOnToggle = $("<span>").addClass("on").text(currentSettings.trueLabel);
				var $spanOffToggle = $("<span>").addClass("off").text(currentSettings.falseLabel);     
			$innerToggle.append([$spanOnToggle, $spanOffToggle]);

			var $switchToggle = $( "<div>").addClass("flipswitch-switch");
		
		$labelToggle.append([$innerToggle, $switchToggle]);
	$divToggle.append([$inputToggle, $labelToggle]);

	var submitPayload = {
		"true": currentSettings.truePayload,
		"false": currentSettings.falsePayload
	};

	var toggleFlip = function(){
		$inputToggle.toggleClass("flipped");
		currentState = !currentState;
	}

	self.render = function(containerElement)
	{
		$(containerElement).append([$titleElement, $divToggle]);
		$inputToggle.on("change", self.onToggle);
	}


	self.getHeight = function()
	{
		if(currentSettings.size == "big")
		{
			return 3;
		}
		else
		{
			return 2;
		}
	}

	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
		$titleElement.text(newSettings.sectionTitle);
		$spanOnToggle.text(newSettings.trueLabel);
		$spanOffToggle.text(newSettings.falseLabel);   
		submitPayload = {
			"true": newSettings.truePayload,
			"false": newSettings.falsePayload
		};
		self.currentState = newSettings.currentState;
		self.targetDataSource = newSettings.targetDataSource;
	}

	self.getValue = function() {
		if($inputToggle.hasClass("flipped")) {
			return ON_CONSTANT;
		} else {
			return OFF_CONSTANT;
		}
	}

	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		var isFlipped = $inputToggle.hasClass("flipped");
		if((newValue === "true" || newValue === true) && !isFlipped ){
			toggleFlip();
		} else if((newValue === "false" || newValue === false) && isFlipped ){
			toggleFlip();
		}
	}

	self.onDispose = function()
	{
	}

	self.onToggle = function() {
		if(currentState === "true" || currentState === true){
			toggleFlip();
			updateCallback(OFF_CONSTANT);
		} else {
			toggleFlip();
			updateCallback(ON_CONSTANT);
		}
	}
}



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
freeboard.loadWidgetPlugin({
    "type_name": "grouping_list",
    "display_name": "Grouping List",
    "fill_size": false,
    "description": "Easily group an array of objects by specific key/value pairs on the object. Also will nest groupings as much as you like.",
    "settings" : [
        {
            name: "list_name",
            display_name: "List Name",
            type: "text"
        },
        {
            name: "list_data",
            display_name: "List Source",
            type: "data",
            incoming_parser: true,
            multi_input: true
        },
        {
            name: "selected_item",
            display_name: "Selected Item",
            type: "data",
            force_data: "dynamic",
            outgoing_parser: true,
            multi_input: true
        },
        {
            name: "status_attribute",
            display_name: "Status Attribute",
            type: "text",
            description: "Attribute used to display status type styling (If value is true, then background will have green highlighting, if false, then it will be red). Leave blank if you don't care about this."
        },
        {
            name: "group_by_attributes",
            display_name: "Group By Attributes",
            type: "text",
            description: "An Array of strings defining what attribute(s) to group by on the provided array of objects."
        },
        {
            name: "block_height",
            display_name: "Block Height",
            type: "number",
            default_value: 4,
        },
        {
            name: "container_width",
            display_name: "Container Width",
            type: "integer",
            description: "Width of your widget's container as a percentage. Useful when juxtaposing widgets.",
            default_value: "100",
            required: true
        }
    ],
    newInstance: function (settings, newInstanceCallback, updateCallback) {
        newInstanceCallback(new groupingListWidgetPlugin(settings, updateCallback))
    }
});



var groupingListWidgetPlugin = function (settings, updateCallback) {
    var self = this;

    var currentSettings = settings;
    var activeValue;
    self.rawData = {};

    var $titleElement = $("<h2>")
        .addClass("section-title")
        .text(currentSettings.list_name)
        .css("margin-bottom", "3px");

    var $activeList = $("<ul>");

    var $activeItem;

    //create an underscore mixin to easily group provided objects by whatever keys
    _.mixin({
        groupByMulti: function(list, values, context) {
            if (!values.length) {
                return list;
            }
            var byFirst = _.groupBy(list, values[0], context);
            var rest = values.slice(1);
            for (var prop in byFirst) {
                byFirst[prop] = _.groupByMulti(byFirst[prop], rest, context);
            }
            return byFirst;
        }
    });


    var buildList = function (listData) {
        var $list = $("<ul>").addClass("grouping-list-widget");
        var listData = utils.parseJsonArray(listData);

        var onGroupNameClick = function(event) {
            event.stopPropagation();
            var children = $(this).children();
            children.toggleClass("hidden");
        };

        for (var property in listData) {
            if (listData.hasOwnProperty(property)) {
                if (Array.isArray(listData[property])) {
                    var $nestedList = $("<li>").addClass("grouping-list-widget-group-name").on("click", onGroupNameClick).text(property);
                    var $listItems = $("<ul>").addClass("grouping-list-widget hidden");
                    $nestedList.append($listItems);

                    for (var x = 0; x < listData[property].length; x++) {
                        var $listItem = $("<li>");
                        if (currentSettings.status_attribute !== undefined && currentSettings.status_attribute !== "") {
                            var status = $("<div>").addClass("status");
                            if (listData[property][x][currentSettings.status_attribute]) {
                                status.addClass("positive");
                            } else {
                                status.addClass("negative");
                            }
                            $listItem.append(status);
                        }
                        $listItem.append($("<span>").text(listData[property][x].name));
                        //$listItem.text(listData[property][x].name)
                        $listItem.addClass("grouping-list-widget-item")
                            .on("click", {item: listData[property][x]}, function (event) {
                                event.stopPropagation();
                                activeValue = event.data.item;
                                if ($activeItem) {
                                    $activeItem.removeClass("active");
                                }
                                $activeItem = $(this);
                                $activeItem.addClass("active");
                                updateCallback(event.data.item, currentSettings.selected_item);
                            });
                        $listItems.append($listItem);
                    }
                    $list.append($nestedList);
                } else {
                    var $nestedList = $("<li>")
                        .addClass("grouping-list-widget-group-name")
                        .text(property)
                        .on("click", onGroupNameClick);
                    var $nestedListItems = buildList(listData[property]);
                    $nestedList.append($nestedListItems.addClass('hidden'));
                    $list.append($nestedList);
                }
            }
        }


        return $list;
    };

    self.render = function (containerElement) {
        //$activeList = buildList(currentSettings.list_data);
        $(containerElement)
            .addClass("grouping-list-container")
            .append([$titleElement, $activeList]);
    };

    self.getHeight = function () {
        return utils.widget.calculateHeight(currentSettings.block_height);
    };

    self.getValue = function () {
        return activeValue;
    };

    self.onCalculatedValueChanged = function(settingName, newValue) {
        if (!_.isEqual(newValue, this.rawData)) {
            this.rawData = newValue;
            var $newList = buildList(_.groupByMulti(newValue, utils.parseJsonArray(currentSettings.group_by_attributes)));
            $activeList.replaceWith($newList);
            $activeList = $newList;
        }
    };

    self.onSettingsChanged = function (newSettings) {
        currentSettings = newSettings;
        var $newList = buildList(_.groupByMulti(this.rawData, utils.parseJsonArray(currentSettings.group_by_attributes)));
        $activeList.replaceWith($newList);
        $activeList = $newList;
        $titleElement.text(currentSettings.list_name);
    };

};

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
freeboard.loadWidgetPlugin({

	"type_name"   : "lineGraph",
	"display_name": "Line Graph",
    "description" : "A line graph generated from input data",
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
			name            : "line_color",
			display_name    : "Line Color",
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
		newInstanceCallback(new lineGraph(settings, updateCallback));
	}
});


var lineGraph = function(settings, updateCallback)
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

		// Set the ranges
		var x = d3.scale.ordinal().rangeRoundBands([0, width]);
		var y = d3.scale.linear().range([height, 0]);

		// Define the axes
		var xAxis = d3.svg.axis()
		    .scale(x)
		    .orient("bottom")

		var yAxis = d3.svg.axis().scale(y)
		    .orient("left");

		// Define the line
		var valueline = d3.svg.line()
		    .x(function(d) { return x(d.x) + (margin.right + 8); })
		    .y(function(d) { return y(d.y); });

		x.domain(data.map(function(d) { return d.x; }));
		y.domain([0, d3.max(data, function(d) { return d.y; })]);

		// Add the valueline path.
		svg.append("path")
		.attr("class", "line")
		.attr("d", valueline(data));

		// Add the X Axis
		svg.append("g")
		.attr("class", "x axis")
		.attr("transform", "translate(0," + height + ")")
		.call(xAxis);

		// Add the Y Axis
		svg.append("g")
		.attr("class", "y axis")
		.call(yAxis);

		svg.append("text")
			.attr("class", "axisLabel")
			.attr("transform", "rotate(-90)")
			.attr("y", 5)
			.attr("dy", ".71em")
			.style("text-anchor", "end")
			.text(currentSettings.rangeTitle);

		svg.append("text")
			.attr("class", "axisLabel")
	        .attr("x", (width / 2) )
	        .attr("y", (height + 35) )
	        .style("text-anchor", "middle")
	        .text(currentSettings.domainTitle);


	    svg.selectAll(".line").style({ "stroke": currentSettings.line_color });
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
		}, 300);

	}

	self.getHeight = function()
	{
		var blocks = currentSettings.sizeInBlocks ? currentSettings.sizeInBlocks : 4.0;
		return utils.widget.calculateHeight(blocks);
	}

	self.getValue = function()
	{
		return graphData;
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


	self.onDispose = function()
	{

	}
}

freeboard.loadWidgetPlugin({
 
	"type_name"   : "collection_list",
	"display_name": "List",
	"fill_size" : false,
	"description" : "Expects an array of items in the format [ {\"label\": \"String\", \"value\" : AnyObject } ] where value is sent to the local_var on item click.",
	"settings"    : [
		{
			"name"        : "list_name",
			"display_name": "List Name",
			"type"        : "text"
		},
		{
			name: "listData",
			display_name: "List Source",
			type: "data",
			incoming_parser: true,
			multi_input: true
		},
		{
			name			: "local_var",
			display_name	: "Local Variable",
			type			: "data",
			force_data		: "dynamic",
			outgoing_parser	: true,
			multi_input		: true
		},
		{
			name 			: "track_attribute",
			display_name	: "Tracking Column Name",
			type 			: "text",
			description		: "Attribute used to identify active item."
		},
		{
			"name"        : "blockHeight",
			"display_name": "Block Height",
			"type"        : "number",
			default_value : 4,
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
	"default_parsers" : {
        clearblade_collection : {
            incoming : "// Defualt incoming parser for use with a ClearBlade Collection datasource. Generates a list using \"item_id\" as a label and the row data as the value, then sorts by alphanumeric order.\n" +
"if(this.datasource === undefined){return;}\n"+
"var fmtData = [];\n"+
"var len = this.datasource.length;\n"+
"for(var i = 0; i < len; i++){\n"+
    "fmtData.push({\"label\": this.datasource[i].data.item_id , \"value\": this.datasource[i].data});\n"+
"}\n" +
"fmtData.sort(function(a,b) {return (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0);} );\n"+
"return fmtData;"		
		}
	}
	,
	newInstance   : function(settings, newInstanceCallback, updateCallback)
	{
		newInstanceCallback(new listWidgetPlugin(settings, updateCallback));
	}
});

 
var listWidgetPlugin = function(settings, updateCallback)
{
	var self = this;
	
	var currentSettings = settings;
	var activeValue;

	var $titleElement = $("<h2>")
			.addClass("section-title")
			.text(settings.list_name)
			.css("margin-bottom","3px");

	var $activeList = $("<ul>");

	var buildList = function(listData){
		var $list = $("<ul>").css({"padding":"0px"}).addClass("list-widget");
		var data = utils.parseJsonArray(listData);
		var len = data.length;
		if(len){
			for(var i = 0; i < len; i++){
				var $listItem = $("<li>")
					.text(data[i].label)
					.addClass("list-widget-item")
					.on("click", { idx: i, item: data[i].value }, function(event){
						activeValue = event.data.item;
						$(this).siblings(".list-widget-item").removeClass("active");
						$(this).toggleClass("active");
						updateCallback(event.data.item, currentSettings.local_var);
					});
				
				if(activeValue !== undefined && currentSettings.track_attribute !== undefined && activeValue[currentSettings.track_attribute] === data[i].value[currentSettings.track_attribute]){
					$listItem.addClass("active");
				}
				
				$list.append($listItem);
			}
		} else console.error("List missing data");
		return $list;
	}

	self.render = function(containerElement)
	{
		$activeList = buildList(currentSettings.listData);
		$(containerElement)
			.css("overflow","auto")
			.append([$titleElement, $activeList]);
	}


	self.getHeight = function()
	{
		return utils.widget.calculateHeight(currentSettings.blockHeight);
	}

	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
		var $newList = buildList(currentSettings.listData);
		$activeList.replaceWith($newList);
		$activeList = $newList;
		$titleElement.text(currentSettings.list_name);
	}

	self.getValue = function(){
		return activeValue;
	}

	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		var $newList = buildList(newValue);
		$activeList.replaceWith($newList);
		$activeList = $newList;
	}

	self.onDispose = function()
	{

	}
}
freeboard.addStyle('.gm-style-cc a', "text-shadow:none;");

var googleMapWidget1 = function (settings, updateCallback) {
    var self = this;
    var currentSettings = settings;
    var map;
    var apiKey = currentSettings.apiKey;
    var ele;
    var locReturn = {};
    var url = "";
    var locationSource;

    self.getValue = function(){
        return locReturn;
    }

    self.initializeMap = function() { 

        var locationData = {};
        var heatmapData = [];
        var bounds = new google.maps.LatLngBounds();

        if(locationSource === undefined){
            // If a source has not been set return ... if dynamic must wait for onCalculatedValue
            return;
        }

        // Parse location source... expecting  { "markers" : [ { "lat": 11.11 , "lng": -33.33 }, { lat/lng } , { lat/lng }, ... ] }
        try{
            locationData = JSON.parse(locationSource);
        } catch (e){
            locationData = locationSource;
        }

        // Some validation
        if(locationData === undefined || locationData.markers === undefined){
            console.warn("Map source invalid");
            return;
        }

        if(locationData.markers[0] === undefined){
            console.warn("Map source invalid. Must provide at least one marker");
            return;
        }

        var defaultZoom = (locationData.zoom !== undefined) ? locationData.zoom : 16;

        // Initialize the map element using the first coordinate
        var mapOptions = {
            zoom: defaultZoom,
            center: locationData.markers[0],
            mapTypeId: google.maps.MapTypeId.ROADMAPX
        }
        map = new google.maps.Map(ele, mapOptions);

        // For each coordinate, extends map bounds
        for(var i = 0, len = locationData.markers.length; i < len; i++){
            // If a standard map, add marker to map
            if(currentSettings.map_type === "standardMap"){
                var marker = new google.maps.Marker({
                  position: locationData.markers[i],
                  map: map
                });
            }
            // Gather google Lat/Lng for heatmap points
            heatmapData.push(new google.maps.LatLng(locationData.markers[i].lat, locationData.markers[i].lng));
            // Extend bounds to include marker
            bounds.extend(locationData.markers[i]);
        }

        // Re-position map to contain all markers ... unless zoom specified by user
        if(locationData.zoom === undefined) {
            map.fitBounds(bounds);
        }

        // If heatmap, render layer with gathered heatmap data
        if(currentSettings.map_type === "heatMap"){
            var heatmap = new google.maps.visualization.HeatmapLayer({
              data: heatmapData,
              map: map
            });
            heatmap.setMap(map);
        }

        // Add map click listener to add marker and callback position to DS
        map.addListener('click', function(event){
            var latLng = event.latLng;
            new google.maps.Marker({
                position: latLng,
                map: map
            });
            locReturn = {"lat":latLng.lat(), "lng":latLng.lng() };
            updateCallback(locReturn, 'location_source')
        });
    }

    self.render = function (element) {
        ele = element;
        url = "https://maps.googleapis.com/maps/api/js?v=3.exp&key=" + apiKey + "&libraries=visualization";
        mapLoader(url, self.initializeMap);
    }

    self.onSettingsChanged = function (newSettings) {

        // Workaround for source being reset for static datatype
        if((newSettings.location_source === undefined || newSettings.location_source === "") && (currentSettings.location_source !== undefined && currentSettings.location_source !== "")){
            newSettings.location_source = currentSettings.location_source;
        }
        
        currentSettings = newSettings;
        
        if(currentSettings._datatype == "static"){
            locationSource = currentSettings.location_source;
        } 
        
        // Attempt map draw
        if(map !== undefined){
            mapLoader(url, self.initializeMap);
        }
    }

    self.onCalculatedValueChanged = function (settingName, newValue) {

        if(newValue === locationSource){
            // No new location data, no need to redraw map
            return;
        }

        locationSource = newValue;
        mapLoader(url, self.initializeMap);
    }

    self.onDispose = function () {
    }

    self.getHeight = function () {
        return utils.widget.calculateHeight(4);
    }

    this.onSettingsChanged(settings);
};

freeboard.loadWidgetPlugin({
    type_name: "google_map1",
    display_name: "Google Map",
    fill_size: true,
    settings: [
        {
        name        : "map_name",
        display_name: "Map Name",
        type        : "text",
        required    : true
        },
        {
        name         : "map_type",
        display_name : "Map Type",
        type         : "option",
        options      : [
                {
                    "name" : "Simple Map",
                    "value": "standardMap"
                },
                {
                    "name" : "Heat Map",
                    "value": "heatMap"
                }
            ]
        },
        {
            name: "location_source",
            display_name: "Location Source",
            type: "data",
            multi_input: true,
            incoming_parser: true,
            outgoing_parser: true
        },
        {
            name: "apiKey",
            display_name: "API Key",
            type: "text",
            required: true
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
        newInstanceCallback(new googleMapWidget1(settings));
    }
});
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

var speedometerWidgetPlugin = function(settings) {
	var self = this;
	var currentSettings = settings;
	var speedometer;
	var speedometerID = Date.now() + '-speedometer';
	var titleElement = $('<h2 style="text-align: center; font-weight: bold; font-size: 20px; padding-top: 6%;">' + settings.speedometerName + '</h2>');
	var speedometerElement = $('<div id="' + speedometerID + '" style="width: 200px; height: 200px; padding-left: 15%; padding-top: 3%;"></div>');
	var unitElement;
	if(currentSettings.speedometerName==undefined){titleElement.html("")}
	if(settings.unit !== undefined) {
		unitElement = $('<div style="text-align: center; font-weight: bold; padding-top: 2%;">' + settings.unit + '</div>');
	} else {
		unitElement = $('<div style="text-align: center; font-weight: bold; padding-top: 2%;"></div>');
	}

	self.render = function(containerElement) {
		$(containerElement).append(titleElement).append(speedometerElement).append(unitElement);
		speedometer = new Speedometer (speedometerID, {theme: 'default', max: parseInt(currentSettings.maxValue)});
    	speedometer.draw();
	}

	self.getHeight = function() {
		return utils.widget.calculateHeight(5);
	}

	self.onSettingsChanged = function(newSettings) {
		currentSettings = newSettings;
		speedometer.rescale(parseInt(currentSettings.maxValue));
		unitElement.html((_.isUndefined(currentSettings.unit) ? "" : currentSettings.unit));
		titleElement.html((_.isUndefined(currentSettings.speedometerName) ? "" : currentSettings.speedometerName));
		if(currentSettings.speedometerName==undefined){titleElement.html("")}
	}

	self.onCalculatedValueChanged = function(settingName, newValue) {
		speedometer.update(parseInt(newValue));
	}

	self.onDispose = function() {
	}

	self.getValue = function(){
		
	}
	//this.onSettingsChanged(settings);
};

freeboard.loadWidgetPlugin({
	"type_name"   : "speedometer_widget",
	"display_name": "Speedometer",
    "description" : "A speedometer widget for displaying speed",
	"external_scripts": [			
		"plugins/thirdparty/controls.js",
		"plugins/thirdparty/digitaldisplay.js",
		"plugins/thirdparty/example.js",
		"plugins/thirdparty/speedometer.js",
		"plugins/thirdparty/tbe.js",
		"plugins/thirdparty/xcanvas.js",
		"plugins/thirdparty/themes/default.js"
	],
	"fill_size" : true,
	"settings" : [
		{
			"name"        : "speedometerName",
			"display_name": "Speedometer Name",
			"type"        : "text",
			"required"	  : false
		},
		{
			"name"			: "maxValue",
			"display_name"  : "Maximum Value",
			"type"			: "text",
			"default_value"	: "100",
			"description"	: "Maximum speed on the speedometer"
		},
		{
			"name"			: "unit",
			"display_name"	: "Unit",
			"type"			: "text"
		},
		{
			name: "speedVal",
			display_name: "Speed Source",
			type: "data",
			multi_input: true,
			incoming_parser: true,
			default_value: 0
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
	newInstance : function(settings, newInstanceCallback)
	{
		newInstanceCallback(new speedometerWidgetPlugin(settings));
	}
});
freeboard.loadWidgetPlugin({
 
	"type_name"   : "text_editor",
	"display_name": "Text Editor",
    "description" : "Wire text to a datasource for updates/publishes",
    "external_scripts" : [
		"lib/js/thirdparty/ckeditor/ckeditor.js"
		],
	"fill_size" : false,
	"settings"    : [
		{
			name        : "sectionTitle",
			display_name: "Title",
			type        : "text"
		},
		{
			name: "inputVal",
			display_name: "Value",
			type: "data",
			multi_input: true,
			incoming_parser: true,
			outgoing_parser: true
		},
		{
			name        : "size",
			display_name: "Size",
			type        : "option",
			options     : [
				{
					name : "Big",
					value: "big"
				}
			]
		}
	],

	newInstance   : function(settings, newInstanceCallback, updateCallback)
	{
		newInstanceCallback(new TextEditorWidgetPlugin(settings, updateCallback));
	}
});

 
var TextEditorWidgetPlugin = function(settings, updateCallback)
{
	var self = this;
	//replace spaces with dash so we can retrieve by id later
	if (settings.sectionTitle === undefined){
		settings.inputName = "";
	}
	else{
		settings.inputName = settings.sectionTitle.replace(/\s+/g, '-');
	}
	var currentSettings = settings;
	var displayElement = $('<div class="tw-display"></div>');
	var titleElement = $('<h2 class="section-title tw-title tw-td">'+settings.sectionTitle+'</h2>');
    // var valueElement = $('<div class="tw-value"></div>');
    var inputElement = $("<textarea id='"+settings.inputName+"'></textarea>");
    var script = document.createElement( 'script' );
	script.type = 'text/javascript';
	//script.src = "plugins/thirdparty/ckeditor/index.js";
	script.text = "var editor = CKEDITOR.replace('"+settings.inputName+"');"
	var sendButton = $('<input id="send" type="button" value="Save">');
	self.render = function(containerElement)
	{
		var editor = CKEDITOR.instances[settings.inputName];
		if (editor) 
		{ 
			editor.destroy(true); 
		}
		$(containerElement).empty();
		$(displayElement)
			.append($('<div class="tw-tr"></div>')
			.append(titleElement))
				.append($('<div class="tw-tr"></div>')
					.append($('<div class="tw-value-wrapper tw-td"></div>').append(inputElement)).append(script))
				.append($('<div class="tw-tr"></div>')
				.append(sendButton));
		sendButton.on( "click", self.onEvent);
		$(containerElement).append(displayElement);
	}
	self.getHeight = function()
	{
		if(currentSettings.size == "big")
		{
			return 8;
		}
	}


	self.onSettingsChanged = function(newSettings)
	{
		currentSettings = newSettings;
	}


	self.onCalculatedValueChanged = function(settingName, newValue)
	{
		CKEDITOR.instances[currentSettings.inputName].setData(newValue);
	}


	self.onDispose = function()
	{
	}

	self.getValue = function() {
		try {
			var data = CKEDITOR.instances[settings.inputName].getData().replace(/<[^>]*>/g, " ");
    		//console.log(data);
			return data;
		} catch(e) {
			console.log('unable to get value from the textarea ' + currentSettings.inputName);
			console.log(e);
			return {};
		}
	}

	self.onEvent = function() {
		updateCallback(self.getValue());
	}
};
(function(){
// Andrea Giammarchi - Mit Style License
var extend = {
    // Circle methods
    circle:function(aX, aY, aDiameter){
        this.ellipse(aX, aY, aDiameter, aDiameter);
    },
    fillCircle:function(aX, aY, aDiameter){
        this.beginPath();
        this.circle(aX, aY, aDiameter);
        this.fill();
    },
    strokeCircle:function(aX, aY, aDiameter){
        this.beginPath();
        this.circle(aX, aY, aDiameter);
        this.stroke();
    },
    // Ellipse methods
    ellipse:function(aX, aY, aWidth, aHeight){
        var hB = (aWidth / 2) * .5522848,
            vB = (aHeight / 2) * .5522848,
            eX = aX + aWidth,
            eY = aY + aHeight,
            mX = aX + aWidth / 2,
            mY = aY + aHeight / 2;
        this.moveTo(aX, mY);
        this.bezierCurveTo(aX, mY - vB, mX - hB, aY, mX, aY);
        this.bezierCurveTo(mX + hB, aY, eX, mY - vB, eX, mY);
        this.bezierCurveTo(eX, mY + vB, mX + hB, eY, mX, eY);
        this.bezierCurveTo(mX - hB, eY, aX, mY + vB, aX, mY);
        this.closePath();
    },
    fillEllipse:function(aX, aY, aWidth, aHeight){
        this.beginPath();
        this.ellipse(aX, aY, aWidth, aHeight);
        this.fill();
    },
    strokeEllipse:function(aX, aY, aWidth, aHeight){
        this.beginPath();
        this.ellipse(aX, aY, aWidth, aHeight);
        this.stroke();
    },
    polygon:function(pts) {
        var npts = pts.length;
        if (npts & 1) npts--;
        npts /= 2;
        if (npts <= 1)
          return;

        this.moveTo (pts[0], pts[1]);
        for (var n = 1; n < npts; n++)
          this.lineTo (pts[n*2+0], pts[n*2+1]);
    },
    fillPolygon:function(pts) {
        this.beginPath ();
        this.polygon (pts);
        this.fill ();
    },
    strokePolygon:function(pts) {
        this.beginPath ();
        this.polygon (pts);
        this.stroke ();
    },
    boxedArc: function(x, y, w, h, startAngle, sweepAngle, counterClockWise) {
        this.save ();
        this.scale (w / h, h / w);
        this.arc (x+w/2, y+h/2, w/2, startAngle, startAngle + sweepAngle, counterClockWise);
        this.restore ();
    },
    fillBoxedArc: function(x, y, w, h, startAngle, sweepAngle) {
        this.beginPath ();
        this.boxedArc (x, y, w, h, startAngle, sweepAngle, counterClockWise);
        this.fill ();
    },
    strokeBoxedArc: function(x, y, w, h, startAngle, sweepAngle, counterClockWise) {
        this.beginPath ();
        this.boxedArc (x, y, w, h, startAngle, sweepAngle, counterClockWise);
        this.stroke ();
    }
};

for(var key in extend)
    CanvasRenderingContext2D.prototype[key] = extend[key];

var quirks = {
    measureText: function(str) {
        return this.mozMeasureText(str);
    },
    fillText: function(str, x, y) {
        this.beginPath ();
        this.drawText (str, x, y);
        this.fill ();
    },
    strokeText: function (str, x, y) {
        this.beginPath ();
        this.drawText (str, x, y);
        this.stroke ();
    },
    drawText: function (str, x, y) {
        if (this.font)
            this.mozTextStyle = this.font;

        if (this.textAlignment == 'center')
            x -= this.measureText (str) / 2;
        else if (this.textAlignment == 'right')
            x = this.width - this.measureText(str);

        this.save ();
        this.translate (x, y);
        this.mozPathText (str);
        this.restore ();
    }
};

for(var key in quirks) {
    if (!CanvasRenderingContext2D.prototype[key]) {
        CanvasRenderingContext2D.prototype[key] = quirks[key];
    }
}

if(!this.G_vmlCanvasManager)
    G_vmlCanvasManager = {init:function(){}, initElement:function(el){return el}};
})();
