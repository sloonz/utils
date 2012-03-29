// ~ pkg: pHash
// ~ ldflags: -lpthread

#include <pHash.h>
#include <stdio.h>

static const char cb64[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

void encodeblock( unsigned char in[3], unsigned char out[4], int len )
{
    out[0] = cb64[ in[0] >> 2 ];
    out[1] = cb64[ ((in[0] & 0x03) << 4) | ((in[1] & 0xf0) >> 4) ];
    out[2] = (unsigned char) (len > 1 ? cb64[ ((in[1] & 0x0f) << 2) | ((in[2] & 0xc0) >> 6) ] : '=');
    out[3] = (unsigned char) (len > 2 ? cb64[ in[2] & 0x3f ] : '=');
}

int main(int argc, char **argv) {
	int N;
	uint8_t *hash = ph_mh_imagehash(argv[1], N);
	
	char *result = (char*)alloca(((N+1)*4)/3 + 1);
	char *out = result;
	while(N > 0) {
		encodeblock(hash, (unsigned char*)out, N);
		hash += 3;
		out += 4;
		N -= 3;
	}
	*out = 0;
	
	printf("%s\n", result);
	
	return 0;
}