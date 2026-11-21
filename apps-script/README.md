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
4. Sao chép **URL ứng dụng web** (dòng có nhãn "URL ứng dụng web", kết thúc bằng `/exec`, không phải dòng "Thư viện"). Mở thử URL đó trong cửa sổ ẩn danh, phải thấy `{"ok":true,"service":"DearSunday","build":"3.7",...}`.
5. Mở trang web DearSunday. Ở màn đăng nhập, dán URL vào ô "Địa chỉ máy chủ", bấm **Lần đầu cài đặt? Tạo Admin**, nhập `SETUP_CODE`, tên đăng nhập và mật khẩu Admin của bạn.
6. Vào **Cài đặt** để cấp tài khoản cho nhân viên. Gửi cho họ địa chỉ trang web, tên đăng nhập và mật khẩu.

Để các máy khác không phải dán URL, đặt URL vào `CONFIG.API_URL` ở đầu phần `<script>` trong `docs/index.html` rồi đưa lên GitHub.

## Cập nhật code máy chủ về sau

**Phải dán ĐỦ cả bốn file** vào dự án Apps Script (mỗi file một tab, cùng tên): `Code.gs`, `Push.gs`, `OtaFinance.gs` và `appsscript.json` (bật "Hiện tệp kê khai appsscript.json" trong Cài đặt dự án). Thứ tự các tab không quan trọng. Nếu quên `Push.gs` hoặc `OtaFinance.gs`, máy chủ vẫn chạy các chức năng cũ, nhưng thao tác thông báo hoặc đối soát tiền nền tảng sẽ báo "Máy chủ thiếu phần ...". Sau khi dán hoặc sửa code, vào **Triển khai → Quản lý các bản triển khai → biểu tượng bút chì → Phiên bản: Phiên bản mới → Triển khai**. Làm vậy thì URL giữ nguyên.

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

### Một link duy nhất cho cả ba nền tảng, có chống bản sao (build 3.7)

Link lịch của app (`?ics=`) giờ gồm **đặt phòng trong app và mọi đơn thật từ Airbnb, Booking, Agoda**, nên dán cùng một link vào cả ba nền tảng là đủ: đơn ở nền tảng nào cũng được chặn ở hai nền tảng còn lại. Lịch xuất vẫn chỉ có ngày, tiêu đề "Reserved", không tên khách, số điện thoại, giá, mã khóa, tên nguồn.

Vì nền tảng nhận ngày bận rồi xuất ngược lại ("Airbnb (Not available)", "CLOSED - Not available"...), máy chủ phân biệt **đơn thật** và **bản sao**:
- Máy chủ nhớ những khoảng ngày đã xuất (`ICS_SENT`, tự dọn sau 3 ngày, tối đa khoảng 6 KB). Sự kiện từ nền tảng không có dấu hiệu đơn thật, nằm trọn trong các khoảng đó và xuất hiện sau khi app bắt đầu xuất (tối đa 2 giờ sau khi app ngừng xuất) là bản sao (echo).
- Nếu chủ nhà còn nối trực tiếp nền tảng với nhau (ví dụ dán lịch Booking vào Airbnb), sự kiện nằm trọn trong đơn thật của một nền tảng khác cũng là bản sao (mirror). Đặt phòng trong app không dùng để xét mirror: quan hệ app → nền tảng chỉ dùng quy tắc echo ở trên. Nhờ vậy nhân viên nhập tay đơn nền tảng vào app rồi xóa đi thì đơn nền tảng vẫn được xuất.
- Dấu hiệu đơn thật của Airbnb: tiêu đề đúng "Reserved" hoặc mô tả có "Reservation URL"/"reservations/details": luôn là đơn thật.
- Cờ bản sao chỉ được nhả nếu sự kiện vẫn còn sau 36 giờ kể từ khi nguồn che phủ nó biến mất (app ngừng xuất khoảng đó, hoặc đơn thật nguồn khác biến mất): lúc đó nó là đơn thật, hiện trong app, được xuất và tính trùng. Nhờ vậy đơn Booking thật bị nhầm là bản sao (vì nhân viên nhập tay vào app trước) không bị chặn mãi sau khi xóa đặt phòng app.
- Riêng Airbnb (nguồn có dấu hiệu đơn thật): sự kiện không có dấu hiệu đơn thật mà nằm trọn trong một đặt phòng app đang có là bản sao bất kể mốc thời gian, kể cả sự kiện đã lưu trước đó là đơn thật (phân loại lại ở lần đọc kế tiếp). Nhờ vậy ngày Airbnb xuất ngược từ trước khi máy chủ nâng cấp không còn hiện ghi chú "trùng đúng ngày" và không bị xuất lại. Sự kiện có "Reserved"/Reservation URL vẫn là đơn thật. Cờ này cũng được nhả sau 36 giờ khi đặt phòng app biến mất.
- Bản sao được giữ nguyên là bản sao đến khi biến mất hoặc được nhả, nên khi khách hủy, bản sao còn sót lại không thành đơn ma và không bị xuất lại; vài giờ sau nền tảng đọc lại lịch thì ngày mở hoàn toàn.
- Bản sao không hiện trong app, không vào lịch công khai, không tạo dự tính thu nhập, không gửi thông báo. Admin thấy số bản sao đã bỏ qua của từng nguồn.

