import  subprocess

SOCKET_FILE = "/var/run/dnsbackend.sock"

def init(id, cfg): return True

def deinit(id): return True

def inform_super(id, qstate, superqstate, qdata): return True

def operate(id, event, qstate, qdata):
    if (event == MODULE_EVENT_NEW) or (event == MODULE_EVENT_PASS):
        # Transmit query to dnsbackend
        cmd = ["socat", "UNIX-CONNECT:" + SOCKET_FILE, "STDIO"]
        cmd = subprocess.Popen(cmd, stdin = subprocess.PIPE, stdout = subprocess.PIPE, stderr = subprocess.STDOUT)
        res, _ = cmd.communicate("SQ\t%s\t%s\t%s\n" %
            (qstate.qinfo.qname_str, qstate.qinfo.qclass_str, qstate.qinfo.qtype_str))
        rc = cmd.wait()
        if rc != 0:
            log_err("pythonmod: socat returned %s (%d)" % (out, rc))
            qstate.ext_state[id] = MODULE_ERROR 
            return True
        
        # Create response
        # Unbound format: qname ttl qclass(IN) qtype(A/NS/...) data
        # dnsbackend format: qname qclass qtype ttl section data
        msg = DNSMessage(qstate.qinfo.qname_str, qstate.qinfo.qtype, qstate.qinfo.qclass,
            PKT_QR | PKT_RA)
        for line in res.splitlines():
            if line == "END":
                break
            _, qname, qclass, qtype, ttl, section, data = line.strip().split('\t')
            entry = "%s %s %s %s %s" % (qname, ttl, qclass, qtype, data)
            if section == "AN":
                msg.answer.append(entry)
            elif section == "AU":
                msg.authority.append(entry)
            elif section == "AD":
                msg.additional.append(entry)
            else:
                log_err("pythonmod: invalid section: %s" % section)
                qstate.ext_state[id] = MODULE_ERROR 
                return True
        
        # Send response
        if not msg.set_return_msg(qstate):
            qstate.ext_state[id] = MODULE_ERROR 
            return True

        qstate.return_msg.rep.security = 2
        qstate.return_rcode = RCODE_NOERROR
        qstate.ext_state[id] = MODULE_FINISHED 
        return True

    if event == MODULE_EVENT_MODDONE:
        log_info("pythonmod: iterator module done")
        qstate.ext_state[id] = MODULE_FINISHED 
        return True
      
    log_err("pythonmod: bad event")
    qstate.ext_state[id] = MODULE_ERROR
    return True
