const APP_ID = "27708155402192252";
const GRAPH = "https://graph.facebook.com";
const GRAPH_VERSION = "v23.0";
const SESSION_SECONDS = 172800;
const OAUTH_SECONDS = 600;
const CHUNK_SIZE = 8 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/") return home();
      if (url.pathname === "/privacy") return privacy();
      if (url.pathname === "/login") return login(url);
      if (url.pathname === "/callback") return callback(request, url, env);
      if (url.pathname === "/app") return app(request);
      if (url.pathname === "/logout") return logout();

      if (url.pathname === "/api/pages") return pagesAPI(request);
      if (url.pathname === "/api/publish") return publishAPI(request);
      if (url.pathname === "/api/ai") return aiAPI(request, env);
      if (url.pathname === "/api/ai-image") return aiImageAPI(request, env);
      if (url.pathname === "/assets/erol-vural-logo.png" && env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      if (url.pathname === "/api/video/start") return videoStart(request);
      if (url.pathname === "/api/video/upload") return videoUpload(request);
      if (url.pathname === "/api/video/finish") return videoFinish(request);

      if (url.pathname === "/api/reel/start") return reelStart(request);
      if (url.pathname === "/api/reel/upload") return reelUpload(request);
      if (url.pathname === "/api/reel/finish") return reelFinish(request);

      if (url.pathname === "/api/story/photo") return storyPhoto(request);
      if (url.pathname === "/api/story/video/start") return storyVideoStart(request);
      if (url.pathname === "/api/story/video/upload") return storyVideoUpload(request);
      if (url.pathname === "/api/story/video/finish") return storyVideoFinish(request);

      return text("Not Found", 404);
    } catch (error) {
      return json({ success: false, error: cleanError(error) }, 500);
    }
  }
};

/* ---------------- AUTH ---------------- */

function login(url) {
  const state = crypto.randomUUID();
  const redirectUri = url.origin + "/callback";

  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: redirectUri,
    state: state,
    response_type: "code",
    scope: "public_profile,pages_show_list,pages_read_engagement,pages_manage_posts"
  });

  const location =
    "https://www.facebook.com/" +
    GRAPH_VERSION +
    "/dialog/oauth?" +
    params.toString();

  return redirect(location, [
    cookie("oauth_state", state, OAUTH_SECONDS)
  ]);
}

async function callback(request, url, env) {
  const cookies = readCookies(request.headers.get("Cookie") || "");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state || state !== cookies.oauth_state) {
    return text("OAuth doğrulaması başarısız.", 400);
  }

  if (!env.META_APP_SECRET) {
    return text("META_APP_SECRET Cloudflare Secret eksik.", 500);
  }

  const params = new URLSearchParams({
    client_id: APP_ID,
    client_secret: env.META_APP_SECRET,
    redirect_uri: url.origin + "/callback",
    code: code
  });

  const response = await fetch(
    GRAPH + "/oauth/access_token?" + params.toString()
  );

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    return json({
      success: false,
      error: data?.error?.message || "Facebook erişim anahtarı alınamadı."
    }, 400);
  }

  return redirect("/app", [
    cookie("fb_user_token", data.access_token, SESSION_SECONDS),
    cookie("oauth_state", "", 0)
  ]);
}

function logout() {
  return redirect("/", [
    cookie("fb_user_token", "", 0),
    cookie("oauth_state", "", 0)
  ]);
}

/* ---------------- FACEBOOK PAGES ---------------- */

function getUserToken(request) {
  const cookies = readCookies(request.headers.get("Cookie") || "");
  return cookies.fb_user_token || null;
}

async function getPages(request) {
  const token = getUserToken(request);

  if (!token) {
    throw new Error("Oturum süresi dolmuş. Facebook ile tekrar bağlanın.");
  }

  const params = new URLSearchParams({
    fields: "id,name,access_token,tasks",
    access_token: token
  });

  const response = await fetch(
    GRAPH + "/me/accounts?" + params.toString()
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data?.error?.message || "Facebook Sayfaları alınamadı."
    );
  }

  return data.data || [];
}

async function getPage(request, pageId) {
  const pages = await getPages(request);
  const page = pages.find(function (item) {
    return String(item.id) === String(pageId);
  });

  if (!page || !page.access_token) {
    throw new Error("Sayfa bulunamadı veya yayınlama yetkisi yok.");
  }

  return page;
}

async function pagesAPI(request) {
  const pages = await getPages(request);

  return json({
    success: true,
    sessionHours: 48,
    pages: pages.map(function (page) {
      return {
        id: page.id,
        name: page.name
      };
    })
  });
}

/* ---------------- NORMAL POSTS / PHOTOS ---------------- */

async function publishAPI(request) {
  const form = await request.formData();
  const ids = parseJSON(form.get("pages"), []);
  const type = String(form.get("type") || "post");
  const message = String(form.get("message") || "").trim();
  const media = form.get("media");

  if (!ids.length) {
    return json({ success: false, error: "En az bir Sayfa seçin." }, 400);
  }

  const results = [];

  for (const pageId of ids) {
    try {
      const page = await getPage(request, pageId);
      let result;

      if (type === "photo" && media && typeof media !== "string") {
        result = await publishPhoto(page, message, media);
      } else {
        if (!message) throw new Error("Gönderi metni boş.");
        result = await publishText(page, message);
      }

      results.push({
        pageId: page.id,
        page: page.name,
        success: true,
        result: result
      });
    } catch (error) {
      results.push({
        pageId: pageId,
        page: String(pageId),
        success: false,
        error: cleanError(error)
      });
    }
  }

  return json({ success: true, results: results });
}

async function publishText(page, message) {
  const body = new URLSearchParams({
    message: message,
    access_token: page.access_token
  });

  const response = await fetch(
    GRAPH + "/" + page.id + "/feed",
    { method: "POST", body: body }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data?.error?.message || "Gönderi yayınlanamadı."
    );
  }

  return data;
}

async function publishPhoto(page, message, file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Geçerli bir fotoğraf seçin.");
  }

  const body = new FormData();
  body.append("source", file, file.name || "photo.jpg");
  if (message) body.append("caption", message);
  body.append("access_token", page.access_token);

  const response = await fetch(
    GRAPH + "/" + page.id + "/photos",
    { method: "POST", body: body }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data?.error?.message || "Fotoğraf yayınlanamadı."
    );
  }

  return data;
}

/* ---------------- VIDEO ---------------- */

async function videoStart(request) {
  const body = await request.json();
  const page = await getPage(request, body.pageId);
  const fileSize = Number(body.fileSize || 0);

  if (!fileSize) throw new Error("Video boyutu alınamadı.");

  const params = new URLSearchParams({
    upload_phase: "start",
    file_size: String(fileSize),
    access_token: page.access_token
  });

  const response = await fetch(
    GRAPH + "/" + page.id + "/videos",
    { method: "POST", body: params }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data?.error?.message || "Video yükleme başlatılamadı."
    );
  }

  return json({
    success: true,
    page: page.name,
    session: data.upload_session_id,
    start: Number(data.start_offset || 0),
    end: Number(data.end_offset || 0)
  });
}

