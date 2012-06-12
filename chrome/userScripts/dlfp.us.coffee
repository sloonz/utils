userScripts.register
	callback: (document)->
		sendClick = (elem)->
			elem.dispatchEvent(userScripts.utils.createClickEvent(document))
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
