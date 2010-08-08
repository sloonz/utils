var usdlfp = {
    xpathEval: function(doc, expr, ctx) {
        if(ctx == undefined)
            ctx = doc;
        return doc.evaluate(expr, ctx, null, XPathResult.ANY_TYPE, null);
    },

    gotoSiblingElem: function(doc, delta) {
        doc.usdlfpCurElem += delta;
        if(doc.usdlfpCurElem < 0)
            doc.usdlfpCurElem = doc.usdlfpNewElems.length - 1;
        else if(doc.usdlfpCurElem >= doc.usdlfpNewElems.length)
            doc.usdlfpCurElem = 0;
        doc.getElementById('current').innerHTML = (doc.usdlfpCurElem + 1).toString();
        
        var curtop = 0;
        var obj = doc.usdlfpNewElems[doc.usdlfpCurElem];
        if (obj.offsetParent) {
            while (obj.offsetParent) {
                curtop += obj.offsetTop
                obj = obj.offsetParent;
            }
        }
        else if (obj.y) {
            curtop += obj.y;
        }
        doc.documentElement.scrollTop = curtop;
    },

    createToolbar: function(document) {
        /* Container */
        var div = document.createElement('div');
        div.id = "commentsbrowser";
        var subDiv = document.createElement('span');
        subDiv.id = "newcommentsnav";
        
        /* Current position */
        var theSpan = document.createElement('span');
        theSpan.id = "current";
        theSpan.appendChild(document.createTextNode("0"));
        subDiv.appendChild(theSpan);
        subDiv.appendChild(document.createTextNode("/"));
        
        /* Num. new elems */
        theSpan = document.createElement('span');
        theSpan.id = "max";
        theSpan.appendChild(document.createTextNode("0"));
        subDiv.appendChild(theSpan);
        subDiv.appendChild(document.createTextNode(" "));
        
        /* "<" link */
        theA = document.createElement('a');
        theA.accessKey = "<";
        theA.href = "#";
        theA.appendChild(document.createTextNode("<"));
        subDiv.appendChild(theA);
        subDiv.appendChild(document.createTextNode(" | "));
        theA.addEventListener("click",
            function(e) {
                e.preventDefault();
                usdlfp.gotoSiblingElem(document, -1);
            }, false);
        
        /* ">" link */
        theA = document.createElement('a');
        theA.accessKey = ">";
        theA.href = "#";
        theA.appendChild(document.createTextNode(">"));
        subDiv.appendChild(theA);
        div.appendChild(subDiv);
        theA.addEventListener("click",
            function(e) {
                e.preventDefault();
                usdlfp.gotoSiblingElem(document, 1);
            }, false);
        
        /* Key grab */
        userScripts.bindHotKey(document, "<", function() { usdlfp.gotoSiblingElem(document, -1); });
        userScripts.bindHotKey(document, ">", function() { usdlfp.gotoSiblingElem(document, 1); });
        
        document.body.appendChild(div);
    },

    init: function(document) {
        var elems = usdlfp.xpathEval(document, '//span[@class="isnew"]');
        var elem = elems.iterateNext();
        var tabElems = [];
        
        /* Don't do it twice */
        if(document.usdlfpDone)
            return;
        
        /* Are all elements initialized ? */
        while(elem) {
            if(elem.innerHTML == "&nbsp;")
                return;
            else
                tabElems.push(elem);
            elem = elems.iterateNext();
        }
        
        /* Find new elements */
        document.usdlfpDone = true;
        document.usdlfpNewElems = [];
        document.usdlfpCurElem = -1;
        
        for(var i in tabElems) {
            elem = tabElems[i];
            var title = elem.parentNode.parentNode.previousSibling.previousSibling;
            if(elem.getElementsByTagName('img').length > 0) {
                document.usdlfpNewElems.push(title);
                title.style.backgroundColor = "#a33";
            }
        }
        
        /* Create the toolbar */
        usdlfp.createToolbar(document);
        document.getElementById('max').innerHTML = document.usdlfpNewElems.length;
    }
};

userScripts.register({
    callback: function(doc) {
        doc.addEventListener("DOMSubtreeModified", function() { usdlfp.init(doc); }, false);
    },
    rinclude: /^https?:\/\/(www\.)?linuxfr.org\/(users\/lastseen|journal)/
});
