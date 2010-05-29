package main

import "io"
import "bufio"
import "net"
import "exec"
import "os"
import "os/signal"
import "strings"
import "unicode"
import "fmt"
import "strconv"
import "time"
import "log"
import "container/vector"

const (
	DUMP_TIMEOUT = 300  // Maximum time (secs) between two cache dumps
	DUMP_UPDATES = 100  // Maximum nr of requests between two cache dumps
	LOGFILE = "/var/log/dnsbackend.log"
	SOCKET = "/var/run/dnsbackend.sock"
	CACHEFILE = "/var/cache/dnsbackend.cache"
	
	ANSWER = "AN"
	AUTHORITY = "AU"
	ADDITIONAL = "AD"
	
	CACHE_CMD_DUMP = "dump"
	CACHE_CMD_EXIT = "exit"
)

// Data structures
type Query struct {
	qname, qtype, qclass string
}

type ReplyEntry struct {
	Query
	ttl int
	data string
	section string
}

type Reply []*ReplyEntry
type CacheQuery struct { 
	Query
	resp chan Reply
}
type CacheReply struct {
	Query
	r Reply
}

type Cache struct {
	// Private data
	qr map[string]Reply
	file string
	last_dump_req int
	dirty bool
	pending_queries map[string]vector.Vector
	
	// Used to communicate with the cache
	command chan string
	replies chan CacheReply
	queries chan CacheQuery
}

var cache Cache = Cache{qr: make(map[string]Reply), pending_queries: make(map[string]vector.Vector),
	command: make(chan string), queries: make(chan CacheQuery), replies: make(chan CacheReply)}
var logger *log.Logger
var dnsaddr string

// Get the "Error" field from *os.PathError
func GetError(err os.Error) os.Error {
	patherr, ok := err.(*os.PathError)
	if ok {
		return patherr.Error
	}
	return err
}

// Cache helper: returns map key for given request
func GetKeyForQuery(req Query) string {
	return req.qname + "\t" + req.qclass + "\t" + req.qtype
}

// Like strings.Field, but returns at most n entries
func Fields(s string, n int) []string {
    a := make([]string, n)
    na := 0
    fieldStart := -1
    for i, rune := range s {
        if unicode.IsSpace(rune) {
            if fieldStart >= 0 && na < (n-1) {
                a[na] = s[fieldStart:i]
                na++
                fieldStart = -1
            }
        } else if fieldStart == -1 {
            fieldStart = i
        }
    }
    if fieldStart != -1 {
        a[na] = s[fieldStart:]
        na++
    }
    return a[0:na]
}

// Send non-empty lines (read from "in") to "lines". The final '\n' is removed.
func ReadLines(in io.Reader) (lines chan string) {
	lines = make(chan string);
	go func(lines chan string) {
		bufIn := bufio.NewReader(in)
		for {
			line, err := bufIn.ReadString('\n')
			line = strings.TrimSpace(line)
			if len(line) > 0 {
				lines <- line
			}
			if err != nil {
				close(lines)
				break
			}
		}
	}(lines)
	return
}

// Process commands sent to cache
func ManageCache() {
	for {
		select {
		case cmd := <- cache.command:
			DumpCache()
			if cmd == CACHE_CMD_EXIT {
				os.Exit(0)
			}
		case q := <- cache.queries:
			key := GetKeyForQuery(q.Query)
			repl, ok := cache.qr[key]
			if ok {
				q.resp <- repl
			} else {
				vec, _ := cache.pending_queries[key]
				vec.Insert(vec.Len(), q)
				cache.pending_queries[key] = vec
			}
		case r := <- cache.replies:
			if r.r != nil && len(r.r) > 0 {
				cache.qr[GetKeyForQuery(r.Query)] = r.r
				cache.dirty = true
			}
			vec, _ := cache.pending_queries[GetKeyForQuery(r.Query)]
			for i := 0; i < vec.Len(); i++ {
				vec.At(i).(CacheQuery).resp <- r.r
			}
			cache.pending_queries[GetKeyForQuery(r.Query)] = nil
			cache.last_dump_req++
			if cache.last_dump_req >= DUMP_UPDATES {
				DumpCache()
			}
		}
	}
}

// Write the cache to disk
func DumpCache() {
	if !cache.dirty {
		return 
	}
	cache.dirty = false
	cache.last_dump_req = 0

	logger.Logf("Dumping cache to %s", cache.file)
	fd, err := os.Open(cache.file + ".new", os.O_WRONLY | os.O_CREAT, 0664)
	if err != nil {
		logger.Logf("Can't open cache file: %s", err.String())
		return
	}
	wr := bufio.NewWriter(fd)
	
	for req, entries := range cache.qr {
		if _, err := fmt.Fprintf(wr, "BEGIN\t%s\t%d\n", req, len(entries)); err != nil {
			logger.Logf("Can't write to cache file: %s", err.String())
			return
		}
		for _, entry := range entries {
			if _, err := fmt.Fprintf(wr, "%s\t%s\t%d\t%s\t%s\t%s\n", entry.section, entry.qname, entry.ttl, entry.qclass, entry.qtype, entry.data); err != nil {
				logger.Logf("Can't write to cache file: %s", err.String())
				return
			}
		}
		if _, err := fmt.Fprintf(wr, "END\n\n"); err != nil {
			logger.Logf("Can't write to cache file: %s", err.String())
			return
		}
	}
	
	wr.Flush()
	fd.Close()
	os.Rename(cache.file + ".new", cache.file)
}

