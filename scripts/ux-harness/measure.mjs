// Misura UX locale (Playwright su localhost, SOLO i nostri siti). Uso: node measure.mjs <baseUrl> <outDir> <tag> route1 route2 ...
import { chromium } from '/home/ale/scala-ai-os/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const [base, outDir, tag, ...routes] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const probe = () => {
  const lum = (r,g,b)=>{const f=c=>{c/=255;return c<=.03928?c/12.92:((c+.055)/1.055)**2.4};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
  const parse = s=>{const m=s.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);return {r:p[0],g:p[1],b:p[2],a:p[3]===undefined?1:p[3]}};
  const bgOf = el=>{let layers=[];for(let e=el;e;e=e.parentElement){const c=parse(getComputedStyle(e).backgroundColor);if(c&&c.a>0){layers.push(c);if(c.a>=1)break}}let base={r:11,g:17,b:32};let cur=base;for(const l of layers.reverse()){cur={r:l.r*l.a+cur.r*(1-l.a),g:l.g*l.a+cur.g*(1-l.a),b:l.b*l.a+cur.b*(1-l.a)}}return cur};
  let textBlocks=0, low=0; const lowSamples={};
  const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(w.nextNode()){const n=w.currentNode;if(!n.textContent.trim())continue;const el=n.parentElement;if(!el||['SCRIPT','STYLE','NOSCRIPT'].includes(el.tagName))continue;const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')continue;const r=el.getBoundingClientRect();if(r.width<2||r.height<2)continue;
    const fg=parse(cs.color);if(!fg)continue;const bg=bgOf(el);const a=fg.a*(parseFloat(cs.opacity)||1);const f={r:fg.r*a+bg.r*(1-a),g:fg.g*a+bg.g*(1-a),b:fg.b*a+bg.b*(1-a)};
    const L1=lum(f.r,f.g,f.b),L2=lum(bg.r,bg.g,bg.b);const cr=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
    const fs=parseFloat(cs.fontSize),bold=parseInt(cs.fontWeight)>=700;const large=fs>=24||(fs>=18.66&&bold);const need=large?3:4.5;textBlocks++;
    if(cr<need){low++;const k=cs.color+' on '+`rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`+' '+cr.toFixed(2);lowSamples[k]=(lowSamples[k]||0)+1}}
  const ctr=[...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=menuitem]')].filter(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=='hidden'});
  const small=ctr.filter(e=>{const r=e.getBoundingClientRect();if(e.tagName==='A'&&getComputedStyle(e).display==='inline'&&e.closest('p,li,span'))return false;return r.height<44||r.width<44});
  const fields=[...document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]),select,textarea')].filter(e=>e.getBoundingClientRect().width>0);
  const unl=fields.filter(e=>!(e.labels&&e.labels.length)&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')&&!e.getAttribute('title'));
  const imgsNoAlt=[...document.images].filter(i=>!i.hasAttribute('alt')).length;
  const btnNoName=[...document.querySelectorAll('button,a[href]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&!(e.textContent.trim()||e.getAttribute('aria-label')||e.getAttribute('title')||e.querySelector('img[alt]'))}).length;
  const top=Object.entries(lowSamples).sort((a,b)=>b[1]-a[1]).slice(0,3);
  return {textBlocks,low,top,controls:ctr.length,smallTap:small.length,fields:fields.length,unlabeled:unl.length,btnNoName,imgsNoAlt,h1:document.querySelectorAll('h1').length,main:document.querySelectorAll('main').length,hscroll:document.documentElement.scrollWidth>innerWidth+1,docH:document.documentElement.scrollHeight,words:document.body.innerText.split(/\s+/).length};
};
const b = await chromium.launch({executablePath:process.env.CHROME_BIN||'/home/ale/.cache/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-linux64/chrome-headless-shell'});
const out=[];
for (const vp of [{n:390,w:390,h:844},{n:1280,w:1280,h:800}]) {
  const ctx = await b.newContext({ viewport:{width:vp.w,height:vp.h}, deviceScaleFactor:1, ...(process.env.STORAGE?{storageState:process.env.STORAGE}:{}) });
  await ctx.addInitScript(() => { try { localStorage.setItem('scala_cookie_consent',JSON.stringify({necessary:true,analytics:false,marketing:false,timestamp:new Date().toISOString()})); localStorage.setItem('scala_token','demo-token'); localStorage.setItem('tour_completed_scala','true'); for (const k of ['scala_pro_welcomed','scala_info_dismissed','scala_upgrade_banner_dismissed','scala_pwa_dismissed','pro_onboarding_done']) localStorage.setItem(k,k==='scala_pwa_dismissed'?'1':'true'); localStorage.setItem('scala_onboarding_completed','true'); localStorage.setItem('i18nextLng','it'); } catch(e){} window.__cls=0; window.__lcp=0;
    new PerformanceObserver(l=>{for(const e of l.getEntries()) if(!e.hadRecentInput) window.__cls+=e.value}).observe({type:'layout-shift',buffered:true});
    new PerformanceObserver(l=>{for(const e of l.getEntries()) window.__lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true}); });
  if (process.env.MOCK==='snagtime') await ctx.route('**/api/**', route => {
    const u=new URL(route.request().url()).pathname; const j=o=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:o})});
    const ws={id:'w1',name:'Studio Demo',timeZone:'Europe/Rome',role:'OWNER',onboardingCompleted:true};
    if(u==='/api/auth/session') return j({user:{id:'u1',email:'demo@example.test',name:'Demo User',imageUrl:null,timeZone:'Europe/Rome'},workspace:ws});
    if(u==='/api/account') return j({user:{id:'u1',email:'demo@example.test',name:'Demo User',imageUrl:null,timeZone:'Europe/Rome'},workspace:ws,workspaces:[ws],members:[{id:'m1',userId:'u1',name:'Demo User',email:'demo@example.test',role:'OWNER',status:'ACTIVE'}]});
    const durs=[{id:'d1',label:'30 min',durationMinutes:30,isDefault:true,priceCents:0,currency:'EUR',position:0}];
    if(u==='/api/event-types') return j([1,2,3].map(i=>({id:'e'+i,name:'Consulenza demo '+i,slug:'demo-'+i,description:'Evento sintetico',durationMinutes:30,color:['#2563eb','#16836f','#a56813'][i-1],locationType:'GOOGLE_MEET',locationValue:null,isActive:i<3,bufferBeforeMinutes:0,bufferAfterMinutes:0,minimumNoticeMinutes:60,bookingWindowDays:30,priceCents:0,currency:'EUR',bookingUrl:'https://example.test/demo-'+i,durations:durs,questions:[],branding:null,bookingCount:4*i,hostName:'Demo User'})));
    if(u==='/api/bookings') return j([1,2,3,4].map(i=>({id:'b'+i,eventTypeId:'e1',eventTypeName:'Consulenza demo 1',inviteeName:'Ospite '+i,inviteeEmail:'ospite'+i+'@example.test',eventTitleSnapshot:'Consulenza demo 1',locationType:'GOOGLE_MEET',locationValue:null,calendarProvider:'local',inviteeTimeZone:'Europe/Rome',startAt:new Date(Date.now()+i*864e5).toISOString(),endAt:new Date(Date.now()+i*864e5+18e5).toISOString(),status:i==3?'PENDING_PAYMENT':'CONFIRMED',notes:null,calendarSyncStatus:'LOCAL',notificationStatus:'LOCAL_NO_EMAIL',cancellationReason:null,hostName:'Demo User',durationId:'d1',durationMinutes:30,priceCents:0,currency:'EUR',bookingWindowDays:30,refundStatus:'NOT_REQUIRED',refundedAmountCents:0})));
    return j([]);
  });
  for (const r of routes) {
    const pg = await ctx.newPage(); const errs=[]; const ext=new Set();
    pg.on('pageerror',e=>errs.push(String(e).slice(0,100)));
    pg.on('request',q=>{const u=new URL(q.url());if(!['localhost'].includes(u.hostname))ext.add(u.hostname)});
    try { await pg.goto(base+r,{waitUntil:'networkidle',timeout:45000}); } catch(e){ errs.push('goto:'+String(e).slice(0,60)); }
    await pg.waitForTimeout(+(process.env.WAIT||2500));
    const m = await pg.evaluate(probe).catch(e=>({err:String(e)}));
    const pf = await pg.evaluate(()=>({lcp:Math.round(window.__lcp),cls:+window.__cls.toFixed(3)}));
    const slug = r.replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'')||'home';
    await pg.screenshot({path:`${outDir}/${tag}_${slug}_${vp.n}.png`,fullPage:false});
    out.push({route:r,vp:vp.n,...m,...pf,errs:errs.length,ext:[...ext]}); await pg.close();
  }
  await ctx.close();
}
await b.close();
fs.writeFileSync(`${outDir}/${tag}.json`,JSON.stringify(out,null,1));
for (const o of out) console.log(`${o.vp} ${o.route} | low ${o.low}/${o.textBlocks} | tap<44 ${o.smallTap}/${o.controls} | unl ${o.unlabeled}/${o.fields} | noName ${o.btnNoName} | h1 ${o.h1} main ${o.main} | hscroll ${o.hscroll} | H ${o.docH} | LCP ${o.lcp} CLS ${o.cls} | err ${o.errs} ext ${o.ext.join(',')}`);
