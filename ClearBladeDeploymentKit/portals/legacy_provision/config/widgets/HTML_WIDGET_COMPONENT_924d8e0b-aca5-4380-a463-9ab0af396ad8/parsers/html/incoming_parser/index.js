var workConfig = this.datasource.results.WORKFLOW;

if(workConfig.EDGE.route){
    switch(workConfig.EDGE.flow){
        case "NEW":
            CB_PORTAL.selectPage("/Edge/NewEdge");
            break;
        case "EXISTING":
            CB_PORTAL.selectPage("/Edge/ExistingEdge");
            break;
        case "IPM":
            break;
        case "PRECONFIGURED":
            CB_PORTAL.selectPage("/Retarget");
    }
}