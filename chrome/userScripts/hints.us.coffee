config =
    defaultExpr: "//a[@href or @onclick or @oncommand] | //input[@type='button' or @type='submit' or @type='radio' or @type='checkbox']"
    formExpr: "//input[@type='text' or not(@type) or @type='password'] | //textarea | //select"
    keys: 'abcdefghijklmnopqrstuvwxyz'
    hintClass: 'ushints_hint'
    selectedHintClass: 'ushints_hint ushints_sel_hint'
    stopOnEmptyMatch: false

pow = (base, n)->
    return 1    if n == 0
    return base if n == 1
    return base * pow(base, n-1)

min = (x,y)->
    return x if x < y
    return y

max = (x,y)->
    return x if x > y
    return y

innerRect = (elem)->
    top = elem.offset().top
    left = elem.offset().left
    return [top, top + elem.innerHeight(),
        left, left + elem.innerWidth()]

rectIntersect = (ecoords, vcoords)->
    top = max ecoords[0], vcoords[0]
    bottom = min ecoords[1], vcoords[1]
    left = max ecoords[2], vcoords[2]
    right = min ecoords[3], vcoords[3]
    if left > right or top > bottom
        return false
    else
        return [top, bottom, left, right]

nextNumber = (number, base)->
    ret = []
    inc = true
    for chiffer in number
        if inc
            chiffer = (chiffer + 1) % base
            inc = (chiffer == 0)
        ret.push chiffer
    return ret

numberToString = (number)->
    res = ""
    (res = config.keys[digit] + res) for digit in number
    return res.toUpperCase()

isVisible = (element, vcoords)->
    return rectIntersect(innerRect(element), vcoords) and element.css('visibility') != 'hidden'

xpath = (expr, document)->
    elems = []
    res = document.evaluate(expr, document, null, XPathResult.ANY_TYPE, null)
    elems.push elem while elem = res.iterateNext()
    return elems

class UsHints
    constructor: (@document)->
        @container = null
        @curHints = null
        @callback = null

    stop: ->
        @curHints = null
        if @container?
            $(@container).remove()
            @container = null

    start: (expr, @callback)->
        # Find visible elements
        win = @document.defaultView
        vcoords = [win.pageYOffset, win.pageYOffset + win.innerHeight,
            win.pageXOffset, win.pageXOffset + win.innerWidth]
        elems = (elem for elem in $(xpath(expr, @document)).filter(':visible') when isVisible($(elem), vcoords))

        # How many letters do we need ?
        curHint = [0]
        curHint.push(0) while elems.length >= pow(config.keys.length, curHint.length)

        # Create hints
        @container = @document.body.appendChild @document.createElement 'div'
        @curHints = []
        for elem in elems
            rect = innerRect $(elem)
            hint = @document.createElement 'div'
            label = numberToString curHint
            $(hint).html label
            $(hint).css
                top: rect[0] + "px"
                left: rect[2] + "px"
            hint.className = config.selectedHintClass

            @curHints.push
                elem: elem
                hint: hint
                label: label
            @container.appendChild hint
            curHint = nextNumber curHint, config.keys.length

    updateSelectedLinks: (letters)->
        hints = []
        for hint in @curHints
            if hint.label.indexOf(letters) == 0
                hints.push hint
                hint.hint.className = config.selectedHintClass
            else
                hint.hint.className = config.hintClass
        return hints

    hit: (hint)->
        ret = this.updateSelectedLinks hint.toUpperCase()
        if ret.length == 0
            if config.stopOnEmptyMatch
                this.stop()
                return false
        else if ret.length == 1
            if @callback and not @callback(this, ret[0].elem)
                this.stop()
                return false
        return true

callbacks =
    simulateClick: (ush, element)->
        element.focus()
        event = ush.document.createEvent 'MouseEvents'
        event.initMouseEvent('click',
            true, true,                  # canBubble, cancelable
            ush.document.defaultView, 1, # view, click count 
            0, 0,                        # screen coords 
            0, 0,                        # client coords 
            false, false, false, false,  # ctrl, alt, shift, meta 
            0, null)                     # button, related target 
        element.dispatchEvent event
        return false

    simulateCtrlClick: (ush, element)->
        element.focus()
        event = ush.document.createEvent 'MouseEvents'
        if navigator.appVersion.indexOf("Mac") != -1
            [ctrl, meta] = [false, true]
        else
            [ctrl, meta] = [true, false]
        event.initMouseEvent('click',
            true, true,                  # canBubble, cancelable
            ush.document.defaultView, 1, # view, click count 
            0, 0,                        # screen coords 
            0, 0,                        # client coords 
            ctrl, false, false, meta,    # ctrl, alt, shift, meta 
            0, null)                     # button, related target 
        element.dispatchEvent event
        return false

    activate: (ush, element)->
        element.focus()
        return false

userScripts.register
    include: "*"
    callback: (document)->
        ush = new UsHints(document)
        bindCommand = (command, expr, callback)->
            userScripts.bindCommand document, command, (document, event, hint)->
                if not hint?
                    ush.stop()
                    return false
                hint = hint.split(':')[1]
                if hint == ""
                    ush.start expr, callback
                    return true
                else
                    return ush.hit hint

        bindCommand "f:", config.defaultExpr, callbacks.simulateClick
        bindCommand "F:", config.defaultExpr, callbacks.simulateCtrlClick
        bindCommand "a:", "#{config.defaultExpr}|#{config.formExpr}", callbacks.activate
