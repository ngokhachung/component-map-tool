# Component Map Tool — Giải thích cho team

> Tài liệu này giải thích **tool dùng để làm gì**, **chạy ra sao**, và **hiện tại đang ở đâu**. Dành cho thành viên mới chưa theo dõi quá trình. Cập nhật: 2026-05-29.

---

## 1. Tool này giải quyết vấn đề gì?

Codebase Angular của ta có 100–500 component. Khi một dev sửa **một** component, họ mất nhiều thời gian để:
- (a) **Tìm impact**: component này đang được những ai dùng? sửa nó hỏng chỗ nào?
- (b) **Tìm đường tới UI**: làm sao bấm/điều hướng trên app để nhìn thấy component đó?

Hiện tại dev phải `grep`, search trong IDE, hoặc hỏi senior — chậm và dễ sót.

**Tool**: đưa vào một `component-id` → trả về **(1) danh sách component cha (impact)** + **(2) đường đi UI để tới component đó**.

> Ràng buộc: không dùng tool open-source ngoài (Compodoc/Nx/ng-analyzer) vì chính sách bảo mật → build in-house bằng `ts-morph` (đọc code TypeScript) và `@angular/compiler` (đọc template HTML).

---

## 2. Ví dụ cụ thể (đọc cái này là hiểu ngay)

Giả sử repo có:

```
src/app/
  app.routes.ts                       // route '' → Dashboard, 'users' → UserList
  shared/user-avatar.component.ts     // selector: app-user-avatar   ← MUỐN SỬA CÁI NÀY
  users/user-list.component.html      // có dùng <app-user-avatar>
  header/header.component.html        // cũng có dùng <app-user-avatar>
  dashboard/dashboard.component.html  // dùng <app-user-list>
```

Dev hỏi: *“Tôi sắp đổi `UserAvatarComponent`, **ảnh hưởng tới đâu** và **làm sao bấm vào UI để thấy nó**?”*

Tool xử lý 4 bước:

```
BƯỚC 1 — LẬP CHỈ MỤC (index) mọi component
   Quét mọi *.ts có @Component → bảng selector → class:
     app-user-avatar → UserAvatarComponent (shared/user-avatar.component.ts)
     app-user-list   → UserListComponent
     app-dashboard   → DashboardComponent
     app-header      → HeaderComponent

BƯỚC 2 — DỰNG CẠNH cha→con
   Đọc template từng component, tìm thẻ khớp bảng Bước 1:
     UserListComponent  →  <app-user-avatar>   ⇒  UserList  → UserAvatar
     HeaderComponent    →  <app-user-avatar>   ⇒  Header    → UserAvatar
     DashboardComponent →  <app-user-list>     ⇒  Dashboard → UserList

BƯỚC 3 — ĐỌC ROUTING
   app.routes.ts:
     ''       → DashboardComponent
     'users'  → UserListComponent

BƯỚC 4 — GHÉP GRAPH rồi ĐẢO CHIỀU
   Graph:  Dashboard → UserList → UserAvatar
                        Header  → UserAvatar
   Hỏi "ai là CHA của UserAvatar?":
     UserAvatar ◄── UserList ◄── Dashboard
     UserAvatar ◄── Header
```

**Kết quả tool trả về:**

```
Component: UserAvatarComponent  (shared/user-avatar.component.ts)

① IMPACT — sửa nó ảnh hưởng:
   - UserListComponent   (dùng trực tiếp)
   - HeaderComponent     (dùng trực tiếp)
   - DashboardComponent  (gián tiếp qua UserList)

② UI ACCESS PATH — cách tới nó trên app:
   - Mở route /users      → thấy trong danh sách user
   - Hoặc: nằm ở Header   → hiện ở MỌI trang
```

→ Thay vì grep khắp repo rồi tự lần ngược, tool trả lời trong vài giây.

---

## 3. Trạng thái hiện tại — RẤT QUAN TRỌNG

Dự án đi theo từng giai đoạn. Hiện mới xong **Phase 0 (POC – thăm dò khả thi)**, CHƯA phải tool hoàn chỉnh.

| Việc | Trạng thái |
|---|---|
| Bóc tách component / route / template từ code Angular 19 thật | ✅ **Đã chứng minh** (Phase 0 — GO) |
| Ghép graph + đảo chiều + tính UI path + truy vấn theo `component-id` (Bước 4) | ⏳ **Chưa có** — là **Phase 1 (M2)** cần build |
| PR bot, giao diện/visualization | ⏳ Phase 2.5 / Phase 3 |

**Phase 0 đã trả lời được câu hỏi sống còn:** *"3 thư viện parse có đáng tin trên Angular 19 không?"* → **Có** (kết quả GO, xem `poc/FEASIBILITY-REPORT.md`). Đây là điều kiện tiên quyết trước khi đổ công sức build tool thật.

> Code Phase 0 nằm trong `poc/` là **code thăm dò, dùng xong vứt** — không phải tool production. Phase 1 sẽ viết lại sạch dựa trên các "công thức" đã chứng minh.

---

## 4. Phase 0 đã làm gì (tóm tắt)

POC gồm 3 "mũi khoan" (spike) chạy trên **dữ liệu Angular 19 giả lập** (fixtures), mỗi mũi kiểm 1 giả định khó nhất:

| Spike | Kiểm gì | Công cụ | Kết quả |
|---|---|---|---|
| Component | Bóc selector, @Input/@Output, signal `input()/output()/model()`, standalone, NgModule | `ts-morph` | 11/11 ✅ |
| Routing | Bóc route, lazy `loadChildren/loadComponent`, guard; cờ lazy không giải được | `ts-morph` | 5/5 ✅ |
| Template | Tìm component con dưới `*ngIf/@if/@for/@switch/@defer`; cờ `ng-content`/`ngComponentOutlet` | `@angular/compiler` | 5/5 ✅ |

Mỗi fixture đi kèm một file `*.expected.json` (đáp án viết tay) để **tự động chấm đúng/sai**. Báo cáo cuối: `poc/FEASIBILITY-REPORT.md` → **Overall verdict: GO**.

---

## 5. Cách chạy thử POC (UAT)

```powershell
cd D:\project\component-maping\poc
npm install      # 1 lần
npm run smoke    # (1) chứng minh @angular/compiler + ts-morph chạy được standalone
npm test         # (2) 20 unit test
npm run report   # (3) chạy 3 spike + ghi FEASIBILITY-REPORT.md
```

| Lệnh | PASS khi thấy |
|---|---|
| `npm run smoke` | JSON có `"parseErrorCount": 0`, thoát mã 0 |
| `npm test` | `Tests 20 passed (20)` |
| `npm run report` | 3 bảng đều `GO` + dòng `**Overall verdict: GO**` |

Muốn thấy 1 test FAIL để hiểu cơ chế: sửa 1 giá trị trong một file `fixtures/**/**.expected.json` rồi chạy lại spike tương ứng → báo `mismatch`. Nhớ `git checkout` để hoàn tác.

---

## 6. Cấu trúc code POC (`poc/`)

```
poc/
├── types.ts                # Hợp đồng dữ liệu chung (interface) cho mọi spike + harness
├── harness/                # "Trọng tài" chấm điểm (không biết gì về Angular)
│   ├── diff.ts             #   so 2 mảng không quan tâm thứ tự, có đếm trùng
│   └── report.ts           #   chấm pass/fail 1 case (FAIL nếu có lỗi parse) + gộp tỉ lệ
├── spikes/
│   ├── smoke.ts            #   cổng gác: import thử thư viện
│   ├── lib/
│   │   ├── load-fixtures.ts    # ghép file nguồn với file đáp án
│   │   └── template-visitor.ts # duyệt cây AST template, gom component con
│   ├── spike-component.ts  #   ts-morph đọc metadata @Component
│   ├── spike-routing.ts    #   ts-morph đọc Routes
│   ├── spike-template.ts   #   @angular/compiler parse template
│   └── report-all.ts       #   chạy 3 spike → áp ngưỡng GO/NO-GO → ghi báo cáo
├── fixtures/               # dữ liệu Angular mẫu + đáp án (component / routing / template)
└── FEASIBILITY-REPORT.md   # SẢN PHẨM CUỐI: báo cáo GO/NO-GO
```

**Luồng của một spike:**

```
 fixture nguồn ──► PARSE (ts-morph / @angular/compiler) ──► kết quả thật
                                                              │
 đáp án (expected.json) ──────────────────────────────────►  so khớp ──► PASS/FAIL
```

**Luồng `npm run report`:**

```
 spike-component ─┐
 spike-routing  ──┼─► 3 TaskReport ─► áp ngưỡng (≤50% NO-GO; 50–80% caveats; ≥80% GO)
 spike-template ─┘                  ─► verdict tổng ─► FEASIBILITY-REPORT.md
```

---

## 7. Từ POC sang tool thật cần thêm gì (Phase 1 — M2)

POC mới "bóc tách" 3 mảnh rời. Tool thật cần:
1. **Tự sinh bảng selector→class** từ repo thật (POC đang viết tay trong `selectors.json`).
2. Đọc template ngoài (`templateUrl`), quét cả repo `src/` (không giả định tên file).
3. **Ghép graph + đảo chiều** để tìm **cha** (POC mới tìm con).
4. **Tính UI Access Path** (lần route → chuỗi component).
5. **Cache + incremental build** (mục tiêu: full < 60s, incremental < 5s).
6. **CLI/API**: nhập `component-id` → xuất impact + UI path.
7. Phát hiện **version Angular** từ `package.json` (POC ghim cứng v19).

Chi tiết rủi ro & ghi chú chuyển giao: xem `.planning/phase0-SUMMARY.md`. Kế hoạch tổng thể: `specs/component-map-plan-v2.md`.

---

## 8. Tài liệu liên quan

| File | Nội dung |
|---|---|
| `specs/component-map-plan-v2.md` | Kế hoạch tổng thể toàn dự án (Phase -1 → Phase 4) |
| `poc/FEASIBILITY-REPORT.md` | Báo cáo GO/NO-GO của Phase 0 |
| `.planning/phase0-SUMMARY.md` | Tóm tắt Phase 0 + ghi chú chuyển sang Phase 1 |
| `docs/specs/2026-05-29-phase0-poc-validation-design.md` | Thiết kế chi tiết Phase 0 |
| `.planning/REQUIREMENTS.md` | Danh sách yêu cầu (POC-01..05) |
