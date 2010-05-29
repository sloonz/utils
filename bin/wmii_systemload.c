// ~ cflags: -O3

#include <stdio.h>
#include <unistd.h>
#include <stdlib.h>
#include <sys/wait.h>

typedef unsigned long ulong;

static ulong oldused = 0;
static ulong oldtotal = 0;

int get_cpuload()
{
    FILE *fd;
    ulong user, nice, system, idle, used, total;
    int load = 0;

    fd = fopen("/proc/stat", "r");
    if (!fd)
        return -1;
    fscanf(fd, "%*s %ld %ld %ld %ld", &user, &nice, &system, &idle);
    fclose(fd);

    used = user + nice + system;
    total = used + idle;
    if(total - oldtotal)
        load = (100 * (double)(used - oldused)) / (double)(total - oldtotal);
    oldused = used;
    oldtotal = total;

    return load;
}

#define MT_SIZE 9
#define MF_SIZE 8
#define MC_SIZE 7
#define ST_SIZE 10
#define SF_SIZE 9

static char buf[81] = {80};
inline long readlong(const char *buf)
{
    for(; *buf == ' '; ++buf);
    return atol(buf);
}

int get_memswap(ulong *memused, ulong *memtot, ulong *swused, ulong *swtot)
{
    FILE *fd;
    long mtotal = -1, mfree = -1, mcached = -1, stotal = -1, sfree = -1;
    
    fd = fopen("/proc/meminfo", "r");
    if(!fd)
        return -1;
    
    do {
        if(fgets(buf, 80, fd) == NULL)
        {
            fclose(fd);
            return -1;
        }
        if(!strncmp(buf, "MemTotal:", MT_SIZE))
            mtotal = readlong(buf + MT_SIZE);
        if(!strncmp(buf, "MemFree:", MF_SIZE))
            mfree = readlong(buf + MF_SIZE);
        if(!strncmp(buf, "Cached:", MC_SIZE))
            mcached = readlong(buf + MC_SIZE);
        if(!strncmp(buf, "SwapTotal:", ST_SIZE))
            stotal = readlong(buf + ST_SIZE);
        if(!strncmp(buf, "SwapFree:", SF_SIZE))
            sfree = readlong(buf + SF_SIZE);
    }
    while(mtotal == -1 || mfree == -1 || mcached == -1 ||
          stotal == -1 || sfree == -1);
    fclose(fd);
    
    *memused = mtotal - mfree - mcached;
    *memtot = mtotal;
    *swused = stotal - sfree;
    *swtot = stotal;
    
    return 0;
}

#define WMII_SEND(args...) {\
    if((p = fork()) == 0) {\
        execlp("wmiir", "wmiir", args, NULL);\
        perror("execlp");\
        exit(1);\
    }\
    wait(&st);\
    if(WIFEXITED(st) && WEXITSTATUS(st) != 0) \
        fprintf(stderr, "Exit status: %d\n", WEXITSTATUS(st));\
    if(WIFSIGNALED(st))\
        fprintf(stderr, "Signal: %d\n", WTERMSIG(st));\
}

#define WMII_WRITE(path, fmt, data...) {\
    sprintf(mbuf, fmt, data);\
    WMII_SEND("xwrite", path, mbuf);\
}

int main(int argc, char **argv)
{
    ulong memused, memtot, swused, swtot;
    char *mbuf = malloc(255);
    pid_t p;
    int st;
    long delay = atol(argv[4])*1000;
    
    for(;;) {
        get_memswap(&memused, &memtot, &swused, &swtot);
        WMII_WRITE(argv[1], "CPU:% 3d%%", get_cpuload());
        WMII_WRITE(argv[2], "Mem:%lu/%lu", memused / 1024, memtot / 1024);
        WMII_WRITE(argv[3], "Swp:%lu/%lu", swused / 1024, swtot / 1024);
        usleep(delay);
    }
    
    free(mbuf);
    
    return 0;
}
