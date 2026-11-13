"""Erzeugt die Status-Icons (32x32, Pixel-Stil) nach status/<id>.png.  Aufruf: python3 tools/gen_status_icons.py"""
import math,os
from PIL import Image,ImageDraw,ImageChops,ImageFilter
SS=4;N=32;OUT=(41,25,14)
def new():return Image.new('RGBA',(N*SS,N*SS),(0,0,0,0))
def P(pts):return [(x*SS,y*SS) for x,y in pts]
def mask_poly(pts):
    m=Image.new('L',(N*SS,N*SS),0);ImageDraw.Draw(m).polygon(P(pts),fill=255);return m
def mask_ell(cx,cy,rx,ry):
    m=Image.new('L',(N*SS,N*SS),0);ImageDraw.Draw(m).ellipse([(cx-rx)*SS,(cy-ry)*SS,(cx+rx)*SS,(cy+ry)*SS],fill=255);return m
def mask_line(pts,w,round_=True):
    m=Image.new('L',(N*SS,N*SS),0);d=ImageDraw.Draw(m);d.line(P(pts),fill=255,width=int(w*SS))
    if round_:
        for x,y in pts:d.ellipse([(x-w/2)*SS,(y-w/2)*SS,(x+w/2)*SS,(y+w/2)*SS],fill=255)
    return m
def U(*ms):
    r=ms[0]
    for m in ms[1:]:r=ImageChops.lighter(r,m)
    return r
def I(a,b):return ImageChops.darker(a,b)
def shift(m,dx,dy):return ImageChops.offset(m,int(dx*SS),int(dy*SS))
def sub(a,b):return ImageChops.subtract(a,b)
def star(cx,cy,R,r,n=5,rot=-90):
    pts=[]
    for i in range(n*2):
        a=math.radians(rot+i*180/n);rr=R if i%2==0 else r;pts.append((cx+rr*math.cos(a),cy+rr*math.sin(a)))
    return pts
