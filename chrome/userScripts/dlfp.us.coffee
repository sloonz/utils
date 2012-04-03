userScripts.register
	callback: (document)->
		sendClick = (elem)->
			e = document.createEvent("MouseEvent")
			e.initMouseEvent("click", true, true, document.defaultView,
				1, 0, 0, 0, 0,
				false, false, false, false,
				0, null)
			elem.dispatchEvent(e)
		userScripts.bindCommand document, "<", ->
			if $("article", document).length > 1
				sendClick($("#toolbar_alt_items .prev", document)[0])
			else
				sendClick($("#toolbar_items .prev", document)[0])
		userScripts.bindCommand document, ">", ->
			if $("article", document).length > 1
				sendClick($("#toolbar_alt_items .next", document)[0])
			else
				sendClick($("#toolbar_items .next", document)[0])
	rinclude: /^https?:\/\/(www\.)?linuxfr.org\//
