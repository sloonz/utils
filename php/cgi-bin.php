<?php
/** Execute a CGI script
 * Usage http://example.com/~sb/cgi-bin.php/spam/egg.py/foo?args
 * This will try to call (in order):
 * (By default, CGI_ROOT is cgi-bin in the same directory of this script)
 *  - CGI_ROOT/spam with PATH_INFO = /egg.py/path
 *  - CGI_ROOT/spam/egg.py with PATH_INFO = /path
 *  - CGI_ROOT/spam/egg.py/foo without filling PATH_INFO
 *    Note that calling /spam/egg.py/foo/?args will fill PATH_INFO with /
 * Requirements:
 *  - You must have read and execute persmissions on the cgi script
 *  - PHP must allow proc_open, proc_close and proc_get_status
 *  - Your webserver must fill $_SERVER['PATH_INFO'], $_SERVER['QUERY_STRING'] and $_SERVER['PHP_SELF']
 * Error reporting:
 *  By default, nothing. If you define CGI_DEBUG to a string, all errors
 *  will be written to the file CGI_DEBUG
 * Security considerations:
 *  None. Using this may be dangerous :)
 * Input:
 *  - QUERY_STRING (all things after "?") will be passed at first (and only)
 *    argument of the script (argv[1] in C)
 *  - POST data will be passed to standard input
 *  - Environment variables: everything in $_ENV and $_SERVER, plus:
 *     > PATH_INFO, described below
 *     > GATEWAY_INTERFACE="CGI/1.1" (though I didn't read the whole CGI scpecification)
 *     > PATH_TRANSLATED=realpath(PATH_INFO)
 *     > SCRIPT_NAME=CGI_ROOT/spam/egg.py (for example)
 * Output:
 *  headers (each ended with a newline) + newline + body
 *  For example:
 *   HTTP/1.1 200 OK CRLF
 *   Content-type: text/plain CRLF
 *   X-Powered-By: Python/2.5.1 CRLF
 *   CRLF
 *   Hello, world !
 *  (end of lines can also be LF but not only CR)
 * Licence: as-is
 * Author: moonz (sloonz@gmial.com, with a voluntary typo error on gmail.com)
 *
 * Pipiru piru piru pipiru pi !
 */

define('CGI_ROOT', 'cgi-bin');
define('CGI_DEBUG', '/dev/null');

error_reporting(E_ALL);

function is_cgi($file) {
	return is_readable($file) && is_executable($file) && !is_dir($file);
}

function error($errstr, $code = 500, $msg = "Internal Server Error") {
	@header('HTTP/1.1 $code $msg');
	@header('Content-type: text-plain');
	die($errstr);
}

// find PATH_INFO and QUERY_STRING
if(isset($_SERVER['PATH_INFO']) && isset($_SERVER['QUERY_STRING'])) {
	$path_info = $_SERVER['PATH_INFO'];
	$query_string = $_SERVER['QUERY_STRING'];
	
	if($path_info == NULL && isset($_SERVER['ORIG_PATH_INFO'])) { // For lighttpd
		$path_info = $_SERVER['ORIG_PATH_INFO'];
	}
}
else {
	error('Bad server configuration, missing PATH_INFO and QUERY_STRING');
}

// Find what script to execute
$parts = explode('/', $path_info);
if($parts[0] == "") array_shift($parts);

$path = array_shift($parts);
while(file_exists(CGI_ROOT . '/' . $path) && !is_cgi(CGI_ROOT . '/' . $path) && count($parts) > 0) {
	$path .= '/' . array_shift($parts);
}

if(!file_exists(CGI_ROOT . '/' . $path) || !is_cgi(CGI_ROOT . '/' . $path)) {
	error("Can't find a valid CGI script for $path request", 404, "Not Found");
}

// Script found, fill PATH_INFO, GATEWAY_INTERFACE, PATH_TRANSLATED and SCRIPT_NAME
$environ = array();
$environ['GATEWAY_INTERFACE'] = 'CGI/1.1';
$environ['SCRIPT_NAME'] = $_SERVER['PHP_SELF'] . '/' . $path;
$environ['QUERY_STRING'] = $query_string;
if(count($parts) > 0) {
	$environ['PATH_INFO'] = '/' . implode('/', $parts);
	$environ['PATH_TRANSLATED'] = realpath(CGI_ROOT) . $path_info;
}

// Find POST data
if(!isset($_POST) && !isset($HTTP_RAW_POST_DATA)) {
	$data = NULL;
}
elseif(isset($HTTP_RAW_POST_DATA)) {
	$data = $HTTP_RAW_POST_DATA;
}
else {
	// Can't get raw POST data, rebuild it...
	$data = "";
	foreach($_POST as $k=>$v) {
		$k = urlencode($k);
		$v = urlencode($v);
		$data.="$k=$v\n";
	}
	$data = substr($data,0,-1);
}

// Fill environment vars
if($data != NULL) {
	if(isset($_ENV['HTTP_CONTENT_TYPE'])) {
		$environ['CONTENT_TYPE'] = $_ENV['HTTP_CONTENT_TYPE'];
	}
	$environ['CONTENT_LENGTH'] = strlen($data);
}

foreach($_ENV as $k => $v) {
	if(!isset($environ[$k]) && !is_array($v) && $v !== NULL) {
		$environ[$k] = $v;
	}
}

foreach($_SERVER as $k => $v) {
	if(!isset($environ[$k]) && !is_array($v) && $v !== NULL) {
		$environ[$k] = $v;
	}
}

$env = array();
foreach($environ as $k => $v) {
	$env[] = "$k='".addslashes($v)."'";
}

// Execute process
$cgi = CGI_ROOT . '/' . $path;
$cwd = dirname(realpath($cgi));
$fds = array(0=>array("pipe", "r"), 1=>array("pipe", "w"), 2=>array("pipe", "w"));
$cmd = realpath($cgi) . " '"  . addslashes($query_string) . "'";

$p = proc_open($cmd, $fds, $pipes, $cwd, $env);
if(!is_resource($p)) {
	error("Can't execute CGI script ($cgi)");
}

if($data != NULL) {
	fwrite($pipes[0], $data);
}
fclose($pipes[0]);

$out = stream_get_contents($pipes[1]);
$err = stream_get_contents($pipes[2]);
fclose($pipes[1]);
fclose($pipes[2]);
$exit = proc_close($p);

// Error handling
if($err != "") {
	$fd = fopen(CGI_DEBUG, "w");
	fwrite($fd, $err);
	fclose($fd);
}

if($exit != 0) {
	error("CGI script $cgi returned $exit, 0 expected.\n\n$err");
}

// Parse output
$out = explode("\n", $out);
while(($header = trim(array_shift($out))) != "") {
	header($header);
}
echo implode("\n", $out);
?>
