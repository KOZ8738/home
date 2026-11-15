/* The staff admin page (dark palette = the Polaris website tokens.css) (served on /admin, behind Cloudflare Access). One file, no build step. */
export const ADMIN_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Polaris Mail · Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&family=Marcellus&display=swap" rel="stylesheet">
<script>try{const t=localStorage.getItem("pmTheme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}</script>
<style>
:root{color-scheme:light;--teal:#1A6772;--teal-d:#124C55;--accent:#1A6772;--mist:#E3E9E9;--bronze:#A78970;--ink:#0F2A2E;--label:#51696C;--line:#D5DEDE;--bg:#FFFFFF;--soft:#F5F8F8;--field:#FFFFFF;--off:#9aa8aa;--red:#B42828;--red-l:#e6c4c4;--green:#2C7A4B;--ok-bg:#E6F0E9;--err-bg:#F6E5E5;--q-bg:#F4ECE3;--q:#8A6744}
:root[data-theme=dark]{color-scheme:dark;--teal:#1A6772;--teal-d:#22808D;--accent:#7CC2C9;--mist:#222225;--bronze:#A78970;--ink:#E8E8E9;--label:#9C9CA1;--line:#2E2E32;--bg:#1A1A1C;--soft:#121213;--field:#222225;--off:#5C5C61;--red:#F2A3A3;--red-l:#4A2427;--green:#8FCFA6;--ok-bg:#1D2A23;--err-bg:#3A1C1E;--q-bg:#2E2A24;--q:#D9C2AD}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--teal:#1A6772;--teal-d:#22808D;--accent:#7CC2C9;--mist:#222225;--bronze:#A78970;--ink:#E8E8E9;--label:#9C9CA1;--line:#2E2E32;--bg:#1A1A1C;--soft:#121213;--field:#222225;--off:#5C5C61;--red:#F2A3A3;--red-l:#4A2427;--green:#8FCFA6;--ok-bg:#1D2A23;--err-bg:#3A1C1E;--q-bg:#2E2A24;--q:#D9C2AD}}
body,header,section,input,select,textarea,button,.preview{transition:background-color .25s,border-color .25s,color .25s}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--soft);color:var(--ink);font:15px/1.5 Jost,"Avenir Next","Segoe UI",system-ui,sans-serif}
header{background:var(--bg);border-bottom:1px solid var(--line);padding:14px 24px;display:flex;align-items:center;gap:14px}
header h1{font:400 22px Marcellus,Georgia,serif;margin:0;color:var(--accent)}header .who{margin-left:auto;color:var(--label);font-size:13px}
main{max-width:1180px;margin:0 auto;padding:24px;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:24px}
@media(max-width:900px){main{grid-template-columns:1fr}}
section{background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:20px}
h2{font:500 13px Jost;letter-spacing:.08em;text-transform:uppercase;color:var(--bronze);margin:0 0 14px}
label{display:block;font-weight:500;font-size:13px;color:var(--label);margin:14px 0 6px}
input[type=text],input[type=datetime-local],select,textarea{width:100%;font:inherit;color:var(--ink);background:var(--field);border:1px solid var(--line);border-radius:4px;padding:9px 11px}
input[type=file]{font:inherit;font-size:13.5px;color:var(--label)}input[type=file]::file-selector-button{font:500 13px Jost;border-radius:4px;border:1px solid var(--line);background:var(--field);color:var(--ink);padding:6px 12px;margin-right:10px;cursor:pointer}
::placeholder{color:var(--off)}
textarea{min-height:220px;resize:vertical;font-size:14.5px}input:focus,select:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:var(--accent)}
.row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.row>*{flex:1}
.radio{display:flex;gap:18px;flex-wrap:wrap;margin-top:4px}.radio label{display:flex;gap:7px;align-items:center;margin:0;font-weight:400;color:var(--ink)}
.radio label.off{color:var(--off)}
.hint{color:var(--label);font-size:12.5px;margin:6px 0 0}
button{font:500 14px Jost;border-radius:4px;border:1px solid var(--line);background:var(--field);color:var(--ink);padding:9px 16px;cursor:pointer}
button.primary{background:var(--teal);border-color:var(--teal);color:#fff}button.primary:hover{background:var(--teal-d)}
button.warn{color:var(--red);border-color:var(--red-l)}button:disabled{opacity:.5;cursor:default}
.actions{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
.preview{border:1px dashed var(--line);border-radius:4px;padding:14px 16px;margin-top:8px;background:var(--soft);min-height:60px}
.preview h4{margin:12px 0 4px;font-size:15px}.preview p{margin:0 0 10px}.preview ul{margin:0 0 10px;padding-left:20px}
.atts{list-style:none;padding:0;margin:8px 0 0}.atts li{display:flex;gap:10px;align-items:center;font-size:13.5px;padding:4px 0}.atts button{padding:2px 9px;font-size:12px}
.mail{border-top:1px solid var(--line);padding:12px 0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px}
.mail:first-of-type{border-top:0}.mail b{font-weight:600}.mail .meta{color:var(--label);font-size:12.5px}
.mail .btns{grid-row:1/3;grid-column:2;display:flex;gap:6px;align-items:start}.mail .btns button{padding:4px 10px;font-size:12.5px}
.tag{display:inline-block;font-size:11px;font-weight:600;letter-spacing:.05em;padding:1px 7px;border-radius:9px;margin-left:6px;vertical-align:1px}
.tag.s{background:var(--ok-bg);color:var(--green)}.tag.q{background:var(--q-bg);color:var(--q)}
.msg{margin-top:12px;padding:10px 12px;border-radius:4px;font-size:14px}.msg.ok{background:var(--ok-bg);color:var(--green)}.msg.err{background:var(--err-bg);color:var(--red)}
.deny{max-width:640px;margin:60px auto;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:24px;font-size:15px}
.empty{color:var(--label);font-size:14px}
.preview a{color:var(--accent)}
.thm{display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden}.thm button{border:0;border-radius:0;background:transparent;color:var(--label);padding:5px 9px;display:grid;place-items:center}.thm button+button{border-left:1px solid var(--line)}.thm button[aria-pressed=true]{background:var(--soft);color:var(--accent)}.thm svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
</style></head><body>
<header><h1>Polaris Mail</h1><span class="who" id="who"></span><div class="thm" role="group" aria-label="Appearance"><button data-thm="light" title="Light" aria-label="Light"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button><button data-thm="auto" title="Match system" aria-label="Match system"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg></button><button data-thm="dark" title="Dark" aria-label="Dark"><svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg></button></div></header>
<!--DENIED-->
<main id="app">
<section>
 <h2 id="formTitle">New message</h2>
 <label for="to">To</label>
 <div class="radio" id="to"><label><input type="radio" name="to" checked> All pilots</label><label class="off" title="Comes with pilot sign-in"><input type="radio" name="to" disabled> Specific pilots <span class="hint" style="margin:0">(after pilot sign-in)</span></label></div>
 <div class="row"><div><label for="from">From</label><input type="text" id="from" list="froms" maxlength="60" value="Crew Management"><datalist id="froms"><option>Crew Management</option><option>Flight Operations</option><option>Training</option><option>Polaris News</option><option>Fleet</option></datalist></div>
 <div><label for="when">Send</label><select id="when"><option value="now">Now</option><option value="later">At a set time</option></select></div></div>
 <div id="atRow" hidden><label for="at">Send at (your local time)</label><input type="datetime-local" id="at"></div>
 <label for="subject">Subject</label><input type="text" id="subject" maxlength="160">
 <label for="body">Message</label><textarea id="body" maxlength="20000" placeholder="Dear Polaris pilots,&#10;&#10;**Bold**, *italic*, a line starting with - for a list, ## for a heading, links as [text](https://…)."></textarea>
 <label>Preview</label><div class="preview" id="preview"><span class="empty">The message as pilots will see it.</span></div>
 <label for="file">Attachments <span class="hint" style="margin:0">PDF, PNG, JPG, WebP or text · up to 5 files, 5 MB each</span></label>
 <input type="file" id="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,text/plain"><ul class="atts" id="atts"></ul>
 <div class="actions"><button class="primary" id="send">Send to all pilots</button><button id="cancel" hidden>Cancel editing</button></div>
 <div id="msg"></div>
 <p class="hint">Until pilot sign-in comes, the Mail app is open to anyone who opens the EFB: don't put anything private in a message.</p>
</section>
<section><h2>Sent and scheduled</h2><div id="list"><span class="empty">Loading…</span></div></section>
</main>
<script>
const $=s=>document.querySelector(s),esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/* the same light markup the EFB renders */
function md(t){const L=esc(t).split("\\n"),out=[];let ul=false,para=[];const inl=s=>s.replace(/\\*\\*(.+?)\\*\\*/g,"<b>$1</b>").replace(/(^|[^*])\\*(?!\\s)(.+?)\\*/g,"$1<i>$2</i>").replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
 const flush=()=>{if(para.length){out.push("<p>"+para.map(inl).join("<br>")+"</p>");para=[]}};
 for(const l of L){if(/^\\s*[-•]\\s+/.test(l)){flush();if(!ul){out.push("<ul>");ul=true}out.push("<li>"+inl(l.replace(/^\\s*[-•]\\s+/,""))+"</li>");continue}if(ul){out.push("</ul>");ul=false}
  if(/^##\\s+/.test(l)){flush();out.push("<h4>"+inl(l.replace(/^##\\s+/,""))+"</h4>")}else if(!l.trim())flush();else para.push(l)}
 flush();if(ul)out.push("</ul>");return out.join("")}
function thmUi(){let t="auto";try{t=localStorage.getItem("pmTheme")||"auto"}catch(e){}document.querySelectorAll("[data-thm]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.thm===t)))}
document.addEventListener("click",e=>{const b=e.target.closest("[data-thm]");if(!b)return;const t=b.dataset.thm;try{t==="auto"?localStorage.removeItem("pmTheme"):localStorage.setItem("pmTheme",t)}catch(x){}if(t==="auto")delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=t;thmUi()});
thmUi();
let S={mails:[],edit:null,keep:[],add:[]};
const api=async(path,opt)=>{const r=await fetch(path,{credentials:"same-origin",...(opt||{})});let j=null;try{j=await r.json()}catch(e){}if(!r.ok)throw new Error((j&&j.error)||("HTTP "+r.status));return j};
const say=(t,ok)=>{$("#msg").innerHTML=t?'<div class="msg '+(ok?"ok":"err")+'">'+esc(t)+"</div>":""};
const fmt=ms=>new Date(ms).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})+" · "+new Date(ms).toISOString().slice(11,16)+"Z";
const kb=n=>n>1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB";
function attsUi(){const old=S.edit?(S.mails.find(m=>m.id===S.edit)||{}).att||[]:[];
 $("#atts").innerHTML=old.filter(a=>S.keep.includes(a.n)).map(a=>'<li>📎 '+esc(a.name)+' <span class="hint" style="margin:0">'+kb(a.size)+'</span><button data-rmk="'+a.n+'">Remove</button></li>').join("")+S.add.map((f,i)=>'<li>📎 '+esc(f.name)+' <span class="hint" style="margin:0">'+kb(f.size)+' · new</span><button data-rma="'+i+'">Remove</button></li>').join("")}
function preview(){const b=$("#body").value;$("#preview").innerHTML=b.trim()?"<h4 style='margin-top:0'>"+esc($("#subject").value||"(no subject)")+"</h4><div class='hint' style='margin:-2px 0 10px'>From "+esc($("#from").value||"…")+" · To all Polaris pilots</div>"+md(b):'<span class="empty">The message as pilots will see it.</span>'}
function listUi(){const now=Date.now();$("#list").innerHTML=S.mails.length?S.mails.map(m=>{const q=m.sendAt>now;return '<div class="mail"><div><b>'+esc(m.subject)+'</b><span class="tag '+(q?"q":"s")+'">'+(q?"SCHEDULED":"SENT")+'</span></div><div class="meta">'+esc(m.from)+" · "+(q?"goes out ":"")+fmt(m.sendAt)+(m.att.length?" · 📎 "+m.att.length:"")+(m.by?" · by "+esc(m.by):"")+(m.edited?" · edited":"")+'</div><div class="btns"><button data-edit="'+m.id+'">Edit</button><button class="warn" data-del="'+m.id+'">Delete</button></div></div>'}).join(""):'<span class="empty">No mail yet.</span>'}
async function load(){try{const j=await api("/admin/api/mail");S.mails=j.mails;listUi()}catch(e){$("#list").innerHTML='<div class="msg err">'+esc(e.message)+"</div>"}}
function reset(){S.edit=null;S.keep=[];S.add=[];$("#formTitle").textContent="New message";$("#send").textContent="Send to all pilots";$("#cancel").hidden=true;["subject","body"].forEach(i=>$("#"+i).value="");$("#from").value="Crew Management";$("#when").value="now";$("#atRow").hidden=true;$("#file").value="";attsUi();preview()}
const localInput=ms=>{const d=new Date(ms-new Date(ms).getTimezoneOffset()*60000);return d.toISOString().slice(0,16)};
document.addEventListener("click",async e=>{const t=e.target.closest("button");if(!t)return;
 if(t.dataset.rmk!=null){S.keep=S.keep.filter(n=>n!==+t.dataset.rmk);attsUi()}
 else if(t.dataset.rma!=null){S.add.splice(+t.dataset.rma,1);attsUi()}
 else if(t.dataset.edit){const m=S.mails.find(x=>x.id===t.dataset.edit);if(!m)return;S.edit=m.id;S.keep=m.att.map(a=>a.n);S.add=[];$("#from").value=m.from;$("#subject").value=m.subject;$("#body").value=m.body;
  const q=m.sendAt>Date.now();$("#when").value=q?"later":"now";$("#atRow").hidden=!q;if(q)$("#at").value=localInput(m.sendAt);$("#formTitle").textContent="Edit message";$("#send").textContent=q?"Save changes":"Save changes (already sent)";$("#cancel").hidden=false;attsUi();preview();say("");scrollTo({top:0,behavior:"smooth"})}
 else if(t.dataset.del){const m=S.mails.find(x=>x.id===t.dataset.del);if(!m||!confirm('Delete "'+m.subject+'"? Pilots will no longer see it.'))return;try{await api("/admin/api/mail?id="+encodeURIComponent(m.id),{method:"DELETE"});if(S.edit===m.id)reset();say("Deleted.",true);load()}catch(er){say(er.message)}}
 else if(t.id==="cancel"){reset();say("")}
 else if(t.id==="send"){const body={id:S.edit||undefined,from:$("#from").value,subject:$("#subject").value,body:$("#body").value,keepAtt:S.keep,newAtt:S.add.map(f=>({name:f.name,type:f.type,data:f.data}))};
  if($("#when").value==="later"){if(!$("#at").value){say("Pick when it goes out.");return}body.sendAt=new Date($("#at").value).toISOString()}
  t.disabled=true;try{await api("/admin/api/mail",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const was=S.edit,later=body.sendAt&&Date.parse(body.sendAt)>Date.now();reset();say(was?"Saved.":later?"Scheduled.":"Sent to all pilots.",true);load()}catch(er){say(er.message)}finally{t.disabled=false}}});
$("#when").addEventListener("change",()=>{$("#atRow").hidden=$("#when").value!=="later"});
["subject","body","from"].forEach(i=>$("#"+i).addEventListener("input",preview));
$("#file").addEventListener("change",async e=>{for(const f of e.target.files){if(f.size>5242880){say(f.name+" is larger than 5 MB.");continue}
 const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]);r.onerror=rej;r.readAsDataURL(f)});S.add.push({name:f.name,type:f.type||"application/octet-stream",size:f.size,data})}e.target.value="";attsUi()});
if(!document.querySelector(".deny")){api("/admin/api/me").then(j=>{$("#who").textContent="Signed in as "+j.email}).catch(()=>{});load();preview()}else $("#app").hidden=true;
</script></body></html>`;