**Báo trùng:** sau mỗi lần đọc, máy chủ tìm chồng lấn giữa đơn thật của hai nền tảng, hoặc đơn thật của nền tảng với đặt phòng trong app. Trang chủ hiện thẻ đỏ "Trùng lịch: ngày, nguồn" và gửi một thông báo đẩy cho mỗi vụ trùng mới (không có tên khách). Lần đầu sau khi nâng cấp chỉ ghi mốc, không báo.

**Đúng cùng ngày nhận và trả:** đặt phòng trong app trùng đúng ngày với một đơn nền tảng không bị coi là trùng đỏ và không gửi thông báo, vì thường là nhân viên tự nhập đơn nền tảng vào app. Trang chủ hiện ghi chú vàng nhỏ "Đơn trong app trùng đúng ngày đơn <nền tảng>: nếu cùng một khách thì bỏ qua". Trùng lệch ngày vẫn là thẻ đỏ và có thông báo.

Giới hạn: nền tảng đọc lịch chậm vài giờ nên vẫn có khoảng chờ đặt trùng. Bản sao chỉ nhận biết theo ngày: một đơn thật không có dấu hiệu (Booking, Agoda) trùng đúng ngày đơn thật của nền tảng khác có thể bị coi là bản sao và không báo trùng; đơn đến sau, trùng đúng khoảng app đang xuất trong lúc chờ, cũng có thể bị coi là bản sao (đơn Airbnb "Reserved" và đơn trùng một phần thì vẫn báo). Nếu hai nền tảng nối trực tiếp hai chiều với nhau thì chúng tự giữ ngày của nhau và app không gỡ được.

## Khóa thông minh TTLock: tự tạo mã vào cửa (build 3.3)

