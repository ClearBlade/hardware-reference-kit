var config = datasources["ProvisionConfig"].latestData();

config.DEVELOPER.devEmail = this.widget.data.devEmail
config.DEVELOPER.devPassword = this.widget.data.devPassword
config.DEVELOPER.flow = "NEW"

CB_PORTAL.selectPage("/System");

return {}