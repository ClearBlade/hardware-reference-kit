TOKEN="oJDx8IdI3ko3CP36fLY_QBuduXDBh8OLhpNISo5qHkmkGkaF-BehCKn-ze9dVH9iyuAszBnzKb6d3ZHs2g=="
REPO_USER="rreinold"
REPO_NAME="q-promise-library"
REPO_URL="https://github.com"
DEVELOPER_EMAIL="abc@abc.com"

function TestInstallIPM(req, resp) {
  var r = ClearBladeAdminREST("https://staging.clearblade.com")
  r.initWithToken(TOKEN)
  r.installIPMIntoNewSystem(REPO_USER,REPO_NAME,DEVELOPER_EMAIL)
  .then(function(a){
    log("phase 2");
    log({a})
    resp.success(a)
    })
  .then(function(finalOutput){
    log("Finished")
    log({finalOutput})
    resp.success(finalOutput)
  })
  .catch(function(e){
    log(e)
    resp.error("error")
  })
}
