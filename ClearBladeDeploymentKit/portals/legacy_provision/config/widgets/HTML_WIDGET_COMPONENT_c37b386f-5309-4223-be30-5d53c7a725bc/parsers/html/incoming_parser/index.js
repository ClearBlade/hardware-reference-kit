var workConfig = this.datasource.results.WORKFLOW;

if(workConfig.SYSTEM.route){
    switch(workConfig.SYSTEM.flow){
        case "NEW":
            CB_PORTAL.selectPage("/System/NewSystem");
            break;
        case "EXISTING":
            CB_PORTAL.selectPage("/System/ExistingSystem");
            break;
        case "IPM":
            CB_PORTAL.selectPage("/System/NewIPMSystem");
            break;
        case "PRECONFIGURED":
            CB_PORTAL.selectPage("/Edge");
    }
}