async function videoUpload(request) {
  const form = await request.formData();
  const page = await getPage(request, form.get("pageId"));
  const session = String(form.get("session") || "");
  const offset = String(form.get("offset") || "0");
  const chunk = form.get("chunk");

  if (!session || !chunk || typeof chunk === "string") {
    throw new Error("Video parçası eksik.");
  }

  const body = new FormData();
  body.append("upload_phase", "transfer");
  body.append("upload_session_id", session);
  body.append("start_offset", offset);
  body.append("video_file_chunk", chunk, "video.chunk");
  body.append("access_token", page.access_token);

  const response = await fetch(
    GRAPH + "/" + page.id + "/videos",
    { method: "POST", body: body }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data?.error?.message || "Video parçası yüklenemedi."
    );
  }

  return json({
    success: true,
    start: Number(data.start_offset || 0),
    end: Number(data.end_offset || 0)
  });
}

async function videoFinish(request) {
  const body = await request.json();
  const page = await getPage(request, body.pageId);

  const params = new URLSearchParams({
    upload_phase: "finish",
    upload_session_id: String(body.session || ""),
    access_token: page.access_token
  });

  if (body.description) {
    params.set("description", String(body.description));
  }

  const response = await fetch(
    GRAPH + "/" + page.id + "/videos",
    { method: "POST", body: params }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data?.error?.message || "Video yayınlanamadı."
    );
  }

  return json({
    success: true,
    page: page.name,
    result: data
  });
}

/* ---------------- REELS ---------------- */

async function reelStart(request) {
  const body = await request.json();
  const page = await getPage(request, body.pageId);

  const params = new URLSearchParams({
    upload_phase: "start",
    access_token: page.access_token
  });

  const response = await fetch(
    GRAPH + "/" + page.id + "/video_reels",
    { method: "POST", body: params }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data?.error?.message || "Reels yükleme başlatılamadı."
    );
  }

  return json({
    success: true,
    page: page.name,
    videoId: data.video_id,
    uploadUrl: data.upload_url
  });
}

async function reelUpload(request) {
  const form = await request.formData();
  const page = await getPage(request, form.get("pageId"));
  const uploadUrl = String(form.get("uploadUrl") || "");
  const offset = String(form.get("offset") || "0");
  const chunk = form.get("chunk");

  if (!uploadUrl || !chunk || typeof chunk === "string") {
    throw new Error("Reels parçası eksik.");
  }

  const host = new URL(uploadUrl).hostname;

  if (host !== "rupload.facebook.com") {
    throw new Error("Geçersiz Meta upload adresi.");
  }

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: "OAuth " + page.access_token,
      offset: offset,
      "Content-Type": "application/octet-stream"
    },
    body: chunk
  });

  const raw = await response.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch (error) {
    data = { raw: raw };
  }

  if (!response.ok || data.error) {
    throw new Error(
      data?.error?.message || "Reels videosu yüklenemedi."
    );
  }

  return json({ success: true, result: data });
}

async function reelFinish(request) {
  const body = await request.json();
  const page = await getPage(request, body.pageId);

  const params = new URLSearchParams({
    upload_phase: "finish",
    video_id: String(body.videoId || ""),
    video_state: "PUBLISHED",
    access_token: page.access_token
  });

  if (body.description) {
    params.set("description", String(body.description));
  }

  const response = await fetch(
    GRAPH + "/" + page.id + "/video_reels",
    { method: "POST", body: params }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data?.error?.message || "Reels yayınlanamadı."
    );
  }

  return json({
    success: true,
    page: page.name,
    result: data
  });
}

/* ---------------- STORIES ---------------- */

async function storyPhoto(request) {
  const form = await request.formData();
  const page = await getPage(request, form.get("pageId"));
  const file = form.get("media");

  if (!file || typeof file === "string") {
    throw new Error("Story fotoğrafı seçilmedi.");
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Story için fotoğraf seçin.");
  }

  const upload = new FormData();
  upload.append("source", file, file.name || "story.jpg");
  upload.append("published", "false");
  upload.append("access_token", page.access_token);

  const photoResponse = await fetch(
    GRAPH + "/" + page.id + "/photos",
    { method: "POST", body: upload }
  );

  const photoData = await photoResponse.json();

  if (!photoResponse.ok || photoData.error || !photoData.id) {
    throw new Error(
      photoData?.error?.message || "Story fotoğrafı yüklenemedi."
    );
  }

  const params = new URLSearchParams({
    photo_id: photoData.id,
    access_token: page.access_token
  });

  const storyResponse = await fetch(
    GRAPH + "/" + page.id + "/photo_stories",
    { method: "POST", body: params }
  );

  const storyData = await storyResponse.json();

  if (!storyResponse.ok || storyData.error) {
    throw new Error(
      storyData?.error?.message || "Fotoğraf Story yayınlanamadı."
    );
  }

  return json({
    success: true,
    page: page.name,
    result: storyData
  });
}

async function storyVideoStart(request) {
  const body = await request.json();
  const page = await getPage(request, body.pageId);

  const params = new URLSearchParams({
    upload_phase: "start",
    access_token: page.access_token
  });

  const response = await fetch(
    GRAPH + "/" + page.id + "/video_stories",
    { method: "POST", body: params }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data?.error?.message || "Video Story upload başlatılamadı."
    );
  }

  return json({
    success: true,
    page: page.name,
    videoId: data.video_id,
    uploadUrl: data.upload_url
  });
}

async function storyVideoUpload(request) {
  const form = await request.formData();
  const page = await getPage(request, form.get("pageId"));
  const uploadUrl = String(form.get("uploadUrl") || "");
  const offset = String(form.get("offset") || "0");
  const chunk = form.get("chunk");

  if (!uploadUrl || !chunk || typeof chunk === "string") {
    throw new Error("Story video parçası eksik.");
  }

  const host = new URL(uploadUrl).hostname;

  if (host !== "rupload.facebook.com") {
    throw new Error("Geçersiz Meta upload adresi.");
  }

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: "OAuth " + page.access_token,
      offset: offset,
      "Content-Type": "application/octet-stream"
    },
    body: chunk
  });

  const raw = await response.text();
  let data;

  try {
    data = JSON.parse(raw);
  } catch (error) {
    data = { raw: raw };
  }

  if (!response.ok || data.error) {
    throw new Error(
      data?.error?.message || "Story videosu yüklenemedi."
    );
  }

  return json({ success: true, result: data });
}

