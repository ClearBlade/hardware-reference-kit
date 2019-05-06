window.retarget = function(){
    var config = datasources.ProvisionConfig.latestData();
    datasources.SetupPlatformSystemForEdge.sendData(config).then(function(response){
        
        console.log("Process this: ")
        console.log({response})
        CB_PORTAL.selectPage("/Retarget/Redirect")
    })
}