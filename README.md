# NameOnCar – Update

Kho cập nhật nóng cho app **Car Sign Live** (ký tên người xem TikTok LIVE lên xe 3D).

- `version.json` – số phiên bản, ghi chú, danh sách file + SHA256. App so sánh với bản đang chạy mỗi lần mở.
- `app/` – các file core được app tải về (`core.js`, giao diện, bundle 3D).
- `source/` – mã nguồn đầy đủ (bootstrap `main.js`, `src/display.js`, script phát hành).

Phát hành bản mới: tăng `version` trong `source/package.json`, `npm run build`, rồi
`python3 scripts/release.py <thư-mục-repo> "ghi chú"` và push.
File `.exe` chỉ cần tải lại khi `minBase` trong `version.json` lớn hơn bản cài.
