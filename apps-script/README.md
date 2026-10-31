# Máy chủ đồng bộ cho DearSunday (Google Apps Script)

Trang web `docs/index.html` (chạy trên GitHub Pages) không có máy chủ riêng. Phần đăng nhập, phân quyền và lưu dữ liệu nằm ở đây:

- Dữ liệu và tài khoản lưu trong kho riêng của chính script (Script Properties). Script **không dùng Google Sheets hay Drive**, nên không đòi cấp quyền gì và không hiện cảnh báo "chưa xác minh ứng dụng".
- Mật khẩu được băm, không lưu mật khẩu gốc.
- Chỉ **Admin** gọi được các thao tác quản trị (cấp, khóa, xóa tài khoản, đặt lại mật khẩu). Quyền được kiểm tra ở máy chủ, không chỉ ẩn nút trên giao diện.
- Các máy đăng nhập đều tự đồng bộ: mỗi thay đổi tự lưu lên sau khoảng 1 giây, mỗi 20 giây tự kiểm tra thay đổi từ máy khác. Hai người sửa cùng lúc thì dữ liệu được gộp, không ghi đè nhau.

## Cài đặt (làm 1 lần, khoảng 3 phút)

1. Mở **https://script.new** (đăng nhập tài khoản Google bạn muốn dùng). Xóa code mẫu, dán toàn bộ nội dung file [`Code.gs`](./Code.gs).
2. Đổi dòng đầu `var SETUP_CODE = "DOI-MA-NAY";` thành một chuỗi bí mật của bạn (ví dụ 16 ký tự ngẫu nhiên). Mã này chỉ dùng 1 lần để tạo Admin đầu tiên.
3. **Triển khai → Triển khai mới → biểu tượng bánh răng chọn Ứng dụng web**. Chọn "Thực thi bằng: **Tôi**" và "Ai có quyền truy cập: **Bất kỳ ai**". Bấm **Triển khai**. Nếu Google có hỏi cấp quyền thì làm theo hướng dẫn trên màn hình.
4. Sao chép **URL ứng dụng web** (dòng có nhãn "URL ứng dụng web", kết thúc bằng `/exec`, không phải dòng "Thư viện"). Mở thử URL đó trong cửa sổ ẩn danh, phải thấy `{"ok":true,"service":"DearSunday","build":"3",...}`.
5. Mở trang web DearSunday. Ở màn đăng nhập, dán URL vào ô "Địa chỉ máy chủ", bấm **Lần đầu cài đặt? Tạo Admin**, nhập `SETUP_CODE`, tên đăng nhập và mật khẩu Admin của bạn.
6. Vào **Cài đặt** để cấp tài khoản cho nhân viên. Gửi cho họ địa chỉ trang web, tên đăng nhập và mật khẩu.

Để các máy khác không phải dán URL, đặt URL vào `CONFIG.API_URL` ở đầu phần `<script>` trong `docs/index.html` rồi đưa lên GitHub.

## Cập nhật code máy chủ về sau

Sửa code trong Apps Script, sau đó **Triển khai → Quản lý các bản triển khai → biểu tượng bút chì → Phiên bản: Phiên bản mới → Triển khai**. Làm vậy thì URL giữ nguyên.

## Giới hạn dung lượng

Kho Script Properties tối đa 500 KB, script giới hạn dữ liệu cả homestay ở khoảng 90.000 ký tự JSON (đủ cho nhiều năm với 1 phòng). Nếu đầy, app báo "Dữ liệu quá lớn": vào **Cài đặt → Tải bản sao lưu**, rồi xóa bớt khách, giao dịch và ghi chú cũ. Script không tự sao lưu, nên admin nên tải bản sao lưu định kỳ.

## Bảo mật: nên biết

- Trang GitHub Pages là công khai nhưng **không chứa dữ liệu**. Dữ liệu chỉ tải về sau khi đăng nhập.
- Đăng nhập sai 5 lần thì tài khoản bị khóa 10 phút. Đổi mật khẩu hoặc khóa tài khoản làm mọi phiên đang đăng nhập của tài khoản đó mất hiệu lực. Phiên tự hết hạn sau 14 ngày.
- Mật khẩu băm bằng SHA-256 lặp 150 vòng với muối riêng. Đủ cho ứng dụng nội bộ nhỏ, nhưng không mạnh bằng bcrypt. Hãy đặt mật khẩu dài.
- Người sở hữu tài khoản Google chạy script xem được toàn bộ dữ liệu (trong Cài đặt dự án của Apps Script).
- Mọi tài khoản (cả nhân viên) xem được khách hàng, đặt phòng và tài chính. Chỉ mục Cài đặt là riêng của Admin.
- Kiểm tra thông tin khách bằng AI, mã khóa thông minh và gửi email trong app hiện vẫn là giả lập.

## Lịch iCal hai chiều với Airbnb, Booking (build 3.2)

**Xuất (Airbnb, Booking đọc lịch của bạn):** địa chỉ `<URL /exec>?ics=<mã>`. Mã tự tạo và lưu trong script (không nằm trong code). Xem địa chỉ ở **Cài đặt → Lịch Airbnb và Booking**, hoặc chạy hàm `layLinkLich`. Muốn đổi mã thì bấm "Tạo lại mã lịch" hoặc chạy `taoLaiMaLich` (địa chỉ cũ ngừng hoạt động, phải dán lại địa chỉ mới vào hai nền tảng). Lịch chỉ có ngày bị chặn (`Reserved`), không có tên, số điện thoại, giá hay ghi chú. Gói qua đêm chặn các đêm từ ngày nhận đến ngày trả; gói trong ngày và 4H chặn cả ngày đó. Đơn đã qua hơn 1 ngày không được xuất.

**Nhập (app biết ngày đã đặt trên Airbnb, Booking):** dán địa chỉ iCal xuất của từng nền tảng vào **Cài đặt → Lịch Airbnb và Booking** (chỉ Admin). Địa chỉ lưu trên máy chủ, không trả lại cho trình duyệt. Máy chủ đọc lại mỗi 30 phút, các ngày đó hiện trên lịch và báo trùng khi đặt phòng. Sự kiện đã hủy, đã qua, và sự kiện do chính Dear Sunday xuất ra bị bỏ qua. Nếu một lần đọc lỗi thì giữ lịch lần trước.

Cần làm một lần trong Apps Script editor: chạy hàm `caiTuDongLich` (Google sẽ hỏi cấp thêm quyền gọi ra ngoài và tạo bộ hẹn giờ).

Giới hạn: lịch chỉ có ngày, không có giờ. Đặt từ nền tảng được coi là nhận 14:00, trả 11:00. Nền tảng tự đọc lịch của bạn sau vài giờ nên vẫn có khoảng chờ có thể đặt trùng.
