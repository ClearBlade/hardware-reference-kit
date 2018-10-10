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