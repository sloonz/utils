#include <fcntl.h>
#include <stdlib.h>
#include <stdio.h>
#include <ctype.h>
#include <string.h>

/* Constants */
#define DEFAULT_INFO_FILE "/proc/acpi/battery/BAT0/info"
#define DEFAULT_STATE_FILE "/proc/acpi/battery/BAT0/state"
#define DEFAULT_LOW_COMMAND "/usr/local/bin/suspend"
#define DEFAULT_WARNING_COMMAND ""
#define DEFAULT_SLEEP 30
#define STR(x) #x

#define READ_BUF_SIZE 50
#define LOW_STR "design capacity low:"
#define WARNING_STR "design capacity warning:"
#define CSTATE_STR "charging state:"
#define DISCHARGING_STR "discharging"
#define REMCAP_STR "remaining capacity:"

static const char *help = 
"Options:\n"
"  -h|--help: print this message\n"
"  -f|--dontfork: keep this process in foreground\n"
"  -i|--info FILE: read battery informations from FILE "
	"[default: "DEFAULT_INFO_FILE"]\n"
"  -s|--state FILE: read battery state from FILE "
	"[default: "DEFAULT_STATE_FILE"]\n"
"  -w|--warning COMMAND: execute COMMAND upon reaching warning capacity "
	"[default: "DEFAULT_WARNING_COMMAND"]\n"
"  -l|--low COMMAND: execute COMMAND upon reaching low capacity "
	"[default: "DEFAULT_LOW_COMMAND"]\n"
"  -t|--sleep SECONDS: interval between two read of the battery state "
	"[default: 30]\n"
;

/* Types */
typedef struct {
	int warning;
	int low;
} bat_info;

typedef struct {
	int capacity;
	int ac_present;
} bat_state;

/** Read a while line from "fd", extending the given buffer if necessary.
 * The buffer is extended with realloc so the old pointer will be invalid after
 * calling this function. "line" and "allocated_size" both refer on the initial
 * and modified value (in/out arguments). allocated_size MUST be initialized,
 * but line MAY mot if allocated_size is 0 (but MUST be if allocated_size is
 * not 0).
 * If the file don't has a final empty line, the last line will be discarded.
 * The LF character isn't included in the line.
 * Returns 0 upon reaching EOF, -1 on error and 1 else.
 * Free the allocated memory on EOF/error, so you can use this function without
 * having to deal with free/malloc/realloc/... If so, line is set to NULL.
 */
int readline(int fd, char **line, size_t *allocated_size)
{
	size_t line_size, read_size;
	char *curchar;
	
	if(*allocated_size == 0) {
		*line = malloc(READ_BUF_SIZE);
		*allocated_size = READ_BUF_SIZE;
	}
	
	line_size = 0;
	curchar = *line;
	
	while((read_size = read(fd, curchar, 1)) > 0) {
		if(*curchar == '\n') {
			*curchar = 0;
			return 1;
		}
		
		if(++line_size == *allocated_size) {
			curchar = *line = realloc(*line, *allocated_size + READ_BUF_SIZE);
			*allocated_size += READ_BUF_SIZE;
		}
		else {
			++curchar;
		}
	}
	
	/* Error or EOF, don't has a good string in line... */
	free(*line);
	*line = NULL;
	
	return read_size;
}

/** Read low/warning capacity for the battery from info_file.
 * Read all lines of info_file (with readline) and search for the lines:
 *  design capacity low: xxx
 *  design capacity warning: xxx
 * Return the values into info, 1 on success, 0 on error.
 */
int read_battery_info(const char *info_file, bat_info *info)
{
	int info_fd, rd;
	char *line;
	size_t bufsize = 0;
	
	size_t low_str_size = strlen(LOW_STR);
	size_t warn_str_size = strlen(WARNING_STR);
	
	info->low = info->warning = -1;
	if((info_fd = open(info_file, O_RDONLY)) == -1)
		return 0;
	
	while((rd = readline(info_fd, &line, &bufsize)) == 1) {
		if(!strncmp(line, LOW_STR, low_str_size))
			info->low = atoi(strchr(line, ':') + 1);
		if(!strncmp(line, WARNING_STR, warn_str_size))
			info->warning = atoi(strchr(line, ':') + 1);
	}
	
	close(info_fd);
	
	return (info->low != -1 && info->warning != -1);
}

