class this.PrefFile
	constructor: (name)->
		@file = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile)
		@file.append name

	lines: ->
		return [] if not @file.exists()

		istream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream)
		istream.init(@file, -1, -1, 0)
		istream.QueryInterface(Ci.nsILineInputStream)

		line = {}
		canContinue = true
		lines = while canContinue
			canContinue = istream.readLine(line)
			line.value
		
		return lines

	appendLines: (lines)->
		ostream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream)
		ostream.init(@file, 0x02|0x08|0x10, -1, 0)
		for line in lines
			str = "#{line}\n"
			ostream.write(str, str.length)
		null
