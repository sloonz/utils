# See https://developer.mozilla.org/en/XUL/List_of_commands

userScripts.bindCommand document, 'n', (document, event)->
	goDoCommand 'cmd_scrollPageDown'
userScripts.bindCommand document, 'N', (document, event)->
	goDoCommand 'cmd_scrollPageUp'
userScripts.bindCommand document, 's', (document, event)->
	goDoCommand 'cmd_scrollLineDown'
userScripts.bindCommand document, 'S', (document, event)->
	goDoCommand 'cmd_scrollLineUp'
userScripts.bindCommand document, 't', (document, event)->
	# FIXME: why Browser:NextTab doesn't work ?
	#goDoCommand 'Browser:NextTab'
	gBrowser.tabContainer.advanceSelectedTab(1, true)
userScripts.bindCommand document, 'T', (document, event)->
	# FIXME: why Browser:PreviousTab doesn't work ?
	#goDoCommand 'Browser:PreviousTab'
	gBrowser.tabContainer.advanceSelectedTab(-1, true)
userScripts.bindCommand document, 'z', (document, event)->
	# FIXME: why cmd_close doesn't work ?
	#goDoCommand 'cmd_close'
	gBrowser.removeCurrentTab()
