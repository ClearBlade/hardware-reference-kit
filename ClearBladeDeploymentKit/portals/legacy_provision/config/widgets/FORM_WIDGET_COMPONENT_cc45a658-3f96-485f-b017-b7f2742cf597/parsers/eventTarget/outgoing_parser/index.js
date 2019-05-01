var config = datasources.ProvisionConfig.latestData();

config.EDGE = this.widget.data;
config.EDGE.flow = "NEW"

CB_PORTAL.selectPage("/Retarget");
return {}