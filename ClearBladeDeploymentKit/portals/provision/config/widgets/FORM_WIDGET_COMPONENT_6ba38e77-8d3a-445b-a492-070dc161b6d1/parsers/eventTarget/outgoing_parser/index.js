var config = datasources["ProvisionConfig"].latestData();

config.SYSTEM = this.widget.data
config.SYSTEM.flow = "EXISTING"

CB_PORTAL.selectPage("/Edge");

return {}