/* OBS Studio on this PC, through its own WebSocket server (obs-websocket 5, built into OBS 28 and later: OBS > Tools >
   WebSocket Server Settings). Only for the broadcast desk (desk.js): the Operations admin's director switches OBS's
   scenes and sees what it shows. Polaris Navdata talks to OBS on this PC only (127.0.0.1); OBS's password is set on
   the EFB on this PC (Ground > Simulator PC > Broadcast), kept here in this Windows user's protected storage, and never
   leaves this PC. Kept connected while it is set: tried again every 5 s while OBS is closed (not after OBS refused the
   password: until it is set again on the EFB). */
'use strict';
const crypto = require('crypto');
const WebSocket = require('ws');

const sha = (s) => crypto.createHash('sha256').update(s).digest('base64');
/* the events Navdata listens to: General (1), Scenes (4), Outputs (64) */
const EVENTS = 1 | 4 | 64;
const NOT_OPEN = 'OBS is not open, or its WebSocket Server is off (OBS › Tools › WebSocket Server Settings)';

class ObsLink {
  /* o = { log(), changed() (connected or not, or the error, changed), ready() (just connected), event(type, data) } */
  constructor(o) { this.o = o; this.port = 4455; this.pw = ''; this.on = false; this.ws = null; this.st = 'off'; this.err = ''; this.v = ''; this.n = 0; this.pend = new Map(); this.timer = null; this.said = ''; this.stuck = false; }
  /* from the saved settings or the EFB: on with this port and password, or off */
  config(on, port, pw) {
    this.on = !!on; this.port = Math.max(1, Math.min(65535, +port || 4455)); this.pw = String(pw || ''); this.stuck = false;
    clearTimeout(this.timer); this.drop();
    if (this.on) this.connect(); else { this.st = 'off'; this.err = ''; this.tell(); }
  }
  /* the EFB and the desk hear of it only when something changed */
  tell() { const k = this.st + '|' + this.err; if (k === this.said) return; this.said = k; this.o.changed(); }
  drop() { const w = this.ws; this.ws = null; if (w) try { w.close(); } catch (e) { /* closed */ } this.fail('OBS is not connected'); }
  stop() { this.on = false; clearTimeout(this.timer); this.drop(); this.st = 'off'; }
  fail(why) { for (const p of this.pend.values()) { clearTimeout(p.t); p.rej(new Error(why)); } this.pend.clear(); }
  connect() {
    if (!this.on || this.ws) return;
    let w; try { w = new WebSocket('ws://127.0.0.1:' + this.port); } catch (e) { this.err = e.message; this.st = 'err'; this.tell(); this.later(); return; }
    this.ws = w; if (this.st !== 'err') this.st = 'connecting';
    w.on('message', (m) => this.msg(w, m));
    w.on('error', (e) => { if (!this.stuck) this.err = /ECONNREFUSED|ECONNRESET/.test(String(e && e.message)) ? NOT_OPEN : String((e && e.message) || 'No answer'); });
    w.on('close', (code) => {
      if (this.ws !== w) return; this.ws = null; this.fail('OBS closed');
      /* 4009: the password is wrong (and asked again, it would be again): not tried until it is set again */
      if (code === 4009) { this.stuck = true; this.err = 'OBS refused the password: check it on the EFB (Ground › Simulator PC › Broadcast) and in OBS › Tools › WebSocket Server Settings'; }
      else if (!this.stuck && this.st === 'on') this.err = NOT_OPEN;
      const was = this.st; this.st = this.on ? 'err' : 'off';
      if (was === 'on') this.o.log('OBS closed.' + (this.stuck ? '' : ' Trying again every 5 s...'));
      if (this.stuck) this.o.log(this.err);
      this.tell(); if (!this.stuck) this.later();
    });
  }
  later() { if (this.on) { clearTimeout(this.timer); this.timer = setTimeout(() => this.connect(), 5000); } }
  msg(w, raw) {
    let j; try { j = JSON.parse(String(raw)); } catch (e) { return; }
    const d = (j && j.d) || {};
    if (j.op === 0) {
      this.v = String(d.obsWebSocketVersion || '');
      const id = { rpcVersion: 1, eventSubscriptions: EVENTS };
      if (d.authentication) {
        if (!this.pw) { this.stuck = true; this.err = 'OBS asks for its WebSocket password: enter it on the EFB (Ground › Simulator PC › Broadcast)'; try { w.close(); } catch (e) { /* closed */ } return; }
        id.authentication = sha(sha(this.pw + d.authentication.salt) + d.authentication.challenge);
      }
      try { w.send(JSON.stringify({ op: 1, d: id })); } catch (e) { /* closed */ }
    } else if (j.op === 2) {
      this.st = 'on'; this.err = ''; this.o.log('Connected to OBS' + (this.v ? ' (WebSocket ' + this.v + ')' : '') + ' for the broadcast desk.');
      this.tell(); if (this.o.ready) this.o.ready();
    } else if (j.op === 7) {
      const p = this.pend.get(d.requestId); if (!p) return;
      this.pend.delete(d.requestId); clearTimeout(p.t);
      if (d.requestStatus && d.requestStatus.result) p.res(d.responseData || {}); else p.rej(new Error((d.requestStatus && d.requestStatus.comment) || 'OBS could not do that'));
    } else if (j.op === 5 && this.o.event) {
      try { this.o.event(String(d.eventType || ''), d.eventData || {}); } catch (e) { /* a listener's slip */ }
    }
  }
  req(type, data, ms) {
    return new Promise((res, rej) => {
      const w = this.ws; if (!w || w.readyState !== 1 || this.st !== 'on') return rej(new Error('OBS is not connected'));
      const id = 'r' + (++this.n), t = setTimeout(() => { this.pend.delete(id); rej(new Error('OBS did not answer')); }, ms || 8000);
      this.pend.set(id, { res, rej, t });
      try { w.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data || {} } })); } catch (e) { clearTimeout(t); this.pend.delete(id); rej(e); }
    });
  }
}

module.exports = { ObsLink, sha };