async function storyVideoFinish(request) {
  const body = await request.json();
  const page = await getPage(request, body.pageId);

  const params = new URLSearchParams({
    upload_phase: "finish",
    video_id: String(body.videoId || ""),
    access_token: page.access_token
  });

  const response = await fetch(
    GRAPH + "/" + page.id + "/video_stories",
    { method: "POST", body: params }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data?.error?.message || "Video Story yayınlanamadı."
    );
  }

  return json({
    success: true,
    page: page.name,
    result: data
  });
}

/* ---------------- UI ---------------- */

function app(request) {
  if (!getUserToken(request)) {
    return redirect("/");
  }

  return html(`<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f5f8fa">
<title>Doç. Dr. Erol Vural • Social Publisher</title>
<style>
:root{
  --navy:#00588e;--blue:#006fae;--teal:#009fb5;--green:#82bc00;
  --bg:#f4f7f8;--card:rgba(255,255,255,.86);--line:#dfe8eb;
  --text:#16323d;--muted:#6d7d84;--danger:#c62828;--ok:#2e7d32;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:linear-gradient(180deg,#f7fafb 0,#eef4f6 100%);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Arial,sans-serif;color:var(--text)}
button,input,textarea,select{font:inherit}
button{cursor:pointer}
a{text-decoration:none;color:inherit}
.shell{max-width:980px;margin:auto;padding:14px 14px 96px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 2px 14px;position:sticky;top:0;z-index:10;background:rgba(244,247,248,.84);backdrop-filter:blur(18px)}
.brand{display:flex;align-items:center;gap:11px}
.brand img{width:58px;height:42px;object-fit:contain}
.eyebrow{font-size:10px;letter-spacing:2px;font-weight:800;color:var(--teal)}
.top h1{font-size:20px;margin:2px 0 0;color:var(--navy)}
.logout{font-size:13px;font-weight:700;color:#7b2525}
.hero{border:1px solid rgba(255,255,255,.9);background:linear-gradient(135deg,rgba(255,255,255,.95),rgba(236,246,248,.9));border-radius:28px;padding:22px;box-shadow:0 16px 40px rgba(24,65,79,.09);margin-bottom:14px}
.hero h2{font-size:25px;margin:0 0 7px;color:var(--navy)}
.hero p{margin:0;color:var(--muted);line-height:1.5}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:17px}
.stat{background:rgba(255,255,255,.8);border:1px solid var(--line);border-radius:18px;padding:12px}
.stat b{display:block;font-size:20px;color:var(--navy)}
.stat span{font-size:11px;color:var(--muted)}
.card{background:var(--card);border:1px solid rgba(255,255,255,.9);border-radius:22px;padding:18px;margin-bottom:13px;box-shadow:0 10px 28px rgba(27,65,78,.07)}
.card h3{margin:0 0 12px;font-size:17px;color:var(--navy)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
label{font-size:12px;font-weight:800;color:#46606a;display:block;margin:9px 0 6px}
input,textarea,select{width:100%;border:1px solid var(--line);background:#fff;border-radius:14px;padding:12px 13px;color:var(--text);outline:none}
textarea{min-height:125px;resize:vertical}
input:focus,textarea:focus,select:focus{border-color:var(--teal);box-shadow:0 0 0 3px rgba(0,159,181,.1)}
.btn{border:0;border-radius:14px;padding:12px 15px;font-weight:800}
.primary{background:linear-gradient(135deg,var(--navy),var(--teal));color:#fff}
.secondary{background:#eaf2f4;color:var(--navy)}
.green{background:var(--green);color:#fff}
.danger{background:#ffe9e9;color:#9d2525}
.small{padding:9px 11px;font-size:12px}
.actions{display:flex;gap:8px;flex-wrap:wrap}
.tabs{display:flex;gap:7px;overflow:auto;padding:3px 0 10px;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{white-space:nowrap;border:1px solid var(--line);background:#fff;border-radius:999px;padding:10px 14px;font-size:13px;font-weight:800;color:#54707a}
.tab.active{background:var(--navy);color:#fff;border-color:var(--navy)}
.pageList{display:grid;gap:7px;max-height:340px;overflow:auto;padding-right:2px}
.page{display:flex;align-items:center;gap:10px;padding:11px;border:1px solid var(--line);background:#fff;border-radius:15px}
.page input{width:20px;height:20px}
.page span{font-size:13px;font-weight:700}
.preview{display:grid;grid-template-columns:minmax(230px,360px) 1fr;gap:16px;align-items:start}
.preview img{width:100%;aspect-ratio:4/5;object-fit:contain;background:#eef3f5;border-radius:18px;border:1px solid var(--line)}
.previewText{min-width:0}
.muted{font-size:12px;color:var(--muted);line-height:1.45}
.pill{display:inline-flex;padding:6px 9px;border-radius:999px;background:#edf4f6;font-size:11px;font-weight:800;color:#46616b}
.notice{padding:11px 12px;border-radius:14px;background:#edf8fa;color:#42616a;font-size:12px;line-height:1.45}
.notice.warn{background:#fff7e8;color:#805d17}
.notice.ok{background:#edf8ed;color:#27652b}
.notice.bad{background:#ffeded;color:#8b2727}
.scheduleList{display:grid;gap:9px}
.item{background:#fff;border:1px solid var(--line);border-radius:17px;padding:13px}
.itemTop{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.itemTitle{font-weight:900;color:var(--navy);font-size:14px}
.itemMeta{font-size:11px;color:var(--muted);margin-top:4px}
.itemBody{display:grid;grid-template-columns:72px 1fr;gap:10px;margin-top:10px}
.thumb{width:72px;height:90px;object-fit:cover;border-radius:10px;background:#edf2f4}
.status{font-size:10px;font-weight:900;padding:6px 8px;border-radius:999px;background:#edf4f6;white-space:nowrap}
.status.approved{background:#edf8ed;color:#27652b}.status.rejected{background:#ffeded;color:#8b2727}.status.published{background:#e9f7ec;color:#27652b}.status.paused{background:#fff3dd;color:#7a5a13}
.itemActions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.empty{text-align:center;padding:28px 12px;color:var(--muted);font-size:13px}
.bottom{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:20;width:min(720px,calc(100% - 20px));display:grid;grid-template-columns:repeat(4,1fr);gap:5px;padding:6px;background:rgba(255,255,255,.86);border:1px solid rgba(255,255,255,.95);border-radius:20px;box-shadow:0 12px 36px rgba(23,57,69,.16);backdrop-filter:blur(22px)}
.navbtn{border:0;background:transparent;border-radius:15px;padding:9px 4px;color:#71838a;font-size:11px;font-weight:800}
.navbtn.active{background:#eaf4f6;color:var(--navy)}
.navbtn span{display:block;font-size:17px;margin-bottom:2px}
.section{display:none}.section.active{display:block}
.modal{position:fixed;inset:0;background:rgba(12,32,40,.38);backdrop-filter:blur(9px);z-index:50;display:none;align-items:flex-end;justify-content:center;padding:10px}
.modal.show{display:flex}
.modalBox{width:min(720px,100%);max-height:92vh;overflow:auto;background:#f8fbfc;border-radius:25px;padding:18px;box-shadow:0 25px 70px rgba(0,0,0,.25)}
.close{float:right;border:0;background:#e9f0f2;border-radius:50%;width:34px;height:34px}
.checkrow{display:flex;gap:8px;align-items:center;margin:8px 0}
.checkrow input{width:20px;height:20px}
.category{border:1px solid var(--line);background:#fff;border-radius:15px;padding:12px}
.category.active{border-color:var(--teal);box-shadow:0 0 0 2px rgba(0,159,181,.1)}
@media(max-width:700px){
 .shell{padding:8px 10px 94px}.top{position:relative}.stats{grid-template-columns:1fr 1fr}
 .grid2,.grid3,.preview{grid-template-columns:1fr}.preview img{max-width:360px;margin:auto}
 .hero h2{font-size:22px}.card{padding:15px}.bottom{bottom:7px}
}
</style>
</head>
<body>
<div class="shell">
<header class="top">
  <div class="brand"><img src="/assets/erol-vural-logo.png" alt="Doç. Dr. Erol Vural"><div><div class="eyebrow">DOÇ. DR. EROL VURAL</div><h1>Social Publisher</h1></div></div>
  <a class="logout" href="/logout">Çıkış</a>
</header>

<section class="hero">
  <h2>İçerik üret · ön izle · planla · yayınla</h2>
  <p>Doç. Dr. Erol Vural marka kimliğine uygun içerik üretimi. Sunucu tarafında R2/KV/D1 medya arşivi kullanılmaz; planlar bu tarayıcıda tutulur.</p>
  <div class="stats">
    <div class="stat"><b id="statPages">0</b><span>Facebook sayfası</span></div>
    <div class="stat"><b id="statUpcoming">0</b><span>Gelecek içerik</span></div>
    <div class="stat"><b id="statPublished">0</b><span>Yayınlanan</span></div>
    <div class="stat"><b id="statPaused">0</b><span>Durdurulan</span></div>
  </div>
</section>

<nav class="tabs" id="mainTabs">
 <button class="tab active" data-tab="dashboard">Ana Sayfa</button>
 <button class="tab" data-tab="create">AI İçerik</button>
 <button class="tab" data-tab="calendar">Takvim</button>
 <button class="tab" data-tab="publish">Yayınla</button>
</nav>

<section id="dashboard" class="section active">
 <div class="card">
  <h3>Yaklaşan yayınlar</h3>
  <div id="dashboardList" class="scheduleList"></div>
 </div>
 <div class="card">
  <h3>Otomatik yayın davranışı</h3>
  <div class="notice">Onay süresinin sonuna kadar <b>Onayla / Düzenle / Yeniden oluştur / Reddet</b> işlemi yapılmazsa içerik otomatik son kontrolden geçirilir ve uygunsa planlanan saatte yayınlanır.</div>
 </div>
</section>

<section id="create" class="section">
 <div class="card">
  <h3>1. Kategori</h3>
  <div class="grid2">
   <button class="category active" data-cat="sugar">🩺 Şeker hastalığı ameliyatı</button>
   <button class="category" data-cat="botox">💉 Mide botoksu</button>
   <button class="category" data-cat="balloon">🎈 Mide balonu</button>
   <button class="category" data-cat="obesity">⚕️ Obezite / mide küçültme</button>
   <button class="category" data-cat="general">👨‍⚕️ Genel — Dr. Erol Vural</button>
  </div>
 </div>

 <div class="card">
  <h3>2. İçerik üretim ayarları</h3>
  <div class="grid2">
   <div><label>Konu</label><input id="topic" placeholder="Örn. Mide botoksu kimler için değerlendirilir?"></div>
   <div><label>İçerik tipi</label><select id="contentType"><option value="post">Instagram/Facebook Post</option><option value="reel">Reel senaryosu + kapak</option><option value="story">Story</option></select></div>
  </div>
  <label>AI'ye özel Türkçe talimat / düzeltme</label>
  <textarea id="instruction" placeholder="Örn. Daha sade yaz. Görsel başlığını kısalt. Reklam dili kullanma. Doktor Erol Vural ifadesini doğal biçimde geçir."></textarea>
  <div class="actions">
   <button class="btn primary" id="generateBtn">✨ İçeriği oluştur</button>
   <button class="btn secondary" id="regenerateBtn">↻ Yeniden oluştur</button>
  </div>
 </div>

 <div id="previewCard" class="card" style="display:none">
  <h3>3. Ön izleme</h3>
  <div class="preview">
   <div><img id="previewImg" alt="İçerik ön izlemesi"></div>
   <div class="previewText">
    <div class="pill" id="previewCategory"></div>
    <label>Başlık</label><input id="previewTitle">
    <label>Açıklama</label><textarea id="previewCaption"></textarea>
    <label>5 etiket</label><input id="previewTags">
    <label>Düzeltme / yeniden oluşturma talimatı</label><textarea id="editInstruction" placeholder="Beğenmediğiniz kısmı Türkçe olarak yazın..."></textarea>
    <div class="actions">
      <button class="btn primary" id="savePreview">Ön izlemeyi kaydet</button>
      <button class="btn secondary" id="regenPreview">↻ Yeniden oluştur</button>
    </div>
    <div id="complianceBox" class="notice" style="margin-top:10px"></div>
   </div>
  </div>
 </div>

 <div class="card">
  <h3>4. Sayfalar / hesaplar</h3>
  <div class="actions">
   <button class="btn secondary small" id="selectAll">Tüm Facebook sayfaları</button>
   <button class="btn secondary small" id="clearAll">Temizle</button>
  </div>
  <div id="pageList" class="pageList" style="margin-top:10px">Yükleniyor...</div>
 </div>

 <div class="card">
  <h3>5. Onay ve yayın zamanı</h3>
  <div class="grid2">
   <div><label>Planlanan yayın</label><input id="scheduleAt" type="datetime-local"></div>
   <div><label>Onay için son süre</label><input id="approvalAt" type="datetime-local"></div>
  </div>
  <div class="notice warn" style="margin-top:10px">Bu sürümde sunucu tarafında içerik depolaması yoktur. Otomatik saatli yayın, Social Publisher sayfası açık olduğu sürece tarayıcı zamanlayıcısıyla çalışır.</div>
  <button class="btn green" id="scheduleBtn" style="width:100%;margin-top:10px">📅 Ön izlemeyi planla</button>
 </div>
</section>

<section id="calendar" class="section">
 <div class="card">
  <h3>İçerik geçmişi ve gelecek planı</h3>
  <div class="grid2">
   <select id="statusFilter"><option value="all">Tüm durumlar</option><option value="planned">Planlandı</option><option value="approved">Onaylandı</option><option value="published">Yayınlandı</option><option value="paused">Durduruldu</option><option value="rejected">Reddedildi</option><option value="failed">Hatalı</option></select>
   <select id="categoryFilter"><option value="all">Tüm kategoriler</option><option value="sugar">Şeker hastalığı ameliyatı</option><option value="botox">Mide botoksu</option><option value="balloon">Mide balonu</option><option value="obesity">Obezite / mide küçültme</option><option value="general">Genel — Dr. Erol Vural</option></select>
  </div>
  <div class="actions" style="margin-top:10px">
   <button class="btn secondary small" id="bulkPause">Seçilenleri durdur</button>
   <button class="btn danger small" id="bulkDelete">Seçilenleri sil</button>
  </div>
  <div id="calendarList" class="scheduleList" style="margin-top:10px"></div>
 </div>
</section>

<section id="publish" class="section">
 <div class="card">
  <h3>Manuel yayın</h3>
  <label>Mesaj</label><textarea id="manualMessage" placeholder="Yayın açıklaması..."></textarea>
  <label>Fotoğraf (opsiyonel)</label><input id="manualFile" type="file" accept="image/*">
  <div class="actions" style="margin-top:10px"><button class="btn green" id="manualPublish">🚀 Seçilen sayfalara yayınla</button></div>
  <div id="manualResult" style="margin-top:10px"></div>
 </div>
</section>
</div>

<nav class="bottom">
 <button class="navbtn active" data-tab="dashboard"><span>⌂</span>Ana Sayfa</button>
 <button class="navbtn" data-tab="create"><span>✦</span>AI İçerik</button>
 <button class="navbtn" data-tab="calendar"><span>◷</span>Takvim</button>
 <button class="navbtn" data-tab="publish"><span>↗</span>Yayınla</button>
</nav>

<div id="editModal" class="modal">
 <div class="modalBox">
  <button class="close" id="closeModal">×</button>
  <h3>İçeriği düzenle</h3>
  <input type="hidden" id="editId">
  <label>Başlık</label><input id="editTitle">
  <label>Açıklama</label><textarea id="editCaption"></textarea>
  <label>5 etiket</label><input id="editTags">
  <label>Türkçe düzeltme talimatı</label><textarea id="editPrompt" placeholder="Örn. Görsel başlığını daha kısa yap..."></textarea>
  <div class="actions">
   <button class="btn primary" id="applyEdit">Kaydet</button>
   <button class="btn secondary" id="applyAiEdit">AI ile düzelt</button>
  </div>
 </div>
</div>

<script>
(function(){
  var categories={
    sugar:"Şeker hastalığı ameliyatı",botox:"Mide botoksu",balloon:"Mide balonu",
    obesity:"Obezite / mide küçültme",general:"Genel — Dr. Erol Vural"
  };
  var state={pages:[],selected:{},category:"sugar",draft:null};
  var KEY="ev_social_publisher_v9_items";
  var items=loadItems();

  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]})}
  function loadItems(){try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch(e){return []}}
  function saveItems(){localStorage.setItem(KEY,JSON.stringify(items));renderAll()}
  function uid(){return "c_"+Date.now()+"_"+Math.random().toString(36).slice(2,8)}
  function fmt(iso){try{return new Date(iso).toLocaleString("tr-TR",{dateStyle:"short",timeStyle:"short"})}catch(e){return iso}}
  function statusText(s){return {planned:"Planlandı",approved:"Onaylandı",published:"Yayınlandı",paused:"Durduruldu",rejected:"Reddedildi",failed:"Hatalı"}[s]||s}
  function selectedIds(){return Object.keys(state.selected).filter(function(id){return state.selected[id]})}

  function tab(name){
    document.querySelectorAll(".section").forEach(function(x){x.classList.toggle("active",x.id===name)});
    document.querySelectorAll("[data-tab]").forEach(function(x){x.classList.toggle("active",x.getAttribute("data-tab")===name)});
    window.scrollTo({top:0,behavior:"smooth"});
  }
  document.querySelectorAll("[data-tab]").forEach(function(x){x.onclick=function(){tab(x.getAttribute("data-tab"))}});

  function loadPages(){
    fetch("/api/pages",{cache:"no-store"}).then(function(r){return r.json()}).then(function(d){
      state.pages=d.pages||[];
      document.getElementById("statPages").textContent=state.pages.length;
      renderPages();
    }).catch(function(e){document.getElementById("pageList").innerHTML='<div class="notice bad">'+esc(e.message)+'</div>'});
  }
  function renderPages(){
    var el=document.getElementById("pageList");
    if(!state.pages.length){el.innerHTML='<div class="empty">Facebook sayfası bulunamadı.</div>';return}
    el.innerHTML=state.pages.map(function(p){
      return '<label class="page"><input type="checkbox" data-page="'+esc(p.id)+'" '+(state.selected[p.id]?"checked":"")+'><span>'+esc(p.name)+'</span></label>'
    }).join("");
    el.querySelectorAll("input").forEach(function(c){c.onchange=function(){state.selected[c.getAttribute("data-page")]=c.checked}})
  }
  document.getElementById("selectAll").onclick=function(){state.pages.forEach(function(p){state.selected[p.id]=true});renderPages()}
  document.getElementById("clearAll").onclick=function(){state.selected={};renderPages()}

  document.querySelectorAll(".category").forEach(function(b){b.onclick=function(){
    document.querySelectorAll(".category").forEach(function(x){x.classList.remove("active")});
    b.classList.add("active");state.category=b.getAttribute("data-cat");
  }})

  function aiGenerate(extra){
    var topic=document.getElementById("topic").value.trim();
    var instruction=(document.getElementById("instruction").value||"")+" "+(extra||"");
    if(!topic) topic=categories[state.category]+" hakkında bilgilendirici bir içerik";
    document.getElementById("generateBtn").disabled=true;
    document.getElementById("generateBtn").textContent="Üretiliyor...";
    fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      action:"generate",category:state.category,categoryName:categories[state.category],topic:topic,instruction:instruction,
      contentType:document.getElementById("contentType").value
    })}).then(function(r){return r.json()}).then(function(d){
      if(!d.success) throw new Error(d.error||"AI üretimi başarısız.");
      state.draft=d.content;
      showDraft(d.content);
      if(d.review) showCompliance(d.review);
    }).catch(function(e){alert(e.message)}).finally(function(){
      document.getElementById("generateBtn").disabled=false;document.getElementById("generateBtn").textContent="✨ İçeriği oluştur";
    })
  }
  function showDraft(c){
    document.getElementById("previewCard").style.display="block";
    document.getElementById("previewCategory").textContent=categories[state.category];
    document.getElementById("previewTitle").value=c.title||"";
    document.getElementById("previewCaption").value=c.caption||"";
    document.getElementById("previewTags").value=(c.hashtags||[]).join(" ");
    if(c.imageDataUrl){document.getElementById("previewImg").src=c.imageDataUrl}
    else document.getElementById("previewImg").src="/assets/erol-vural-logo.png";
  }
  function showCompliance(r){
    var b=document.getElementById("complianceBox");
    b.className="notice "+(r.ok?"ok":"bad");
    b.innerHTML=(r.ok?"✓ Ön kontrol uygun. ":"⚠ Ön kontrol uyarısı. ")+esc((r.reasons||[]).join(" "));
  }
  document.getElementById("generateBtn").onclick=function(){aiGenerate("")}
  document.getElementById("regenerateBtn").onclick=function(){aiGenerate("Önceki taslağı beğenmedim; farklı bir anlatım ve farklı bir görsel yaklaşımıyla yeniden oluştur.")}
  document.getElementById("regenPreview").onclick=function(){aiGenerate(document.getElementById("editInstruction").value)}
  document.getElementById("savePreview").onclick=function(){
    if(!state.draft) return;
    state.draft.title=document.getElementById("previewTitle").value.trim();
    state.draft.caption=document.getElementById("previewCaption").value.trim();
    state.draft.hashtags=document.getElementById("previewTags").value.trim().split(/\\s+/).filter(Boolean).slice(0,5);
    alert("Ön izleme güncellendi.");
  }

  function scheduleDraft(){
    if(!state.draft){alert("Önce içerik oluşturun.");return}
    var ids=selectedIds();if(!ids.length){alert("En az bir Facebook sayfası seçin.");return}
    var at=document.getElementById("scheduleAt").value, approval=document.getElementById("approvalAt").value;
    if(!at){alert("Yayın saatini seçin.");return}
    var when=new Date(at).toISOString();
    var deadline=approval?new Date(approval).toISOString():new Date(new Date(when).getTime()-30*60000).toISOString();
    var item={id:uid(),category:state.category,title:state.draft.title,caption:state.draft.caption,hashtags:state.draft.hashtags,
      imageDataUrl:state.draft.imageDataUrl||"",pageIds:ids,scheduledAt:when,approvalAt:deadline,status:"planned",createdAt:new Date().toISOString(),contentType:document.getElementById("contentType").value};
    items.unshift(item);saveItems();alert("İçerik planlandı.");tab("calendar");
  }
  document.getElementById("scheduleBtn").onclick=scheduleDraft;

  function renderItem(it,withSelect){
    return '<div class="item"><div class="itemTop"><div><div class="itemTitle">'+esc(it.title)+'</div><div class="itemMeta">'+esc(categories[it.category]||it.category)+' • '+fmt(it.scheduledAt)+'</div></div><span class="status '+esc(it.status)+'">'+statusText(it.status)+'</span></div>'+
      '<div class="itemBody"><img class="thumb" src="'+esc(it.imageDataUrl||"/assets/erol-vural-logo.png")+'"><div><div class="muted">'+esc((it.caption||"").slice(0,240))+'</div><div class="itemMeta">Onay sonu: '+fmt(it.approvalAt)+'</div></div></div>'+
      '<div class="itemActions">'+
      (withSelect?'<label style="display:flex;align-items:center;gap:5px;margin:0"><input type="checkbox" data-bulk="'+it.id+'" style="width:18px"> Seç</label>':"")+
      '<button class="btn secondary small" data-edit="'+it.id+'">Düzenle</button>'+
      '<button class="btn secondary small" data-preview="'+it.id+'">Ön izleme</button>'+
      (it.status==="planned"||it.status==="approved"?'<button class="btn secondary small" data-pause="'+it.id+'">Durdur</button>':"")+
      (it.status==="paused"?'<button class="btn green small" data-resume="'+it.id+'">Devam</button>':"")+
      '<button class="btn danger small" data-delete="'+it.id+'">Sil</button>'+
      '</div></div>'
  }
  function renderLists(){
    var upcoming=items.filter(function(x){return x.status==="planned"||x.status==="approved"}).sort(function(a,b){return new Date(a.scheduledAt)-new Date(b.scheduledAt)});
    document.getElementById("dashboardList").innerHTML=upcoming.slice(0,8).map(function(x){return renderItem(x,false)}).join("")||'<div class="empty">Yaklaşan içerik yok.</div>';
    var sf=document.getElementById("statusFilter").value,cf=document.getElementById("categoryFilter").value;
    var list=items.filter(function(x){return (sf==="all"||x.status===sf)&&(cf==="all"||x.category===cf)}).sort(function(a,b){return new Date(b.scheduledAt)-new Date(a.scheduledAt)});
    document.getElementById("calendarList").innerHTML=list.map(function(x){return renderItem(x,true)}).join("")||'<div class="empty">Kayıt yok.</div>';
    document.getElementById("statUpcoming").textContent=items.filter(function(x){return x.status==="planned"||x.status==="approved"}).length;
    document.getElementById("statPublished").textContent=items.filter(function(x){return x.status==="published"}).length;
    document.getElementById("statPaused").textContent=items.filter(function(x){return x.status==="paused"}).length;
    bindItems();
  }
  function bindItems(){
    document.querySelectorAll("[data-delete]").forEach(function(b){b.onclick=function(){items=items.filter(function(x){return x.id!==b.getAttribute("data-delete")});saveItems()}})
    document.querySelectorAll("[data-pause]").forEach(function(b){b.onclick=function(){var x=items.find(function(i){return i.id===b.getAttribute("data-pause")});if(x){x.status="paused";saveItems()}}})
    document.querySelectorAll("[data-resume]").forEach(function(b){b.onclick=function(){var x=items.find(function(i){return i.id===b.getAttribute("data-resume")});if(x){x.status="planned";saveItems()}}})
    document.querySelectorAll("[data-preview]").forEach(function(b){b.onclick=function(){var x=items.find(function(i){return i.id===b.getAttribute("data-preview")});if(x) showItemPreview(x)}})
    document.querySelectorAll("[data-edit]").forEach(function(b){b.onclick=function(){openEdit(b.getAttribute("data-edit"))}})
  }
  function showItemPreview(x){
    state.draft={title:x.title,caption:x.caption,hashtags:x.hashtags,imageDataUrl:x.imageDataUrl};
    state.category=x.category;showDraft(state.draft);tab("create");
  }
  function openEdit(id){
    var x=items.find(function(i){return i.id===id});if(!x)return;
    document.getElementById("editId").value=id;document.getElementById("editTitle").value=x.title;
    document.getElementById("editCaption").value=x.caption;document.getElementById("editTags").value=(x.hashtags||[]).join(" ");
    document.getElementById("editPrompt").value="";document.getElementById("editModal").classList.add("show");
  }
  document.getElementById("closeModal").onclick=function(){document.getElementById("editModal").classList.remove("show")}
  document.getElementById("applyEdit").onclick=function(){
    var id=document.getElementById("editId").value,x=items.find(function(i){return i.id===id});if(!x)return;
    x.title=document.getElementById("editTitle").value;x.caption=document.getElementById("editCaption").value;
    x.hashtags=document.getElementById("editTags").value.split(/\\s+/).filter(Boolean).slice(0,5);saveItems();
    document.getElementById("editModal").classList.remove("show");
  }
  document.getElementById("applyAiEdit").onclick=function(){
    var id=document.getElementById("editId").value,x=items.find(function(i){return i.id===id});if(!x)return;
    var prompt=document.getElementById("editPrompt").value;
    fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"edit",category:x.category,title:x.title,caption:x.caption,hashtags:x.hashtags,instruction:prompt})}).then(function(r){return r.json()}).then(function(d){
      if(!d.success)throw new Error(d.error||"AI düzenleme başarısız.");x.title=d.content.title;x.caption=d.content.caption;x.hashtags=d.content.hashtags;saveItems();document.getElementById("editModal").classList.remove("show");
    }).catch(function(e){alert(e.message)})
  }

  document.getElementById("statusFilter").onchange=renderLists;
  document.getElementById("categoryFilter").onchange=renderLists;
  document.getElementById("bulkDelete").onclick=function(){
    var ids=Array.from(document.querySelectorAll("[data-bulk]:checked")).map(function(x){return x.getAttribute("data-bulk")});
    if(!ids.length)return;items=items.filter(function(x){return ids.indexOf(x.id)<0});saveItems();
  }
  document.getElementById("bulkPause").onclick=function(){
    var ids=Array.from(document.querySelectorAll("[data-bulk]:checked")).map(function(x){return x.getAttribute("data-bulk")});
    items.forEach(function(x){if(ids.indexOf(x.id)>=0&&(x.status==="planned"||x.status==="approved"))x.status="paused"});saveItems();
  }

  function publishItem(it){
    if(it.status==="paused"||it.status==="published")return Promise.resolve();
    return fetch("/api/ai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
      action:"review",category:it.category,title:it.title,caption:it.caption,hashtags:it.hashtags
    })}).then(function(r){return r.json()}).then(function(review){
      if(!review.success||!review.review.ok){it.status="failed";it.error=(review.review.reasons||[]).join(" ");saveItems();return}
      var form=new FormData();form.append("pages",JSON.stringify(it.pageIds));form.append("type","photo");form.append("message",(it.caption||"")+"\\n\\n"+(it.hashtags||[]).join(" "));
      if(it.imageDataUrl){
        return fetch(it.imageDataUrl).then(function(r){return r.blob()}).then(function(blob){
          form.append("media",blob,"erol-vural-"+it.id+".jpg");
          return fetch("/api/publish",{method:"POST",body:form});
        }).then(function(r){return r.json()}).then(function(d){
          var failed=(d.results||[]).filter(function(x){return !x.success});
          it.status=failed.length===0?"published":"failed";it.result=d.results;it.publishedAt=new Date().toISOString();saveItems();
        })
      }
      return Promise.reject(new Error("Görsel bulunamadı."));
    }).catch(function(e){it.status="failed";it.error=e.message;saveItems()})
  }
  function scheduler(){
    var now=Date.now();
    items.forEach(function(it){
      if((it.status==="planned"||it.status==="approved") && now>=new Date(it.scheduledAt).getTime()){
        publishItem(it);
      } else if(it.status==="planned" && it.approvalAt && now>=new Date(it.approvalAt).getTime()){
        it.status="approved";
      }
    });
    saveItems();
  }
  setInterval(scheduler,15000);
  document.addEventListener("visibilitychange",function(){if(!document.hidden)scheduler()});

  document.getElementById("manualPublish").onclick=function(){
    var ids=selectedIds();if(!ids.length){alert("Sayfa seçin.");return}
    var form=new FormData();form.append("pages",JSON.stringify(ids));form.append("type","post");form.append("message",document.getElementById("manualMessage").value);
    var file=document.getElementById("manualFile").files[0];if(file){form.set("type","photo");form.append("media",file,file.name)}
    document.getElementById("manualResult").innerHTML='<div class="notice">Yayınlanıyor...</div>';
    fetch("/api/publish",{method:"POST",body:form}).then(function(r){return r.json()}).then(function(d){
      document.getElementById("manualResult").innerHTML='<div class="notice '+(d.results&&d.results.every(function(x){return x.success})?"ok":"bad")+'">'+esc(JSON.stringify(d.results||d.error))+'</div>';
    }).catch(function(e){document.getElementById("manualResult").innerHTML='<div class="notice bad">'+esc(e.message)+'</div>'})
  }

  renderLists();loadPages();
})();
</script>
</body>
</html>`);
}


