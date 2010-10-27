this.userScripts = 
    scripts: []
    globalDocument: document
    init: (appcontent)->
        userScripts.globalDocument ?= document
        userScripts.firstResponder = null

        $(appcontent).bind 'DOMContentLoaded', (event)->
            document = event.target
            return unless document.location

            # Call scripts registered on this page
            for script in userScripts.scripts
                hasInc = hasExc = false
                for inc in script.includes
                    if inc.test document.location
                        hasInc = true
                        break
                for exc in script.excludes
                    if exc.test document.location
                        hasExc = true
                        break
                        
                continue if hasExc or not hasInc
                
                if script.hotkey
                    userScripts.bindHotKey(document, script.hotkey, script.callback)
                else
                    script.callback document
    
    register: (script)->
        includes = []
        excludes = []
        includes.push userScripts.stringToRegexp script.include if script.include?
        excludes.push userScripts.stringToRegexp script.exclude if script.exclude?
        $.merge(includes, (userScripts.stringToRegexp inc for inc in script.includes)) if script.includes?
        $.merge(excludes, (userScripts.stringToRegexp exc for exc in script.excludes)) if script.excludes?
        includes.push script.rinclude if script.rinclude?
        excludes.push script.rexculde if script.rexclude?
        $.merge(includes, script.rincludes) if script.rincludes?
        $.merge(excludes, script.rexcludes) if script.rexcludes?
        
        userScripts.scripts.push
            callback: script.callback
            includes: includes
            excludes: excludes
            hotkey: script.hotkey
    
    stringToRegexp: (str)->
        new RegExp str.replace(/[.^$\\[\](){}+|]/g, "\\$&").
            replace(/\*/g, ".*").replace(/\?/g, ".")
    
    parseHotKey: (hotkey)->
        ctrl = meta = shift = alt = false
        hotkey = hotkey.toUpperCase()
        while true
            if hotkey.indexOf("C-") == 0
                ctrl = true
            else if hotkey.indexOf("M-") == 0
                meta = true
            else if hotkey.indexOf("S-") == 0
                shift = true
            else if hotkey.indexOf("A-") == 0
                alt = true
            else
                break
            hotkey = hotkey.substr 2
        if hotkey.length > 1
            eval "var charCode = KeyEvent.DOM_VK_#{hotkey}"
        else if shift
            charCode = hotkey.charCodeAt 0
        else
            charCode = hotkey.toLowerCase().charCodeAt 0

        return [ctrl, meta, shift, alt, charCode]
    
    bindHotKey: (document, rawHotkey, callback)->
        hotkey = userScripts.parseHotKey rawHotkey
        document.addEventListener 'keypress',
            (event)->
                charCode = event.charCode
                charCode ?= event.keyCode
                if event.ctrlKey  == hotkey[0] and event.metaKey == hotkey[1] and
                   event.shiftKey == hotkey[2] and event.altKey  == hotkey[3] and
                   charCode == hotkey[4]
                    if not callback(document, event)
                        event.stopPropagation()
                        event.preventDefault()
            true

    bindCommand: (document, cmd, callback)->
        document ?= userScripts.globalDocument

        if not document._usCommands?
            # Install required properties & event handlers
            # on request document
            document._usCommands = {}
            document._usCurrentCommand = ""
            document._usCurrentHandler = null
            document.addEventListener 'keypress',
                (event)->
                    clear = ->
                        document._usCurrentCommand = ""
                        if document._usCurrentHandler?
                            document._usCurrentHandler(document, event, null)
                            document._usCurrentHandler = null

                    stop = ->
                        clear()
                        userScripts.firstResponder = null

                    # On escape, stop the first responder
                    if event.keyCode == KeyEvent.DOM_VK_ESCAPE
                        if userScripts.firstResponder?
                            userScripts.firstResponder.stop()
                            event.stopPropagation()
                            event.preventDefault()
                        return clear()

                    # If there's a first responder, and it's a DOM element,
                    # or if current document isn't the document owning the
                    # first responder, don't continue
                    if userScripts.firstResponder?
                        return clear() if userScripts.firstResponder.element?
                        return clear() if userScripts.firstResponder.ownerDocument isnt document

                    # If there's a modifier, that's not handled by us but by
                    # bindHotkey
                    if event.ctrlKey or event.altKey or
                       event.metaKey or not event.charCode?
                        return

                    # Add or remove a character
                    if event.keyCode == KeyEvent.DOM_VK_BACK_SPACE
                        cmd = document._usCurrentCommand
                        if cmd == ""
                            return
                        else
                            lastChar = cmd[cmd.length - 1]
                            if lastChar != ":"
                                cmd = document._usCurrentCommand = cmd.substr(0, cmd.length - 1)
                                if cmd == ""
                                    return stop()
                    else
                        cmd = (document._usCurrentCommand += String.fromCharCode event.charCode)


                    # Call associated callback or pass the event to the current handler (if any)
                    if document._usCurrentHandler?
                        if not document._usCurrentHandler(document, event, cmd)
                            stop()
                        event.stopPropagation()
                        event.preventDefault()
                    else if document._usCommands[cmd]?
                        [callback, isHandler] = document._usCommands[cmd]
                        if isHandler
                            cmd = (document._usCurrentCommand += ":")
                            document._usCurrentHandler = callback
                            userScripts.firstResponder = 
                                element: null
                                ownerDocument: document
                                stop: stop
                        handlerContinue = callback(document, event, cmd)
                        stop() unless isHandler and handlerContinue
                        event.stopPropagation()
                        event.preventDefault()
                    else
                        clear()
                true

            # Add event handlers for first responder management
            document.addEventListener "focus",
                (focusEvent)->
                    if userScripts.firstResponder?
                        if userScripts.firstResponder.element? and
                           userScripts.firstResponder.element is focusEvent.target
                            return
                        userScripts.firstResponder.stop()
                    return if not focusEvent.target.tagName?
                    activeElem = focusEvent.target.tagName.toLowerCase().split ":"
                    activeElem = activeElem[activeElem.length-1]
                    if activeElem in ["input", "textarea", "select", "textbox", "findbar"]
                        userScripts.firstResponder = 
                            element: focusEvent.target
                            ownerDocument: document
                            stop: ->
                                focusEvent.target.blur()
                                userScripts.firstResponder = null
                true

            document.addEventListener "blur",
                (focusEvent)->
                    return if not userScripts.firstResponder?
                    return if not userScripts.firstResponder.element?
                    if focusEvent.target is userScripts.firstResponder.element
                        userScripts.firstResponder = null
                true
            
        # Register command in requested document
        if cmd[cmd.length-1] == ":"
            [cmd, isHandler] = [cmd.substr(0, cmd.length-1), true]
        else
            isHandler = false
        document._usCommands[cmd] = [callback, isHandler]

appcontent = document.getElementById 'appcontent'
userScripts.init appcontent if appcontent?
