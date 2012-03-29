#!/usr/bin/python3

# Usage: imdb-import.py /path/to/image1 /path/to/image2 /path/to/image3...
# It will import images into current working directory. Images will be checked for duplicates
# (you must first init the database with imdb.py init). If there's duplicates, they will be
# presented to you with qiv; then press 0 for a list of actions.
# You will need qiv and qiv-command in your PATH

import imdb, sys, os, subprocess

def echop(p, file, i, total):
    l = str(len(str(total)))
    fmt = "[Pass %d, %0"+l+"d/%d] Processing %s..."
    data = fmt % (p, i+1, total, file)
    print(data, end=' ')
    sys.stdout.flush()

def syslp(cmd, *args):
    if os.fork() == 0:
        os.execlp(cmd, cmd, *args)
    return os.wait()[1]

def process(db, file):
    # Find output filename
    i = 0
    while os.path.exists("%d.jpg" % i):
        i += 1
    out = "%d.jpg" % i
    
    # Copy,
    if syslp("cp", "--", file, out):
        return False
    
    # insert copy in DB,
    try:
        db.insert(out)
    except Exception as e:
        print("Can't insert %s: %s" % (file, e), file=sys.stderr)
        return False
    
    # and delete original
    os.unlink(file)
    return out

# Process arguments
opts, args = {}, []
for arg in sys.argv[1:]:
    if arg.startswith('-') and len(arg) > 1:
        arg, val = arg.lstrip('-'), 1
        if '=' in arg:
            arg, val = arg.split('=', 1)
        opts[arg] = val
    else:
        args.append(arg)

# Open DB
dbfile = opts.get('db', '.images.db')
db = imdb.ImagesDB(dbfile)

# Called by qiv-command
def qivremove(db, f, fromdb):
    os.unlink(f)
    print("%s removed" % f)
    if fromdb:
        db.remove(f)
        print("%s removed from db" % f)

def qivprocess(db, f):
    ret = process(db, f)
    if ret:
        print("%s added into db (%s)" % (f, ret))
    return ret
    
if opts.get('delete'):
    qivremove(db, args[0], args[0] != opts['new'])
elif opts.get('append'):
    if args[0] == opts['new']:
        qivprocess(db, opts['new'])
    else: print("Already in DB")
elif opts.get('replace'):
    if args[0] != opts['new']:
        if qivprocess(db, opts['new']):
            qivremove(db, args[0], True)
    else: print("Replacing with itself")

if opts.get('delete') or opts.get('append') or opts.get('replace'):
    sys.exit(0)
    db.close()

# Process trivial files
problematics = []
for i, file in enumerate(args):
    echop(1, file, i, len(args))
    if any(db.search(imdb.hash(file))):
        print("DUPS [%s]" % ", ".join(x[1] for x in db.search(imdb.hash(file))))
        problematics.append(file)
    else:
        if process(db, file):
            print("OK")
        else:
            print("ERR")

# Process duplicates
os.environ['QIV_ACTION0'] = "echo -e '1 = delete\\n2 = append\\n3 = replace this DB image by new image'"
for i, file in enumerate(problematics):
    echop(2, file, i, len(problematics))
    dups = [x[1] for x in db.search(imdb.hash(file))]
    
    # Check that duplicates are still here
    if not dups:
        if process(db, file):
            print("OK")
        else:
            print("ERR")
        continue
    
    # Ask what to do from user
    os.environ['QIV_ACTION1'] = '"%s" --db="%s" --new="%s" --delete "$file"' % (sys.argv[0], dbfile, file)
    os.environ['QIV_ACTION2'] = '"%s" --db="%s" --new="%s" --append "$file"' % (sys.argv[0], dbfile, file)
    os.environ['QIV_ACTION3'] = '"%s" --db="%s" --new="%s" --replace "$file"' % (sys.argv[0], dbfile, file)
    syslp("qiv", "-fDm", file, *dups)
    print("Done")

db.close()
