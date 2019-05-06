var config = datasources["ProvisionConfig"].latestData();

config.EDGE = this.widget.data;
config.EDGE.flow = "EXISTING"
CB_PORTAL.selectPage("/Retarget");

return {}