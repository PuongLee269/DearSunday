# DearSunday Homestay Manager

Ứng dụng quản lý homestay (Next.js App Router + Prisma/SQLite):

- **Đồ đạc & cây cảnh** (`/items`): theo dõi đồ đạc nhỏ, trò chơi cần refill, cây cần tưới theo chu kỳ (giờ), đánh dấu đã chăm sóc.
- **Khách hàng** (`/guests`): quản lý khách đặt phòng; mỗi khách có **box chat kiểm tra thông tin bằng AI** — dán profile + số điện thoại để phát hiện dấu hiệu giả mạo/clone/lừa đảo, trả về mức rủi ro (LOW/MEDIUM/HIGH) và tóm tắt.
- **Tài chính** (`/finance`): ghi nhận thu/chi, xem tổng thu, tổng chi, số dư.
- **Mã khóa thông minh**: tạo mã khóa cửa cho khách qua API ổ khóa (có thể cấu hình nhà cung cấp thật), tự động gửi email chứa mã cho khách.

## Cấu hình biến môi trường (`.env`)

```
DATABASE_URL="file:./dev.db"

# AI kiểm tra thông tin khách — nếu bỏ trống sẽ dùng kiểm tra theo quy tắc (rule-based)
ANTHROPIC_API_KEY=

# API ổ khóa thông minh — nếu bỏ trống sẽ dùng chế độ giả lập (mock)
SMART_LOCK_API_BASE_URL=
SMART_LOCK_API_KEY=

# Gửi email — nếu bỏ trống sẽ chỉ log ra console
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="DearSunday Homestay <no-reply@dearsunday.local>"
```

Không cấu hình các key trên, app vẫn chạy đầy đủ tính năng ở chế độ mock/rule-based để phát triển và demo.

## Chạy dự án

```bash
npm install
npx prisma migrate dev   # khởi tạo database SQLite
npm run dev              # http://localhost:3000
```

## Tích hợp API ổ khóa thông minh thật

Chỉnh sửa `src/lib/smart-lock.ts` (hàm `callRealApi`) cho đúng schema request/response của nhà cung cấp khóa (TTLock, Sciener, Yale, Xiaomi...).