/* ---------------- AI ---------------- */

async function aiAPI(request, env) {
  if (request.method !== "POST") return json({ success:false, error:"POST gerekli." },405);
  const body = await request.json();
  const action = String(body.action || "generate");

  if (!env.AI) {
    return json({
      success:false,
      error:"Workers AI bağlantısı bulunamadı. Wrangler/Cloudflare'da AI binding = AI ekleyin."
    },503);
  }

  const system =
    "Sen Doç. Dr. Erol Vural için sağlık bilgilendirme içerikleri hazırlayan Türkçe bir editörsün. " +
    "Reklam, garanti, kesin sonuç, üstünlük iddiası, yanıltıcı başarı oranı, doğrudan hasta yönlendirmesi veya korku dili kullanma. " +
    "Metni bilgilendirici, ölçülü ve sağlık mevzuatına uygun tut. " +
    "SEO ifadeleri 'Doktor Erol Vural', 'Doç. Dr. Erol Vural' ve 'Dr. Erol Vural' doğal biçimde kullanılabilir; anahtar kelime doldurma yapma. " +
    "Tam olarak 5 hashtag üret. Hashtagleri Türkçe ve konuya uygun tut.";

  let prompt = "";

  if (action === "edit") {
    prompt =
      "Aşağıdaki mevcut içeriği kullanıcının Türkçe düzeltme talimatına göre yeniden yaz. " +
      "Sadece gerekli alanları değiştir; sonuç JSON olsun. " +
      "JSON alanları: title, caption, hashtags (5 elemanlı dizi). " +
      "Kategori: " + String(body.category || "") + "\n" +
      "Başlık: " + String(body.title || "") + "\n" +
      "Açıklama: " + String(body.caption || "") + "\n" +
      "Etiketler: " + JSON.stringify(body.hashtags || []) + "\n" +
      "Kullanıcı talimatı: " + String(body.instruction || "");
  } else if (action === "review") {
    prompt =
      "Bu sağlık sosyal medya içeriğini son yayın öncesi kontrol et. " +
      "JSON döndür: ok (boolean), reasons (string array). " +
      "Sorun varsa somut ve kısa neden yaz. " +
      "Kategori: " + String(body.category || "") + "\n" +
      "Başlık: " + String(body.title || "") + "\n" +
      "Açıklama: " + String(body.caption || "") + "\n" +
      "Etiketler: " + JSON.stringify(body.hashtags || []);
  } else {
    prompt =
      "Kategori: " + String(body.categoryName || body.category || "") + "\n" +
      "Konu: " + String(body.topic || "") + "\n" +
      "İçerik tipi: " + String(body.contentType || "post") + "\n" +
      "Kullanıcı özel talimatı: " + String(body.instruction || "") + "\n\n" +
      "JSON döndür. Alanlar: title, caption, hashtags (tam 5 eleman). " +
      "Açıklamada doğal biçimde SEO ifadelerinden yararlan. " +
      "Caption bilgilendirici olsun; reklam/pazarlama çağrısı yapmasın.";
  }

  const result = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
    messages:[
      {role:"system",content:system},
      {role:"user",content:prompt}
    ],
    chat_template_kwargs:{enable_thinking:false}
  });

  const textValue = typeof result === "string" ? result : (result.response || result.output_text || JSON.stringify(result));
  const parsed = parseAIJson(textValue);

  if (!parsed) return json({success:false,error:"AI geçerli JSON döndürmedi.",raw:textValue},502);

  if (action === "review") return json({success:true,review:parsed});
  return json({success:true,content:normalizeAIContent(parsed)});
}

