userScripts.register
	callback: (document)-> $('#leftnav', document).detach()
	rinclude: /^http:\/\/(www\.)?google\./

