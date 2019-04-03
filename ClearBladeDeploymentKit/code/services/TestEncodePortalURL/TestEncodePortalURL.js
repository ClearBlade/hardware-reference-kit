function TestEncodePortalURL(req, resp) {
  var expected = "https://staging.clearblade.com/portal/?systemKey=AAAAAAAAAAAAAAAAAAAAAJ55QP1_jm4T4tACWYwn_wgmMAO5ZJ9UIevGphA=&systemSecret=AAAAAAAAAAAAAAAAAAAAAF5AtL3OVP0aafCQgFbZ9PN2jPj2oPmptrMVRRU=&name=provision&allowAnon=true#/Home"
  ClearBladeAdminREST("https://staging.clearblade.com")
    .getEncodedPortalURL("caa0b1bc0b96c4aa9c9786d8b96f","CAA0B1BC0B94BBC7FBDFB1DBC12D","provision")
    .then(function(out){
        resp.success(out)
    })
    .catch(function(e){
        resp.error(e)
    })
}
