// Elenca i controlli <44 px per route. Uso: node small-taps.mjs <chrome> <width> route...
import { chromium } from '/home/ale/scala-ai-os/node_modules/playwright/index.mjs';
const [exe,w,...routes]=process.argv.slice(2);
const b=await chromium.launch({executablePath:exe});
const pg=await (await b.newContext({viewport:{width:+w,height:800}})).newPage();
await pg.addInitScript(()=>{for(const [k,v] of Object.entries({scala_cookie_consent:JSON.stringify({necessary:true,analytics:false,marketing:false,timestamp:'x'}),scala_token:'t',tour_completed_scala:'true',scala_pwa_dismissed:'1',scala_onboarding_completed:'true',scala_pro_welcomed:'true',pro_onboarding_done:'true',mobile_onboarding_scala:'true'}))localStorage.setItem(k,v)});
await pg.route('**/api/**', route=>{const u=new URL(route.request().url()).pathname;const ws={id:'w1',name:'Studio Demo',timeZone:'Europe/Rome',role:'OWNER',onboardingCompleted:true};const j=o=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:o})});if(u==='/api/auth/session')return j({user:{id:'u1',email:'d@example.test',name:'Demo',imageUrl:null,timeZone:'Europe/Rome'},workspace:ws});return j([]);});
for(const r of routes){await pg.goto('http://localhost:3207'+r,{waitUntil:'networkidle'});await pg.waitForTimeout(2500);
const o=await pg.evaluate(()=>{const m={};for(const e of document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab]')){const r=e.getBoundingClientRect();if(!r.width||!r.height)continue;if(r.height>=44&&r.width>=44)continue;const k=e.tagName+' '+Math.round(r.width)+'x'+Math.round(r.height)+' "'+(e.innerText||e.getAttribute('aria-label')||e.title||'').trim().slice(0,22)+'"';m[k]=(m[k]||0)+1}return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,14)});
console.log('==',r,w);for(const [k,v] of o)console.log(v,k)}
await b.close();
