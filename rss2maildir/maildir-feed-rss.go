package main

import (
	"os"
	"json"
	"path"
	"io/ioutil"
	"fmt"
	"time"
	"http"
	"regexp"
	"bytes"
	"strings"
	"encoding/qprintable"
	"feedparser"
	"maildir"
	"mime/message"
)

type Cache struct {
	data map[string]bool
	path string
}

func (c *Cache) load() os.Error {
	cacheFile, err := os.Open(c.path, os.O_RDONLY, 0)
	if err != nil {
		return err
	}

	data, err := ioutil.ReadAll(cacheFile)
	if err != nil {
		return err
	}

	return json.Unmarshal(data, &c.data)
}

func (c *Cache) dump() os.Error {
	cacheFile, err := os.Open(c.path+".new", os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	defer cacheFile.Close()

	enc := json.NewEncoder(cacheFile)
	if err = enc.Encode(c.data); err != nil {
		return err
	}

	return os.Rename(c.path+".new", c.path)
}

var cache Cache

func firstNonEmpty(s ...string) string {
	var val string
	for _, val = range s {
		if val != "" {
			break
		}
	}
	return val
}

func getRFC822Date(e *feedparser.Entry) string {
	if e.PublicationDateParsed != nil {
		return e.PublicationDateParsed.Format(time.RFC822)
	}
	if e.ModificationDateParsed != nil {
		return e.ModificationDateParsed.Format(time.RFC822)
	}
	if e.PublicationDate != "" {
		return e.PublicationDate
	}
	if e.ModificationDate != "" {
		return e.ModificationDate
	}
	return time.UTC().Format(time.RFC822)
}

func getFrom(e *feedparser.Entry) string {
	name := strings.TrimSpace(message.EncodeWord(firstNonEmpty(e.Author.Name, e.Author.Uri, e.Author.Text)))
	if e.Author.Email != "" {
		name += " <" + strings.TrimSpace(e.Author.Email) + ">"
	}
	return name
}

var convertEOLReg = regexp.MustCompile("\r\n?")

func convertEOL(s string) string {
	return convertEOLReg.ReplaceAllString(s, "\n")
}

func process(rawUrl string) os.Error {
	url, err := http.ParseURL(rawUrl)
	if err != nil {
		return err
	}

	md, err := maildir.New(".", false)
	if err != nil {
		return err
	}

	feed, err := feedparser.ParseURL(url)
	if err != nil {
		return err
	}

	fmt.Printf("[%s]\n", feed.Title)
	for _, entry := range feed.Entries {
		postId := firstNonEmpty(entry.Id, entry.Link, entry.PublicationDate+":"+entry.Title)
		if _, hasId := cache.data[postId]; hasId {
			continue
		}

		body := convertEOL(firstNonEmpty(entry.Content, entry.Summary))
		body += "\n<p><small><a href=\"" + entry.Link + "\">View post</a></small></p>\n"

		title := strings.TrimSpace(entry.Title)
		msg := message.NewTextMessage(qprintable.UnixTextEncoding, bytes.NewBufferString(body))
		msg.SetHeader("Date", getRFC822Date(&entry))
		msg.SetHeader("From", getFrom(&entry))
		msg.SetHeader("To", "Feeds <feeds@localhost>")
		msg.SetHeader("Subject", message.EncodeWord(title))
		msg.SetHeader("Content-Type", "text/html")

		_, err = md.CreateMail(msg)
		if err != nil {
			return err
		}

		fmt.Printf("  %s\n", title)
		cache.data[postId] = true
	}

	return nil
}

func main() {
	url := os.Args[1]

	cache.path = path.Join(os.Getenv("HOME"), ".cache", "rss2maildir", strings.Replace(url, "/", "_", -1))
	cache.data = make(map[string]bool)

	err := cache.load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: can't read cache: %s\n", err.String())
	}

	err = process(url)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Can't process feed: %s\n", err.String())
		os.Exit(1)
	}

	err = cache.dump()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Can't write cache: %s\n", err.String())
		os.Exit(1)
	}
}
