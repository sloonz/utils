(function(){

var usWSApostrophe = function(doc) {
	var isNew = /new/.test(doc.getElementById('ca-nstab-page').className);
	var elem = doc.getElementById('wpTextbox1');
	if(isNew)
		elem.value = elem.value.replace(/'/g, "\u2019");
	elem.focus();
}

userScripts.register({
    callback: function(doc) { window.setTimeout(usWSApostrophe, 1000, doc); },
    rinclude: /^http:\/\/fr\.wikisource\.org\/w\/index\.php\?.*title=Page:.+&action=edit/
});

})();
