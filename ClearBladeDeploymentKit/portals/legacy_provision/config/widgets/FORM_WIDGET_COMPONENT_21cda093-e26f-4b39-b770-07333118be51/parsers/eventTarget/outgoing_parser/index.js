var config = datasources["ProvisionConfig"].latestData();

config.SYSTEM = this.widget.data
config.SYSTEM.flow = "NEW"

CB_PORTAL.selectPage("/Edge");

return {}