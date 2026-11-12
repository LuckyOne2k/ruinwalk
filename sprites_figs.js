/* Spielfiguren je Entwicklungsstufe – 48x48, aus Bausteinen zusammengesetzt */
(function(){
/* Platzhalter: a/A Rüstung hell/dunkel, z Zierde, q/Q Stoff hell/dunkel, v Haar, V Hose, x/X Akzent, T Fell */
const P={
 legs:'r17,36,6,8V;r25,36,6,8V;r16,43,8,4B;r24,43,8,4B',
 legsA:'r17,36,6,8A;r25,36,6,8A;r16,43,8,4G;r24,43,8,4G;r16,36,8,2z;r24,36,8,2z',
 face:'e24,14,7,7n;r21,13,2,3k;r26,13,2,3k;r23,18,3,1R',
 hairS:'r17,9,3,9v;r28,9,3,9v;e24,9,8,3v',
 hairL:'r16,9,3,18v;r29,9,3,18v;e24,9,8,4v',
 tunic:'r15,25,18,11q;r10,25,6,12q;r32,25,6,12q;r10,37,6,4n;r32,37,6,4n;r15,33,18,3B;r22,33,4,3z',
 plate:'e13,23,6,5a;e35,23,6,5a;r16,21,16,15a;r20,22,8,10A;r16,34,16,3B;r22,34,4,3z;r10,25,6,12a;r32,25,6,12a;r10,37,6,4A;r32,37,6,4A;r16,21,16,2z',
 robe:'t14,23,34,23,42,46q;t14,23,6,46,42,46q;r17,32,14,3z;r6,44,36,3z;r8,26,7,13q;r33,26,7,13q;r9,38,5,4n;r34,38,5,4n;r15,23,18,2z',
 bare:'r16,24,16,12n;r10,25,6,12n;r32,25,6,12n;L19,27,23,32R;L27,27,25,31R;r15,33,18,3B;r22,33,4,3z;e13,24,5,4T;e35,24,5,4T;r10,37,6,4B;r32,37,6,4B',
 helm:'e24,10,9,9a;r16,14,3,6A;r29,14,3,6A;r19,11,10,3k;p21,12w;p26,12w;r21,18,6,2A',
 helmH:'t15,10,10,1,18,13w;t33,10,38,1,30,13w',
 plume:'t22,2,34,4,26,9x;e30,4,4,3x',
 hood:'e24,9,10,10q;e24,14,6,6n;r21,13,2,3k;r26,13,2,3k;r23,18,3,1R;e24,9,10,2Q',
 hat:'t24,0,33,13,15,13q;e24,13,13,3q;r15,11,18,2z;p24,6,y',
 crown:'r18,4,12,4y;t18,4,18,0,21,4y;t22,4,24,-1,26,4y;t27,4,30,0,30,4y',
 halo:'e24,3,8,2y;e24,3,5,1_',
 cape:'t12,22,36,22,40,46x',
 swordR:'r39,4,3,32s;t39,4,42,4,40,0w;r35,36,10,3Y;r39,39,3,5d;e40,45,2,2Y',
 axeR:'L40,46,40,8d;t40,6,47,11,40,18s;t40,6,34,11,40,18s;e40,12,1,1S',
 shieldL:'r3,22,11,16u;t3,38,14,38,8,45u;r3,22,11,2Y;e8,30,3,3y;r7,24,2,14w;r4,29,8,2w',
 staffR:'L41,46,41,12d;e41,9,5,5a;e41,9,2,2z;L38,8,38,13d',
 bowL:'L10,8,6,18d;L6,18,6,30d;L6,30,10,40d;L10,8,10,40w;L10,24,24,24d;t8,24,12,22,12,26s',
 quiver:'r33,16,5,16b;r33,13,1,4d;r35,13,1,4d;r37,13,1,4d;t32,12,34,12,33,9w;t34,12,36,12,35,9w',
};
const J=(...a)=>'@48;'+a.join(';');
const F={};
const fig=(k,parts,sw)=>{F[k]={d:J(...parts),sw:sw||''};};
/* Krieger */
fig('ritter',[P.cape.replace('x','u'),P.legsA,P.plate,P.shieldL,P.helm,P.plume,P.swordR],'a>s,A>S,z>y,x>r');
fig('paladin',[P.cape,P.legsA,P.plate,P.shieldL,P.helm,P.helmH,P.halo,P.swordR,'L40,4,40,36w'],'a>w,A>g,z>y,x>u');
fig('sonnenwaechter',['L24,2,24,6y;L12,8,15,11y;L36,8,33,11y;L8,18,12,18y;L40,18,36,18y',P.cape,P.legsA,P.plate,'e8,30,7,7y;e8,30,5,5o;e8,30,2,2w',P.helm,P.plume,P.swordR,'e24,28,3,3o'],'a>y,A>Y,z>o,x>r');
fig('berserker',[P.legs,P.bare,P.hairL,P.face,'t17,8,12,0,19,12w;t31,8,36,0,29,12w',P.axeR,'L8,22,12,40d;t8,22,14,26,6,34s;t8,22,2,26,6,34s;L6,34,4,38s'],'v>R,V>B,T>G');
fig('kriegsherr',[P.cape,P.legsA,P.plate,'t8,16,2,12,8,22A;t40,16,46,12,40,22A',P.helm,P.helmH,P.crown,'L40,46,40,2d;t40,0,47,5,40,10x;r2,22,3,18d;t2,22,12,24,2,30x',P.axeR],'a>G,A>k,z>r,x>R,w>g');
fig('weltenbrecher',[P.cape,P.legsA,P.plate,'L18,26,22,34o;L30,26,26,34o;L20,38,28,42o',P.helm,P.helmH,'t20,6,24,-2,28,6o;r36,10,10,14G;r35,6,12,6S;L41,46,41,20d','e41,8,0,0_'],'a>G,A>k,z>o,x>R,w>o');
/* Duellant */
fig('duellant',[P.cape.replace('x','u'),P.legs,P.tunic,P.hairL,P.face,P.hat.replace('t24,0,33,13,15,13q','e24,8,10,3q').replace('p24,6,y','t30,6,38,0,34,10w'),'r40,12,1,26s;r37,37,7,2Y;r40,39,1,4d;e40,44,1,1Y;L8,24,12,32w'],'q>b,Q>B,z>y,v>R,x>u');
fig('klingentaenzer',[P.legs,'r15,25,18,11n;r10,25,6,12n;r32,25,6,12n;r10,37,6,4n;r32,37,6,4n;r15,31,18,6x;r15,25,18,4q',P.hairS,P.face,'r16,8,16,3x;L10,28,4,16s;L38,28,44,16s;r8,28,4,2Y;r36,28,4,2Y'],'q>R,v>k,V>R,x>r');
fig('phantomklinge',[P.cape.replace('x','P'),P.legs,P.tunic,'e24,9,10,10q;e24,14,6,6k;p21,14,c;p26,14,c','L38,46,38,8c;t38,8,41,8,39,2w;r35,32,8,2c','e24,30,9,9c'],'q>P,Q>k,V>k,z>c');
/* Bogen */
fig('scharfschuetze',[P.legs,P.tunic,P.quiver,P.hood,'r20,12,8,4k;r21,13,6,2c',P.bowL],'q>e,Q>L,V>B');
fig('meisterschuetze',[P.cape.replace('x','b'),P.legs,P.tunic,P.quiver,P.hood,'e24,31,3,3y;L21,25,27,25y',P.bowL.replace('L10,8,6,18d','L12,2,6,18d').replace('L6,30,10,40d','L6,30,12,46d').replace('L10,8,10,40w','L12,2,12,46w')],'q>L,Q>e,V>B,z>y');
fig('falkenauge',[P.cape.replace('x','b'),P.legs,P.tunic,P.quiver,P.hairS,P.face,'r17,8,14,2x;t30,8,34,4,30,12w;t18,8,14,4,18,12w','e36,22,4,5b;e36,18,3,3w;t33,18,31,19,33,21y;p36,18,k;t38,24,44,30,36,28b',P.bowL],'q>b,Q>B,v>B,x>r');
fig('jaeger',[P.legs,P.tunic,'e24,10,9,4T;r16,10,16,4T',P.hairS,P.face,P.bowL,'e6,42,7,4G;e2,38,4,4G;t0,34,2,32,4,36G;p1,38y;L12,42,14,38G;r2,44,2,3G;r8,46,2,2G'],'q>b,Q>B,v>B,T>t');
fig('bestienmeister',[P.legs,P.tunic,'e24,9,10,10T;e24,14,6,6n;r21,13,2,3k;r26,13,2,3k;r23,18,3,1R;e16,3,3,3T;e32,3,3,3T',P.axeR.replace('s','b'),'e6,41,8,5B;e2,36,5,5B;e0,32,2,2B;e4,32,2,2B;p1,36,k'],'q>B,Q>k,T>b');
fig('herr',[P.cape.replace('x','L'),P.legs,P.tunic,'r10,24,6,3L;r32,24,6,3L;L17,8,10,0d;L10,0,6,4d;L12,4,16,0d;L31,8,38,0d;L38,0,42,4d;L36,4,32,0d',P.hairL,P.face,'L41,46,41,6d;e41,5,4,4l;L38,12,38,22L;e38,18,2,2l',P.bowL.replace('L10,8,6,18d','L10,10,6,18d')],'q>L,Q>e,v>B,V>B,T>L');
fig('fallensteller',[P.legs,P.tunic,'e24,7,11,4T;r13,7,22,3T;r16,4,16,5T',P.hairS,P.face,'r6,34,16,5S;t6,34,8,28,10,34g;t10,34,12,28,14,34g;t14,34,16,28,18,34g;t18,34,20,28,22,34g;r6,39,16,2G'],'q>b,Q>B,T>B');
fig('schattenjaeger',[P.cape.replace('x','P'),P.legs,P.tunic,P.hood,'e24,5,3,3y;e25,5,2,3_','L10,10,34,10k;r8,8,4,6B;r12,9,24,2d;L14,10,14,16d;L34,10,34,16d;r12,22,24,2P;r36,20,6,12S'],'q>P,Q>k,V>k,z>c');
fig('nachtpirscher',[P.cape.replace('x','k'),P.legs,P.tunic,'e24,9,10,10q;e24,14,6,6k;e21,13,2,2y;e27,13,2,2y;t14,4,10,0,16,10q;t34,4,38,0,32,10q;p24,17,o','L8,26,4,18s;L40,26,44,18s;r6,26,4,2Y;r38,26,4,2Y'],'q>k,Q>G,V>k,z>c');
/* Magier */
fig('feuermagier',[P.robe,P.hairS,P.face,P.hat,P.staffR,'e41,5,3,4r;e41,6,2,3y;e6,36,4,4r;e6,37,2,3y;L4,40,8,40o'],'q>r,Q>R,z>y,a>R,v>B');
fig('pyromant',[P.cape.replace('x','k'),P.robe,'e24,9,10,10q;e24,14,6,6k;e21,13,2,2o;e27,13,2,2o;t16,6,14,-1,20,2o;t32,6,36,-1,28,2o;t22,2,24,-4,26,2r','L41,46,41,10d;e41,6,5,5w;r39,8,1,1k;r42,8,1,1k;r40,10,3,1k;e6,32,5,5r;e6,33,3,4y;t2,28,6,22,8,28o;p42,2,r;p4,22,y',P.hairS.replace('v','k')],'q>X,Q>k,z>o,x>k');
fig('phoenixweber',['t12,24,0,6,8,42o;t36,24,48,6,40,42o;t10,28,2,16,12,36r;t38,28,46,16,36,36r',P.robe,P.hairS,P.face,'t18,6,24,-3,30,6o;t22,6,24,-1,26,6y',P.staffR,'t41,2,44,-2,43,6o'],'q>o,Q>r,z>y,a>r,v>Y');
fig('frostmagier',[P.robe,P.hairS,P.face,P.hat,P.staffR,'t41,1,44,5,41,9c;t41,1,38,5,41,9c;L41,0,41,10w'],'q>u,Q>U,z>c,a>c,v>w');
fig('eisweber',[P.robe,'t4,24,8,32,2,32C;t42,28,46,36,40,36C;t6,12,9,18,3,18c',P.hairL,P.face,'t18,6,20,0,22,6c;t23,6,24,-2,25,6w;t26,6,28,0,30,6c;r18,6,12,2C',P.staffR,'t41,0,44,4,38,4w'],'q>c,Q>C,z>w,a>w,v>c');
fig('winterherrscher',[P.cape.replace('x','w'),P.robe,'r13,22,22,3w;e16,24,3,3w;e32,24,3,3w',P.hairL,P.face,P.crown,'t18,2,21,-3,24,2c;t24,2,27,-4,30,2c',P.staffR,'L41,2,41,16w;L35,9,47,9w;L36,4,46,14w;L46,4,36,14w'],'q>U,Q>u,z>c,a>c,v>w,y>c,x>w');
fig('sturmmagier',[P.robe,'r16,6,2,6y;r30,6,2,6y;L16,4,12,0y;L32,4,36,0y',P.hairS.replace('v','y'),P.face,P.staffR,'t41,1,38,6,42,6y;t42,5,45,10,39,11y;L41,14,38,24y;t4,30,8,26,6,36y'],'q>G,Q>k,z>y,a>y,v>y');
fig('sturmrufer',[P.robe,'e24,3,12,3G;e14,5,6,3g;e34,5,6,3g;L20,6,18,12y;L28,6,31,14y;t22,6,26,6,24,14y',P.hairS,P.face,P.staffR,'L6,20,4,26c;L2,24,0,30c;L44,20,42,26c'],'q>S,Q>G,z>y,a>y,v>g');
fig('himmelsspalter',[P.cape.replace('x','P'),P.robe,'t20,0,28,0,30,16y;t18,12,30,12,24,24w;t22,20,26,20,24,34y',P.hairS,P.face,P.staffR,'t41,0,44,8,38,8w;L41,4,41,30y'],'q>P,Q>k,z>y,a>y,v>w');
/* Heiler */
fig('priester',[P.robe,P.hairS,P.face,'t18,8,24,0,30,8w;r18,8,12,2y;p24,3,y','L41,46,41,14d;e41,10,5,5y;L41,5,41,15w;L36,10,46,10w','r2,26,8,11m;r3,27,6,9w;L6,27,6,36G'],'q>w,Q>g,z>y,v>Y');
fig('hohepriester',[P.cape.replace('x','y'),P.robe,'r15,22,18,3y;L24,24,24,44y',P.hairL,P.face,'t17,9,24,-6,31,9w;r17,9,14,2y;L24,-3,24,4y;L21,0,27,0y',P.staffR,'e41,5,6,6y;e41,5,3,3w;L41,-2,41,2y'],'q>w,Q>g,z>y,v>w,a>y');
fig('lichtgesandter',['t14,22,0,8,10,36w;t34,22,48,8,38,36w;t12,26,2,16,14,34h;t36,26,46,16,34,34h','e24,3,10,3y;e24,3,7,2_',P.robe,P.hairL,P.face,P.staffR,'e24,26,16,16h'],'q>h,Q>w,z>y,v>Y,a>y');
fig('moench',[P.legs,'r15,25,18,11x;r10,25,6,12n;r32,25,6,12n;r10,37,7,5n;r31,37,7,5n;r15,33,18,3z','e24,12,7,7n;r21,13,2,2k;r26,13,2,2k;r23,18,3,1R',P.legs.replace('V','x')+'','r17,36,6,8x;r25,36,6,8x','e8,39,3,3o;e40,39,3,3o'],'x>o,z>R,V>o');
fig('grossmeister',[P.legs,'r15,25,18,11w;r10,25,6,12w;r32,25,6,12w;r10,37,6,5n;r32,37,6,5n;r15,33,18,4k;L16,25,31,35x','e24,12,7,7n;r21,13,2,2k;r26,13,2,2k;r23,18,3,1R;e24,6,3,3k;r17,9,14,2x','r17,36,6,8k;r25,36,6,8k','e8,38,5,5y;e40,38,5,5y;e8,38,3,3w;e40,38,3,3w'],'x>r,V>k');
fig('erleuchteter',['e24,26,20,20y;e24,26,17,17_;e24,26,14,14h','e24,12,7,7n;r21,13,2,1k;r26,13,2,1k;r23,18,3,1R;e24,6,2,2y;e24,3,9,2y;e24,3,6,1_','t14,22,34,22,38,40w;t14,22,10,40,38,40w;r6,38,36,4w;r12,38,8,3z;r28,38,8,3z;r15,30,18,3z','r8,28,6,8n;r34,28,6,8n;e24,30,4,4w','e24,31,4,4k;e24,31,2,2w'],'z>y');
fig('naturheiler',[P.robe,P.hairL,P.face,'e24,6,9,2l;e18,6,3,3l;e30,6,3,3l;e24,3,3,3m','L41,46,41,10d;e41,7,4,4l;e38,10,2,2l;e44,12,2,2l;L41,22,38,28L;r2,34,12,8b;r2,34,12,2B;e5,32,3,3l;e9,32,3,3l;e7,30,2,2m'],'q>e,Q>L,z>l,v>B');
fig('druide',[P.cape.replace('x','L'),P.robe,'r13,22,22,4T;e16,24,3,3L;e32,24,3,3L',P.hairL.replace('v','w'),P.face,'t17,9,12,0,18,12d;t31,9,36,0,30,12d;L14,2,10,-2d;L34,2,38,-2d;t18,8,24,2,30,8L','L41,46,41,6d;t41,4,45,10,41,16l;t41,4,37,10,41,16l;e41,12,1,1y',],'q>b,Q>B,z>L,v>w,T>L');
fig('weltenbaumhueter',[P.cape.replace('x','L'),P.legsA,P.plate.replace(/r10,25,6,12a;r32,25,6,12a/,'r10,25,6,12a;r32,25,6,12a'),'t6,24,2,14,12,30L;t42,24,46,14,36,30L',P.hairL.replace('v','L'),P.face,'e24,5,10,4L;e16,6,4,3l;e32,6,4,3l;e24,2,4,3l;p24,2,y;p17,5,h;p31,5,h','L41,46,41,8d;e41,6,6,6L;e41,6,3,3y;L38,4,36,0L;L44,4,46,0L;L41,0,41,-1L'],'a>B,A>d,z>l,v>L,x>L');
/* Grundklassen (Details wie zuvor in sprites_chars.js) */
const A={},S2={};
for(const k in F){S2[':chf_'+k+':']=F[k].d;}
for(const k in F){A[':ch_'+k+':']=[':chf_'+k+':',F[k].sw];}
if(typeof module!=='undefined')module.exports=E=>{Object.assign(E.PX_SPR32,S2);Object.assign(E.PX_ALIAS32,A);};
else{Object.assign(PX_SPR32,S2);Object.assign(PX_ALIAS32,A);}
})();
