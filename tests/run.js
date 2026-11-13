/* Aufruf: node tests/run.js   (oder: npm test) */
const H=require('./harness');
const files=['save','gear','craft','combat','world','gps','ui','status','chars','session'];
let pass=0,fail=0;const failed=[];
(async()=>{
  const {srv,url}=await H.serve(),browser=await H.launch();
  const T={browser,url,page:(seed,q)=>H.page(browser,url,seed,q)};
  for(const f of files){
    const tests=require('./cases/'+f+'.js');
    console.log('\n## '+f);
    for(const [name,fn] of Object.entries(tests)){
      try{await fn(T,eq);pass++;console.log('  ✓ '+name);}
      catch(e){fail++;failed.push(f+': '+name);console.log('  ✗ '+name+'\n      '+String(e.message).split('\n')[0]);}
    }
  }
  await browser.close();srv.close();
  console.log('\n'+pass+' bestanden, '+fail+' fehlgeschlagen');
  if(fail){console.log(failed.map(x=>' - '+x).join('\n'));process.exit(1);}
})();
const norm=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort()):x);
function eq(a,b,msg){if(norm(a)!==norm(b))throw new Error((msg||'Erwartet')+': '+norm(a)+' !== '+norm(b));}
