(function(){

var usHints = function(doc) {
    this.doc = doc;
    
    /* Elements to add a hint */
    this.xpathQuery = "//a[@href or @onclick or @oncommand] | //input[@type='button' or @type='submit' or @type='radio' or @type='checkbox']";
    
    /* Letters to use for hints */
    this.keys = "abcdefhgijklmnopqrstuvwxyz";
    
    /* CSS class of a non-selected hint */
    this.hint_class = "ushints_hint";
    
    /* CSS class of a selected hint */
    this.selected_hint_class = "ushints_hint ushints_sel_hint";
    
    /* If true, interpret backspace (call this.remove_last_letter) */
    this.translate_backspace = true;
    
    /* If true, interpret escape (call this.stop) */
    this.translate_escape = true;
    
    /* If true, a string matching no hint will call this.stop */
    this.stop_on_empty_match = false;
    
    /* If true, a unknown keystroke will call this.stop */
    this.stop_on_keystroke = true;
    
    /* If not null, call this when a single hint is selected. If returns true, call this.stop.
     * You have standard callbacks in usHintsStandardCallbacks */
    this.callback = null;
    
    this._container = null;
    this._curHints = null;
    this._curLetters = null;
}

/** Evaluate an XPath expression
 * @expr: The expression to evaluate
 * @ctx: Context of the expression. Optional ; by default, the document.
 * @return: An array of DOM elements matching the expression.
 */
usHints.prototype.xpathEval = function(expr, ctx) {
    if(ctx == undefined)
        ctx = this.doc;
    var res = this.doc.evaluate(expr, ctx, null, XPathResult.ANY_TYPE, null);
    var elems = [];
    var elem = res.iterateNext();
    while(elem) {
        elems.push(elem);
        elem = res.iterateNext();
    }
    return elems;
}

/** Activate the script
 * Display visible hints and listen for keystrokes.
 */
usHints.prototype.start = function() {
    var pow = function(base, n) {
        if(n == 0) return 1;
        else if(n == 1) return base;
        else return base * pow(base, n-1);
    }
    
    this.stop();
    
    this._curHints = [];
    this._curLetters = "";
    
    var base = this.keys.length;
    
    /* Find visible elems */
    var elems = this.xpathEval(this.xpathQuery);
    var visElems = [];
    var win = this.doc.defaultView;
    var vcoords = [win.pageYOffset, win.pageYOffset + win.innerHeight,
                   win.pageXOffset, win.pageXOffset + win.innerWidth];
    for each(var elem in elems) {
        var rect = this.rect_intersect(this.get_elem_coords(elem), vcoords);
        if(rect)
            visElems.push([elem, rect]);
    }
    
    /* How many letters do we need ? */
    var curHint = [0];
    while(visElems.length >= pow(base, curHint.length))
        curHint.push(0);
    
    /* Create hints container */
    this._container = this.doc.body.appendChild(this.doc.createElement('div'));
    
    /* Create hints */
    for each(var visElem in visElems) {
        var hint = this.doc.createElement('div');
        var hint_label = this.number_to_string(curHint);
        hint.innerHTML = hint_label;
        hint.className = this.selected_hint_class;
        hint.style.top = visElem[1][0] + 'px';
        hint.style.left = visElem[1][2] + 'px';
        
        this._curHints.push({elem: visElem[0], hint: hint, label: hint_label.toLowerCase()});
        this._container.appendChild(hint);
        curHint = this.enumeration_next_number(curHint, base);
    }
}

/** Desactivate the script
 * Destroy displayed hints
 */
usHints.prototype.stop = function() {
    if(this._container != null) {
        this.doc.body.removeChild(this._container);
        this._container = null;
        this._curHints = null;
        this._curLetters = null;
    }
}

/** Refresh
 * Stop and restart
 */
usHints.prototype.refresh = function() {
    this.start();
}

/** Retuns true if started
 */
usHints.prototype.is_started = function() {
    return !!this._curHints;
}

/** Get the coordinates of an element
 * Return the displayed rectangle of @elem (top, bottom, left, right)
 */
usHints.prototype.get_elem_coords = function(elem) {
    var top = elem.offsetTop;
    var left = elem.offsetLeft;
    var width = elem.offsetWidth;
    var height = elem.offsetHeight;
    while(elem.offsetParent) {
        elem = elem.offsetParent;
        top += elem.offsetTop;
        left += elem.offsetLeft;
    }
    return [top, top + height, left, left + width];
}

/** Computes the intersection of two rectangles
 * Compute the bigger rectangle (top, bottom, left, right) included in the two given rectangles.
 * If the two rectangles doesn’t intersects, returns false
 */
usHints.prototype.rect_intersect = function(ecoords, vcoords) {
    var min = function(a, b) { return a < b ? a : b; }
    var max = function(a, b) { return a > b ? a : b; }
    var top = max(ecoords[0], vcoords[0]);
    var bottom = min(ecoords[1], vcoords[1]);
    var left = max(ecoords[2], vcoords[2]);
    var right = min(ecoords[3], vcoords[3]);
    if(left > right || top > bottom)
        return false;
    else
        return [top, bottom, left, right];
}

/** Counts in @base base
 * A number in a different base is an array of its chiffer, ist LSB being the first element of the array.
 * Given @cur_number, this function computes @cur_number + 1
 * For example, in base 13, (5)(12)(12) = [12, 12, 5] ; (5)(12)(12)+(1)=(6)(0)(0)=[0, 0, 6]
 */
usHints.prototype.enumeration_next_number = function(cur_number, base) {
    var ret = [];
    var inc = true;
    for each(var chiffer in cur_number) {
        if(inc) {
            chiffer = (chiffer + 1) % base;
            ret.push(chiffer);
            inc = (chiffer == 0);
        }
        else {
            ret.push(chiffer);
        }
    }
    return ret;
}

/** Number (in different base) to string
 * Given a number @num in a different base (see enumeration_next_number), find its representation with
 * an alphabet of same size as the base.
 * For example, with the alphabet "aetn", the number in base 4 10213 = [3, 1, 2, 0, 1] will be translated
 * into "eaten"
 */
usHints.prototype.number_to_string = function(num) {
    var res = "";
    for each(var chiffer in num)
        res = this.keys[chiffer] + res;
    return res.toUpperCase();
}

/** Return the current string defining selected hints
 */
usHints.prototype.get_current_letters = function() {
    return this._curLetters;
}

/** Add a letter into the string defining selected hints. If the letter is not a hint key, returns false.
 * returns the newly selected hints
 */
usHints.prototype.add_letter = function(letter) {
    letter = letter.toLowerCase();
    if(this.keys.indexOf(letter) == -1)
        return false;
    
    this._curLetters += letter;
    return this.update_selected_links(this._curLetters);
}

/** Remove the last letter in the string defining selected hints
 * returns the newly selected hints
 */
usHints.prototype.remove_last_letter = function() {
    if(this._curLetters.length > 0) {
        this._curLetters = this._curLetters.substr(0, this._curLetters.length - 1);
        return this.update_selected_links(this._curLetters);
    }
    else {
        return [];
    }
}

/** Select hints which theirs labels starts theirs letters
 * Returns newly selected links
 */
usHints.prototype.update_selected_links = function(letters) {
    var hints = [];
    for each(var hint in this._curHints) {
        if(hint.label.indexOf(letters) == 0) {
            hints.push(hint);
            hint.hint.className = this.selected_hint_class;
        }
        else {
            hint.hint.className = this.hint_class;
        }
    }
    return hints;
}

/** Manage a key event
 * See the instance variables defined in the constructor to see how to tune this function
 */
usHints.prototype.manage_key_event = function(event) {
    if(!event.keyCode && !event.charCode)
        return;
    
    var has_mod = event.ctrlKey || event.altKey || event.metaKey;
    
    if(!has_mod && event.keyCode == 27 && this.translate_escape) {
        this.stop();
        return;
    }
    
    if(!has_mod && event.keyCode == 8 && this.translate_backspace)
        ret = this.remove_last_letter();
    else if(!event.charCode)
        ret = false;
    else if(String.fromCharCode(event.charCode).length != 1 || has_mod)
        ret = false;
    else
        ret = this.add_letter(String.fromCharCode(event.charCode));
    
    
    if(ret.length && ret.length == 0) {
        if(this.stop_on_empty_match)
            this.stop();
    }
    else if(!ret) {
        if(this.stop_on_keystroke)
            this.stop();
    }
    else if(ret.length == 1) {
        if(this.callback)
            if(this.callback(this, ret[0].elem))
                this.stop();
    }
}

/** Standad callbacks */
var usHintsStandardCallbacks = {
    /* Activate the element (give the focus) and call stop */
    activate: function(hints, element) {
        element.focus();
        return true;
    },
    
    /* Simulate a click on the element and call stop */
    simulateClick: function(hints, element) {
        usHintsStandardCallbacks.activate(hints, element);
        var evt = hints.doc.createEvent('MouseEvents');
        var coords = hints.get_elem_coords(element);
        evt.initMouseEvent('click',
            true, true,                 /* canBubble, cancelable */
            hints.doc.defaultView, 1,   /* view, click count */
            0, 0,                       /* screen coords */
            0, 0,                       /* client coords */
            false, false, false, false, /* ctrl, alt, shift, meta */
            0, null);                   /* button, related target */
        element.dispatchEvent(evt);
        return true;
    },
    
    /* Simulate a control + click on the element and call stop */
    simulateCtrlClick: function(hints, element) {
        usHintsStandardCallbacks.activate(hints, element);
        var evt = hints.doc.createEvent('MouseEvents');
        var coords = hints.get_elem_coords(element);
        evt.initMouseEvent('click',
            true, true,                /* canBubble, cancelable */
            hints.doc.defaultView, 1,  /* view, click count */
            0, 0,                      /* screen coords */
            0, 0,                      /* client coords */
            true, false, false, false, /* ctrl, alt, shift, meta */
            0, null);                  /* button, related target */
        element.dispatchEvent(evt);
        return true;
    }
};

var ushints_main = function(document) {
    var ush = new usHints(document);
    var default_expr = ush.xpathQuery;

    document.addEventListener("keypress", function(e) {
            var active = document.activeElement.tagName.toLowerCase();
            if(active == "input" || active == "textarea" || active == "select") {
                if(e.keyCode == KeyEvent.DOM_VK_ESCAPE) {
                    document.activeElement.blur();
                    e.stopPropagation();
                    e.preventDefault();
                }
                return;
            }
            
            var handled = true;
            if(ush.is_started()) {
                ush.manage_key_event(e);
            }
            else if(e.charCode && !(e.ctrlKey || e.metaKey || e.altKey)) {
                var cmd = String.fromCharCode(e.charCode);
                ush.xpathQuery = default_expr;
                if(cmd == "a") {
                    ush.xpathQuery = default_expr + " | //input[@type='text' or not(@type) or @type='password'] | //textarea | //select";
                    ush.callback = usHintsStandardCallbacks.activate;
                    ush.start();
                }
                else if(cmd == "g") {
                    ush.callback = usHintsStandardCallbacks.simulateClick;
                    ush.start();
                }
                else if(cmd == "G") {
                    ush.callback = usHintsStandardCallbacks.simulateCtrlClick;
                    ush.start();
                }
                else if(cmd == "n") {
                    var evt = document.createEvent('KeyEvents');
                    evt.initKeyEvent('keypress',
                        true, true,                    /* canBubble, cancelable */
                        document.defaultView,          /* view */
                        false, false, false, false,    /* ctrl, alt, shift, meta */
                        KeyEvent.DOM_VK_PAGE_DOWN, 0); /* keycode, charCode */
                    document.body.dispatchEvent(evt);
                }
                else if(cmd == "N") {
                    var evt = document.createEvent('KeyEvents');
                    evt.initKeyEvent('keypress',
                        true, true,                  /* canBubble, cancelable */
                        document.defaultView,        /* view */
                        false, false, false, false,  /* ctrl, alt, shift, meta */
                        KeyEvent.DOM_VK_PAGE_UP, 0); /* keycode, charCode */
                    document.body.dispatchEvent(evt);
                }
                else if(cmd == "t") {
                    var evt = document.createEvent('KeyEvents');
                    evt.initKeyEvent('keypress',
                        true, true,                    /* canBubble, cancelable */
                        document.defaultView,          /* view */
                        true, false, false, false,     /* ctrl, alt, shift, meta */
                        KeyEvent.DOM_VK_PAGE_DOWN, 0); /* keycode, charCode */
                    document.body.dispatchEvent(evt);
                }
                else if(cmd == "T") {
                    var evt = document.createEvent('KeyEvents');
                    evt.initKeyEvent('keypress',
                        true, true,                  /* canBubble, cancelable */
                        document.defaultView,        /* view */
                        true, false, false, false,   /* ctrl, alt, shift, meta */
                        KeyEvent.DOM_VK_PAGE_UP, 0); /* keycode, charCode */
                    document.body.dispatchEvent(evt);
                }
                else if(cmd == "s") {
                    var evt = document.createEvent('KeyEvents');
                    evt.initKeyEvent('keypress',
                        true, true,                 /* canBubble, cancelable */
                        document.defaultView,       /* view */
                        false, false, false, false, /* ctrl, alt, shift, meta */
                        KeyEvent.DOM_VK_DOWN, 0);   /* keycode, charCode */
                    document.body.dispatchEvent(evt);
                }
                else if(cmd == "S") {
                    var evt = document.createEvent('KeyEvents');
                    evt.initKeyEvent('keypress',
                        true, true,                 /* canBubble, cancelable */
                        document.defaultView,       /* view */
                        false, false, false, false, /* ctrl, alt, shift, meta */
                        KeyEvent.DOM_VK_UP, 0);     /* keycode, charCode */
                    document.body.dispatchEvent(evt);
                }
                else if(cmd == "z") {
                    var evt = document.createEvent('KeyEvents');
                    evt.initKeyEvent('keypress',
                        true, true,                /* canBubble, cancelable */
                        document.defaultView,      /* view */
                        true, false, false, false, /* ctrl, alt, shift, meta */
                        0, "w".charCodeAt(0));     /* keycode, charCode */
                    document.defaultView.dispatchEvent(evt);
                }
                else handled = false;
            }
            else handled = false;
            
            if(handled) {
                e.stopPropagation();
                e.preventDefault();
            }
        }, true);
}

userScripts.register({
    callback: ushints_main,
    include: "*"
});
    
})();
