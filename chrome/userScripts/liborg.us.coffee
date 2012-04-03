userScripts.register
	callback: (document)->
		$('#branding', document).remove()
		$('#primary_nav', document).remove()
		$('#secondary_navigation', document).remove()
		$('.ipsType_pagedesc.forum_rules', document).remove()
		for newelem in $('tr.unread', document)
			a1 = $("td.col_f_icon a", newelem)[0]
			a2 = $("a.topic_title", newelem)[0]
			[a1.href, a2.href] = [a2.href, a1.href]
	rinclude: /^https?:\/\/(www\.)?liberaux.org\//
