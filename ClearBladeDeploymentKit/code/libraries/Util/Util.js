const Util= {
    generateStrongPassword:function(){
        return chance().string({ length: 20 })
    },
    generateEmail:function(){
        return new String(+new Date()) + "@iot.com"
    }
};
