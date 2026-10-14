# Máy chủ đồng bộ cho DearSunday (Google Apps Script + Google Sheet)

Trang web `docs/index.html` (chạy trên GitHub Pages) không có máy chủ riêng. Phần đăng nhập, phân quyền và lưu dữ liệu nằm ở đây:

- Script tự tạo một Google Sheet `DearSunday Data` trong Drive của bạn để lưu dữ liệu (sheet `Data`), có bản sao lưu tự động mỗi giờ (sheet `Backup`).
- Tài khoản nằm trong sheet `Users`. Mật khẩu được băm, không lưu mật khẩu gốc.
- Chỉ **Admin** gọi được các thao tác quản trị (cấp, khóa, xóa tài khoản, đặt lại mật khẩu). Quyền được kiểm tra ở máy chủ, không chỉ ẩn nút trên giao diện.
- Các máy đăng nhập đều tự đồng bộ: mỗi thay đổi tự lưu lên sau khoảng 1 giây, mỗi 20 giây tự kiểm tra thay đổi từ máy khác. Hai người sửa cùng lúc thì dữ liệu được gộp, không ghi đè nhau.

## Cài đặt (làm 1 lần, khoảng 3 phút)

Không cần tạo Sheet trước, không cần sửa code.

1. Mở **https://script.new** (đăng nhập đúng tài khoản Google muốn lưu dữ liệu). Xóa code mẫu, dán toàn bộ nội dung file [`Code.gs`](./Code.gs).
2. Đổi dòng đầu `var SETUP_CODE = "DOI-MA-NAY";` thành một chuỗi bí mật của bạn (ví dụ 16 ký tự ngẫu nhiên). Mã này chỉ dùng 1 lần để tạo Admin đầu tiên.
3. **Triển khai → Triển khai mới → biểu tượng bánh răng chọn Ứng dụng web**. Chọn "Thực thi bằng: **Tôi**" và "Ai có quyền truy cập: **Bất kỳ ai**". Bấm **Triển khai**, cấp quyền khi Google hỏi. Nếu thấy cảnh báo "Google chưa xác minh ứng dụng": Nâng cao → Đi tới ... (không an toàn) → Cho phép. Đây là script do chính bạn tạo.
4. Sao chép **URL ứng dụng web** (kết thúc bằng `/exec`). Mở thử URL đó trên trình duyệt, phải thấy `{"ok":true,"service":"DearSunday",...}`.
5. Mở trang web DearSunday. Ở màn đăng nhập, dán URL vào ô "Địa chỉ máy chủ", bấm **Lần đầu cài đặt? Tạo Admin**, nhập `SETUP_CODE`, tên đăng nhập và mật khẩu Admin của bạn.
6. Vào **Cài đặt** để cấp tài khoản cho nhân viên. Gửi cho họ địa chỉ trang web, tên đăng nhập và mật khẩu.

Để các máy khác không phải dán URL, đặt URL vào `CONFIG.API_URL` ở đầu phần `<script>` trong `docs/index.html` rồi đưa lên GitHub.

Tùy chọn: muốn Google Sheet nằm trong một thư mục Drive cụ thể, điền `FOLDER_ID` trong code (script sẽ xin thêm quyền Drive). Hoặc cứ để mặc định rồi kéo file `DearSunday Data` vào thư mục bằng tay.

## Cập nhật code máy chủ về sau

Sửa code trong Apps Script, sau đó **Triển khai → Quản lý các bản triển khai → biểu tượng bút chì → Phiên bản: Phiên bản mới → Triển khai**. Làm vậy thì URL giữ nguyên.

## Bảo mật: nên biết

- Trang GitHub Pages là công khai nhưng **không chứa dữ liệu**. Dữ liệu chỉ tải về sau khi đăng nhập.
- Đăng nhập sai 5 lần thì tài khoản bị khóa 10 phút. Đổi mật khẩu hoặc khóa tài khoản làm mọi phiên đang đăng nhập của tài khoản đó mất hiệu lực. Phiên tự hết hạn sau 14 ngày.
- Mật khẩu băm bằng SHA-256 lặp 150 vòng với muối riêng. Đủ cho ứng dụng nội bộ nhỏ, nhưng không mạnh bằng bcrypt. Hãy đặt mật khẩu dài.
- Người sở hữu tài khoản Google chạy script nhìn thấy toàn bộ dữ liệu. **Không chia sẻ Sheet** `DearSunday Data` cho người khác.
- Mọi tài khoản (cả nhân viên) xem được khách hàng, đặt phòng và tài chính. Chỉ mục Cài đặt là riêng của Admin.
- Kiểm tra thông tin khách bằng AI, mã khóa thông minh và gửi email trong app hiện vẫn là giả lập.
