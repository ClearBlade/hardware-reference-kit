function TestChance(req, resp){
    resp.success(chance().string({ length: 20 }))
}
