(function(){
         
var usGoogleLeft = function(doc) {
	var elem = doc.getElementById("leftnav");
	if(elem)
		elem.parentNode.removeChild(elem);
	return true;
}

userScripts.register({
	callback: usGoogleLeft,
	rinclude: /^http:\/\/(www\.)?google\./,
});

})();
