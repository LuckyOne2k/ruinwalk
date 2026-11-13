/* Konto: Registrierung, E-Mail-Bestätigung, Login, Sitzung, Logout, Passwort-Reset, Cloud-Plätze, Upload.
   Läuft gegen eine Attrappe der Supabase-Schnittstellen (tests/fake_supabase.js), ohne Netzwerk. */
const fake=require('../fake_supabase');
const PW='Gut#Pass1',PW2='Neu#Pass2';
const tap=(a,d)=>`(()=>{const b=document.createElement('button');b.dataset.a=${JSON.stringify(a)};Object.assign(b.dataset,${JSON.stringify(d||{})});document.body.appendChild(b);b.click();b.remove();})()`;
const open=async p=>{await p.evaluate(tap('acct'));};
const txt=p=>p.evaluate(()=>document.querySelector('#acct').innerText);
const waitTxt=(p,s)=>p.waitForFunction(s=>document.querySelector('#acct').innerText.includes(s),s,{timeout:5000}).catch(async()=>{throw new Error('Text fehlt: "'+s+'" – gefunden: '+(await txt(p)).replace(/\n/g,' | ').slice(0,300));});
const fill=async(p,o)=>{for(const [k,v] of Object.entries(o))await p.fill('#ac_'+k,v);};
const mk=async(T,{seed,query,srv,user=true}={})=>{const st=srv||fake();if(user)st.addUser('anna@test.de',PW,'Anna_1');
  const p=await T.page(seed||{lv:7,cls:'krieger',inv:{holz:3},name:'Held'},query,undefined,pg=>st.install(pg));return {p,st};};
const mkp=(T,seed,query,st)=>T.page(seed||{lv:7,cls:'krieger',inv:{holz:3},name:'Held'},query,undefined,pg=>st.install(pg));
const lsAll=p=>p.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('ruinwalk_v1')||k==='ruinwalk_slot').sort().map(k=>[k,localStorage.getItem(k)])));
const login=async(p,email='anna@test.de',pw=PW)=>{await open(p);await fill(p,{email,pw});await p.evaluate(tap('aclog'));};
const sessionLS=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('ruinwalk_auth')||'null'));

