package main

import (
	"os"
	"os/signal"
	"syscall"
	"json"
	"path"
	"io/ioutil"
	"fmt"
	"time"
	"bytes"
	"http"
	"exec"
	"runtime"
	"maildir"
	"encoding/qprintable"
	"mime/message"
)

const RUN_DELAY = 2
const INTERVAL_DELAY = 60 * 15
const MAX_ERR = 10

func Abs(p string) string {
	if path.IsAbs(p) {
		return p
	}
	wd, err := os.Getwd()
	if err != nil {
		panic(err.String())
	}
	return path.Join(wd, p)
}

func worker(root, md *maildir.Maildir, url *http.URL, delay int) {
	var w *os.Waitmsg
	var stderr []byte

	errCount := 0
	errch := make(chan []byte)
	dir, _ := path.Split(os.Args[0])
	execPath := path.Join(Abs(dir), "maildir-feed-rss")

	time.Sleep(int64(delay) * 1e9)
	for {
		cmd, err := exec.Run(execPath, []string{execPath, url.String()}, nil, md.Path, exec.PassThrough, exec.PassThrough, exec.Pipe)
		if err == nil {
			go (func() {
				data, _ := ioutil.ReadAll(cmd.Stderr)
				errch <- data
			})()
			w, err = cmd.Wait(0)
			cmd.Close()
			stderr = <-errch
		}

		if err != nil || (w != nil && (!w.Exited() || w.ExitStatus() != 0)) {
			errCount++

			body := bytes.NewBuffer(nil)
			if err != nil {
				body.WriteString("Err: " + err.String() + "\n")
			}
			if w != nil && w.Exited() {
				body.WriteString(fmt.Sprintf("Exit code: %s\n", w.ExitStatus()))
			} else if w != nil {
				body.WriteString(fmt.Sprintf("Signal: %s\n\n", w.Signal()))
			}
			body.Write(stderr)

			fmt.Fprintf(os.Stderr, "[%s: error]", url.String())
			os.Stderr.Write(body.Bytes())

			if errCount >= MAX_ERR {
				errCount = 0

				msg := message.NewTextMessage(qprintable.UnixTextEncoding, body)
				msg.SetHeader("Date", time.UTC().Format(time.RFC822))
				msg.SetHeader("From", "Feeds <feeds@localhost>")
				msg.SetHeader("To", "Feeds <feeds@localhost>")
				msg.SetHeader("Subject", "Error while fetching "+url.String())
				msg.SetHeader("Content-Type", "text/plain; encoding=UTF-8")

				_, err = root.CreateMail(msg)
				if err != nil {
					panic(err.String())
				}
			}
		}

		time.Sleep(INTERVAL_DELAY * 1e9)
	}
}

func parseBox(root, md *maildir.Maildir, data map[string]interface{}, delay int) int {
	for name, v := range data {
		child, err := md.Child(name, true)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Can't open %s: %s\n", name, err.String())
			os.Exit(1)
		}

		switch v.(type) {
		case map[string]interface{}:
			delay = parseBox(root, child, v.(map[string]interface{}), delay)
		case []interface{}:
			for i, item := range v.([]interface{}) {
				url, ok := item.(string)
				if !ok {
					fmt.Fprintf(os.Stderr, "%s[%i]: bad value type", name, i)
					os.Exit(1)
				}
				parsedURL, err := http.ParseURL(url)
				if err != nil {
					fmt.Fprintf(os.Stderr, "%s[%i]: bad url: %s", name, i, err)
					os.Exit(1)
				}
				go worker(root, child, parsedURL, delay)
				delay += RUN_DELAY
			}
		case string:
			parsedURL, err := http.ParseURL(v.(string))
			if err != nil {
				fmt.Fprintf(os.Stderr, "%s: bad url: %s", name, err)
				os.Exit(1)
			}
			go worker(root, child, parsedURL, delay)
			delay += RUN_DELAY
		default:
			fmt.Fprintf(os.Stderr, "%s: bad value type", name)
			os.Exit(1)
		}
	}
	return delay
}

func main() {
	runtime.GOMAXPROCS(5)

	// Read & parse config
	configFile, err := os.Open(path.Join(os.Getenv("HOME"), ".config", "rss2maildir", "feeds.json"), os.O_RDONLY, 0)
	config := make(map[string]interface{})
	if err != nil {
		fmt.Fprintf(os.Stderr, "Can't open config\n")
		return
	}
	data, err := ioutil.ReadAll(configFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Can't read config\n")
		return
	}
	if err = json.Unmarshal(data, &config); err != nil {
		fmt.Fprintf(os.Stderr, "Parse error: %s\n", err.String())
		return
	}

	md, err := maildir.New(path.Join(os.Getenv("HOME"), "Maildir-feeds"), true)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Can't open maildir: %s\n", err.String())
		return
	}

	parseBox(md, md, config, 0)

	// Wait for SIGINT
	for {
		sig := <-signal.Incoming
		if sig.(signal.UnixSignal) == syscall.SIGINT {
			break
		}
	}
}
