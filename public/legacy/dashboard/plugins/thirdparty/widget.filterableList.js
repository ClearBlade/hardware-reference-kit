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