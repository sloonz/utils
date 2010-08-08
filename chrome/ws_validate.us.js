(function(){
         
var usWSValidate = function(doc) {
	var active = doc.activeElement.tagName.toLowerCase();
	if(active == "input" || active == "textarea" || active == "select")
		return;
	
	var allInputs = doc.getElementsByTagName('input');
	for each(var input in allInputs) {
		if(input.getAttribute('name') == 'quality' && input.getAttribute('value') == '4') {
			var evt = doc.createEvent('MouseEvents');
			evt.initMouseEvent('click',
			    true, true,                 /* canBubble, cancelable */
			    doc.defaultView, 1,         /* view, click count */
			    0, 0,                       /* screen coords */
			    0, 0,                       /* client coords */
			    false, false, false, false, /* ctrl, alt, shift, meta */
			    0, null);                   /* button, related target */
			input.dispatchEvent(evt);
		}
	}
	
	doc.getElementById('wpMinoredit').checked = true;
	doc.getElementById('editform').submit();
	return true;
}

userScripts.register({
	callback: usWSValidate,
	rinclude: /^http:\/\/fr\.wikisource\.org\/w\/index\.php\?.*title=Page:.+&action=edit/,
	hotkey: 'v'
});

})();
