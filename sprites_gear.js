/* Ausrüstung – 32x32. Platzhalterfarben: a=Hauptfarbe, A=Schatten, z=Zierfarbe; die Stufen färben um. */
(function(){
const S={
':gb_schleuder:':'L16,29,16,17d;L16,17,7,4d;L16,17,25,4d;L7,5,25,5z;L8,6,16,14z;L24,6,16,14z;e16,15,4,4a;e16,15,2,2A',
':gb_schwert:':'t29,2,31,4,13,24a;t29,2,13,24,8,19a;L26,5,11,21A;L6,17,16,27z;L5,18,15,28z;L8,26,3,31d;e3,30,2,2z',
':gb_bogen:':'L11,2,3,12a;L3,12,3,20a;L3,20,11,30a;L11,2,11,30w;L11,16,29,16d;t30,16,24,12,24,20z;t11,16,15,13,15,19w;e3,16,2,3z',
':gb_stab:':'L5,29,22,12d;e24,9,6,6a;e24,9,3,3z;L24,1,24,3z;L31,9,29,9z;L17,9,19,9z;L24,16,24,18z',
':gb_heilstab:':'L5,29,22,12d;e24,9,7,7a;e24,9,5,5_;r23,4,3,10z;r19,8,11,3z;e24,9,1,1w',
':gb_schild:':'r4,3,24,16a;t4,19,28,19,16,31a;r7,6,18,11A;t8,18,24,18,16,27A;r14,6,4,22z;r7,12,18,4z;e16,13,3,3w',
':gb_koecher:':'r10,10,12,20a;r10,26,12,3A;r10,12,12,3z;L12,10,10,2d;L16,10,16,2d;L20,10,22,2d;t10,2,8,8,12,8w;t16,1,14,8,18,8w;t22,2,20,8,24,8w',
':gb_buch:':'r6,4,20,24a;r8,6,16,20w;r6,4,3,24A;L12,10,22,10A;L12,14,22,14A;L12,18,19,18A;e20,22,3,3z',
':gb_talisman:':'L9,2,16,13d;L23,2,16,13d;e16,20,10,10a;e16,20,7,7A;e16,20,4,4z;p14,18w',
':gb_helm:':'e16,15,11,10a;r5,15,22,10a;r9,17,14,4k;L16,17,16,24A;t16,0,19,9,13,9z;r5,23,22,3A',
':gb_kappe:':'e16,16,11,9a;r3,20,26,4A;e16,10,5,4z;L8,16,24,16A;p16,6w',
':gb_kapuze:':'e16,13,11,12a;e16,17,6,8k;t6,22,26,22,16,31a;L9,14,13,6A;L23,14,19,6A;e14,16,1,1y;e18,16,1,1y',
':gb_harnisch:':'r7,5,18,23a;r1,5,7,11a;r24,5,7,11a;r7,22,18,5z;L16,5,16,27A;e16,11,4,3z;r7,5,18,3A;r2,6,4,3z;r26,6,4,3z',
':gb_wams:':'r7,5,18,23a;r1,6,7,14a;r24,6,7,14a;L16,6,16,27z;L12,10,20,10z;L12,14,20,14z;L12,18,20,18z;L12,22,20,22z;r7,5,18,3A',
':gb_robe:':'t11,4,21,4,29,30a;t11,4,3,30,29,30a;r10,16,12,4z;e16,5,6,3A;r13,5,6,2z;L16,20,16,29A',
':gb_beinschienen:':'r6,3,20,6a;r7,9,8,20a;r17,9,8,20a;r7,22,8,4z;r17,22,8,4z;r7,29,9,2A;r17,29,9,2A;L16,9,16,20k;e11,16,2,2z;e21,16,2,2z',
':gb_hose:':'r6,3,20,5z;r7,8,8,22a;r17,8,8,22a;L16,8,16,22k;L9,20,13,20A;L19,20,23,20A;r7,28,8,2A;r17,28,8,2A',
':gb_beinkleid:':'r6,3,20,5z;t7,8,15,8,10,30a;t17,8,25,8,22,30a;L12,12,11,28A;L22,12,23,28A',
':gb_handschuhe:':'r9,14,14,12a;r9,6,3,9a;r13,3,3,12a;r17,4,3,11a;r21,7,3,8a;r4,15,6,3a;r8,24,16,5z;r8,24,16,2A',
':gb_stiefel:':'r11,3,10,19a;r5,20,22,8a;r5,27,22,3A;r11,3,10,4z;L11,12,21,12A;r5,20,6,4A',
':gb_schuhe:':'r9,8,12,11a;r4,18,24,9a;r4,26,24,3A;L11,11,19,11z;L11,14,19,14z',
':gb_umhang:':'t16,3,30,30,2,30a;r11,2,10,3z;e16,3,6,2A;L16,5,16,29A;L8,12,5,28A;L24,12,27,28A;e16,6,2,2z',
':gb_ring:':'e16,19,10,10a;e16,19,6,6_;e16,6,5,5z;e16,6,2,2w;L11,10,13,13a;L21,10,19,13a',
':gb_amulett:':'L5,2,13,20a;L27,2,19,20a;e16,23,7,7a;e16,23,4,4z;p14,21,w',
':g_axt:':'L5,29,22,10d;L6,29,23,10d;t14,3,28,7,24,17s;t14,3,24,17,12,14S;L18,6,25,12w',
':g_hacke:':'L6,29,23,10d;L7,29,24,10d;L4,10,14,3s;L14,3,28,10s;L4,10,4,14s;L28,10,28,14s;L5,11,14,5S',
':g_krone:':'r4,18,24,8y;t4,18,4,5,11,18y;t11,18,16,3,21,18y;t21,18,28,5,28,18y;e4,5,2,2r;e16,3,2,2c;e28,5,2,2r;r4,24,24,2Y;e10,22,2,2r;e22,22,2,2c',
':g_medaille:':'e16,19,10,10y;e16,19,7,7Y;e16,19,4,4y;t8,1,13,1,16,12r;t24,1,19,1,16,12u;L16,16,16,22w',
};
const A={};
const GRP={
 metal:['a>g,A>G,z>b','a>s,A>S,z>y','a>r,A>R,z>y'],
 leather:['a>b,A>B,z>t','a>g,A>G,z>s','a>o,A>R,z>y'],
 cloth:['a>t,A>b,z>e','a>c,A>C,z>w','a>p,A>P,z>y'],
 magic:['a>g,A>G,z>t','a>c,A>C,z>w','a>p,A>P,z>m']};
function tiers(name,base,grp){for(let t=1;t<=3;t++)A[':g_'+name+'_'+t+':']=[':gb_'+base+':',GRP[grp][t-1]];}
tiers('w_schleuder','schleuder','leather');tiers('w_schwert','schwert','metal');tiers('w_bogen','bogen','leather');tiers('w_stab','stab','magic');tiers('w_heilstab','heilstab','magic');
tiers('o_schild','schild','metal');tiers('o_koecher','koecher','leather');tiers('o_buch','buch','cloth');tiers('o_talisman','talisman','magic');
const AT={schwer:'metal',mittel:'leather',leicht:'cloth'};
const AN={kopf:['helm','kappe','kapuze'],brust:['harnisch','wams','robe'],beine:['beinschienen','hose','beinkleid'],haende:['handschuhe','handschuhe','handschuhe'],fuesse:['stiefel','stiefel','schuhe']};
['schwer','mittel','leicht'].forEach((ty,i)=>{for(const sl in AN)tiers(sl+'_'+ty,AN[sl][i],AT[ty]);});
tiers('umhang','umhang','cloth');tiers('ring','ring','metal');tiers('amulett','amulett','metal');
for(let t=1;t<=3;t++){A[':g_umhang_'+t+':']=[':gb_umhang:',GRP.cloth[t-1]];}
if(typeof module!=='undefined')module.exports=E=>{Object.assign(E.PX_SPR32,S);Object.assign(E.PX_ALIAS32,A);};
else{Object.assign(PX_SPR32,S);Object.assign(PX_ALIAS32,A);}
})();