/** Return a pointer on the first non-space character of s */
const char *lstrip(const char *s) {
	for(;isspace(*s);++s);return s;
}

/** Read capacity and presence of AC adapter for the battery from state_file.
 * Read all lines of state_file (with readline) and search for the lines:
 *  present: xxx
 *  remaining capacity: xxx
 * Return the values into state, 1 on success, 0 on error.
 */
int read_battery_state(const char *state_file, bat_state *state)
{
	int state_fd, rd;
	char *line;
	size_t bufsize = 0;
	
	size_t remcap_size = strlen(REMCAP_STR);
	size_t cstate_size = strlen(CSTATE_STR);
	size_t discharging_size = strlen(DISCHARGING_STR);
	
	state->ac_present = state->capacity = -1;
	if((state_fd = open(state_file, O_RDONLY)) == -1)
		return 0;
	
	while((rd = readline(state_fd, &line, &bufsize)) == 1) {
		if(!strncmp(line, CSTATE_STR, cstate_size))
			state->ac_present = !!strncmp(
		           lstrip(strchr(line, ':') + 1),
			   DISCHARGING_STR, discharging_size);
		if(!strncmp(line, REMCAP_STR, remcap_size))
			state->capacity = atoi(strchr(line, ':') + 1);
	}
	
	close(state_fd);
	
	return (state->ac_present != -1 && state->capacity != -1);
}

int main(int argc, char **argv) {
	bat_info info;
	bat_state state;
	
	const char *info_file = DEFAULT_INFO_FILE,
	           *state_file = DEFAULT_STATE_FILE,
	           *low_cmd = DEFAULT_LOW_COMMAND,   
	           *warn_cmd = DEFAULT_WARNING_COMMAND;   
	int do_fork = 1;
	int sleept = DEFAULT_SLEEP;
	int reported_warn = 0, reported_low = 0;
	
	/* Parse command line arguments */
	while(*++argv) {
		if(!strcmp(*argv, "-f") || !strcmp(*argv, "--nofork"))
			do_fork = 0;
		else if(!strcmp(*argv, "-i") || !strcmp(*argv, "--info"))
			info_file = *++argv;
		else if(!strcmp(*argv, "-s") || !strcmp(*argv, "--state"))
			state_file = *++argv;
		else if(!strcmp(*argv, "-w") || !strcmp(*argv, "--warning"))
			warn_cmd = *++argv;
		else if(!strcmp(*argv, "-l") || !strcmp(*argv, "--low"))
			low_cmd = *++argv;
		else if(!strcmp(*argv, "-t") || !strcmp(*argv, "--sleep"))
			sleept = atoi(*++argv);
		else {
			fprintf(stderr, help);
			exit(1);
		}
	}
	
	/* Load battery informations */
	if(!read_battery_info(info_file, &info)) {
		perror("read_battery_info");
		exit(1);
	}
	
	printf("Low: %d\n", info.low);
	printf("Warning: %d\n", info.warning);
	printf("Low command: %s\n", low_cmd);
	printf("Warning command: %s\n", warn_cmd);
	printf("Interval: %d\n", sleept);
	
	/* Pass in background */
	if(do_fork)
		switch(fork()) {
		case -1:
			perror("fork");
			exit(1);
		case 0:
			/* Child process */
			break;
		default:
			/* Parent process, exit */
			exit(0);
		}
	
	/* Main loop */
	for(;;) {
		if(!read_battery_state(state_file, &state)) {
			perror("read_battery_state");
			exit(1);
		}
		
		printf("%d %d\n", state.ac_present, state.capacity);
		
		if(!state.ac_present && state.capacity <= info.low) {
			fprintf(stderr, "Low battery !\n");
			if(*low_cmd && !reported_low)
				system(low_cmd);
			reported_low = 1;
		}
		else if(!state.ac_present && state.capacity <= info.warning) {
			fprintf(stderr, "Warning from battery !\n");
			if(*warn_cmd && !reported_warn)
				system(warn_cmd);
			reported_warn = 1;
			reported_low = 0;
		}
		else {
			reported_warn = 0;
			reported_low = 0;
		}
		
		sleep(sleept);
	}
	
	return 0;
}
