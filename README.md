# Cấu trúc đề
Đề có các dịch vụ sau:
- `Mathsays`: Sử dụng Deno (javascript) và canvas để tạo hình ảnh cowsays từ text là các công thức toán học
- `Upload Log`: Sử dụng PHP/Apache để upload log
- `FreeDom Chat`: Sử dụng Deno (javascript) websocket để làm phòng chat giữa người dùng
- `Postgrest`: Sử dụng postgrest làm rest api cho postgres để cung cấp cho FreeDom Chat

# Cấu trúc hệ thống
Người dùng truy cập vào các dịch vụ thông qua nginx proxy:
- `/` => Trang tĩnh html bao gồm index.html (thông báo 403), mathsays.html, free-chat.html, swagger.html, việc thông báo 403 là intended, đội chơi cần phải monitor traffic, nginx access log để biết được các endpoints của hệ thống
- `/api/` => Trang API cho phép gọi functions/procedure/tables trên postgrest
- `/log-api/` => Trang upload log của PHP, chuyển tiếp request tới Apache
- `/mathsays` => Trang cho phép generate hình ảnh từ đoạn mã là công thưc toán học, trả về png
- `/ws` => Trang kết nối websocket thực hiện chat realtime

# Danh sách bugs
- `/api/` (postgrest):
  + unauthentication blind command injection
  + nhiều ssrf

- `/log-api/`:
  + apache CVE-2021-41773 cho phép đọc tệp tùy ý trên hệ thống
  + file upload php dẫn tới RCE
  + phpunit CVE-2017-9841 RCE

- `/mathsays`: command injection
- `/ws`: SQL Injection (2 lỗi với 2 escape character khác nhau `'` và `$$`)

# Build dịch vụ
- `mathsays`: thực hiện tiếp nhận tham số t và chạy command `deno says-cli.ts` <= command injection sảy ra ở đây
- `php upload log`: nhận tham số log là tệp upload và lưu lại tại thư mục logs/[ngày tháng năm giờ:phút]
- `ws`: bao gồm 2 tables: chats và messages.
    + Khi người dùng tạo phòng chat hoặc join phòng chat, table chats được insert mới.
    + Khi người dùng nhắn tin, websocket nhận event khác 'ping', decode json và insert tin nhắn vào table messages (SQL Injection xảy ra tại đây). Người lập trình cố gắng insert tin nhắn nếu fail (2 lỗi SQL Injection).
- `postgres/postgrest`: function `public.c` được tạo để chạy câu lệnh cmd, tuy nhiên function này không còn sử dụng nữa (lỗ hổng của hệ thống)

# Bot
Các hàm check dịch vụ của bot và cách check
- `checkUptime`: Truy cập trang chủ và check status
- `checkFakeFlag`: Truy cập mathsays.html và check md5 xem có bị xóa bỏ không
- `checkFreeChat`: Truy cập free-chat.html và check status
- `checkMathsays`: Truy cập `/mathsays?t=` với các công thức và câu hỏi toán học khác nhau để kiểm tra việc tạo hình ảnh, check response của hệ thống có khớp không
- `checkPHPUploadLog`: Thực hiện upload các tệp tin với định dạng khác nhau, nội dung ngẫu nhiên lên `/log-api/app/upload-log.php`, các tệp tin không gây hại, không có `.php`, `.htaccess`, `.html`,..., check response
- `checkPHPUploadLog-stage2`: Thực hiện truy cập vào tệp đã upload và kiểm tra status, check response
- `checkAPIHttp`: Thực hiện sử dụng function `http_get` của postgres để truy cập vào các website khác nhau trên internet, check response
- `checkCreateChat`: Thực hiện tạo một phòng chat mới trên postgres, check response
- `checkChatWs`: Thực hiện connect websocket và gửi tin nhắn cho chat id từ 1-15, lắng nghe tin nhắn đã được gửi và kiểm tra
- `checkChatId`: Truy cập để xem chat id vừa gửi từ websocket, check response
- Bot sẽ tự động restart sau mỗi round mới
