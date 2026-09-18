import {leafGrowth,type LeafDescriptor} from './index';

/** Renderer 1.2 geometry only. The server's seed, birth week and credits never change. */
export function botanicalLeaf(d:LeafDescriptor,week:number,rows=24,columns=10){
  if(!Number.isFinite(week)||week<0||week>52||!Number.isInteger(rows)||rows<4||rows>64||!Number.isInteger(columns)||columns<4||columns>32)
    throw new Error('Invalid botanical geometry request');
  for(const key of ['length','width','height','angle','bend','azimuth','stemLength','colorVariant'] as const)
    if(!Number.isFinite(d[key]))throw new Error('Invalid leaf descriptor');
  if(d.width<=0||d.length<=0)throw new Error('Invalid leaf dimensions');
  const g=leafGrowth(d,week),positions:number[]=[],uv:number[]=[],indices:number[]=[];
  // Young blades unfurl from a narrow fold instead of scaling the entire plant.
  const unfurl=.28+.72*g;
  for(let y=0;y<=rows;y++){
    const t=y/rows,span=Math.pow(Math.max(0,Math.sin(Math.PI*t)),.82)*d.width*.72*g*unfurl;
    for(let x=0;x<=columns;x++){
      const u=x/columns,s=u*2-1;
      const ripple=.006*Math.sin(t*25+d.colorVariant*7)*Math.sin(Math.PI*t)*s*s;
      const fold=.040*(1-g*.45)*Math.abs(s)*Math.sin(Math.PI*t);
      const curl=.22*Math.pow(t,2.2)-.035*Math.sin(t*Math.PI);
      positions.push(s*span*(1+.025*Math.sin(t*12+d.angle)),t*d.length*g,(curl+fold+ripple)*g);
      uv.push(u,t);
      if(y<rows&&x<columns){const a=y*(columns+1)+x,b=a+columns+1;indices.push(a,b,a+1,b,b+1,a+1)}
    }
  }
  return {positions:new Float32Array(positions),uv:new Float32Array(uv),indices:new Uint16Array(indices),growth:g};
}

/** Stable pose, evaluated by renderer version; stem anchors grow with their own leaf. */
export function botanicalPose(d:LeafDescriptor,week:number){
  const g=leafGrowth(d,week),radius=d.stemLength*.64*g;
  return {position:[Math.sin(d.angle)*radius,.035+d.height*(.55+.45*g),Math.cos(d.angle)*radius*.6] as [number,number,number],
    rotation:[.14+d.azimuth*.46,d.angle,Math.sin(d.angle)*.20] as [number,number,number],growth:g};
}