// Transmit request to dig, and send entries to "entries". When the child program terminates, close 
// the channel. If not nil, put dig return code in "rc", just before sending "nil" to "entries"
func GetEntriesFromDig(req Query, rc *int) (entries chan *ReplyEntry, err os.Error) {
	path, _ := exec.LookPath("dig")
	cmd, err := exec.Run(path, []string{path, "@" + dnsaddr, req.qname, req.qtype, req.qclass, "+nomultiline"},
		os.Environ(), "/", exec.DevNull, exec.Pipe, exec.MergeWithStdout)
	if err != nil {
		logger.Logf("Error running dig: %s", err.String())
		entries = nil
		return
	}
	
	entries = make(chan *ReplyEntry)
	section := ANSWER
	go func(entries chan *ReplyEntry) {
		lines := ReadLines(cmd.Stdout)
		for line := range lines {
			if line[0] != ';' {
				parts := Fields(line, 5)
				ttl, _ := strconv.Atoi(parts[2])
				entries <- &ReplyEntry{Query:Query{qname: parts[0], qclass: parts[2], qtype: parts[3]},
					ttl: ttl, data: parts[4], section: section}
			} else {
				switch strings.TrimSpace(line) {
				case ";; ANSWER SECTION:":
					section = ANSWER
				case ";; AUTHORITY SECTION:":
					section = AUTHORITY
				case ";; ADDITIONAL SECTION:":
					section = ADDITIONAL
				}
			}
		}
		
		cmd_rc, _ := cmd.Wait(0)
		if rc != nil {
			*rc = cmd_rc.WaitStatus.ExitStatus()
			if *rc != 0 {
				logger.Logf("dig exited with code %d", *rc)
			}
		}
		cmd.Close()
		close(entries)
	}(entries)
	
	return
}

// Display a list of entries, including END
func PrintEntries(out io.Writer, entries Reply) (close bool) {
	for _, entry := range entries {
		_, err := fmt.Fprintf(out, "DATA\t%s\t%s\t%s\t%d\t%s\t%s\n", entry.qname, entry.qclass, entry.qtype, entry.ttl, entry.section, entry.data)
		if GetError(err) == os.EPIPE {
			return true
		}
	}
	_, err := fmt.Fprintf(out, "END\n")
	return (GetError(err) == os.EPIPE)
}

// Transform a channel of *ReplyEntry to a slice of *ReplyEntry (a Reply)
func EntryChannelToReply(entries chan *ReplyEntry) (reply Reply) {
	// First, transform to Vector...
	var entries_vec vector.Vector
	for entry := range entries {
		entries_vec.Insert(entries_vec.Len(), entry)
	}
	
	// ...and then to slice
	reply = make(Reply, entries_vec.Len())
	for i := 0; i < entries_vec.Len(); i++ {
		reply[i] = entries_vec.At(i).(*ReplyEntry)
	}
	return
}

// Reply to a Q or QS query
func ProcessQuery(out io.Writer, req Query) (close bool) {
	// Send the query to dig, and the result to the cache (in background)
	var rc int
	entries, err := GetEntriesFromDig(req, &rc)
	if err != nil {
		logger.Logf("Can't run dig: %s\n", err.String())
		_, err := fmt.Fprintf(out, "FAIL\t%s\n", err.String())
		return (GetError(err) == os.EPIPE)
	}

	go func() {
		reply := EntryChannelToReply(entries)
		if rc == 0 {
			cache.replies <- CacheReply{req, reply}
		}
	}()
	
	// Send the query to the cache
	reply_chan := make(chan Reply)
	cache.queries <- CacheQuery{req, reply_chan}
	reply := <- reply_chan
	if reply == nil {
		_, err := fmt.Fprintf(out, "FAIL\terror from dig\n")
		close = (GetError(err) == os.EPIPE)
	} else {
		close = PrintEntries(out, reply)
	}
	return
}