Dùng [TTLock Open Platform](https://euopen.ttlock.com) (`api.sciener.com`).

**Cần có:**
1. Tài khoản nhà phát triển tại https://euopen.ttlock.com/register, được TTLock duyệt, rồi tạo ứng dụng để có **Client ID** và **Client Secret**.
2. Tài khoản app TTLock (email hoặc số điện thoại, mật khẩu) đang quản lý khóa. Không dùng tài khoản nhà phát triển.
3. Khóa phải hỗ trợ mã dạng V4 (khóa hiện đại). Mã tạo kiểu "theo khoảng thời gian" (`keyboardPwd/get`, loại 3) nên không cần gateway.

**Cài đặt:** Cài đặt (Admin) → Khóa thông minh TTLock: nhập 4 thông tin, bấm "Kết nối và lấy danh sách khóa", chọn khóa. Mật khẩu TTLock chỉ lưu dạng MD5 trong Script Properties.

**Cách dùng:** mỗi đặt phòng có nút **Tạo mã vào cửa**. Mã hiệu lực từ giờ nhận phòng (làm tròn xuống giờ) đến giờ trả phòng + 1 giờ (làm tròn lên giờ), theo giờ Việt Nam (UTC+7). Mã lưu vào đặt phòng và đồng bộ cho mọi máy; có nút sao chép tin nhắn gửi khách.

**Tự động:** chạy hàm `caiTuDongMaKhoa` một lần trong Apps Script editor. Mỗi giờ máy chủ tạo mã cho các đặt phòng sắp nhận trong 24 giờ tới mà chưa có mã.

**Cần biết:** theo tài liệu TTLock, mã loại này phải được dùng ít nhất một lần trong 24 giờ kể từ giờ bắt đầu, nếu không sẽ bị vô hiệu. Thời hạn mã làm tròn theo giờ. Đổi giờ đặt phòng sau khi đã tạo mã thì app báo "Mã lệch giờ" và cho tạo mã mới; mã cũ vẫn mở được cửa đến hết hạn (xóa từ xa cần gateway).

## Lịch công khai chỉ xem (build 3.4)

Trang `docs/lich.html` (https://puonglee269.github.io/DearSunday/lich.html) hiện lịch tháng ngày trống hoặc kín cho người ngoài xem, không cần đăng nhập. Trang chỉ gọi `<URL /exec>?cal=1` bằng GET, máy chủ chỉ trả về danh sách ngày: `night` (đêm đã kín, gồm cả ngày đặt từ Airbnb, Booking) và `day` (ngày chỉ bận theo giờ). Không có tên, số điện thoại, giá, ghi chú hay nguồn đặt phòng, và không có thao tác ghi nào. Trang tự tải lại mỗi phút và khi mở lại tab, nên luôn theo dữ liệu đã đồng bộ trong app.

Ai có link đều xem được ngày bận của phòng. Cần dán code Apps Script bản 3.4 và triển khai phiên bản mới để trang chạy.

## Thêm Agoda (build 3.6)

Agoda là nguồn thứ ba, dùng chung cơ chế với Airbnb và Booking: dán địa chỉ iCal xuất của Agoda (Agoda Partner Portal → Connect calendars → Export) vào ô **Agoda** ở **Cài đặt → Lịch Airbnb, Booking và Agoda**. Địa chỉ chứa mã truy cập riêng nên chỉ lưu trên máy chủ, không đưa vào mã nguồn hay trang công khai. Muốn Agoda thấy lịch của Dear Sunday, dán địa chỉ ở mục "Lịch của Dear Sunday" vào ô **Import a calendar from another site** của Agoda. Thẻ Agoda cũng có nút tạo mã vào cửa như hai nền tảng kia.

## Mã vào cửa cho đặt phòng từ Airbnb, Booking (build 3.5)

Thẻ các ngày đặt từ Airbnb, Booking trên Trang chủ có nút **Tạo mã vào cửa** (hiện khi đã kết nối khóa TTLock). Lịch iCal chỉ có ngày, nên mã hiệu lực từ 14:00 ngày nhận đến 11:00 ngày trả cộng 1 giờ (giờ Việt Nam). Mã lưu trong kho script (`EXT_CODES`, tự xóa sau khi hết hạn hơn 1 ngày), đồng bộ cho mọi máy, có nút sao chép tin nhắn để người quản lý tự gửi khách trên nền tảng. Bấm lại không tạo mã mới. Mã không có trong lịch iCal xuất và lịch công khai.

Lưu ý: khách hủy đơn thì mã vẫn còn hiệu lực đến hết hạn (xóa mã từ xa cần gateway). Nên tạo mã gần ngày nhận phòng. Đổi ngày đặt phòng trên nền tảng thì mã cũ không tự đổi theo.

## Build 3.7

- Máy chủ không còn phụ thuộc thứ tự nạp file; thiếu `Push.gs` hoặc `OtaFinance.gs` chỉ làm các action `push*`, `ota*` trả `code: "missing"`.
- `ttCode` (tạo mã vào cửa) không tạo trùng: bấm lại trả mã cũ. Nếu đã đổi giờ đặt phòng thì tạo mã mới, trả `replaced` và `oldCode` (mã cũ vẫn còn hiệu lực trên khóa đến hết hạn).
- Thêm action `otaCancel` (chỉ Admin): gỡ xác nhận thu tiền nền tảng và xóa giao dịch thu tương ứng.
- Sửa nhỏ: đọc ngày iCal giờ UTC theo giờ Việt Nam, không lưu địa chỉ iCal vào thông báo lỗi, nhận lỗi token TTLock 10003 và 10004, so sánh chữ ký/mã lịch an toàn hơn, xóa mốc thông báo khi tắt nguồn lịch.
