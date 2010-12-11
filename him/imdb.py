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
"""

import imhash, Image, ImageEnhance, sys, sqlite3

method = imhash.DS
kwargs = {
    'size': 96,
    'norm': 1,
    'downsample_method': 1
}
threshold = 67
whitethreshold = 50
maxcontrast = 128

HNORMAL = 0
HENHANCED = 1
HFAILED = 2
HSTATUS = {HNORMAL: 'normal',
    HENHANCED: 'enhanced',
    HFAILED: 'failed'}

class DuplicateError(Exception):
    pass

def hash(image):
    w = Image.new('L', image.size).point(lambda x: 0xff)
    hw = method.hash(w, **kwargs)
    hi = method.hash(image, **kwargs)
    ci = ImageEnhance.Contrast(image)
    
    n = 1
    while method.distance(hw, hi) < whitethreshold and n <= maxcontrast:
        n *= 2
        hi = method.hash(ci.enhance(n), **kwargs)
    
    if method.distance(hw, hi) < whitethreshold:
        return HFAILED, None
    elif n > 1:
        return HENHANCED, hi
    else:
        return HNORMAL, hi

class ImagesDB:
    def __init__(self, file = '.images.db'):
        self.db = sqlite3.connect(file)
        self.cur = self.db.cursor()
    
    def searchFile(self, file):
        self.cur.execute('select id, file, htype, hash, norm from images where file = ?', (file,))
        return self.cur.fetchall()
    
    def searchImage(self, image):
        return self.search(hash(image))
    
    def search(self, hash):
        htype, hash = hash
        if htype == HFAILED:
            for row in self.cur.execute("select id, file, htype, hash, norm from images where htype = ?", (HFAILED,)):
                yield row
        else:
            norm = method.norm(hash)
            rows = self.cur.execute("select id, file, htype, hash, norm from images where htype = ? and norm < ? and norm > ?",
                (htype, norm + threshold, norm - threshold))
            for row in rows:
                if method.distance(hash, method.stringToHash(row[3], **kwargs), **kwargs) < threshold:
                    yield row
    
    def insert(self, image, file):
        htype, h = hash(image)
        if htype == HFAILED:
            hstr, norm = "", 0
        else:
            hstr, norm = method.hashToString(h, **kwargs), method.norm(h, **kwargs)
        
        id = self.cur.execute("select max(id) from images").fetchone()[0] or 0
        self.cur.execute("insert into images (id, file, htype, hash, norm) values (?,?,?,?,?)",
            (id+1, file, htype, hstr, norm))
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
        self.cur.execute('select id, file, htype, hash, norm from images')
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
    
    db = ImageDB(opts.get('db', '.images.db'))
    
    def init():
        db.cur.execute("""
            CREATE TABLE images (
                id longint,
                file string,
                htype shortint,
                hash char(96),
                norm longint)""")
    
    def info(file):
        res = db.searchFile(f)
        
        if len(res) > 1:
            print("Got more than one result, this is wrong...", file=sys.stderr)
            sys.exit(1)
        
        if res:
            row = res[0]
            print("%s-%s %s" % (HSTATUS.get(int(row[2])), row[3], row[4]))
        else:
            print("not in the base")
    
    def dups(file):
        res = list(db.searchImage(Image.open(f)))
        
        if res:
            print(" ".join((row[1] for row in res)))
        return bool(res)
    
    def importfile(file):
        try:
            db.insert(Image.open(file), file)
        except:
            print("Can't insert %s" % file, file=sys.stderr)
            raise
    
    def fileHash(file):
        htype, h = hash(Image.open(file))
        norm = method.norm(h, **kwargs)
        h = method.hashToString(h, **kwargs)
        print("%s-%s %s" % (HSTATUS.get(htype), h, norm))
    
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