async function aiImageAPI(request, env) {
  if (request.method !== "POST") return json({success:false,error:"POST gerekli."},405);
  if (!env.AI) return json({success:false,error:"Workers AI binding eksik."},503);
  const body = await request.json();
  const category = String(body.categoryName || body.category || "sağlık");
  const topic = String(body.topic || "sağlık bilgilendirme görseli");
  const instruction = String(body.instruction || "");
  const prompt =
    "Professional medical editorial social media image, Turkish healthcare education, " +
    "clean premium navy turquoise white visual language, no doctor portrait, no patient face, " +
    "no before after, no exaggerated body transformation, no text, no watermark, " +
    "subject: " + category + ". Topic: " + topic + ". " + instruction;

  const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
    prompt:prompt,
    steps:4,
    width:512,
    height:640
  });

  if (!result || !result.image) return json({success:false,error:"Görsel üretilemedi."},502);
  return json({success:true,imageDataUrl:"data:image/jpeg;base64,"+result.image});
}

function parseAIJson(value) {
  let s=String(value||"").trim();
  s=s.replace(/^```(?:json)?/i,"").replace(/```$/,"").trim();
  try{return JSON.parse(s)}catch(e){}
  const a=s.indexOf("{"),b=s.lastIndexOf("}");
  if(a>=0&&b>a){try{return JSON.parse(s.slice(a,b+1))}catch(e){}}
  return null;
}

