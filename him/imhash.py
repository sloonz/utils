#!/usr/bin/python3

import Image, numpy, sys, math, base64, struct

_nptypes = {'b': numpy.int8, 'B': numpy.uint8, 'h': numpy.int16, 'H': numpy.uint16,
        'i': numpy.int32, 'I': numpy.uint32, 'q': numpy.int64, 'Q': numpy.uint64,
        'f': numpy.float, 'd': numpy.double}
_nprevtypes = {v:k for k,v in _nptypes.items()}

class ImageHashing(object):
    """ The hash of an image consist of an array of integers. The size of the
    array must depend only on the parameters of the algorithm (not the image
    size.

    Hashes are encoded and decoded as base64.

    Distance and norm are provided. Both are integer, the second is always
    positive. Default distance is norm(A - B) where A and B are two hashes,
    and default implementation provide absolute and euclidian norms. Other
    implementations can override these, but classical distances properties
    must remain:
     * distance(A,B) = distance(B,A)
     * distance(A,B) = 0 <=> A = B
     * distance(A,B) <= Abs(Norm(A) + Norm(B)) (triangle inequality)
    
    Default implementation for disntance is just Norm(A - B).
    
    The first two are trivial, but the last one is less, and is really
    important for imdb
    
    Base parameters :
     norm: 1 form absolute norm, 2 for classical euclidean norm (recommended: 1)
    """

    @classmethod
    def hashToString(self, hash, **kwargs):
        assert isinstance(hash, numpy.ndarray)

        type = _nprevtypes[hash.dtype.type]
        if type in "fd":
            conv = float
        else:
            conv = int

        bytes = b""
        for x in hash:
            bytes += struct.pack("!%s" % type, conv(x))

        return type + base64.b64encode(bytes).decode('us-ascii')
    
    @classmethod
    def stringToHash(self, str, **kwargs):
        type = str[0]
        len = struct.calcsize("!%s" % type)
        hash = []
        bytes = base64.b64decode(str[1:].encode('us-ascii'))
        while bytes:
            hash.append(struct.unpack("!%s" % type, bytes[:len])[0])
            bytes = bytes[len:]
        
        return numpy.array(hash, dtype = _nptypes[type])
    
    @classmethod
    def norm(self, hash, **kwargs):
        type = int(kwargs.get('norm', 1))
        if type == 1:
            return int(numpy.sum(numpy.abs(hash)))
        elif type == 2:
            return math.sqrt(numpy.sum(hash**2))
        else:
            raise NotImplementedError
    
    @classmethod
    def distance(self, hash1, hash2, **kwargs):
        return self.norm(hash1 - hash2, **kwargs)
    
    @classmethod
    def hash(self, image, **kwargs):
        raise NotImplementedError

class DS(ImageHashing):
    """ Good parameters:
     * size = 96
     * norm = 1
     * threshold = 67 (0.05 with normed = 1)
     * downsample_method = 1
    
    Note that this doesn't work for image with low energy, typically if
     imwhite -method=DS -size=96 -norm=1 -threshold=15 -downsample_method=1 my_image
    returns my_image, you should consider another method.
    """
    
    @classmethod
    def hash(self, image, **kwargs):
        size = int(kwargs.get('size', 96))
        method = int(kwargs.get('downsample_method', 1))
        
        width, height = image.size
        ratio = float(width) / float(height)
        new_width = int(math.sqrt(size * 2 * ratio))
        new_height = int(math.sqrt(size * 2 / ratio))
        
        image = image.convert('L').resize((new_width, new_height), method).point(lambda x: (x & 224) >> 5)
        rw = list(range(new_width))
        rh = list(range(new_height))
        
        hash = numpy.array([image.getpixel((x,y)) for x in rw for y in rh], dtype = numpy.uint8)
        hash.resize(2*size)
        
        return hash

METHODS = [DS]

def readlines(files):
    if len(files) == 0:
        files.append('-')
    for f in files:
        fd = None
        if f == '-':
            fd = sys.stdin
        else:
            fd = open(f, 'r')
        
        for line in fd:
            if line.strip():
                yield line.strip()

def getopts(opts):
    kwargs = {}
    files = []
    
    for opt in opts:
        if opt.startswith('-') and len(opt) > 1:
            opt, val = opt.lstrip('-'), 1
            if '=' in opt:
                opt, val = opt.split('=', 1)
            kwargs[opt] = val
        else:
            files.append(opt)
    
    return kwargs, files

def get_method(name):
    for m in METHODS:
        if m.__name__ == name:
            return m
    raise NameError(name)

if __name__ == "__main__":
    ex = sys.argv[0].split('/')[-1]
    kwargs, files = getopts(sys.argv[1:])
    method = get_method(kwargs.get('method', 'DS'))
    
    if ex.startswith('imhash'):
        for f in files:
            hash = method.hash(Image.open(f), **kwargs)
            print(method.hashToString(hash, **kwargs), f)
            sys.stdout.flush()
    elif ex.startswith('hdiff'):
        lines = readlines(files)
        href = method.stringToHash(lines.next().split(' ')[0], **kwargs)
        t = float(kwargs.get('threshold', None))
        for line in lines:
            hrel, f = line.split(' ', 1)
            hrel = method.stringToHash(hrel, **kwargs)
            dist = method.distance(hrel, href, **kwargs)
            if t is None:
                print(dist, f)
            elif dist < t:
                print(dist, f)
            sys.stdout.flush()
    elif ex.startswith('imdiff'):
        href = method.hash(Image.open(files[0]), **kwargs)
        for f in files[1:]:
            hrel = method.hash(Image.open(f), **kwargs)
            d = method.distance(hrel, href, **kwargs)
            print(d, f)
    elif ex.startswith('imwhite'):
        t = kwargs.get('threshold', None)
        for f in files:
            i = Image.open(f)
            w = Image.new('L', i.size).point(lambda x: 255)
            hi = method.hash(i, **kwargs)
            hw = method.hash(w, **kwargs)
            d = method.distance(hi, hw, **kwargs)
            if t is None:
                print(d, f)
            elif d < float(t):
                print(d, f)
            sys.stdout.flush()
    elif ex.startswith('imblack'):
        t = kwargs.get('threshold', None)
        for f in files:
            i = Image.open(f)
            w = Image.new('L', i.size).point(lambda x: 0)
            hi = method.hash(i, **kwargs)
            hw = method.hash(w, **kwargs)
            d = method.distance(hi, hw, **kwargs)
            if t is None:
                print(d, f)
            elif d < float(t):
                print(d, f)
            sys.stdout.flush()
