(function(){
const chain=()=>new Proxy(function(){},{get:(t,k)=>k==='getZoom'?()=>17:k==='getCenter'?()=>({lat:48.37,lng:10.9}):chain(),apply:()=>chain()});
window.L={map:()=>{const m={setView(){return m},on(){return m},panTo(){},getZoom:()=>17,removeLayer(l){if(l&&l.el)l.el.remove()},getCenter:()=>({lat:48.37,lng:10.9}),getBounds(){return{contains(){return true}}},latLngToContainerPoint(){return{x:0,y:0}}};return m},
 tileLayer:()=>({addTo(){}}),divIcon:o=>o,
 marker:(ll,o)=>{const m={ll:[...ll],o:o||{},on(){return m},addTo(){const d=document.createElement('div');d.style.cssText='position:absolute;left:'+(Math.random()*300+20)+'px;top:'+(Math.random()*400+100)+'px';d.innerHTML=(m.o.icon&&m.o.icon.html)||'';document.getElementById('map').appendChild(d);m.el=d;return m},setLatLng(x){m.ll=[...x]},getLatLng(){return{lat:m.ll[0],lng:m.ll[1]}},getElement(){return m.el},setIcon(){return m}};return m},
 circle:()=>({addTo(){return this},setLatLng(){},setRadius(){},setStyle(){}}),DomEvent:{stopPropagation(){}},latLng:(a,b)=>({lat:a,lng:b})};
})();
