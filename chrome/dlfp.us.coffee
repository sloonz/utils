gotoSiblingElem = (document, delta)->
	max = document.usdlfpNewElems.length
	document.usdlfpCurElem = (document.usdlfpCurElem + delta + max) % max
	$('#current', document).html(document.usdlfpCurElem + 1)
	$(document).scrollTop $(document.usdlfpNewElems[document.usdlfpCurElem]).offset().top

createToolbar = (document, nElems)->
	$(document.body).append """
	  <div id="commentsbrowser">
	    <span id="newcommentsnav">
	      <span id="current">0</span>/#{nElems}
	      <a href="#" id="unread-prev">&lt;</a> | <a href="#" id="unread-next">&gt;</a>
	    </span>
	  </div>
	"""

	$('#unread-prev', document).click (event)->
		event.preventDefault()
		gotoSiblingElem(document, -1)

	$('#unread-next', document).click (event)->
		event.preventDefault()
		gotoSiblingElem(document, 1)

init = (document)->
	return if document.usdlfpDone?

	# Wait for the arrival of all elements
	elems = $('span.isnew', document)
	for elem in elems
		return if elem.innerHTML == "&nbsp;"

	# Find all new elements
	elems = elems.filter(":has(img)").
		parents('.bodydiv').prev('.titlediv')

	document.usdlfpDone = true
	document.usdlfpNewElems = elems
	document.usdlfpCurElem = -1

	elems.css backgroundColor: "#a33"

	createToolbar(document, document.usdlfpNewElems.length)
	userScripts.bindHotKey(document, "<", ->gotoSiblingElem(document, -1))
	userScripts.bindHotKey(document, ">", ->gotoSiblingElem(document, 1))

userScripts.register
	callback: (document)-> $(document).bind("DOMSubtreeModified", ->init document)
	rinclude: /^https?:\/\/(www\.)?linuxfr.org\/(users\/lastseen|journal)/

