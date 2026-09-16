/** Versioned, deterministic botanical albedo. It is a leaf texture, not a plant image. */
export const CURRENT_RENDERER = '1.1.0' as const;
export type PlantRendererVersion = '1.0.0' | typeof CURRENT_RENDERER;
export function leafRaster(seed:number,width=128,height=256,version:PlantRendererVersion=CURRENT_RENDERER) {
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width>1024||height>1024)throw new Error('Invalid procedural texture arguments');
  const data=new Uint8Array(width*height*4),phase=(seed%4093)/4093*Math.PI*2;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=x/(width-1),v=y/(height-1),center=Math.abs(u-.5),i=(y*width+x)*4;
    if(version==='1.0.0'){
      // Retained for archived plants created with the initial renderer.
      const rib=Math.abs(Math.sin(v*48+center*26));
      const mottled=Math.sin(u*38+seed%37)*Math.sin(v*55+Math.sin(u*23))*Math.sin((u+v)*31);
      const n=center<.012||rib<.055?1:mottled>.15&&center<.4?.64:.17;
      data[i]=28+120*n;data[i+1]=55+104*n;data[i+2]=13+47*n;
    } else {
      // Continuous lateral venation and broad, soft variegation rather than noisy
      // thresholded yellow speckles. The same seed keeps the same leaf pattern.
      const signed=(u-.5)*2,edge=Math.abs(signed);
      const midrib=Math.exp(-Math.pow(signed/.026,2));
      const ribs=Math.exp(-Math.pow(Math.sin(v*Math.PI*10-edge*3.4),2)/.004)*(.35+.65*(1-edge));
      const stripeCenter=.29+.095*Math.sin(v*7+phase)+(signed>0?.03:-.03);
      const stripe=Math.exp(-Math.pow((edge-stripeCenter)/.13,2))*(.5+.5*Math.sin(v*11+phase)**2);
      const lamina=(1-edge)*.20+Math.sin(v*9+signed*3+phase)*.025;
      const pale=.68*stripe+.20*ribs+.32*midrib;
      data[i]=20+lamina*20+pale*96;
      data[i+1]=48+lamina*44+pale*93;
      data[i+2]=18+lamina*10+pale*43;
    }
    data[i+3]=255;
  }
  return data;
}
