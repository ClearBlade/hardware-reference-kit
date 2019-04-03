var workConfig = this.datasource.results.WORKFLOW;
var provConfig = datasources.ProvisionConfig.latestData();

if(workConfig.DEVELOPER.route){
    switch(workConfig.DEVELOPER.flow){
        case "NEW":
            CB_PORTAL.selectPage("/Developer/NewDeveloper");
            break;
        case "EXISTING":
            CB_PORTAL.selectPage("/Developer/ExistingDeveloper");
            break;
        case "IPM":
            CB_PORTAL.selectPage("/Developer/NewDeveloper");
            break;
        case "PRECONFIGURED":
            CB_PORTAL.selectPage("/System");
    }
}
