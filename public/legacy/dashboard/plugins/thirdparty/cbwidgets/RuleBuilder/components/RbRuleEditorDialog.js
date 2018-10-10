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