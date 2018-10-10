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
