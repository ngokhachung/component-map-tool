# Runbook — chạy `cmap` trên Angular repo thật

> Operational runbook cho việc chạy tool `cmap` (Component Map) trên một Angular codebase
> thật, trên một máy mới. Tool **chỉ ĐỌC** repo mục tiêu — mọi output ghi vào `tool/.cmap/`
> và các file HTML bạn chỉ định, không bao giờ ghi vào repo Angular thật.

Quy ước: `REPO` = đường dẫn repo Angular thật; source thường ở `REPO/src`.

---

## 0. Chuẩn bị (1 lần / máy mới)

**Yêu cầu:** Node **≥ 20**, npm, git.

```bash
# 1. Lấy tool sang máy đó (clone repo này, hoặc copy thư mục tool/)
git clone <repo-component-maping> cmap-tool
cd cmap-tool/tool

# 2. Cài dependencies (đúng version đã pin: @angular/compiler 19.2.14, ts-morph 24)
npm install

# 3. Smoke test — đảm bảo tool chạy được TRƯỚC khi đụng repo thật
npm test                 # phải xanh (~161 tests)
npm run cmap -- --help   # in ra USAGE
```

> ⚠️ **Tương thích Angular:** parser pin cứng `@angular/compiler@19.2.14`.
> Tốt nhất cho **Angular 14–19**. Nếu repo thật là **Angular 20+**, cú pháp template
> mới có thể parse sai → kiểm tra `parseErrorComponents` ở bước index; nếu cao thì
> đó là dấu hiệu version lệch.

CLI luôn gọi qua: `npm run cmap -- <command> [flags]`

---

## 1. Index + accuracy

```bash
npm run cmap -- index --root "REPO/src"
```

Kết quả JSON:
```json
{ "components": N, "edges": M, "routes": R,
  "parseErrorComponents": 0, "warnings": 0, "fromCache": false }
```

Đọc thế nào:
- `components` ≈ số component thật (đối chiếu nhanh: `grep -r "@Component" REPO/src | wc -l`).
- `parseErrorComponents` nên **= 0**. > 0 → có template tool không parse được (thường do version Angular lệch).
- `fromCache: false` lần đầu; chạy lại sẽ `true` (cache theo content-hash trong `.cmap/`).

---

## 2. Query — impact + UI access path

Locator nhận: `componentId` (alias trong MD) → tên class → đường dẫn file → selector.

```bash
# theo selector
npm run cmap -- query app-user-detail --root "REPO/src"
# theo class name
npm run cmap -- query UserDetailComponent --root "REPO/src"
```

In ra: `component` (id/selector/file/standalone/module), `impact` (`ancestors` = ai bị ảnh
hưởng + cờ `uncertain`), `accessPaths` (route URL + component chain để tới UI).

- `ambiguous locator` → tool liệt kê candidates, chọn cái cụ thể hơn.
- `no component found` → thử selector/class khác.

---

## 3. Render HTML (offline, mở bằng browser)

```bash
# Toàn đồ thị — SVG + search/filter + pan/zoom + click-highlight + meta panel
npm run cmap -- render --html report.html --root "REPO/src"

# Subgraph 1 component — Mermaid (nét đứt = dynamic dep, hover = file)
npm run cmap -- query UserDetailComponent --html graph.html --root "REPO/src"
```

Mở `report.html` / `graph.html` bằng trình duyệt (file self-contained, không cần mạng).

---

## 4. Audit / Lint / Gaps (maintenance)

```bash
# Gaps — component có dynamic-dep chưa được document/override
npm run cmap -- gaps --root "REPO/src"

# Audit — staleness (git mtime: code commit sau doc), coverage, orphans, gaps
npm run cmap -- audit --root "REPO/src"
#   → ghi file: thêm --report audit   (tạo audit.md + audit.json)

# Lint — cổng CI: chặn debt MỚI (cần baseline)
npm run cmap -- lint --root "REPO/src"
```

> ℹ️ **Kỳ vọng quan trọng:** `audit`/`lint`/`gaps`/coverage dựa trên **MD doc của project**
> (`docs/components/*.md` đúng format đã chốt + override `.cmap.yaml`). Repo thật gần như
> chắc chắn CHƯA có các doc này → coverage = "tất cả chưa document", staleness có thể trống.
> **Đó là hành vi ĐÚNG**, không phải bug — và chính là tín hiệu cần thấy live.
>
> Nếu repo CÓ docs, thêm `--docs "REPO/docs/components"` vào mọi lệnh để bật enrichment.

Thiết lập lint gate lần đầu (grandfather debt hiện có):
```bash
npm run cmap -- migrate --root "REPO/src"   # tạo .cmap-baseline.json + cmap-coverage.md
# sau đó lint chỉ chặn debt MỚI so với baseline. CI phải dùng CÙNG --root.
```

---

## Bảng flag tham chiếu nhanh

| Flag | Ý nghĩa | Default |
|---|---|---|
| `--root <dir>` | thư mục source để phân tích | `.` |
| `--docs <dir>` | folder MD doc (bật enrichment) | (none) |
| `--overrides <dir>` | folder `.cmap.yaml` override | `docs/component-map` |
| `--out <dir>` | nơi ghi graph + cache | `.cmap` |
| `--html <file>` | xuất HTML (cho `query`/`render`) | — |
| `--report <prefix>` | ghi `audit` ra `.md` + `.json` | — |
| `--baseline <file>` / `--accept` / `--coverage <file>` | cho `lint`/`migrate` | `.cmap-baseline.json` / `cmap-coverage.md` |

**Exit code:** `index/query/gaps/render/audit` = 0; **`lint` = 1 khi có debt mới** (đúng cho
CI); `query` = 1 khi không tìm thấy / ambiguous.

---

## Thứ tự chạy đề xuất

`0 (chuẩn bị)` → `1 index` → `2 query` → `3 render` → `4 audit/lint/gaps`.

Gặp lỗi/kết quả lạ (nhất là `parseErrorComponents > 0` hoặc Angular version ≠ 14–19),
lưu lại output để chẩn đoán.
