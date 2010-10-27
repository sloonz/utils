userScripts.register
	callback: (document)->
		$('#logostrip', document).remove()
		for newelem in $('a:has(img[src$="newpost.gif"])', document)
			postelem = $(newelem).nextAll('span[id|="tid-span"]').children('a').get(0)
			[postelem.href, newelem.href] = [newelem.href, postelem.href]
	rinclude: /^https?:\/\/(www\.)?liberaux.org\//
