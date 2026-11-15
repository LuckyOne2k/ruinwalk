/* Attrappe der Supabase-Schnittstellen (Auth + die genutzten Datenbankfunktionen) für die Authentifizierungstests.
   Bildet das Verhalten des echten Projekts nach (Fehlercodes wie GoTrue/PostgREST), ohne Netzwerk. */
const KEY='sb_publishable_jmyPWZWX99qemJRyGh7Beg_lVDaNj4t';
const SYM='!@#$%^&*()_+-=[]{};\':"\\|<>?,./`~';
module.exports=function fake(){
  const st={users:[],tokens:{},refresh:{},chars:[],calls:[],mails:[],n:0,offline:false,failCreate:0,failList:false,failGet:false,saveFail:null,dropResponse:false,saves:[],moves:[],tamper:null,afterList:null,keyOk:true};
  const uid=()=>'00000000-0000-4000-8000-'+String(++st.n).padStart(12,'0');
  const J=(route,status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  const user=u=>({id:u.id,email:u.email,email_confirmed_at:u.confirmed?'2026-11-13T10:00:00Z':null,user_metadata:{username:u.username}});
  const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const issue=u=>{const n=++st.n,at='at-'+b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:u.id,role:'authenticated',session_id:'s'+n,amr:[{method:st.amrMethod||'password',timestamp:Math.floor(Date.now()/1000)}]})+'.sig'+n,rt='rt-'+n;st.tokens[at]=u.id;st.refresh[rt]=u.id;return {access_token:at,refresh_token:rt,expires_in:3600,token_type:'bearer',user:user(u)};};
  const who=h=>{const m=/^Bearer (.+)$/.exec(h.authorization||'');return m&&st.tokens[m[1]]?st.users.find(u=>u.id===st.tokens[m[1]]):null;};
  const strong=p=>p.length>=8&&/[a-z]/.test(p)&&/[A-Z]/.test(p)&&/[0-9]/.test(p)&&[...p].some(c=>SYM.includes(c));
  const rows=u=>st.chars.filter(c=>c.account===u.id).sort((a,b)=>a.slot-b.slot).map(c=>({character_id:c.id,slot_number:c.slot,character_name:c.name,character_class:c.cls||'wanderer',level:c.level||1,version:c.version,last_played:null,locked:!!c.locked}));
  st.install=async page=>page.route(/\.supabase\.co/,async route=>{
    const req=route.request(),url=new URL(req.url()),h=req.headers(),path=url.pathname,m=req.method();
    let body={};try{body=JSON.parse(req.postData()||'{}');}catch(e){}
    st.calls.push({m,path,q:url.search,h,body});
    if(st.offline)return route.abort();
    if(h.apikey!==KEY)return J(route,401,{message:'Invalid API key'});
    if(path==='/auth/v1/signup'){
      if(!/^[A-Za-z0-9_]{3,20}$/.test((body.data||{}).username||''))return J(route,500,{error_code:'unexpected_failure',msg:'Database error saving new user'});
      if(!strong(body.password||''))return J(route,422,{error_code:'weak_password',msg:'Password should be stronger'});
      let u=st.users.find(x=>x.email===body.email);
      if(!u){u={id:uid(),email:body.email,password:body.password,username:body.data.username,confirmed:false};st.users.push(u);st.mails.push({type:'signup',email:u.email});}
      return J(route,200,user(u));            // existierende Adresse: gleiche Antwort (keine Preisgabe)
    }
    if(path==='/auth/v1/resend'){st.mails.push({type:'resend',email:body.email});return J(route,200,{});}
    if(path==='/auth/v1/recover'){st.mails.push({type:'recover',email:body.email});return J(route,200,{});}
    if(path==='/auth/v1/token'&&url.searchParams.get('grant_type')==='password'){
      const u=st.users.find(x=>x.email===body.email&&x.password===body.password);
      if(!u)return J(route,400,{error_code:'invalid_credentials',msg:'Invalid login credentials'});
      if(!u.confirmed)return J(route,400,{error_code:'email_not_confirmed',msg:'Email not confirmed'});
      return J(route,200,issue(u));}
    if(path==='/auth/v1/token'&&url.searchParams.get('grant_type')==='refresh_token'){
      if(st.failRefresh==='net')return route.abort();if(st.failRefresh)return J(route,st.failRefresh,{});
      const id=st.refresh[body.refresh_token];if(!id)return J(route,400,{error_code:'refresh_token_not_found',msg:'Invalid Refresh Token'});
      delete st.refresh[body.refresh_token];return J(route,200,issue(st.users.find(u=>u.id===id)));}
    if(path==='/auth/v1/logout'){const m2=/^Bearer (.+)$/.exec(h.authorization||'');if(m2)delete st.tokens[m2[1]];return route.fulfill({status:204});}
    if(path==='/auth/v1/user'&&m==='GET'){const u=who(h);if(u)return J(route,200,user(u));const tk=/^Bearer (.+)$/.exec(h.authorization||'');return tk&&st.tokens[tk[1]]?J(route,403,{error_code:'user_not_found',msg:'User from sub claim in JWT does not exist'}):J(route,401,{error_code:'bad_jwt',msg:'invalid JWT'});}
    if(path==='/auth/v1/user'&&m==='PUT'){const u=who(h);if(!u)return J(route,401,{error_code:'bad_jwt',msg:'invalid JWT'});
      if(!strong(body.password||''))return J(route,422,{error_code:'weak_password',msg:'weak'});
      if(body.password===u.password)return J(route,422,{error_code:'same_password',msg:'same'});
      u.password=body.password;return J(route,200,user(u));}
    if(path==='/rest/v1/rpc/username_available')return J(route,200,/^[A-Za-z0-9_]{3,20}$/.test(body.p_name)&&!st.users.some(u=>u.username.toLowerCase()===String(body.p_name).toLowerCase()));
    const u=who(h);
    if(path==='/rest/v1/rpc/delete_account'){st.delCalls=(st.delCalls||0)+1;
      if(!u)return J(route,401,{code:'PGRST301',message:'JWT expired'});
      const o=st.del||{};if(o.mode==='net_before')return route.abort();
      if(o.mode==='reauth')return J(route,403,{code:'PT403',message:'reauth_required'});
      if(o.mode==='500')return J(route,500,{message:'boom'});
      if(String(body.p_confirm).toLowerCase()!==u.username.toLowerCase())return J(route,400,{code:'22023',message:'confirm_mismatch'});
      st.users=st.users.filter(x=>x.id!==u.id);st.chars=st.chars.filter(c=>c.account!==u.id);
      if(o.mode==='net_after')return route.abort();
      return route.fulfill({status:204});}
    if(path.startsWith('/rest/v1/')&&!u)return J(route,401,{code:'PGRST301',message:'JWT expired'});
    if(path==='/rest/v1/rpc/touch_login')return route.fulfill({status:204});
    if(path==='/rest/v1/profiles')return J(route,200,[{account_id:u.id,username:u.username,created_at:'2026-11-13T10:00:00Z'}]);
    if(path==='/rest/v1/account_entitlements')return J(route,200,[]);
    if(path==='/rest/v1/rpc/list_characters'){
      if(st.failList)return J(route,500,{message:'boom'});
      const out=rows(u);if(st.afterList){const f=st.afterList;st.afterList=null;f(u);}return J(route,200,out);}
    if(path==='/rest/v1/characters'&&m==='GET'){
      if(st.failGet)return J(route,500,{message:'boom'});
      const id=(/^eq\.(.+)$/.exec(url.searchParams.get('character_id')||'')||[])[1];
      if(!id&&!url.searchParams.get('character_id'))return J(route,200,st.chars.filter(c=>c.account===u.id&&!c.locked).map(c=>({character_id:c.id,slot_number:c.slot,character_name:c.name,level:c.level,character_data:c.data,version:c.version})));
      let out=st.chars.filter(c=>c.id===id&&c.account===u.id&&!c.locked).map(c=>({character_id:c.id,account_id:c.account,slot_number:c.slot,character_name:c.name,version:c.version,character_data:c.data}));
      if(st.tamper)out=st.tamper(out);return J(route,200,out);}
    if(path==='/rest/v1/rpc/save_character'){
      st.saves.push({t:Date.now(),body});
      if(st.saveFail){const sf=st.saveFail;if(sf==='net')return route.abort();return J(route,sf,{message:'boom'});}
      const c=st.chars.find(x=>x.id===body.p_id&&x.account===u.id);
      if(!c)return J(route,409,{code:'PT409',message:'version_conflict'});
      if(c.slot===3&&c.locked)return J(route,403,{code:'PT403',message:'character_locked'});
      if(!body.p_data||typeof body.p_data!=='object'||!Object.keys(body.p_data).length)return J(route,400,{code:'22023',message:'invalid_data'});
      if(c.version!==body.p_expected_version)return J(route,409,{code:'PT409',message:'version_conflict'});
      c.data=Object.assign({},body.p_data,{cid:c.id});c.version++;c.level=body.p_data.lv;
      if(st.dropResponse){st.dropResponse=false;return route.abort();}
      return J(route,200,c.version);}
    if(path==='/rest/v1/rpc/move_character'){
      st.moves.push(body);
      const c=st.chars.find(x=>x.id===body.p_id&&x.account===u.id);
      if(!c)return J(route,404,{code:'PT404',message:'not_found'});
      if(![1,2].includes(body.p_target))return J(route,400,{code:'22023',message:'invalid_slot'});
      if(c.slot!==3)return J(route,400,{code:'22023',message:'move_not_allowed'});
      if(st.chars.some(x=>x.account===u.id&&x.slot===body.p_target))return J(route,409,{code:'PT409',message:'slot_occupied'});
      c.slot=body.p_target;c.version++;c.locked=false;return J(route,200,c.version);}
    if(path==='/rest/v1/rpc/create_character'){
      if(st.failCreate)return J(route,st.failCreate,{message:'boom'});
      if(!u.confirmed)return J(route,403,{code:'PT403',message:'email_not_verified'});
      if(st.chars.some(c=>c.account===u.id&&c.slot===body.p_slot))return J(route,409,{code:'23505',message:'duplicate key value violates unique constraint'});
      const c={id:uid(),account:u.id,slot:body.p_slot,name:body.p_name,data:body.p_data,cls:body.p_data.cls,level:body.p_data.lv,version:1};
      st.chars.push(c);return J(route,200,[{character_id:c.id,version:1}]);}
    return J(route,404,{message:'unbekannt '+path});
  });
  st.confirm=email=>{st.users.find(u=>u.email===email).confirmed=true;};
  st.addUser=(email,password,username,confirmed=true)=>{const u={id:uid(),email,password,username,confirmed};st.users.push(u);return u;};
  st.expireAccess=()=>{st.tokens={};};
  st.KEY=KEY;
  return st;
};
