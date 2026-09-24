const APP_ID = (env) => env.META_APP_ID;

function json(data, status=200){
  return new Response(JSON.stringify(data), {
    status,
    headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
  });
}
function html(body){
  return new Response(body,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
}
function redirect(url, cookies=[]){
  const h=new Headers({Location:url,"cache-control":"no-store"});
  for(const c of cookies) h.append("Set-Cookie",c);
  return new Response(null,{status:302,headers:h});
}
function cookie(name,value,maxAge=172800){
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function readCookie(req,name){
  const raw=req.headers.get("Cookie")||"";
  for(const part of raw.split(";")){
    const [k,...v]=part.trim().split("=");
    if(k===name) return decodeURIComponent(v.join("="));
  }
  return null;
}
async function graph(path, token, options={}){
  const u=new URL("https://graph.facebook.com/v26.0"+path);
  if(token) u.searchParams.set("access_token",token);
  const r=await fetch(u,options);
  const d=await r.json();
  if(!r.ok || d.error) throw new Error(d.error?.message || "Meta API hatası");
  return d;
}

const page = `<!doctype html>
<html lang="tr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#005082"><title>Erol Vural AI Publisher</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif;background:#f3f6f8;color:#18242b}
.wrap{max-width:760px;margin:auto;padding:24px 16px 50px}
.hero{background:linear-gradient(135deg,#fff,#edf7f9);border:1px solid #dfe9ed;border-radius:28px;padding:24px;box-shadow:0 12px 40px #153b4b12}
.logo{height:58px;max-width:240px;object-fit:contain;object-position:left center}
h1{font-size:28px;margin:14px 0 6px;color:#005082}p{line-height:1.55}.muted{color:#64747d}
.btn{display:inline-block;border:0;border-radius:15px;padding:14px 18px;background:#005082;color:white;font-weight:700;text-decoration:none;cursor:pointer}
.btn.green{background:#82bc00}.btn.teal{background:#009bb4}.card{background:#fff;border:1px solid #e2eaed;border-radius:22px;padding:18px;margin-top:16px;box-shadow:0 8px 25px #153b4b0b}
textarea,input,select{width:100%;border:1px solid #d7e1e5;border-radius:14px;padding:13px;font:inherit;background:#fff}
textarea{min-height:130px;resize:vertical}.row{display:flex;gap:10px;flex-wrap:wrap}.row>*{flex:1}
.out{white-space:pre-wrap;background:#f5f8f9;border-radius:15px;padding:14px;margin-top:12px}
.badge{display:inline-block;padding:6px 10px;border-radius:999px;background:#eef7f9;color:#005082;font-size:12px;font-weight:700}
</style></head><body><main class="wrap">
<section class="hero">
<img class="logo" src="/erol-vural-logo.png" alt="Doç. Dr. Erol Vural">
<h1>AI Publisher</h1>
<p>İçerik üretimi, düzenleme ve yayınlama için yeni merkez.</p>
<a class="btn" href="/login">Facebook ile Bağlan</a>
</section>
<section class="card">
<span class="badge">V9 • AI</span>
<h2>AI İçerik Asistanı</h2>
<p class="muted">Komutunu yaz. Açıklama, SEO dili ve 5 hashtag için taslak oluştur.</p>
<textarea id="cmd" placeholder="Örn: Açıklamayı daha bilimsel yaz ve Doktor Erol Vural ifadesini doğal şekilde ekle."></textarea>
<div class="row" style="margin-top:10px"><button class="btn teal" onclick="runAI()">AI ile Düzenle</button><button class="btn green" onclick="makeImage()">Görsel Oluştur</button></div>
<div id="out" aria-live="polite"></div>
</section>
<section class="card">
<h2>Yayınlama</h2><p class="muted">Önce Meta bağlantısını kur. Sayfalar ve Instagram Professional hesapları API'den getirilecek.</p>
<div id="status">Bağlantı kontrol ediliyor…</div>
</section>
</main>
<script>
async function runAI(){
 const out=document.querySelector('#out'); out.innerHTML='<div class="out">AI çalışıyor…</div>';
 try{const r=await fetch('/api/ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command:document.querySelector('#cmd').value})});const d=await r.json();if(!r.ok)throw Error(d.error||'AI hatası');out.innerHTML='<div class="out">'+esc(d.text||'')+'</div>'}catch(e){out.innerHTML='<div class="out">❌ '+esc(e.message)+'</div>'}
}
async function makeImage(){
 const out=document.querySelector('#out');out.innerHTML='<div class="out">Görsel oluşturuluyor…</div>';
 try{const r=await fetch('/api/ai-image',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({prompt:document.querySelector('#cmd').value||'Metabolik ve bariatrik cerrahi hakkında sade, profesyonel sağlık bilgilendirme görseli'})});if(!r.ok){let d=await r.json().catch(()=>({}));throw Error(d.error||'Görsel üretim hatası')}const d=await r.json();if(!d.dataURI)throw Error(d.error||'Görsel verisi alınamadı');out.innerHTML='<div class="out">Görsel üretildi.<br><img src="'+d.dataURI+'" style="display:block;width:100%;max-width:640px;height:auto;border-radius:16px;margin-top:10px" alt="AI görseli"></div>'}catch(e){out.innerHTML='<div class="out">❌ '+esc(e.message)+'</div>'}
}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
fetch('/api/me').then(r=>r.json()).then(d=>document.querySelector('#status').innerHTML=d.connected?'✅ Meta bağlantısı aktif.':'Henüz Meta bağlantısı yok.').catch(()=>{})
</script></body></html>`;

function extractAIText(r){
  const candidates=[
    r?.response,
    r?.output_text,
    r?.text,
    r?.choices?.[0]?.message?.content,
    r?.choices?.[0]?.text,
    r?.result?.response,
    r?.result?.text
  ];
  for(const v of candidates){
    if(typeof v === "string" && v.trim()) return v.trim();
    if(v && typeof v === "object"){
      const nested=v.content ?? v.text ?? v.value;
      if(typeof nested === "string" && nested.trim()) return nested.trim();
    }
  }
  return typeof r === "string" ? r : JSON.stringify(r,null,2);
}

async function handle(req, env){
  const url=new URL(req.url);
  if(url.pathname==="/") return html(page);
  if(url.pathname==="/privacy") return html(`<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Gizlilik Politikası</title></head><body style="font-family:Arial;max-width:760px;margin:40px auto;padding:20px;line-height:1.7"><h1>Gizlilik Politikası</h1><p>Bu uygulama, kullanıcının yetkili olduğu Meta hesapları ve Sayfaları üzerinden içerik yönetimi ve yayınlama işlemleri için tasarlanmıştır.</p><p>Uygulama R2, KV veya D1 ile kalıcı içerik arşivi oluşturmaz.</p><p>İletişim: qasimm2012@gmail.com</p></body></html>`);

  if(url.pathname==="/login"){
    if(!env.META_APP_ID) return new Response("META_APP_ID eksik.",{status:500});
    const state=crypto.randomUUID();
    const redirectUri=url.origin+"/callback";
    const p=new URLSearchParams({client_id:String(env.META_APP_ID||"").trim(),redirect_uri:redirectUri,state,response_type:"code",scope:"pages_show_list,pages_read_engagement,pages_manage_posts"});
    // Pin the OAuth dialog and Graph API to the current Graph API version. public_profile is not requested explicitly here.
    return redirect("https://www.facebook.com/dialog/oauth?"+p.toString(),[cookie("oauth_state",state,600)]);
  }
  if(url.pathname==="/callback"){
    const state=url.searchParams.get("state"), saved=readCookie(req,"oauth_state"), code=url.searchParams.get("code");
    if(!code || !state || state!==saved) return new Response("OAuth state doğrulaması başarısız.",{status:400});
    const redirectUri=url.origin+"/callback";
    const tokenUrl=new URL("https://graph.facebook.com/oauth/access_token");
    tokenUrl.searchParams.set("client_id",env.META_APP_ID);tokenUrl.searchParams.set("client_secret",env.META_APP_SECRET);tokenUrl.searchParams.set("redirect_uri",redirectUri);tokenUrl.searchParams.set("code",code);
    const r=await fetch(tokenUrl);const d=await r.json();
    if(!r.ok||d.error) return html(`<h1>Meta OAuth hatası</h1><pre>${JSON.stringify(d,null,2)}</pre>`);
    return redirect("/",[cookie("fb_token",d.access_token,172800)]);
  }
  if(url.pathname==="/api/me"){
    const token=readCookie(req,"fb_token"); return json({connected:!!token});
  }
  if(url.pathname==="/api/pages"){
    const token=readCookie(req,"fb_token"); if(!token)return json({error:"Meta bağlantısı yok"},401);
    try{return json(await graph("/me/accounts?fields=id,name,access_token,tasks",token));}catch(e){return json({error:e.message},400);}
  }
  if(url.pathname==="/api/ai" && req.method==="POST"){
    if(!env.AI)return json({error:"Workers AI binding bulunamadı."},500);
    const body=await req.json().catch(()=>({}));const command=body.command||"";
    if(!command)return json({error:"Komut boş."},400);
    const prompt=`Türkçe sosyal medya sağlık içeriği editörüsün. Kullanıcının komutunu uygula. Reklam/pazarlama iddiaları üretme; sağlık bilgisini bilgilendirici ve temkinli yaz. Doğal şekilde gerekirse Doktor Erol Vural, Doç. Dr. Erol Vural veya Dr. Erol Vural ifadelerinden uygun olanını kullan. Tam olarak 5 hashtag üret. Kullanıcı komutu: ${command}`;
    const r=await env.AI.run("@cf/google/gemma-4-26b-a4b-it",{messages:[{role:"user",content:prompt}],chat_template_kwargs:{enable_thinking:false}});
    const text = extractAIText(r);
    return json({text});
  }
  if(url.pathname==="/api/ai-image" && req.method==="POST"){
    if(!env.AI)return json({error:"Workers AI binding bulunamadı."},500);
    const body=await req.json().catch(()=>({}));const prompt=body.prompt||"Profesyonel sağlık bilgilendirme görseli";
    const r=await env.AI.run("@cf/black-forest-labs/flux-1-schnell",{prompt:`Türkçe sağlık bilgilendirme tasarımı, lacivert turkuaz beyaz, temiz ve profesyonel, yazıları okunaklı ve gereksiz tıbbi iddia içermeyen bir sosyal medya görseli, ${prompt}`,steps:4});
    if(!r || !r.image) return json({error:"Görsel modeli görüntü döndürmedi."},502);
    return json({dataURI:`data:image/jpeg;base64,${r.image}`});
  }

  // Static assets (logo, favicon, etc.) are served by Cloudflare Assets.
  if(env.ASSETS) return env.ASSETS.fetch(req);
  return new Response("Not Found",{status:404});
}
export default {fetch:handle};