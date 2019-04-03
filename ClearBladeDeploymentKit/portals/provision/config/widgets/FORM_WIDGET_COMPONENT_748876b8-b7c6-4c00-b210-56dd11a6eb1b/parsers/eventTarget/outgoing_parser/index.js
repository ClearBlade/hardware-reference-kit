var config = datasources["ProvisionConfig"].latestData();

config.SYSTEM.system = this.widget.data.system;
config.SYSTEM.flow = "IPM"

console.log("Updating based upon templates, and moving to edge")
CB_PORTAL.selectPage("/Edge");

return {}