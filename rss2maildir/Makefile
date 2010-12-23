include $(GOROOT)/src/Make.inc

CLEANFILES=maildir-feed maildir-feed-rss

all: $(CLEANFILES)

include $(GOROOT)/src/Make.common

%: %.go
	$(GC) $*.go
	$(LD) -o $@ $*.$O
