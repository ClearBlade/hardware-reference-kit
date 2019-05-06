datasources.RetrieveWorkflowConfig.latestData.subscribe(handleWorkflowConfig)

function handleWorkflowConfig(data) {
    var provConfig = datasources.ProvisionConfig.latestData();
    var workConfig = data.results.WORKFLOW;

    for (let k in provConfig) {
        if (provConfig.hasOwnProperty(k)) {
            provConfig[k] = workConfig[k];
        }
    }
}