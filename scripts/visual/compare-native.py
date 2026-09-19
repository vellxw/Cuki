#!/usr/bin/env python3
"""Private native/canon comparison, not a release or pixel-perfect certification.

Requires Pillow and numpy. Canon source PNGs stay outside the repository. Only a
single uniform width scale and the declared device-interior crop are allowed.
Aspect-ratio residuals remain visible, never stretched away. No screenshot is
selected by visual resemblance: compare the capture harness's first named frame.
"""
import argparse
import hashlib
import html
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageChops

SCENES = ('home','recipes','recipe','scan','training','garden')

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def uniform_width(image, width):
    if width <= 0: raise ValueError('Invalid logical width')
    scale = width / image.width
    return image.resize((width, round(image.height * scale)), Image.Resampling.LANCZOS), scale

def crop_valid(image, box):
    if len(box) != 4 or any(not isinstance(v,int) for v in box): raise ValueError('Integer crop required')
    x0,y0,x1,y1=box
    if not (0<=x0<x1<=image.width and 0<=y0<y1<=image.height): raise ValueError('Crop is outside its original')
    return image.crop(box)

def metrics(a,b):
    if a.size != b.size: raise ValueError('No implicit metric resize')
    av=np.asarray(a,dtype=np.float64);bv=np.asarray(b,dtype=np.float64)
    difference=np.abs(av-bv)
    def edges(v):
        gray=np.mean(v,axis=2)
        return np.diff(gray,axis=0),np.diff(gray,axis=1)
    ae,be=edges(av),edges(bv)
    return {'meanAbsoluteChannelDifference_0_255':float(difference.mean()),
            'changedPixelFraction':float(np.any(difference!=0,axis=2).mean()),
            'meanAbsoluteEdgeDifference':float(np.mean([np.abs(x-y).mean() for x,y in zip(ae,be)])),
            'identicalPixels':bool(np.array_equal(av,bv))}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--references',type=Path,required=True)
    parser.add_argument('--captures',type=Path,required=True)
    parser.add_argument('--contract',type=Path,default=Path('docs/visual/comparison-contract.json'))
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    contract=json.loads(args.contract.read_text());native=json.loads((args.captures/'report.json').read_text())
    args.output.mkdir(parents=True,exist_ok=True)
    result={'sourceCommit':native.get('sourceCommit'),'captureReportSha256':sha(args.captures/'report.json'),
            'contractSha256':sha(args.contract),'scope':'diagnostic differences; not a percent-complete or quality score',
            'cropCalibration':contract['cropCalibration'],'fidelityApproved':False,'scenes':[]}
    articles=[]
    for i,scene in enumerate(SCENES,1):
        item=contract['scenes'][scene];reference=args.references/item['file']
        if sha(reference)!=item['sha256']: raise ValueError('Original reference changed: '+scene)
        capture=args.captures/f'{i:02d}-{scene}-1.png';second=args.captures/f'{i:02d}-{scene}-2.png'
        scene_meta=next((s for s in native.get('captures',[]) if s['scene']==scene),None)
        if not scene_meta or not capture.is_file() or not second.is_file():
            result['scenes'].append({'scene':scene,'error':'Missing named native capture/evidence','fidelityApproved':False});continue
        records={r['path']:r['sha256'] for r in scene_meta['framebuffers']}
        if records.get(capture.name)!=sha(capture) or records.get(second.name)!=sha(second):
            raise ValueError('Native framebuffer hash mismatch: '+scene)
        original=Image.open(reference).convert('RGB');raw=Image.open(capture).convert('RGB');repeat=Image.open(second).convert('RGB')
        ref,ref_scale=uniform_width(crop_valid(original,item['interiorCrop']),contract['logicalWidth'])
        shot,native_scale=uniform_width(raw,contract['logicalWidth'])
        common_height=min(ref.height,shot.height);box=(0,0,ref.width,common_height)
        ref_name=scene+'-reference.png';native_name=scene+'-native.png';overlay_name=scene+'-overlay.png';diff_name=scene+'-difference.png'
        ref.save(args.output/ref_name);shot.save(args.output/native_name)
        Image.blend(ref.crop(box),shot.crop(box),.5).save(args.output/overlay_name)
        ImageChops.difference(ref.crop(box),shot.crop(box)).save(args.output/diff_name)
        row={'scene':scene,'referenceSha256':sha(reference),'nativeSha256':sha(capture),'referenceOriginalPixels':original.size,
             'nativeOriginalPixels':raw.size,'referenceCrop':item['interiorCrop'],'referenceUniformScale':ref_scale,
             'nativeUniformScale':native_scale,'referenceNormalizedSize':ref.size,'nativeNormalizedSize':shot.size,
             'uncomparedHeightPixels':abs(ref.height-shot.height),'comparisonRect':box,
             'repeatFrameDifference':metrics(raw,repeat),'differences':metrics(ref.crop(box),shot.crop(box)),
             'nativeSceneAsserted':scene_meta.get('nativeSceneAsserted',False),'fidelityApproved':False,
             'regions':[]}
        for region in contract['regions']:
            y0=round(common_height*region['start']);y1=round(common_height*region['end'])
            area=(0,y0,ref.width,y1)
            row['regions'].append({'name':region['name'],'rect':area,**metrics(ref.crop(area),shot.crop(area))})
        proof=args.captures/f'{i:02d}-{scene}-proof.json'
        if proof.is_file():row['nativeProof']=json.loads(proof.read_text())
        result['scenes'].append(row)
        articles.append(f'<section><h2>{html.escape(scene)}</h2><div class="pair"><figure><img src="{ref_name}"><figcaption>Referencia: recorte declarado, escala uniforme</figcaption></figure><figure><img src="{native_name}"><figcaption>Frame nativo original normalizado</figcaption></figure><figure><img src="{overlay_name}"><figcaption>Superposición al 50 % · solo área común</figcaption></figure><figure><img src="{diff_name}"><figcaption>Diferencia absoluta, sin amplificar</figcaption></figure></div><details><summary>Mediciones, procedencia y residuo de proporciones</summary><pre>{html.escape(json.dumps(row,ensure_ascii=False,indent=2))}</pre></details></section>')
    (args.output/'comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    (args.output/'index.html').write_text('''<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CUKI · comparación nativa</title><style>body{margin:0;padding:32px;background:#101412;color:#eff4f0;font:16px system-ui}h1{font-size:28px}.pair{display:flex;align-items:flex-start;gap:14px;overflow:auto}figure{margin:0;min-width:240px;max-width:390px;flex:1}img{width:100%;display:block}figcaption{font-size:12px;margin:8px 0;color:#c0c9c3}section{padding:24px 0;border-top:1px solid #48544b}pre{white-space:pre-wrap;font-size:12px}p{max-width:960px;line-height:1.6}summary{cursor:pointer;padding:12px 0}</style><h1>CUKI · referencias frente al binario nativo</h1><p>Visor privado de diagnóstico, no una aplicación web ni una aprobación visual. Los originales no se retocan. Se excluye el marco mediante coordenadas declaradas y se escala uniformemente por ancho. Las proporciones distintas permanecen visibles: el residuo no se deforma ni desaparece del informe. Los recortes iniciales necesitan calibración de anclas antes de aplicar tolerancias de 1–2 dp. Las diferencias de color no representan un porcentaje de similitud ni de producto terminado.</p>'''+''.join(articles)+'</html>')
    print(json.dumps({'scenes':len(result['scenes']),'sourceCommit':result['sourceCommit'],'fidelityApproved':False,'report':str(args.output/'comparison.json')}))

if __name__=='__main__':main()
