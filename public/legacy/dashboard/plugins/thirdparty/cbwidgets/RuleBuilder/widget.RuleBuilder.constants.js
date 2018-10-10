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