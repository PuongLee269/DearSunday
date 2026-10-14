# Máy chủ đồng bộ cho DearSunday (Google Apps Script + Google Sheet)

Trang web `docs/index.html` (chạy trên GitHub Pages) không có máy chủ riêng. Phần đăng nhập, phân quyền và lưu dữ liệu nằm ở đây:

- Dữ liệu cả homestay lưu trong một Google Sheet của bạn (sheet `Data`), có bản sao lưu tự động mỗi giờ (sheet `Backup`).
- Tài khoản nằm trong sheet `Users`. Mật khẩu được băm, không lưu mật khẩu gốc.
- Chỉ **Admin** gọi được các thao tác quản trị (cấp, khóa, xóa tài khoản, đặt lại mật khẩu). Quyền được kiểm tra ở máy chủ, không chỉ ẩn nút trên giao diện.
- Các máy đăng nhập đều tự đồng bộ: mỗi thay đổi tự lưu lên sau khoảng 1 giây, mỗi 20 giây tự kiểm tra thay đổi từ máy khác. Hai người sửa cùng lúc thì dữ liệu được gộp, không ghi đè nhau.

## Cài đặt (làm 1 lần, khoảng 5 phút)

1. Vào thư mục Drive của bạn, tạo một **Google Sheet mới** tên `DearSunday Data`.
2. Trong Sheet: **Tiện ích mở rộng → Apps Script**. Xóa code mẫu, dán toàn bộ nội dung file [`Code.gs`](./Code.gs).
3. Sửa dòng đầu `var SETUP_CODE = "DOI-MA-NAY";` thành một chuỗi bí mật của bạn (ví dụ 16 ký tự ngẫu nhiên). Mã này chỉ dùng 1 lần để tạo Admin đầu tiên. Bấm Lưu.
4. **Triển khai → Triển khai mới → Ứng dụng web**. Chọn:
   - Thực thi bằng: **Tôi**
   - Ai có quyền truy cập: **Bất kỳ ai**

   Bấm Triển khai và cấp quyền khi Google hỏi. Nếu thấy cảnh báo "Google chưa xác minh ứng dụng": Nâng cao → Đi tới ... (không an toàn) → Cho phép. Đây là script do chính bạn tạo.
5. Sao chép **URL ứng dụng web** (kết thúc bằng `/exec`). Mở thử URL đó trên trình duyệt, phải thấy `{"ok":true,"service":"DearSunday",...}`.
6. Mở trang web DearSunday. Ở màn đăng nhập, dán URL vào ô "Địa chỉ máy chủ", bấm **Lần đầu cài đặt? Tạo Admin**, nhập `SETUP_CODE`, tên đăng nhập và mật khẩu Admin của bạn.
7. Vào **Cài đặt** để cấp tài khoản cho nhân viên. Gửi cho họ địa chỉ trang web, tên đăng nhập và mật khẩu.

Để các máy khác không phải dán URL, đặt URL vào `CONFIG.API_URL` ở đầu phần `<script>` trong `docs/index.html` rồi đưa lên GitHub.

## Cập nhật code máy chủ về sau

Sửa code trong Apps Script, sau đó **Triển khai → Quản lý các bản triển khai → biểu tượng bút chì → Phiên bản: Phiên bản mới → Triển khai**. Làm vậy thì URL giữ nguyên.

## Bảo mật: nên biết

- Trang GitHub Pages là công khai nhưng **không chứa dữ liệu**. Dữ liệu chỉ tải về sau khi đăng nhập.
- Đăng nhập sai 5 lần thì tài khoản bị khóa 10 phút. Đổi mật khẩu hoặc khóa tài khoản làm mọi phiên đang đăng nhập của tài khoản đó mất hiệu lực. Phiên tự hết hạn sau 14 ngày.
- Mật khẩu băm bằng SHA-256 lặp 150 vòng với muối riêng. Đủ cho ứng dụng nội bộ nhỏ, nhưng không mạnh bằng bcrypt. Hãy đặt mật khẩu dài.
- Người sở hữu Google Sheet và Apps Script nhìn thấy toàn bộ dữ liệu. **Không chia sẻ Sheet** cho người khác.
- Mọi tài khoản (cả nhân viên) xem được khách hàng, đặt phòng và tài chính. Chỉ mục Cài đặt là riêng của Admin.
- Kiểm tra thông tin khách bằng AI, mã khóa thông minh và gửi email trong app hiện vẫn là giả lập.

## Prompt để giao cho một AI có trình duyệt tự cài

Dùng khi bạn muốn AI khác (Claude trong Chrome, app Claude desktop...) làm các bước trên giúp, trong tài khoản Google đã đăng nhập sẵn.

```
Bạn đang điều khiển trình duyệt của tôi, tôi đã đăng nhập Google. Hãy tự làm toàn bộ các bước sau, không hỏi lại, rồi báo kết quả.

MỤC TIÊU
Tạo máy chủ đồng bộ cho app homestay: một Google Sheet kèm Apps Script triển khai thành Web App, đặt trong thư mục Drive này:
https://drive.google.com/drive/folders/1E72qOX5kYyyXrXqgizqVJQbZBhcuR4nd

CÁC BƯỚC
1. Mở thư mục Drive trên. Tạo Google Sheet mới ngay trong thư mục đó (New → Google Sheets), đặt tên "DearSunday Data".
2. Mở file code trên GitHub (tab mới): https://github.com/PuongLee269/DearSunday/blob/main/apps-script/Code.gs
   Nếu không thấy file hoặc không mở được, dùng nhánh claude/brave-archimedes-2vo383 thay cho main. Bấm nút "Raw" rồi chọn toàn bộ và sao chép nguyên văn. Nếu GitHub không cho xem, dừng lại và báo tôi.
3. Quay lại Sheet: Extensions (Tiện ích mở rộng) → Apps Script. Xóa hết code mẫu, dán toàn bộ code vừa sao chép.
4. Ở dòng đầu, đổi var SETUP_CODE = "DOI-MA-NAY"; thành một chuỗi ngẫu nhiên 16 ký tự chữ và số do bạn tự sinh. Ghi nhớ chuỗi này. Không sửa gì khác. Bấm Save, đặt tên project "DearSunday Sync".
5. Deploy → New deployment → loại Web app.
   - Execute as: Me
   - Who has access: Anyone
   Bấm Deploy. Khi Google yêu cầu cấp quyền, chọn tài khoản của tôi. Nếu hiện cảnh báo "Google hasn't verified this app" thì bấm Advanced → Go to DearSunday Sync (unsafe) → Allow (đây là script do chính tôi tạo).
6. Sao chép Web app URL (kết thúc bằng /exec).
7. Kiểm tra: mở URL đó trong tab mới. Kết quả phải là JSON bắt đầu bằng {"ok":true,"service":"DearSunday". Nếu sai, sửa lại và triển khai phiên bản mới cho đến khi đúng.

BÁO LẠI CHO TÔI (đúng 2 dòng)
URL Web App: <url kết thúc bằng /exec>
SETUP_CODE: <chuỗi bạn đã đặt>

QUY TẮC
- KHÔNG tự tạo tài khoản Admin và không nhập mật khẩu nào của tôi. Việc đó tôi tự làm trên trang web.
- Không xóa hay sửa file nào khác trong Drive của tôi.
- Không chia sẻ Sheet cho ai, không đổi quyền chia sẻ của thư mục.
- Không gửi URL hay SETUP_CODE tới trang web nào khác.
- Nếu gặp bước cần tôi tự xác nhận (mật khẩu, mã 2 bước), dừng lại và báo tôi.
```
