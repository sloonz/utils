userScripts = {
    scripts: [],
    
    init: function() {
        var appC = document.getElementById('appcontent');
        if(appC)
            appC.addEventListener("DOMContentLoaded",
                function(event) {
                    var doc = event.target;
                    if(!doc.location)
                        return;
                    
                    for(var s in userScripts.scripts) {
                        var has_inc = false;
                        var has_exc = false;
                        
                        for(var i in userScripts.scripts[s].includes) {
                            if(userScripts.scripts[s].includes[i].test(doc.location)) {
                                has_inc = true;
                                break;
                            }
                        }
                        
                        for(var i in userScripts.scripts[s].excludes) {
                            if(userScripts.scripts[s].excludes[i].test(doc.location)) {
                                has_exc = true;
                                break;
                            }
                        }
                        
                        if(has_inc && !has_exc) {
                            if(userScripts.scripts[s].hotkey)
                                userScripts.bindHotKey(doc, userScripts.scripts[s].hotkey, userScripts.scripts[s].callback);
                            else
                                userScripts.scripts[s].callback(doc);
                        }
                    }
                },
                false);
    },
    
    register: function(script) {
        var includes = [];
        var excludes = [];
        
        if(script.include) includes.push(userScripts.stringToRegExp(script.include));
        if(script.exclude) excludes.push(userScripts.stringToRegExp(script.exclude));
        if(script.rinclude) includes.push(script.rinclude);
        if(script.rexclude) excludes.push(script.rexclude);
        for each(var inc in script.includes) includes.push(userScripts.stringToRegExp(inc));
        for each(var exc in script.excludes) excludes.push(userScripts.stringToRegExp(exc));
        for each(var inc in script.rincludes) includes.push(inc);
        for each(var exc in script.rexcludes) excludes.push(exc);
        
        userScripts.scripts.push({
            callback: script.callback,
            includes: includes,
            excludes: excludes,
            hotkey: script.hotkey
        });
    },
    
    stringToRegExp: function(string) {    // thanks adblock/greasemonkey
        var s = new String(string);
        var str = '';

        for (var i = 0; i < s.length; i++) {
            switch (s[i]) {
                case '*':
                    str += ".*";
                    break;
                case '.':
                case '?':
                case '^':
                case '$':
                case '+':
                case '{':
                case '[':
                case '|':
                case '(':
                case ')':
                case ']':
                    str += "\\" + s[i];
                    break;
                case '\\':
                    str += "\\\\";
                    break;
                case ' ':
                    break;
                default:
                    str += s[i];
                    break;
            }
        }

        if (str)
            return new RegExp('^' + str + '$', 'i');
    },
    
    parseHotKey: function(hotkey) {
        var ctrl = false;
        var meta = false;
        var shift = false;
        var alt = false;
        
        hotkey = hotkey.toUpperCase();
        for(;;) {
            if(hotkey.indexOf("C-") == 0)
                ctrl = true;
            else if(hotkey.indexOf("M-") == 0)
                meta = true;
            else if(hotkey.indexOf("S-") == 0)
                shift = true;
            else if(hotkey.indexOf("A-") == 0)
                alt = true;
            else
                break;
            
            hotkey = hotkey.substr(2);
        }
        
        if(hotkey.length > 1)
            eval("var charCode = KeyEvent.DOM_VK_" + hotkey);
        else if(shift)
            var charCode = hotkey.charCodeAt(0);
        else
            var charCode = hotkey.toLowerCase().charCodeAt(0);
        
        return [ctrl, meta, shift, alt, charCode];
    },
    
    bindHotKey: function(doc, hotkey, callback) {
        var parsed_hotkey = userScripts.parseHotKey(hotkey);
        doc.addEventListener('keypress', function(evt) {
            var charCode = evt.charCode ? evt.charCode : evt.keyCode;
            /*userChrome.log("Event: " + [evt.ctrlKey, evt.metaKey, evt.shiftKey, evt.altKey, charCode]);
            userChrome.log("Ref: " + parsed_hotkey);*/
            if(evt.ctrlKey == parsed_hotkey[0] && evt.metaKey == parsed_hotkey[1] &&
               evt.shiftKey == parsed_hotkey[2] && evt.altKey == parsed_hotkey[3] &&
               charCode == parsed_hotkey[4])
                if(callback(doc)) {
                    evt.stopPropagation();
                    evt.preventDefault();
                }
        }, true);
    }
};

userScripts.init();
