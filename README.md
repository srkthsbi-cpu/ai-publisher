# Social Publisher V9 — Doç. Dr. Erol Vural

Bu sürüm mevcut Social Publisher backend'ini korur ve üstüne AI içerik üretimi, marka önizleme, kategori sistemi, Türkçe düzeltme, planlama ve takvim yönetimi ekler.

## İçerik kategorileri
- Şeker hastalığı ameliyatı
- Mide botoksu
- Mide balonu
- Obezite / mide küçültme
- Genel — Dr. Erol Vural

## AI
Workers AI binding `AI` kullanılır. Metin için Gemma 4 26B A4B, görsel için FLUX.1 schnell kullanılır.

## Depolama
R2, KV ve D1 kullanılmaz. Medya sunucuda arşivlenmez. Plan ve içerik kayıtları tarayıcının localStorage alanında tutulur.

Önemli: Sunucu tarafı kalıcı depolama olmadığı için tarayıcı kapalıyken Cloudflare tarafından bağımsız arka plan yayınlama yapılamaz. Otomatik saatli yayın bu sürümde Social Publisher sayfası açıkken tarayıcı zamanlayıcısı ile çalışır. Bu, R2/KV/D1 kullanmadan yapılabilecek güvenli sınırdır.

## Cloudflare
1. Worker adı `social-publisher`.
2. `META_APP_SECRET` Production Secret olarak mevcut kalmalı.
3. `META_APP_ID` mevcutsa korunabilir; kaynakta App ID de tanımlıdır.
4. Wrangler dosyasındaki AI binding Cloudflare Workers AI bağlantısını açar.
5. Assets dizini `/public` ve logo `/assets/erol-vural-logo.png` olarak sunulur.

## OAuth
Callback adresi:
`https://social-publisher.srkthsbi.workers.dev/callback`

Meta App'teki Valid OAuth Redirect URI aynı kalmalıdır.
