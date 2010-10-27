function ucjsRestartApp() {
	var appStartup = Cc["@mozilla.org/toolkit/app-startup;1"]
	                 .getService(Ci.nsIAppStartup);
	appStartup.quit(appStartup.eRestart | appStartup.eAttemptQuit);
}

(function() {
	var overlay = 
		<overlay xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul">
			<commandset id="mainCommandSet">
				<command id="cmd_RestartApp" oncommand="ucjsRestartApp();" />
			</commandset>
			<keyset id="mainKeyset">
				<key id="key_RestartApp" key="Q" modifiers="accel,shift" command="cmd_RestartApp" />
			</keyset>
			<menu id="menu_FilePopup">
				<menuitem label="Restart" accesskey="R" insertbefore="menu_FileQuitItem"
				          key="key_RestartApp" command="cmd_RestartApp" />
			</menu>
		</overlay>;
	overlay = "data:application/vnd.mozilla.xul+xml;charset=utf-8," + encodeURI(overlay.toXMLString());
	document.loadOverlay(overlay, null);
})();