module.exports={
 'Registrierung: sendet Benutzername/E-Mail/Passwort nur mit Publishable Key, zeigt Hinweis zur Bestätigung, keine Sitzung':async(T,eq)=>{
  const {p,st}=await mk(T,{user:false});await open(p);await p.evaluate(tap('acv',{v:'register'}));
  await fill(p,{user:'Neu_Held',email:'neu@test.de',pw:PW,pw2:PW});await p.evaluate(tap('acreg'));
  await waitTxt(p,'Bestätigungslink');
  const c=st.calls.find(x=>x.path==='/auth/v1/signup');
  eq(c.body.email,'neu@test.de');eq(c.body.data,{username:'Neu_Held'});eq(c.h.apikey,st.KEY);eq(c.h.authorization,undefined);
  eq(/redirect_to=/.test(c.q),true);
  eq(await sessionLS(p),null);eq(st.mails.map(m=>m.type),['signup']);
  eq((await txt(p)).includes('Erst danach kannst du dich anmelden'),true);await p.context().close();},
 'Registrierung: Eingaben werden vor dem Absenden geprüft (Passwortregeln wie Supabase), ohne Serveraufruf':async(T,eq)=>{
  const {p,st}=await mk(T,{user:false});await open(p);await p.evaluate(tap('acv',{v:'register'}));
  const tryReg=async(o,s)=>{await fill(p,Object.assign({user:'Neu_Held',email:'neu@test.de',pw:PW,pw2:PW},o));await p.evaluate(tap('acreg'));await waitTxt(p,s);};
  await tryReg({pw:'Ab#1',pw2:'Ab#1'},'mindestens 8 Zeichen');
  await tryReg({pw:'abcdefg#1',pw2:'abcdefg#1'},'einen Großbuchstaben');
  await tryReg({pw:'ABCDEFG#1',pw2:'ABCDEFG#1'},'einen Kleinbuchstaben');
  await tryReg({pw:'Abcdefg#x',pw2:'Abcdefg#x'},'eine Ziffer');
  await tryReg({pw:'Abcdefg12',pw2:'Abcdefg12'},'ein Sonderzeichen');
  await tryReg({pw2:'Anders#1A'},'nicht gleich');
  await tryReg({email:'keine-mail'},'gültige E-Mail');
  await tryReg({user:'ab'},'Benutzername');
  await tryReg({user:'a b c'},'Benutzername');
  eq(st.calls.length,0,'es darf kein Netzwerkaufruf passiert sein');await p.context().close();},
 'Registrierung: vergebener Benutzername wird gemeldet, kein Konto angelegt':async(T,eq)=>{
  const {p,st}=await mk(T);await open(p);await p.evaluate(tap('acv',{v:'register'}));
  await fill(p,{user:'anna_1',email:'x@test.de',pw:PW,pw2:PW});await p.evaluate(tap('acreg'));
  await waitTxt(p,'schon vergeben');eq(st.calls.some(c=>c.path==='/auth/v1/signup'),false);await p.context().close();},
 'Registrierung: bereits registrierte E-Mail bekommt dieselbe neutrale Meldung (keine Preisgabe), kein zweites Konto':async(T,eq)=>{
  const {p,st}=await mk(T);await open(p);await p.evaluate(tap('acv',{v:'register'}));
  await fill(p,{user:'Anderer',email:'anna@test.de',pw:PW,pw2:PW});await p.evaluate(tap('acreg'));
  await waitTxt(p,'Bestätigungslink');eq(st.users.length,1);eq(await sessionLS(p),null);await p.context().close();},
 'Login vor E-Mail-Bestätigung: abgelehnt, verständliche Meldung, Mail erneut senden möglich, keine Sitzung':async(T,eq)=>{
  const {p,st}=await mk(T,{user:false});st.addUser('neu@test.de',PW,'Neu_1',false);
  await login(p,'neu@test.de');await waitTxt(p,'bestätige zuerst deine E-Mail');
  eq(await sessionLS(p),null);eq(await p.evaluate(()=>!!document.querySelector('[data-a=acres]')),true);
  await p.evaluate(tap('acres'));await waitTxt(p,'erneut gesendet');eq(st.mails.some(m=>m.type==='resend'),true);await p.context().close();},
 'Login: nach Bestätigung erfolgreich, Sitzung gespeichert, Benutzername und Cloud-Plätze werden geladen':async(T,eq)=>{
  const {p,st}=await mk(T,{user:false});st.addUser('neu@test.de',PW,'Neu_1',false);
  await login(p,'neu@test.de');await waitTxt(p,'bestätige');st.confirm('neu@test.de');
  await p.fill('#ac_pw',PW);await p.evaluate(tap('aclog'));
  await waitTxt(p,'Neu_1');await waitTxt(p,'Platz 3');
  const s=await sessionLS(p);eq(s.user.email,'neu@test.de');eq(typeof s.refresh_token,'string');
  eq(st.calls.some(c=>c.path==='/rest/v1/rpc/touch_login'),true);eq(st.calls.some(c=>c.path==='/rest/v1/rpc/list_characters'),true);
  eq((await txt(p)).includes('Angemeldet'),true);await p.context().close();},
 'Login: falsches Passwort und unbekannte E-Mail liefern dieselbe verständliche Meldung, keine Sitzung':async(T,eq)=>{
  const {p}=await mk(T);await login(p,'anna@test.de','Falsch#1x');await waitTxt(p,'E-Mail oder Passwort ist falsch');
  await p.fill('#ac_email','nobody@test.de');await p.fill('#ac_pw','Egal#1234');await p.evaluate(tap('aclog'));
  await waitTxt(p,'E-Mail oder Passwort ist falsch');eq(await sessionLS(p),null);await p.context().close();},
 'Login: Enter-Taste sendet das Formular ab':async(T,eq)=>{
  const {p}=await mk(T);await open(p);await fill(p,{email:'anna@test.de',pw:PW});await p.press('#ac_pw','Enter');
  await waitTxt(p,'Anna_1');await p.context().close();},
 'Login: ohne Verbindung verständliche Meldung, Spiel und Spielstand unberührt':async(T,eq)=>{
  const {p,st}=await mk(T);const before=await lsAll(p);st.offline=true;await login(p);await waitTxt(p,'Keine Verbindung');
  eq(await sessionLS(p),null);eq(await lsAll(p),before);eq(p.errors,[]);await p.context().close();},
 'Sitzung: bleibt nach Neuladen bestehen, Konto-Bildschirm zeigt sofort den angemeldeten Zustand':async(T,eq)=>{
  const {p,st}=await mk(T);await login(p);await waitTxt(p,'Anna_1');
  await p.reload();await p.waitForFunction(()=>window.__RW);
  eq((await sessionLS(p)).user.email,'anna@test.de');await open(p);await waitTxt(p,'Anna_1');
  eq(st.calls.filter(c=>c.path==='/auth/v1/token'&&c.q.includes('password')).length,1,'kein zweites Passwort-Login nötig');await p.context().close();},
 'Sitzung: abgelaufener Zugangstoken wird automatisch mit dem Refresh-Token erneuert':async(T,eq)=>{
  const {p,st}=await mk(T);await login(p);await waitTxt(p,'Anna_1');const old=(await sessionLS(p)).refresh_token;
  st.expireAccess();await p.evaluate(tap('acref'));await waitTxt(p,'Platz 3');
  const s=await sessionLS(p);eq(s.refresh_token!==old,true,'Token rotiert');
  eq(st.calls.some(c=>c.q.includes('refresh_token')),true);eq((await txt(p)).includes('Anna_1'),true);await p.context().close();},
 'Sitzung: veraltete Zugangsdaten (exp in der Vergangenheit) lösen vor dem Aufruf eine Erneuerung aus':async(T,eq)=>{
  const {p,st}=await mk(T);await login(p);await waitTxt(p,'Anna_1');
  await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('ruinwalk_auth'));s.exp=Date.now()-1000;localStorage.setItem('ruinwalk_auth',JSON.stringify(s));});
  await p.reload();await p.waitForFunction(()=>window.__RW);await open(p);await waitTxt(p,'Platz 3');
  eq(st.calls.some(c=>c.q.includes('refresh_token')),true);await p.context().close();},
 'Sitzung: ungültiger Refresh-Token beendet die Sitzung mit Hinweis, lokaler Spielstand bleibt unverändert':async(T,eq)=>{
  const {p,st}=await mk(T);await login(p);await waitTxt(p,'Anna_1');const before=await lsAll(p);
  st.expireAccess();st.refresh={};await p.evaluate(tap('acref'));await waitTxt(p,'Sitzung ist abgelaufen');
  eq(await sessionLS(p),null);eq(await lsAll(p),before);eq(await p.evaluate(()=>!!document.querySelector('#ac_email')),true);await p.context().close();},
 'Logout: Sitzung lokal und serverseitig beendet, Spielstand und Upload-Markierungen bleiben':async(T,eq)=>{
  const {p,st}=await mk(T);await login(p);await waitTxt(p,'Anna_1');await p.evaluate(()=>localStorage.setItem('ruinwalk_cloudmap','{"x:y":{"cloudId":"z","slot":1,"t":1}}'));
  const before=await lsAll(p);await p.evaluate(tap('aclogout'));await waitTxt(p,'abgemeldet');
  eq(await sessionLS(p),null);eq(await lsAll(p),before);eq(await p.evaluate(()=>localStorage.getItem('ruinwalk_cloudmap')!==null),true);
  await p.waitForFunction(()=>true);eq(st.calls.some(c=>c.path==='/auth/v1/logout'),true);eq(Object.keys(st.tokens).length,0);await p.context().close();},
 'Passwort vergessen: Link wird angefordert, Meldung ist für bekannte und unbekannte Adressen gleich':async(T,eq)=>{
  const {p,st}=await mk(T);await open(p);await p.evaluate(tap('acv',{v:'forgot'}));
  await fill(p,{email:'anna@test.de'});await p.evaluate(tap('acfor'));await waitTxt(p,'Wenn zu dieser Adresse ein Konto existiert');
  const a=await txt(p);await p.evaluate(tap('acv',{v:'forgot'}));await fill(p,{email:'niemand@test.de'});await p.evaluate(tap('acfor'));await waitTxt(p,'Wenn zu dieser Adresse');
  eq(a.includes('niemand'),false);eq(st.mails.filter(m=>m.type==='recover').length,2);
  await p.evaluate(tap('acv',{v:'forgot'}));await fill(p,{email:'kaputt'});await p.evaluate(tap('acfor'));await waitTxt(p,'gültige E-Mail');await p.context().close();},
 'Passwort-Reset: Link aus der Mail öffnet das Formular, Token verschwindet aus der Adresszeile, neues Passwort wird geprüft und gesetzt':async(T,eq)=>{
  const st=fake();const u=st.addUser('anna@test.de',PW,'Anna_1');const at='at-rec',rt='rt-rec';st.tokens[at]=u.id;st.refresh[rt]=u.id;
  const p=await mkp(T,{lv:2},'#access_token='+at+'&refresh_token='+rt+'&expires_in=3600&token_type=bearer&type=recovery',st);
  await waitTxt(p,'neues Passwort');eq(await p.evaluate(()=>location.hash),'');
  await fill(p,{pw:'schwach',pw2:'schwach'});await p.evaluate(tap('acrst'));await waitTxt(p,'braucht noch');
  await fill(p,{pw:PW,pw2:PW});await p.evaluate(tap('acrst'));await waitTxt(p,'vom alten unterscheiden');
  await fill(p,{pw:PW2,pw2:PW2});await p.evaluate(tap('acrst'));await waitTxt(p,'Passwort wurde geändert');await waitTxt(p,'Anna_1');
  eq(u.password,PW2);eq((await sessionLS(p)).user.email,'anna@test.de');
  await p.evaluate(tap('aclogout'));await login(p,'anna@test.de',PW2);await waitTxt(p,'Anna_1');await p.context().close();},
 'Passwort-Reset: abgelaufener oder ungültiger Link zeigt eine verständliche Meldung':async(T,eq)=>{
  const st=fake();st.addUser('anna@test.de',PW,'Anna_1');
  const p=await mkp(T,{lv:2},'#error=access_denied&error_code=otp_expired&error_description=expired',st);
  await waitTxt(p,'abgelaufen');eq(await p.evaluate(()=>location.hash),'');
  const p2=await mkp(T,{lv:2},'#access_token=boese&refresh_token=x&type=recovery',st);await waitTxt(p2,'ungültig');eq(await sessionLS(p2),null);
  await p.context().close();await p2.context().close();},
 'E-Mail-Bestätigungslink: meldet an, aber nur bei bestätigtem Konto':async(T,eq)=>{
  const st=fake();const u=st.addUser('anna@test.de',PW,'Anna_1',true);st.tokens['at-c']=u.id;st.refresh['rt-c']=u.id;
  const p=await mkp(T,{lv:2},'#access_token=at-c&refresh_token=rt-c&expires_in=3600&token_type=bearer&type=signup',st);
  await waitTxt(p,'E-Mail bestätigt');await waitTxt(p,'Anna_1');eq((await sessionLS(p)).user.id,u.id);
  const st2=fake();const u2=st2.addUser('b@test.de',PW,'B_1',false);st2.tokens['at-d']=u2.id;
  const p2=await mkp(T,{lv:2},'#access_token=at-d&refresh_token=rt-d&type=signup',st2);await waitTxt(p2,'bestätige zuerst');eq(await sessionLS(p2),null);
  await p.context().close();await p2.context().close();},
 'Cloud-Plätze: drei Plätze mit unveränderten Regeln, Platz 3 gesperrt ohne Kauffunktion, gesperrter Cloud-Charakter markiert':async(T,eq)=>{
  const {p,st}=await mk(T);const u=st.users[0];st.chars.push({id:'c0000000-0000-4000-8000-000000000001',account:u.id,slot:3,name:'Alt<b>X</b>',cls:'krieger',level:12,version:2,locked:true});
  await login(p);await waitTxt(p,'Platz 3');
  const t=await txt(p);eq(t.includes('Platz 1 · Kostenlos')&&t.includes('Platz 2 · Kostenlos')&&t.includes('Platz 3 · Premium'),true);
  eq(t.includes('Gesperrt, solange keine gültige Berechtigung'),true);eq(/kaufen|bezahl|freischalten\s*\n/i.test(t.replace('später einmalig freigeschaltet','')),false);
  eq(await p.evaluate(()=>[...document.querySelectorAll('#acct [data-a]')].map(b=>b.dataset.a).filter(a=>a==='acup').length),2,'Upload nur für Platz 1 und 2');
  eq(await p.evaluate(()=>document.querySelector('#acct b b')===null&&!!document.querySelector('#acct').innerHTML.includes('Alt&lt;b&gt;X&lt;/b&gt;')),true,'Namen werden escaped');await p.context().close();},
 'Upload: Kopie wird erst nach Serverbestätigung markiert, lokaler Spielstand bleibt byte-identisch':async(T,eq)=>{
  const {p,st}=await mk(T);await login(p);await waitTxt(p,'Platz 3');await p.evaluate(()=>__RW.save());const before=await lsAll(p);
  await p.evaluate(tap('acup',{slot:1}));await waitTxt(p,'in die Cloud kopiert');
  const c=st.calls.find(x=>x.path==='/rest/v1/rpc/create_character');eq(c.body.p_slot,1);eq(c.body.p_name,'Held');eq(c.body.p_data.inv,{holz:3});eq(c.body.p_data.lv,7);
  eq(c.h.authorization.startsWith('Bearer at-'),true);eq(st.chars.length,1);
  const after=await lsAll(p);eq(after,before);
  const map=await p.evaluate(()=>JSON.parse(localStorage.getItem('ruinwalk_cloudmap')));eq(Object.values(map)[0].cloudId,st.chars[0].id);eq(Object.values(map)[0].slot,1);
  eq(await p.evaluate(()=>document.querySelectorAll('#acct [data-a=acup]').length),0,'der einzige lokale Charakter ist bereits oben, kein weiteres Angebot');
  eq(await p.evaluate(()=>!document.querySelector('#acsel2')),true,'bereits hochgeladener Charakter wird nicht erneut angeboten');await p.context().close();},
 'Upload: Serverfehler lässt den lokalen Spielstand unverändert und markiert nichts':async(T,eq)=>{
  const {p,st}=await mk(T);await login(p);await waitTxt(p,'Platz 3');await p.evaluate(()=>__RW.save());const before=await lsAll(p);
  st.failCreate=500;await p.evaluate(tap('acup',{slot:1}));await waitTxt(p,'abgelehnt');
  eq(await lsAll(p),before);eq(await p.evaluate(()=>localStorage.getItem('ruinwalk_cloudmap')),null);eq(st.chars.length,0);
  st.failCreate=0;st.offline=true;await p.evaluate(tap('acup',{slot:1}));await waitTxt(p,'nicht erreichbar');eq(await lsAll(p),before);eq(await p.evaluate(()=>localStorage.getItem('ruinwalk_cloudmap')),null);
  eq(p.errors,[]);await p.context().close();},
 'Upload: bleibt eine Bestätigung des Servers aus, wird der Charakter nicht als hochgeladen markiert':async(T,eq)=>{
  const {p,st}=await mk(T);await login(p);await waitTxt(p,'Platz 3');await p.evaluate(()=>__RW.save());const before=await lsAll(p);
  let n=0;st.afterList=null;const orig=st.failList;
  await p.route(/rest\/v1\/rpc\/list_characters/,async r=>{n++;await r.fulfill({status:500,contentType:'application/json',body:'{"message":"x"}'});});
  await p.evaluate(tap('acup',{slot:1}));await waitTxt(p,'nicht bestätigt');
  eq(await p.evaluate(()=>localStorage.getItem('ruinwalk_cloudmap')),null);eq(await lsAll(p),before);void orig;await p.context().close();},
 'Upload: zwischenzeitlich belegter Cloud-Platz wird gemeldet, nichts wird überschrieben':async(T,eq)=>{
  const {p,st}=await mk(T);await login(p);await waitTxt(p,'Platz 3');const u=st.users[0];
  st.chars.push({id:'c0000000-0000-4000-8000-000000000009',account:u.id,slot:1,name:'Fremdgerät',cls:'jaeger',level:3,version:4});
  await p.evaluate(tap('acup',{slot:1}));await waitTxt(p,'schon belegt');
  eq(st.chars.length,1);eq(st.chars[0].name,'Fremdgerät');eq(await p.evaluate(()=>localStorage.getItem('ruinwalk_cloudmap')),null);await p.context().close();},
 'Upload: der aktive und andere lokale Charaktere sind wählbar, jeder wird nur gelesen':async(T,eq)=>{
  const {p,st}=await mk(T);
  await p.evaluate(()=>{const c=__RW.sanitize(Object.assign(__RW.def(),{name:'Zweiter',lv:4,created:1,last:1}));localStorage.setItem('ruinwalk_v1_s2',JSON.stringify(c));});
  await login(p);await waitTxt(p,'Platz 3');await p.evaluate(()=>__RW.save());const before=await lsAll(p);
  eq(await p.evaluate(()=>[...document.querySelectorAll('#acsel1 option')].map(o=>o.textContent)),['Platz 1: Held (Level 7)','Platz 2: Zweiter (Level 4)']);
  await p.selectOption('#acsel2','2');await p.evaluate(tap('acup',{slot:2}));await waitTxt(p,'Zweiter');
  eq(st.chars[0].name,'Zweiter');eq(st.chars[0].slot,2);eq(await lsAll(p),before);await p.context().close();},
 'Ohne Verbindung zu Supabase startet das Spiel normal, Konto-Bildschirm bleibt bedienbar':async(T,eq)=>{
  const {p,st}=await mk(T);st.offline=true;await open(p);
  eq((await txt(p)).includes('Anmelden'),true);eq(p.errors,[]);
  eq(await p.evaluate(()=>__RW.S.lv),7);await p.context().close();},
 'Sicherheit: kein service_role-Schlüssel im Code, alle Aufrufe nur mit Publishable Key bzw. Nutzer-Token':async(T,eq)=>{
  const fs=require('fs'),src=fs.readFileSync(require('path').join(__dirname,'..','..','index.html'),'utf8');
  eq(/service_role|SERVICE_ROLE|postgres:\/\/|db_password|eyJhbGciOi/i.test(src),false,'verbotene Geheimnisse im Quelltext');
  const {p,st}=await mk(T);await login(p);await waitTxt(p,'Platz 3');await p.evaluate(tap('acup',{slot:1}));await waitTxt(p,'kopiert');
  for(const c of st.calls){eq(c.h.apikey,st.KEY,c.path);eq(String(c.h.authorization||'').includes('sb_publishable'),false,'Publishable Key nie als Bearer: '+c.path);}
  await p.context().close();},
 'Lokale Spielstände: Anmelden, Abmelden und Konto-Aktionen verändern keinen Spielstand-Schlüssel':async(T,eq)=>{
  const {p}=await mk(T);await p.evaluate(()=>__RW.save());const before=await lsAll(p);
  await login(p);await waitTxt(p,'Anna_1');await p.evaluate(tap('acref'));await waitTxt(p,'Platz 3');await p.evaluate(tap('aclogout'));await waitTxt(p,'abgemeldet');
  eq(await lsAll(p),before);await p.context().close();},
};
