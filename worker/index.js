// Heliora Care staging backend. No public booking writes or admin reads until explicitly enabled.
const json = (data,status=200,extra={}) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
const sameOrigin=(request)=>{const origin=request.headers.get('Origin');return !origin || origin===new URL(request.url).origin};
function validBody(b){
 if(!b || typeof b!=='object' || Array.isArray(b))return false;
 if(!/^[\p{L} .'-]{2,100}$/u.test(b.patient_name||''))return false;
 if(!/^\+?[0-9 ()-]{8,20}$/.test(b.patient_phone||''))return false;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.patient_email||'') || b.patient_email.length>254)return false;
 if(!['Centre visit','Home sample collection'].includes(b.appointment_type))return false;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(b.preferred_date||''))return false;
 const d=new Date(b.preferred_date+'T00:00:00Z');if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==b.preferred_date)return false;
 const today=new Date().toISOString().slice(0,10);if(b.preferred_date<today)return false;
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.preferred_time||''))return false;
 if(b.appointment_type==='Home sample collection' && !(b.collection_address||'').trim())return false;
 if((b.collection_address||'').length>500)return false;
 return Array.isArray(b.test_ids)&&b.test_ids.length>0&&b.test_ids.length<=20&&b.test_ids.every(n=>Number.isSafeInteger(n)&&n>0)&&new Set(b.test_ids).size===b.test_ids.length;
}
export default {
 async fetch(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/health')return json({ok:true,service:'heliora-care',database_bound:!!env.DB,bookings_enabled:env.ENABLE_BOOKINGS==='true'});
  if(path.startsWith('/api/admin/'))return json({error:'Admin API disabled pending Cloudflare Access JWT verification and role checks.'},403);
  if(path==='/api/tests' && request.method==='GET'){
   if(!env.DB)return json({error:'Database not configured'},503);
   try{const {results}=await env.DB.prepare('SELECT id,test_name,category,price,home_collection FROM diagnostic_tests WHERE active=1 ORDER BY test_name LIMIT 300').all();return json({tests:results});}catch{return json({error:'Unable to load tests'},503)}
  }
  if(path==='/api/bookings'){
   if(request.method!=='POST')return json({error:'Method not allowed'},405,{allow:'POST'});
   if(env.ENABLE_BOOKINGS!=='true')return json({error:'Bookings are not enabled. This is a staging deployment.'},503);
   if(!sameOrigin(request))return json({error:'Origin not permitted'},403);
   if(!env.DB)return json({error:'Database not configured'},503);
   if(Number(request.headers.get('content-length')||0)>12000)return json({error:'Request too large'},413);
   // Do not enable without server-verified Turnstile, rate limiting, privacy review and mail delivery.
   return json({error:'Booking intake locked until spam protection and notifications are configured.'},503);
  }
  if(path.startsWith('/api/'))return json({error:'Not found'},404);
  return env.ASSETS.fetch(request);
 }
};
