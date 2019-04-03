var provConfig = datasources.ProvisionConfig.latestData();
var workConfig = this.datasource.results.WORKFLOW;

for(let k in provConfig){
    if (provConfig.hasOwnProperty(k)) {
        provConfig[k] = workConfig[k];
    }
}

if(workConfig.PLATFORM.route){
    switch(workConfig.PLATFORM.flow){
        case "NEW":
            CB_PORTAL.selectPage("/Platform/ExistingPlatform");
            break;
        case "EXISTING":
            CB_PORTAL.selectPage("/Platform/ExistingPlatform");
            break;
        case "IPM":
            break;
        case "PRECONFIGURED":
            CB_PORTAL.selectPage("/Developer");
    }
}