var config = datasources["ProvisionConfig"].latestData();
config.PLATFORM = {...this.widget.data, flow: "PRECONFIGURED"};
CB_PORTAL.selectPage("/Developer");

return {}