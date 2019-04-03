function TestClearBladeRESTLib(req, resp) {
  var p = {
    url:"https://platform.clearblade.com",
    systemKey:"f8f3fcbc0bce8ad2d6e7ed9a9728",
    systemSecret:"F8F3FCBC0BBAD9BAF99CACBDDCA201",
    email:"yjain@clearblade.com",
    password:"clearblade"
  }
  var rest = ClearBladeREST(p.url, p.systemKey, p.systemSecret);
  //Make sure that in the system, anonymous role has create user perms
  
  rest.authAnon()
  .then(function(data){
    log("promise step 1")
    return rest.register(p.email, p.password, data.user_token);
  })
  .then(function(data){
    log("promise step 2")
    return rest.executeCode("TestChance");
  })
  .then(function(data){
    log("All steps executed successfully");
    resp.success(data);
  })
  .catch(function(err){
    log("Erorr in any of the promise steps");
    resp.error(err);
  })
}