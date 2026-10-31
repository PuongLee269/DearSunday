# Máy chủ đồng bộ cho DearSunday (Google Apps Script), bản 4

Trang `docs/index.html` (GitHub Pages) không có máy chủ riêng. Phần lưu và đồng bộ dữ liệu nằm ở đây.

- **Không có tài khoản hay mật khẩu.** Mọi máy dùng chung một **mã đồng bộ** (`SYNC_KEY`), nhập một lần trên mỗi máy.
- **Admin** là mã PIN lưu riêng trên từng máy, dùng để mở mục Cài đặt (giá gói, sao lưu). PIN chỉ khóa giao diện, máy chủ không kiểm tra. Quên PIN thì bấm "Quên mã PIN?" rồi nhập mã đồng bộ để đặt lại.
- Dữ liệu lưu trong kho riêng của script (Script Properties), không cần quyền Google Sheets hay Drive.
- Mỗi thay đổi tự lưu lên sau khoảng 1 giây, mỗi 20 giây tự kiểm tra thay đổi từ máy khác. Hai người sửa cùng lúc thì dữ liệu được gộp.

## Cài đặt (khoảng 2 phút)

1. Mở https://script.new (hoặc dự án cũ), xóa code, dán toàn bộ [`Code.gs`](./Code.gs).
2. Đổi dòng `var SYNC_KEY = "DOI-MA-NAY";` thành một chuỗi bí mật dài, khó đoán. Không đưa mã này lên GitHub.
3. **Triển khai → Quản lý các bản triển khai → bút chì → Phiên bản mới → Triển khai** (nếu làm mới: Triển khai mới, loại Ứng dụng web, Thực thi bằng **Tôi**, Ai có quyền truy cập **Bất kỳ ai**). URL giữ nguyên khi cập nhật.
4. Mở URL `/exec` trong cửa sổ ẩn danh, phải thấy `"build":"4"` và `"configured":true`.
5. Đặt URL vào `CONFIG.API_URL` đầu phần `<script>` trong `docs/index.html`.
6. Mở trang web, nhập mã đồng bộ ở màn hình đầu tiên.

## Bị khóa vì nhập sai mã

Sai 20 lần thì bị khóa 10 phút. Muốn gỡ ngay: trong Apps Script chọn hàm `moKhoa` rồi bấm Chạy.

## Giới hạn và bảo mật

- Kho Script Properties tối đa 500 KB, dữ liệu cả homestay giới hạn khoảng 90.000 ký tự JSON. Nếu đầy, app báo "Dữ liệu quá lớn": tải bản sao lưu ở Cài đặt rồi xóa bớt dữ liệu cũ.
- Ai có mã đồng bộ và URL đều đọc, ghi được toàn bộ dữ liệu. Hãy giữ mã riêng tư.
- Trang GitHub Pages là công khai nhưng không chứa dữ liệu và không chứa mã đồng bộ.
- Kiểm tra thông tin khách bằng AI, mã khóa thông minh và gửi email trong app hiện vẫn là giả lập.