function normalizeAIContent(x) {
  const tags=Array.isArray(x.hashtags)?x.hashtags.map(String).filter(Boolean).slice(0,5):[];
  while(tags.length<5) tags.push("#ErolVural");
  return {title:String(x.title||"Bilgilendirici sağlık içeriği"),caption:String(x.caption||""),hashtags:tags};
}

/* ---------------- SIMPLE PAGES ---------------- */

function home() {
  return html([
    "<!doctype html><html lang='tr'><head>",
    "<meta charset='UTF-8'>",
    "<meta name='viewport' content='width=device-width,initial-scale=1'>",
    "<meta name='theme-color' content='#005082'>",
    "<title>Social Publisher</title>",
    "<style>body{margin:0;background:#f3f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial}.box{max-width:560px;margin:50px auto;padding:30px;background:white;border-radius:24px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.08)}h1{color:#005082}.btn{display:block;background:#005082;color:#fff;text-decoration:none;padding:17px;border-radius:14px;font-weight:800;margin-top:22px}</style>",
    "</head><body><div class='box'>",
    "<h1>📣 Social Publisher</h1>",
    "<p>Facebook Sayfalarını tek merkezden yönetin.</p>",
    "<a class='btn' href='/login'>Facebook ile Bağlan</a>",
    "<p style='font-size:13px;color:#667'>48 saatlik uygulama oturumu.</p>",
    "<a href='/privacy'>Gizlilik Politikası</a>",
    "</div></body></html>"
  ].join(""));
}

