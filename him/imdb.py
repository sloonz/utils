#!/usr/bin/python3

""" Note: all inequalities are large here (x > x, x < x)

Using the fact that

    d(a,b) < x => abs(norm(a) - norm(b)) < x (reverse triangle inequality)

to efficiently find duplicates of an image in a large database. Indeed,

abs(norm(a) - norm(b)) < x <=> 
    norm(b) - x < norm(a) < norm(b) + x

And since we have norm(*) > 0, we can conclude:

    d(a,b) < x => max(0, norm(b) - x) < norm(a) < norm(b) + x

So, when searching for all hashes b that verify d(a,b) < x, we can safely
compute d(a,b) only for hash with such a norm.

We have a similar result for hamming norm/distance too (p being hamming weight/norm) :

    p(a&b) < p(b) (or -p(b) < -p(a&b))
    p(a|b) = p(a) + p(b) - p(a&b)
    p(a^b) = p(a|b) - p(a&b) = p(a) + p(b) - 2*p(a&b)

    p(a^b) < x => p(a) < x - p(b) + 2*p(a&b) < x + p(b)


    p(a^b) < x => p(a)+p(b)-2*p(a&b) < x => p(b)-p(a) < x =>
    p(a) > p(b) - x
"""

import sys, sqlite3, base64, subprocess

threshold = 150

class DuplicateError(Exception):
    pass

def _hamming_weight(x):
    n = 0
    while x:
        n += 1
        x &= x-1
    return n

def hash(image):
    b64h = subprocess.Popen(["imhash", image], stdout = subprocess.PIPE).communicate()[0]
    return base64.b64decode(b64h)

def norm(h):
    return sum(map(_hamming_weight, h))

def distance(h1, h2):
    d = 0
    for x,y in zip(h1, h2):
        d += norm([x^y])
    return d

class ImagesDB:
    def __init__(self, file = '.images.db'):
        self.db = sqlite3.connect(file)
        self.cur = self.db.cursor()
    
    def searchFile(self, file):
        self.cur.execute('select id, file, hash, norm from images where file = ?', (file,))
        return self.cur.fetchall()
    
    def search(self, h):
        rows = self.cur.execute("select id, file, hash, norm from images where norm < ? and norm > ?",
            (norm(h) + threshold, norm(h) - threshold))
        for row in rows:
            if distance(h, base64.b64decode(row[2].encode())) < threshold:
                yield row
    
    def insert(self, file):
        h = hash(file)
        id = self.cur.execute("select max(id) from images").fetchone()[0] or 0
        self.cur.execute("insert into images (id, file, hash, norm) values (?,?,?,?)",
            (id+1, file, base64.b64encode(h).decode(), norm(h)))
        self.db.commit()
    
    def remove(self, file):
        res = self.searchFile(file)
        if res:
            row = res[0]
            self.cur.execute("delete from images where id = ?", (row[0],))
            self.db.commit()
            return True
        else:
            return False
    
    def list(self):
        self.cur.execute('select id, file, hash, norm from images')
        return self.cur.fetchall()
    
    def close(self):
        self.db.commit()
        self.db.close()

if __name__ == "__main__":
    opts, args = {}, []
    for arg in sys.argv[1:]:
        if arg.startswith('-') and len(arg) > 1:
            arg, val = arg.lstrip('-'), 1
            if '=' in arg:
                arg, val = arg.split('=', 1)
        else:
            args.append(arg)
    mode, args = args[0], args[1:]
    
    db = ImagesDB(opts.get('db', '.images.db'))
    
    def init():
        db.cur.execute("""
            CREATE TABLE images (
                id longint,
                file string,
                hash char(96),
                norm longint)""")
    
    def info(file):
        res = db.searchFile(f)
        
        if len(res) > 1:
            print("Got more than one result, this is wrong...", file=sys.stderr)
            sys.exit(1)
        
        if res:
            row = res[0]
            print("%s %s" % (row[2], row[3]))
        else:
            print("not in the base")
    
    def dups(file):
        res = list(db.search(hash(f)))
        
        if res:
            print(" ".join((row[1] for row in res)))
        return bool(res)
    
    def importfile(file):
        try:
            db.insert(file)
        except:
            print("Can't insert %s" % file, file=sys.stderr)
            raise
    
    def fileHash(file):
        h = hash(file)
        print("%s %s" % (base64.b64encode(h).decode(), norm(h)))
    
    if mode == 'init':
        init()
    elif mode == 'info':
        for f in args:
            if len(args) > 1:
                print(f + ":", end=' ')
            info(f)
    elif mode == 'dups':
        exitcode = 0
        for f in args:
            if len(args) > 1:
                print(f + ":", end=' ')
            if dups(f):
                exitcode = 1
        sys.exit(exitcode)
    elif mode == 'import':
        for f in args:
            importfile(f)
            print(f)
    elif mode == 'hash':
        for f in args:
            if len(args) > 1:
                print(f + ":", end=' ')
            fileHash(f)
    elif mode == "remove":
        for f in args:
            if db.remove(f):
                print("removed")
            else:
                print("not in the base")
    elif mode == "list":
        for item in db.list():
            print(item[1])
    elif mode == "clean":
        if args[0] == "-":
            inp = sys.stdin
        else:
            inp = args
        local = [item[1] for item in db.list()]
        for item in inp:
            if not item in local:
                print(item)
    else:
        print("Unknown mode", file=sys.stderr)
        sys.exit(1)
    
    db.close()