class Ic:
    def __init__(s):s.im=new()
    def fill(s,m,col):
        s.im.alpha_composite(Image.composite(Image.new('RGBA',s.im.size,col+(255,)),new(),m))
    def shape(s,m,base,shade=None,light=None,sdx=2.2,sdy=2.8,ldx=-1.6,ldy=-2.0):
        """flächig + Schatten (unten rechts) + Licht (oben links) innerhalb der Form"""
        s.fill(m,base)
        if shade:s.fill(I(m,sub(m,shift(m,-sdx,-sdy))),shade)
        if light:s.fill(I(m,sub(m,shift(m,-ldx,-ldy))),light)
    def save(s,fn):
        sm=s.im.resize((N,N),Image.NEAREST)   # harte Pixel (Mitte der Blöcke)
        # NEAREST nimmt die obere linke Ecke; für Blockmitte: vorher verschieben
        c=Image.new('RGBA',(N,N));px=s.im.load();cp=c.load()
        for x in range(N):
            for y in range(N):
                p=px[x*SS+SS//2,y*SS+SS//2]
                cp[x,y]=p if p[3]>127 else (0,0,0,0)
        a=c.split()[3];ap=a.load();out=Image.new('RGBA',(N,N),(0,0,0,0));op=out.load()
        for x in range(N):
            for y in range(N):
                if cp[x,y][3]:op[x,y]=cp[x,y]
                else:
                    for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
                        xx,yy=x+dx,y+dy
                        if 0<=xx<N and 0<=yy<N and cp[xx,yy][3]:op[x,y]=OUT+(255,);break
        out.save(fn);return out
icons={}
def gift():
    i=Ic();m=U(mask_poly([(16,2),(8,16),(24,16)]),mask_ell(16,20,9,9))
    i.shape(m,(70,176,84),(34,112,60),(150,230,130));
    i.fill(mask_ell(12,19,1.6,3),(214,255,200))
    i.fill(mask_ell(22,9,2.6,2.6),(70,176,84));i.fill(mask_ell(21.3,8.3,1,1),(200,255,190))
    i.fill(mask_ell(8,27,2,2),(70,176,84))
    # Totenkopf-Andeutung
    i.fill(mask_poly([(12.5,19),(15,19),(15,22),(12.5,22)]),(24,70,40));i.fill(mask_poly([(17,19),(19.5,19),(19.5,22),(17,22)]),(24,70,40))
    i.fill(mask_poly([(15.4,23.2),(16.6,23.2),(16.6,25),(15.4,25)]),(24,70,40))
    return i
def feuer():
    i=Ic();outer=mask_poly([(16,1),(20,8),(25,13),(26,20),(23,27),(16,30),(9,27),(6,20),(8,14),(11,10),(13,5)])
    i.shape(outer,(232,84,32),(170,40,28),(255,150,60))
    mid=mask_poly([(16,10),(20,16),(21,22),(18,27),(14,27),(11,22),(12,16),(14,13)]);i.shape(mid,(255,150,40),(238,100,30),(255,200,80))
    inn=mask_poly([(16,17),(19,21.5),(18.5,26),(13.5,26),(13,21.5)]);i.fill(inn,(255,222,90));i.fill(mask_ell(16,24,2.2,2.4),(255,248,200))
    return i
def betaeubt():
    i=Ic()
    for cx,cy,R,r in((16,17,9.5,4.2),(6.5,7,5,2.2),(26,8,5,2.2),(25,26,4.5,2),(6,26,4,1.8)):
        m=mask_poly(star(cx,cy,R,r));i.shape(m,(255,216,64),(226,160,30),(255,246,170),1.4,1.8,-1,-1.4)
    return i
def wurzeln():
    i=Ic();w=(122,80,42);d=(84,52,26);l=(176,126,70)
    segs=[([(16,2),(16,13),(17,18)],5),([(17,18),(10,23),(5,29)],3.6),([(17,18),(17,24),(16,30)],3.6),([(17,18),(24,22),(28,29)],3.6),([(10,23),(4,22)],2.4),([(24,22),(29,19)],2.4)]
    m=U(*[mask_line(p,wd) for p,wd in segs]);i.shape(m,w,d,l,1.6,1.4,-1.4,-1.2)
    lf=mask_poly([(18,5),(24,2),(28,6),(23,9)]);i.shape(lf,(86,170,70),(46,112,50),(160,224,120),1.2,1.4,-1,-1)
    return i
def schutz():
    i=Ic();outer=mask_poly([(4,4),(16,1.5),(28,4),(28,17),(16,30.5),(4,17)]);i.fill(outer,(232,178,56))
    inner=mask_poly([(7,7),(16,5),(25,7),(25,16),(16,27),(7,16)]);i.shape(inner,(74,128,212),(44,84,170),(130,180,250),2.2,2.8,-1.6,-2)
    i.fill(mask_poly(star(16,15,6,2.6)),(255,255,255));i.fill(shift(mask_poly(star(16,15,6,2.6)),0.5,0.7),(220,235,255))
    i.fill(mask_poly(star(16,15,5,2.2)),(255,255,255))
    return i
def erschoepft():
    i=Ic();c=(176,204,255);d=(110,140,220);l=(236,246,255)
    for pts,wd in(([(4,17),(15,17),(4,28),(15,28)],4.2),([(14,8),(21,8),(14,15),(21,15)],3.4),([(22,2.5),(27.5,2.5),(22,7.5),(27.5,7.5)],2.6)):
        m=mask_line(pts,wd,False);i.shape(m,c,d,l,1.2,1.4,-1,-1)
    return i
def gelaehmt():
    i=Ic();c=(150,214,255);d=(86,150,230);l=(236,250,255)
    arms=[]
    for k in range(3):
        a=math.radians(90+k*60);arms.append(mask_line([(16-14*math.cos(a),16-14*math.sin(a)),(16+14*math.cos(a),16+14*math.sin(a))],3))
    for k in range(6):
        a=math.radians(90+k*60);bx,by=16+8*math.cos(a),16+8*math.sin(a)
        for s in(-1,1):
            b=a+s*math.radians(40);arms.append(mask_line([(bx,by),(bx+5*math.cos(b),by+5*math.sin(b))],2.2))
    m=U(*arms,mask_ell(16,16,4.2,4.2));i.shape(m,c,d,l,1.4,1.6,-1,-1.2)
    i.fill(mask_ell(16,16,2.4,2.4),(240,252,255))
    return i
def harthaut():
    i=Ic();m=mask_poly([(5,9),(13,3),(24,5),(29,13),(27,24),(18,30),(8,26),(3,17)]);i.shape(m,(138,140,152),(88,90,104),(196,198,210),3,3.4,-2,-2.2)
    for pts in([(13,3),(15,10),(12,15),(15,20)],[(24,5),(21,12),(25,17)],[(8,26),(12,22),(11,27)]):
        i.fill(I(m,mask_line(pts,1.6,False)),(52,54,66))
    return i
def feather(cx,cy,ang,L,W):
    pts=[];a=math.radians(ang)
    for t in range(0,360,20):
        u=math.cos(math.radians(t))*L/2+L/2;v=math.sin(math.radians(t))*W/2
        pts.append((cx+u*math.cos(a)-v*math.sin(a),cy+u*math.sin(a)+v*math.cos(a)))
    return mask_poly(pts)
def flug():
    i=Ic()
    fs=[(-14,22,5.4),(-30,24,5.4),(-46,24,5.4),(-62,22,5.2),(-78,18,5)]
    for ang,L,W in fs:
        m=feather(5,27,ang,L,W);i.shape(m,(222,230,246),(150,166,208),(255,255,255),1.4,1.8,-1,-1.4)
        i.fill(I(m,mask_line([(5+2*math.cos(math.radians(ang)),27+2*math.sin(math.radians(ang))),(5+(L-3)*math.cos(math.radians(ang)),27+(L-3)*math.sin(math.radians(ang)))],.9,False)),(120,136,190))
    return i
def sproessling():
    i=Ic();g=(84,184,72);d=(44,120,50);l=(170,232,120)
    mound=mask_ell(16,27,11,4);i.shape(mound,(124,84,46),(84,54,28),(176,128,76),1.6,1.8,-1.2,-1.2)
    stem=mask_line([(16,27),(16,16)],3);i.shape(stem,g,d,l,1,1,-.8,-.8)
    la=mask_poly([(16,17),(8,15),(4,9),(11,7),(16,11)]);lb=mask_poly([(16,14),(22,9),(28,6),(27,13),(21,17)])
    i.shape(la,g,d,l,1.6,1.8,-1,-1.2);i.shape(lb,g,d,l,1.6,1.8,-1,-1.2)
    i.fill(I(la,mask_line([(15,16),(7,9)],1,False)),(34,96,44));i.fill(I(lb,mask_line([(17,15),(26,8)],1,False)),(34,96,44))
    return i
def raserei():
    i=Ic();face=mask_ell(16,17,13,12.5);i.shape(face,(226,56,48),(150,26,34),(255,130,100),2.2,2.6,-1.6,-2)
    for pts in([(5,8),(14,14)],[(27,8),(18,14)]):
        i.fill(mask_line(pts,3.2),(60,10,16))
    for cx in(11.5,20.5):
        i.fill(mask_ell(cx,17.5,3,2.6),(255,248,230));i.fill(mask_ell(cx+(0.8 if cx<16 else -0.8),18,1.4,1.6),(40,8,12))
    i.fill(mask_line([(10,25),(13,23),(16,25.5),(19,23),(22,25)],1.6,False),(60,10,16))
    return i
ALL={'gift':gift,'feuer':feuer,'betaeubt':betaeubt,'wurzeln':wurzeln,'schutz':schutz,'erschoepft':erschoepft,'gelaehmt':gelaehmt,'harthaut':harthaut,'flug':flug,'sproessling':sproessling,'raserei':raserei}
if __name__=='__main__':
    root=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','status');os.makedirs(root,exist_ok=True)
    sheet=Image.new('RGBA',(len(ALL)*36+4,40),(60,50,44,255))
    for k,(n,f) in enumerate(ALL.items()):
        im=f().save(os.path.join(root,n+'.png'));sheet.alpha_composite(im,(4+k*36,4))
    sheet.resize((sheet.width*4,sheet.height*4),Image.NEAREST).save('/tmp/status_sheet.png')