// Client main goroutine
func ServeClient(l net.Listener, c net.Conn) {
	for line := range ReadLines(c) {
		parts := strings.Fields(line)
		cmd := parts[0]
		switch cmd {
		case "SQ": // Single Query -- quit after the reply 
			fallthrough
		case "Q":
			qname := parts[1]
			if len(qname) > 1 && qname[len(qname)-1] == '.' {
				qname = qname[0:len(qname)-1]
			}
			close := ProcessQuery(c, Query{qname: qname, qclass: parts[2], qtype: parts[3]})
			if cmd == "SQ" || close {
				c.Close()
				return
			}
		case "PING":
			_, err := fmt.Fprintf(c, "PONG\n")
			if GetError(err) == os.EPIPE {
				c.Close()
				return
			}
		case "DNSADDR":
			dnsaddr = parts[1]
			logger.Logf("Setting DNS to %s", dnsaddr)
		case "QUIT":
			DumpCache()
			c.Close()
			l.Close()
			os.Exit(0)
			return
		default:
			logger.Logf("WARN: unknown query from powerdns: %s", line)
		}
	}
	c.Close()
}

// Populate cache from a cache DB file
func PopulateCache(fd io.Reader) {
	var req *Query
	var replies Reply
	var reply_idx int
	linecount := 0
	for line := range ReadLines(fd) {
		linecount++
		parts := Fields(line, 5)
		switch parts[0] {
		case "BEGIN":
			req = &Query{qname:parts[1], qclass:parts[2], qtype:parts[3]}
			nentries, _ := strconv.Atoi(parts[4])
			replies = make(Reply, nentries)
		case "END":
			if req != nil && replies != nil {
				cache.qr[GetKeyForQuery(*req)] = replies
			}
			req = nil
			replies = nil
			reply_idx = 0
		case "":
			// Do nothing
		default:
			if reply_idx < len(replies) {
				parts := Fields(line[3:], 5)
				ttl, _ := strconv.Atoi(parts[2])
				replies[reply_idx] = &ReplyEntry{Query: Query{qname: parts[0], qclass: parts[2], qtype: parts[3]},
					ttl: ttl, data: parts[4], section: line[0:2]}
				reply_idx++
			} else {
				logger.Logf("WARNING: %s:%d: ignoring cache reply line: %s", cache.file, linecount, line)
			}
		}
	}
	logger.Logf("Read %d lines from cache file", linecount)
}

// Create a listener listening on unix socket path
func CreateListener(path string) net.Listener {
	listener, err := net.Listen("unix", path)
	if GetError(err) == os.EADDRINUSE {
		// If an instance is already running, exit
		conn, err2 := net.Dial("unix", "", path)
		if err2 == nil {
			_, err3 := fmt.Fprintf(conn, "PING\n")
			if err3 == nil {
				ch := ReadLines(conn)
				line := <- ch
				if line == "PONG" {
					logger.Log("Instance already running, exiting")
					conn.Close()
					os.Exit(1)
				}
			}
		}
		
		// Else, remove the socket file and retry
		err = os.Remove(path)
		if err != nil {
			logger.Logf("ERROR: Can't remove old socket (%s), exiting", err.String())
		}
		listener, err = net.Listen("unix", path)
	}
	if err != nil {
		logger.Logf("ERROR: Can't open socket: %s", err.String())
		os.Exit(1)
	}
	return listener
}

func main() {
	if len(os.Args) > 1 {
		dnsaddr = os.Args[1]
	}
	
	// Init logger
	logger_fd, err := os.Open(LOGFILE, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0664)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Cannot open log file: %s\n", err.String())
		os.Exit(1)
	}
	logger = log.New(logger_fd, nil, "", log.Lok | log.Ldate | log.Ltime)
	
	// Init cache
	cache.last_dump_req = 0
	cache.file = CACHEFILE
	cache.dirty = false
	
	logger.Log("Running new instance")
	
	// Read cache DB
	fd, err := os.Open(cache.file, os.O_RDONLY, 0)
	if err != nil {
		if GetError(err) != os.ENOENT {
			logger.Logf("Error opening cache file: %d %s", err, err.String())
		}
	}
	if err == nil {
		PopulateCache(fd)
		fd.Close()
	} else {
		logger.Log("No cache file")
	}
	
	// Open socket
	listener := CreateListener(SOCKET)
	
	// Run the "daemon" goroutines
	go ManageCache()
	go func() {
		for {
			time.Sleep(DUMP_TIMEOUT * 1000000000)
			cache.command <- CACHE_CMD_DUMP
		}
	}()
	go func() {
		for sig := range signal.Incoming {
			if strings.HasPrefix(sig.String(), "SIGWINCH") || strings.HasPrefix(sig.String(), "SIGCHLD") {
				continue
			}
			logger.Logf("Signal: %s", sig.String())
			cache.command <- CACHE_CMD_EXIT
			listener.Close()
		}
	}()
	
	// Process queries
	logger.Log("Ready")
	for {
		conn, err := listener.Accept()
		if err != nil {
			logger.Logf("Error while accepting connection: %s", err.String())
			continue
		}
		go ServeClient(listener, conn)
	}
	
	logger.Log("terminating")
}

// TODO: 
//  bugs?, fork
