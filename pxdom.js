/* ---------- Browser: Emojis im Spiel automatisch durch die Pixelbilder ersetzen ---------- */
const PX_NORM=s=>s.replace(/️/g,'');
let PX_KEYS={},PX_RE=null;
function pxBuild(){PX_KEYS={};for(const k of Object.keys(PX_SPR).concat(Object.keys(PX_ALIAS),Object.keys(PX_SPR32),Object.keys(PX_ALIAS32)))PX_KEYS[PX_NORM(k)]=k;
if(typeof PX_ITEMS!=='undefined')for(const n of PX_ITEMS)if(/^(set_|ring_|amulett_)/.test(n))PX_KEYS[':i_'+n+':']=':i_'+n+':';
PX_RE=new RegExp(Object.keys(PX_KEYS).sort((a,b)=>b.length-a.length).map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\uFE0F?').join('|'),'g');}
const PX_URL={};
function pxUrl(emo){
  const k=PX_KEYS[PX_NORM(emo)];if(!k)return null;
  if(typeof PX_ITEMS!=='undefined'){const m=/^:[ing]_(\w+):$/.exec(k);if(m&&PX_ITEMS.indexOf(m[1])>=0&&(k[1]==='i'||k[1]==='g'||['stock','stein','ranke','kraut'].indexOf(m[1])>=0))return 'items/'+m[1]+'.png?v=2';}
  if(typeof PX_PNG!=='undefined'){const m=/^:ch_(\w+):$/.exec(k);if(m&&PX_PNG.indexOf(m[1])>=0)return 'figs/'+m[1]+'.png?v=23';}
  if(PX_URL[k])return PX_URL[k];
  const d=pxDef(k);if(!d)return null;
  const cv=document.createElement('canvas');const NN=pxSizeOf(d[0],32);cv.width=cv.height=NN;
  const cx=cv.getContext('2d'),im=cx.createImageData(NN,NN);im.data.set(pxPixels(d[0],d[1],32));cx.putImageData(im,0,0);
  return PX_URL[k]=cv.toDataURL('image/png');
}
pxBuild();
if(typeof document!=='undefined'&&typeof MutationObserver!=='undefined'){
  const SKIP={SCRIPT:1,STYLE:1,TEXTAREA:1,TITLE:1,OPTION:1};
  function pxText(n){
    const t=n.nodeValue;if(!t||!t.match(PX_RE))return;
    const p=n.parentNode;if(!p||SKIP[p.nodeName])return;
    const f=document.createDocumentFragment();let last=0,m;PX_RE.lastIndex=0;
    while((m=PX_RE.exec(t))){
      const u=pxUrl(m[0]);if(!u)continue;
      if(m.index>last)f.appendChild(document.createTextNode(t.slice(last,m.index)));
      const i=document.createElement('i');i.className='px';i.setAttribute('role','img');i.style.backgroundImage='url('+u+')';f.appendChild(i);
      last=m.index+m[0].length;
    }
    if(!last)return;
    if(last<t.length)f.appendChild(document.createTextNode(t.slice(last)));
    p.replaceChild(f,n);
  }
  function pxWalk(root){
    if(root.nodeType===3){pxText(root);return;}
    if(root.nodeType!==1||SKIP[root.nodeName])return;
    const w=document.createTreeWalker(root,4),list=[];let n;while((n=w.nextNode()))list.push(n);
    list.forEach(pxText);
  }
  const st=document.createElement('style');
  st.textContent='.px{display:inline-block;width:1.1em;height:1.1em;vertical-align:-.2em;background-size:100% 100%;background-repeat:no-repeat;image-rendering:pixelated}'
   +'.ent.t-area::after{content:"";width:24px;height:24px;background:url('+pxUrl('👑')+') center/contain no-repeat;image-rendering:pixelated}'
   +'.ent.alert::before{content:"";width:20px;height:20px;background:url('+pxUrl('❗')+') center/contain no-repeat;image-rendering:pixelated}';
  document.head.appendChild(st);
  const go=()=>{pxWalk(document.body);
    new MutationObserver(ms=>{for(const m of ms){if(m.type==='characterData')pxText(m.target);else m.addedNodes.forEach(pxWalk);}})
      .observe(document.body,{childList:true,subtree:true,characterData:true});};
  if(document.body)go();else document.addEventListener('DOMContentLoaded',go);
}

