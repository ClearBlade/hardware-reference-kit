
var rbTokenReplacer = (function () {
    function _replaceTokensInTemplate(tokens, template) {
        var theTemplate = template;
        for (var token in tokens) {
            theTemplate = theTemplate.replace(new RegExp("@" + token + "@", "g"), tokens[token]);   
        }
        return theTemplate
    }

    //This function parses a token value and returns a string
    //containing the token that will be replaced in an impl class. 
    //Variables within a token are surrounded by "<" and ">".
    //"\<" and "\>" allow the "<" and ">" to be included as "text"
    //within the string
    function _parseToken(token, templateVariable) {

        var tokenString = token;

        //Add quotes to the beginning and end of the string
        if (tokenString.length > 0) {
            if(tokenString[0] != "<") {
                tokenString = '"' + tokenString;
            }
            if(tokenString[tokenString.length - 1] != ">" || 
                (tokenString[tokenString.length - 1] === ">" && tokenString[tokenString.length - 2] === "\\")) {
                tokenString += '"';
            }

            var regex = /[^\\]([\<](.+?[^\\])[\>])/g;
            var variable = regex.exec(tokenString);

            while (variable != null) {
                // matched text: variable[0]
                // match start: variable.index
                // capturing group n: variable[n]

                //Build the replacement string
                var replacement = "";

                if(variable.index > 0) {
                    replacement += '" + ';
                }

                replacement += "messageObject." + variable[2];
                if(variable.index + variable[0].length < tokenString.length - 1) {
                    replacement += ' + "';
                }

                //Perform the string replacement
                tokenString = tokenString.replace(variable[1], replacement);

                //Look for the next match within the token string
                variable = regex.exec(tokenString);
            }
        }
        return tokenString;
    }

    return {
        replaceTokens: _replaceTokensInTemplate,
        parseToken: _parseToken
    };
})();