function privacy() {
  return html([
    "<!doctype html><html lang='tr'><head>",
    "<meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'>",
    "<title>Gizlilik Politikası</title>",
    "<style>body{font-family:Arial;max-width:800px;margin:40px auto;padding:20px;line-height:1.7}h1,h2{color:#005082}</style>",
    "</head><body>",
    "<h1>Gizlilik Politikası</h1>",
    "<p><strong>Son güncelleme:</strong> 23 Eylül 2026</p>",
    "<h2>Amaç</h2>",
    "<p>Social Publisher, kullanıcının yönetme yetkisine sahip olduğu Facebook Sayfalarında içerik yayınlamasını kolaylaştırır.</p>",
    "<h2>Veri kullanımı</h2>",
    "<p>Facebook hesap ve Sayfa bilgileri yalnızca yetkili yayınlama işlemleri için kullanılır.</p>",
    "<h2>Saklama</h2>",
    "<p>Uygulama R2, KV, D1 veya içerik veritabanı kullanmaz. İçerik ve medya arşivi oluşturmaz.</p>",
    "<h2>Oturum</h2>",
    "<p>Uygulama oturumu 48 saatlik HttpOnly, Secure cookie ile tutulur. Facebook erişim yetkisinin gerçek süresi Meta tarafından belirlenir.</p>",
    "<h2>İletişim</h2><p>qasimm2012@gmail.com</p>",
    "</body></html>"
  ].join(""));
}

/* ---------------- HELPERS ---------------- */

function cookie(name, value, maxAge) {
  return {
    name: "Set-Cookie",
    value:
      name + "=" + encodeURIComponent(value) +
      "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge
  };
}

function readCookies(header) {
  const result = {};
  header.split(";").forEach(function (part) {
    const i = part.indexOf("=");
    if (i < 0) return;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch (error) {
      result[key] = value;
    }
  });
  return result;
}

function redirect(location, cookies) {
  const headers = new Headers();
  headers.set("Location", location);
  headers.set("Cache-Control", "no-store");

  (cookies || []).forEach(function (item) {
    headers.append(item.name, item.value);
  });

  return new Response(null, {
    status: 302,
    headers: headers
  });
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

function html(content) {
  return new Response(content, {
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

function text(content, status) {
  return new Response(content, {
    status: status || 200,
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
      "Cache-Control": "no-store"
    }
  });
}

function parseJSON(value, fallback) {
  try {
    return JSON.parse(String(value || ""));
  } catch (error) {
    return fallback;
  }
}

function cleanError(error) {
  return String(error?.message || error || "Bilinmeyen hata")
    .replace(/META_APP_SECRET/gi, "[REDACTED]");
}
