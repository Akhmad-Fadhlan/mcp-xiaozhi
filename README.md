# JARVIS IoT MCP

MCP server dengan satu tool, `get_sensor_data`, yang mengambil suhu dan kelembapan terbaru dari Google Apps Script agar Xiaozhi AI bisa menjawab pertanyaan suara berdasarkan data aktual. Google Apps Script tidak diubah.

## Arsitektur (baca ini dulu)

Endpoint `wss://api.xiaozhi.me/mcp/?token=...` dari Xiaozhi Console **bukan URL MCP yang dipanggil oleh Xiaozhi**. Itu adalah titik sambung yang harus **dihubungi keluar oleh penyedia tool** (cara kerja `mcp_pipe.py` resmi Xiaozhi). Xiaozhi bertindak sebagai MCP client lewat WebSocket itu dan mengirim JSON-RPC (`initialize`, `tools/list`, `tools/call`) sebagai text frame.

Akibatnya:

| Komponen | Fungsi | Tempat berjalan |
| --- | --- | --- |
| `src/bridge-cli.ts` (bridge) | Menyambung keluar ke Xiaozhi dan melayani tool | **Proses panjang**: VPS, Railway, Render, Fly.io, Raspberry Pi, atau komputer sendiri. **Tidak bisa di Vercel serverless** (tidak ada proses yang hidup terus). |
| `api/mcp.ts` | Endpoint MCP Streamable HTTP (stateless, wajib Bearer token) untuk klien MCP lain (Claude, Cursor, MCP Inspector) | Vercel |

Xiaozhi tidak memakai endpoint Vercel. Jika Anda hanya punya Vercel, Xiaozhi tidak bisa tersambung; bridge tetap harus berjalan di satu mesin yang menyala terus. Alternatif paling sederhana: jalankan bridge di komputer/Raspberry Pi/VPS kecil.

```
Xiaozhi cloud (wss) <── koneksi keluar ── bridge (Node) ──HTTP GET──> Google Apps Script
```

## Instalasi dan pengujian lokal

Butuh Node.js >= 22.9.

```bash
npm install
cp .env.example .env      # isi SENSOR_API_URL dan MCP_ENDPOINT
npm run typecheck
npm test
npm run build
```

Jalankan bridge:

```bash
npm start                 # setelah build
# atau saat pengembangan:
npm run dev:bridge
```

Log sukses: `Terhubung ke Xiaozhi.` (token pada URL selalu disamarkan di log).

Uji tool tanpa Xiaozhi memakai MCP Inspector terhadap endpoint HTTP (lihat bagian Vercel) atau lewat test suite (`test/bridge.test.ts` meniru Xiaozhi dengan WebSocket server lokal).

## Menghubungkan ke Xiaozhi

1. Buka xiaozhi.me/console/agents, pilih agent, buka konfigurasi, lalu **MCP Endpoint**. Salin URL `wss://api.xiaozhi.me/mcp/?token=...`.
2. Simpan sebagai variabel lingkungan `MCP_ENDPOINT` di mesin yang menjalankan bridge. Jangan masukkan ke Git.
3. Jalankan bridge. Di Xiaozhi Console, tekan refresh pada status MCP Endpoint; tool `get_sensor_data` harus muncul.
4. Uji dengan suara: "Jarvis, berapa suhu sekarang?"
5. Tambahkan instruksi pada prompt agent agar tool dipakai, misalnya: "Untuk pertanyaan suhu, kelembapan, atau data sensor, panggil tool get_sensor_data lalu jawab hanya berdasarkan hasilnya. Jika tool gagal, katakan data tidak tersedia."

Catatan: jangan jalankan dua bridge dengan endpoint yang sama bersamaan. Setiap endpoint punya batas koneksi bersamaan.

## Deployment bridge (contoh Railway/Render/VPS)

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variables: `SENSOR_API_URL`, `MCP_ENDPOINT` (dan opsional `SENSOR_TIMEOUT_MS`)

Bridge menyambung ulang otomatis (backoff eksponensial 1 s sampai 60 s) dan memakai ping/pong untuk mendeteksi koneksi mati.

## Deployment endpoint HTTP ke Vercel (opsional)

1. Push repo ke GitHub (pastikan `.env` tidak ikut; sudah ada di `.gitignore`).
2. Di Vercel: Add New Project, import repo.
3. Settings > Environment Variables: `SENSOR_API_URL` dan `MCP_AUTH_TOKEN` (string acak panjang, mis. `openssl rand -hex 32`).
4. Deploy. Endpoint: `https://<proyek>.vercel.app/api/mcp`, kirim header `Authorization: Bearer <MCP_AUTH_TOKEN>`.

Tanpa `MCP_AUTH_TOKEN`, endpoint menolak semua request (503). Token Xiaozhi **tidak** perlu dan tidak boleh diset di Vercel.

## Variabel lingkungan

| Nama | Dipakai oleh | Keterangan |
| --- | --- | --- |
| `SENSOR_API_URL` | bridge, Vercel | URL Apps Script `...?action=getLastSensor` (wajib, https) |
| `SENSOR_TIMEOUT_MS` | bridge, Vercel | 500 sampai 30000, default 8000 |
| `MCP_ENDPOINT` | bridge | URL `wss://` dari Xiaozhi Console (rahasia) |
| `MCP_AUTH_TOKEN` | Vercel | Bearer token untuk `/api/mcp` |

## Format hasil tool

Sukses:

```json
{ "success": true, "timestamp": "2026-09-17 11:31:39", "suhu": 28.5, "kelembaban": 72,
  "satuan": { "suhu": "°C", "kelembaban": "%" } }
```

Gagal (`isError: true`, tanpa nilai sensor sama sekali):

```json
{ "success": false, "error": { "code": "TIMEOUT", "message": "..." }, "catatan": "..." }
```

Kode error: `TIMEOUT`, `NETWORK`, `HTTP_ERROR`, `INVALID_JSON`, `API_ERROR`, `INVALID_DATA`.

## Status pengujian

Teruji otomatis (23 tes): respons sukses, `success: false`, JSON tidak valid, HTTP non-2xx, timeout, jaringan gagal, data tidak valid, pemanggilan tool lewat client MCP, siklus `initialize`/`tools/list`/`tools/call` lewat WebSocket tiruan Xiaozhi, reconnect, autentikasi endpoint HTTP.

**Belum teruji** (perlu Anda konfirmasi di lingkungan nyata): koneksi ke `api.xiaozhi.me` sungguhan, pemanggilan tool oleh agent Xiaozhi dari suara, panggilan ke Apps Script sungguhan, dan deployment Vercel.

## Keamanan

- Token hanya dari environment variable; tidak ada di source, log (disamarkan), atau respons.
- Jika token pernah terekspos (mis. ditempel ke chat atau repo), cabut dan buat token baru di Xiaozhi Console.
- URL Apps Script yang dapat diakses tanpa login pada dasarnya publik; siapa pun yang tahu URL-nya dapat membaca data sensor.
