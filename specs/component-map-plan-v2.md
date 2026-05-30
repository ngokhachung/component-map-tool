# Kế hoạch triển khai Component Map Tool — v2

> **Thay đổi so với v1**: Plan này được refactor sau khi review qua 4 framework chuyên gia (ATAM, Azure WAF, Internal Developer Tool research, Existing Tools landscape). Các thay đổi chính:
> - ✅ Thêm **Phase -1: Discovery & Metrics** (định nghĩa thành công trước khi code)
> - ✅ Re-evaluate Phase 2 risk lên 🔴 **Cao** (MD maintenance là điểm chết của tool)
> - ✅ Reshuffle ordering: PR bot lên sớm để dev nếm value, tạo động lực adopt
> - ✅ Bổ sung Quality Attributes Utility Tree (ATAM)
> - ✅ Disclose tradeoffs explicit
> - ✅ Adoption strategy + maintenance ownership
>
> **Constraint**: Không dùng tool open-source ngoài (Compodoc, Nx, ng-analyzer) do chính sách bảo mật. Build in-house.

---

## Bối cảnh ban đầu

- **Codebase**: Angular 100-500 components
- **Routing**: Angular Router chuẩn (route config)
- **Documentation**: file `.md` mỗi component, hiện chỉ chứa mô tả + props/inputs
- **Vấn đề**: Khi sửa code 1 component, dev tốn thời gian (a) tìm impact, (b) tìm cách reach component trên UI
- **Solution**: Tool input là component-id, output là dependency graph + UI access path

---

## Quality Attributes Utility Tree (ATAM)

Trước khi code, định nghĩa ưu tiên các thuộc tính chất lượng theo thứ tự:

| Priority | Quality Attribute | Scenario cụ thể | Acceptance |
|---|---|---|---|
| 🥇 H/H | **Correctness** | Component X bị sửa, tool list ra parents | ≥95% parents đúng (verify manual 20 samples) |
| 🥇 H/H | **Maintainability** | Codebase add 50 components mới sau 6 tháng, tool vẫn hoạt động đúng | Không cần dev tool, chỉ rebuild index |
| 🥈 H/M | **Adoptability** | Dev mở tool 5 phút, hiểu cách dùng | ≥80% dev survey "tool dễ dùng" sau 1 tháng |
| 🥈 M/H | **Performance** | Full rebuild trên 500 components | < 60s; incremental < 5s |
| 🥉 M/M | **Extensibility** | Sau này muốn thêm "tìm component theo state management" | Plugin architecture, không phải rewrite |
| 🥉 L/M | **Visualization quality** | Graph > 50 nodes vẫn đọc được | Có filter, depth limit, search |

**Mã hóa**: First letter = importance, second = difficulty. H/H = High importance, High difficulty.

**Sensitivity points** (chỗ tradeoff nhạy cảm):
- Dùng `ts-morph` (dev nhanh) vs raw TS Compiler API (chạy nhanh) → **chọn `ts-morph`**, vì correctness > runtime perf ở scale này
- Cache aggressive vs always fresh → **cache + invalidation theo file hash**, vì perf > consistency tuyệt đối

---

## Success Metrics (đo trước & sau)

**Baseline (đo trước khi build)**:
- Khảo sát 5 dev: thời gian trung bình tracing impact của 1 component (đo bằng phỏng vấn + đo thực tế 1 case study)
- Số bug "miss impact" trong 3 tháng gần nhất (review PR/incident log)

**Mục tiêu sau 3 tháng dùng tool**:
- Giảm ≥50% thời gian tracing impact
- ≥80% file `.md` có UI Access Path section
- ≥70% dev report "tool giúp ích" trong survey
- PR bot comment chính xác ≥90% (sample 20 PR random)
- Zero incident "miss impact" do tool report sai (false negative)

**Sunset criteria** (tránh sunk cost): Nếu sau 3 tháng adoption < 30% hoặc accuracy < 70% → review/pivot/sunset.

---

## Stakeholder Plan

| Role | Người | Trách nhiệm |
|---|---|---|
| Sponsor | Tech Lead | Approve plan, allocate dev time |
| Champion | 1-2 senior dev | Pilot user, give feedback weekly |
| Schema owner | Bạn (tool author) | Maintain MD schema spec, version |
| Tool maintainer (sau launch) | TBD - **cần định trước** | Bug fix, accommodate Angular version upgrade |
| Reviewers | Toàn team | Update MD khi sửa component (enforced via CI) |

⚠️ **Critical**: Phải confirm tool maintainer trước khi build. Tránh tình huống "build xong rồi không ai own".

---

## Tổng quan timeline v2

| Phase | Nội dung | Thời gian | Thay đổi từ v1 |
|---|---|---|---|
| **Phase -1** | **Discovery & Metrics** | **2-3 ngày** | 🆕 Hoàn toàn mới |
| Phase 0 | Setup & POC | 3-5 ngày | Giữ nguyên |
| Phase 1 | Static Analysis Core | 2-3 tuần | Tăng buffer cho standalone components |
| Phase 2a | MD Schema + Parser | 1 tuần | Tách Phase 2 cũ |
| **Phase 2.5** | **PR Bot (early value)** | **3-4 ngày** | 🆕 Đẩy lên sớm |
| Phase 2b | MD Migration + Enforcement | 1 tuần | Phần còn lại của Phase 2 cũ |
| Phase 3 | Renderer & UX | 1 tuần | Có UX research trước |
| Phase 4 | Long-term maintenance | Ongoing | 🆕 Quarterly audit |
| **Tổng** | | **~7-9 tuần** | Dài hơn v1 1 tuần, nhưng risk thấp hơn nhiều |

---

## Phase -1: Discovery & Metrics (2-3 ngày) 🆕

**Mục tiêu**: Đo baseline + define metrics + interview stakeholders TRƯỚC khi viết bất kỳ dòng code nào.

### Task -1.1: Stakeholder Interview (0.5-1 ngày)

**Việc cần làm**: Phỏng vấn 3-5 dev với câu hỏi:
- Lần gần nhất bạn sửa 1 component, mất bao lâu để biết hết impact?
- Workflow hiện tại: bạn dùng IDE search? grep? Hỏi senior?
- Bạn sẽ dùng tool này lúc nào? Trong IDE? Browser? Trước hay sau khi code?
- Format output mong muốn: graph visual? text list? JSON?

**Output**: Doc tóm tắt workflow hiện tại + persona tool user.

**Khả thi**: ✅ Cao. Chỉ là phỏng vấn.

### Task -1.2: Đo Baseline Metrics (0.5 ngày)

**Việc cần làm**:
- Chọn 3 components điển hình (1 leaf, 1 trung gian, 1 shared)
- Đo (timed) thời gian dev senior trace impact thủ công
- Review PR log 3 tháng gần nhất: tìm bug "miss impact" → đếm số case

**Output**: Bảng baseline metrics.

**Khả thi**: ✅ Cao.

### Task -1.3: Khảo sát Codebase (1 ngày)

(Bằng Task 0.1 cũ, đẩy lên đây)

**Cần thu thập**:
- Số components, lazy modules
- **Tỷ lệ standalone components** (Angular 14+) — critical risk
- Dynamic component usage (`*ngComponentOutlet`, ViewContainerRef, Modal service)
- Modal/dialog pattern (MatDialog, custom service)
- Selector naming convention
- File `.md` location convention
- Routing complexity (custom wrapper, guards, dynamic routes)

**Output**: Codebase profile JSON với số liệu cụ thể.

**Khả thi**: ✅ Cao.

### Task -1.4: Define Success Metrics + Sunset Criteria (0.5 ngày)

Document hóa metrics + sunset criteria, present cho stakeholder approve.

**Khả thi**: ✅ Cao về kỹ thuật, ⚠️ cần align với Tech Lead.

### Phase -1 Milestone

**Acceptance**: Có document chính thức gồm: baseline metrics, success metrics, sunset criteria, stakeholder list, codebase profile. **Tech Lead sign-off bằng văn bản**.

⚠️ Nếu skip phase này, sau 3 tháng không biết tool có thành công không.

---

## Phase 0: POC Validation (3-5 ngày)

### Task 0.1: POC parse 1 component (2 ngày)

Như v1: dùng `ts-morph` extract metadata từ 1 component.

**Bổ sung**: Test với **cả NgModule-based và standalone component** nếu codebase có cả 2.

**Khả thi**: ✅ Cao.

### Task 0.2: POC parse routing (1-2 ngày)

Như v1, nhưng test trên 1 lazy module thực tế của project.

**Khả thi**: ⚠️ Trung bình. Phụ thuộc routing pattern (đã verify ở Task -1.3).

### Task 0.3: POC parse template HTML (1 ngày) 🆕

**Mục tiêu**: Verify `@angular/compiler` parse được 5 template phức tạp nhất (có `*ngIf`, `*ngFor`, `ng-content`, dynamic component).

**Lý do thêm**: v1 đánh giá quá lạc quan với HTML parsing. Cần verify sớm vì đây là chỗ dễ fail nhất.

**Khả thi**: ⚠️ Trung bình. `@angular/compiler` API không stable across versions, cần test.

### Phase 0 Milestone

**Acceptance**: 3 POC chạy được, output JSON đúng cho ≥5 components mẫu mỗi loại.

⚠️ **Go/No-go decision point**: Nếu POC routing hoặc HTML fail >50% cases, **dừng plan, re-design**.

---

## Phase 1: Static Analysis Core (2-3 tuần)

### Task 1.1: Component Indexer (3-4 ngày)

Như v1. Bổ sung:
- Support cả NgModule + standalone component patterns
- Detect Angular version từ `package.json` để chọn parser strategy

**Khả thi**: ✅ Cao.

### Task 1.2: Dependency Edge Builder (5-6 ngày, tăng 1 ngày từ v1)

**Tăng effort vì**: phải dùng `@angular/compiler` chuẩn (không fallback `node-html-parser`).

**Bổ sung**:
- Handle `<ng-content>` projection: log warning, tag là "indirect"
- Handle `@ViewChild` programmatic access
- Handle `ngTemplateOutlet`
- Mark conditional rendering (`*ngIf`, `*ngSwitch`) — không bỏ qua

**Risk update**: 🔴 Cao cho dynamic component (v1 ghi ⚠️ TB). Mitigation: Phase 2 MD layer bù.

**Khả thi**: ✅ Cao cho static, ⚠️ TB cho dynamic.

### Task 1.3: Route Parser (3-4 ngày)

Như v1.

**Risk**: Đã verify ở Phase -1, nên risk giảm.

### Task 1.4: Graph Storage & Query API (2-3 ngày)

Như v1.

**Bổ sung**: Versioning cho graph schema (cho dù schema thay đổi sau này, không break old cache).

### Task 1.5: Caching & Incremental Build (2 ngày)

Như v1.

**Bổ sung**: Performance benchmark trên codebase thật. Nếu full build > 60s, **optimize trước khi qua Phase 2**.

### Phase 1 Milestone

**Acceptance**:
- ≥95% edges đúng cho 20 components ground truth
- Full build < 60s, incremental < 5s
- Test coverage ≥80%

---

## Phase 2a: MD Schema + Parser (1 tuần)

### Task 2a.1: Chuẩn hóa MD Schema (2-3 ngày)

Như v1, nhưng **bổ sung quan trọng để giảm friction**:

```yaml
# .component-map-schema.yaml (versioned, owned by tool)
version: 1.0
sections:
  ui_access_path:
    required: false  # OPTIONAL - không có thì tool dùng static analysis
    schema:
      type: array
      items:
        properties:
          route: {type: string, required: true}
          description: {type: string}
          steps: {type: array, items: {action, target, note}}
  dynamic_dependencies:
    required: false
    schema:
      opened_by: {type: array, items: {service, method}}
      triggers: {type: array, items: {event, from}}
```

**Critical principle**: MD section là **OPTIONAL**. Component không có → tool dùng static analysis only, không fail.

**Bổ sung tooling để giảm friction**:
- VSCode snippet generator (gõ `cmap` → expand full template)
- JSON Schema validation built-in
- TypeScript types cho schema (dev import được)

**Khả thi**: ✅ Cao technical, ⚠️ adoption tốn effort.

### Task 2a.2: MD Parser (2 ngày)

Như v1.

**Bổ sung**: Tolerant parser — phần MD sai schema chỉ skip section đó, không fail toàn bộ component.

### Task 2a.3: Merge MD vào Graph (2 ngày)

Như v1.

### Phase 2a Milestone

**Acceptance**: Sample 10 components có MD format mới, tool parse + merge thành công.

---

## Phase 2.5: PR Bot — Early Value 🆕 (3-4 ngày)

**Lý do đẩy lên sớm**: Đây là moment of truth. Dev nếm value qua PR comment → có động lực adopt MD metadata ở Phase 2b.

### Task 2.5.1: PR Bot Core (2 ngày)

**Behavior**: PR sửa file `*.component.ts` → bot tự comment list parents + routes affected (chỉ phần static analysis, MD metadata bổ sung sau).

**Implementation**:
- GitHub Action / GitLab CI script
- Đọc graph.json từ artifact (built trong main branch)
- Comment qua API

**Khả thi**: ✅ Cao.

### Task 2.5.2: Beta Test 2 tuần với champions (2 ngày dev + 2 tuần observation)

- Enable PR bot cho repo, chỉ 2 champion dev xem
- Collect feedback: comment có hữu ích không? Có noise không? Format ok không?
- Iterate

**Khả thi**: ✅ Cao.

### Phase 2.5 Milestone

**Acceptance**: PR bot chạy ≥10 PR thực tế, champion confirm "useful, ít noise".

---

## Phase 2b: MD Migration + Enforcement (1 tuần)

### Task 2b.1: Migration Tool (3-4 ngày)

Như Task 2.5 v1: auto-generate skeleton MD UI Access Path cho 500 components.

**Bổ sung quan trọng** (mitigate maintenance risk):
- Generate **đầy đủ** static info (routes, parents, breadcrumb) — dev chỉ cần fill phần dynamic
- Mark fields với comment `# TODO: fill if applicable` để dev biết nên review
- Generate 1 batch, dev review 5-10 cái đầu để feedback trước khi generate full

**Khả thi**: ✅ Cao.

### Task 2b.2: MD Linter (2 ngày)

Như v1. **Critical change từ v1**: Linter là **MANDATORY trong CI**, không optional.

**Block PR merge nếu**:
- Component file thay đổi mà MD chưa update (chỉ check section UI Access Path)
- MD schema sai version hoặc syntax
- MD reference đến component/route/service không tồn tại

**Soft warning (không block)**:
- MD ≥ 3 tháng chưa update (warn)
- Component có dynamic dep nhưng MD không khai báo

**Tradeoff disclose**: Strict CI → dev sẽ khó chịu lúc đầu. Mitigation: thông báo trước, có grace period 2 tuần, champion support.

**Khả thi**: ⚠️ TB. Technical OK, social/political khó. Cần Tech Lead backup.

### Phase 2b Milestone

**Acceptance**:
- 100% components đã có skeleton MD (auto-generated)
- CI linter active
- ≥30% components có dev đã fill thêm dynamic info

---

## Phase 3: Renderer & UX (1 tuần)

### Task 3.0: UX Research từ Phase -1 (đã có) 🆕

Apply insights từ Task -1.1 (stakeholder interview).

**Quyết định**: Dựa vào survey, ưu tiên CLI vs HTML vs VSCode extension. Đừng build cả 3 nếu không cần.

### Task 3.1: Mermaid Renderer (2 ngày)

Như v1.

### Task 3.2: HTML Interactive Report (3 ngày)

Như v1.

**Bổ sung**: Output single HTML standalone (offline-capable) để compliance với security policy.

### Task 3.3: CLI UX (1-2 ngày)

Như v1.

### Phase 3 Milestone

**Acceptance**: Champion dev confirm UX OK qua 5 use case thực tế.

---

## Phase 4: Long-term Maintenance 🆕 (Ongoing)

### Task 4.1: Quarterly Audit Job (1-2 ngày setup)

**Tự động chạy hàng quý**:
- Report MD files outdated (≥3 tháng không update mà component file đã thay đổi)
- Report components có MD coverage thấp
- Report accuracy: sample 10 random impact reports, dev verify, log accuracy %

**Output**: Email/Slack báo Tech Lead.

**Khả thi**: ✅ Cao.

### Task 4.2: Angular Version Upgrade Buffer

**Lý do**: Mỗi major Angular version (15 → 16 → 17 → 18 → 19...) có thể break parser. **Plan trước**:
- Pin Angular version trong tool dependencies
- Khi project upgrade Angular, dành 2-3 ngày verify tool còn hoạt động
- Maintain compatibility matrix trong README

### Task 4.3: Schema Evolution Policy

- Schema version semver
- Breaking change → migration script bắt buộc
- Document changelog

---

## Bảng tổng hợp Risk & Khả thi v2

| Phase | Task | Khả thi | Risk | Mitigation |
|---|---|---|---|---|
| -1.1 | Interview | ✅ Cao | - | - |
| -1.2 | Baseline metrics | ✅ Cao | - | - |
| -1.3 | Khảo sát codebase | ✅ Cao | - | - |
| -1.4 | Define metrics | ✅ Cao | Tech Lead không approve | Present rõ ROI |
| 0.1 | POC parse | ✅ Cao | - | - |
| 0.2 | POC routing | ⚠️ TB | Custom wrapper | Verified ở -1.3 |
| 0.3 | POC HTML | ⚠️ TB | `@angular/compiler` API quirks | Test sớm, có go/no-go |
| 1.1 | Indexer | ✅ Cao | - | - |
| 1.2 | Edges | ✅ Cao static, 🔴 dynamic | Dynamic component miss | Phase 2 bù qua MD |
| 1.3 | Route parser | ⚠️ TB | - | - |
| 1.4 | Graph storage | ✅ Cao | - | - |
| 1.5 | Caching | ✅ Cao | Perf không đạt | Benchmark sớm |
| 2a.1 | MD schema | ✅ Cao tech, ⚠️ adoption | Dev không tuân thủ | VSCode snippet, optional, tolerant parser |
| 2a.2 | MD parser | ✅ Cao | - | - |
| 2a.3 | Merge | ✅ Cao | - | - |
| **2.5** | **PR Bot** | ✅ Cao | Comment noise | Beta test với champion |
| 2b.1 | Migration | ✅ Cao | - | - |
| 2b.2 | Linter mandatory | ⚠️ TB | 🔴 **Team pushback** | Tech Lead backup, grace period |
| 3.1-3 | Renderer | ✅ Cao | UX không phù hợp | Apply UX research từ -1.1 |
| 4.1 | Audit | ✅ Cao | - | - |
| 4.2 | Angular upgrade | ⚠️ TB | Future break | Pin version, allocate buffer |
| 4.3 | Schema evolution | ✅ Cao | - | - |

---

## So sánh v1 vs v2

| Aspect | v1 | v2 |
|---|---|---|
| Discovery phase | ❌ Không có | ✅ Phase -1 đầy đủ |
| Success metrics | ❌ Không có | ✅ Baseline + target + sunset |
| Risk Phase 2 MD | ⚠️ TB | 🔴 Cao + mitigation chi tiết |
| PR bot ordering | Cuối cùng (optional) | Sớm (Phase 2.5) — early value |
| MD optional/mandatory | Mandatory bias | Optional MD, mandatory linter cho components đã có MD |
| Tool maintainer | ❌ Không định | ✅ Phải confirm trước |
| Sunset criteria | ❌ Không có | ✅ < 30% adoption sau 3 tháng → review |
| Stakeholder plan | ❌ Không có | ✅ Sponsor + Champion + Maintainer |
| Quality attributes | Implicit | ✅ Utility tree explicit |
| Total timeline | 6-8 tuần | 7-9 tuần (dài hơn 1 tuần) |

**Lý do v2 dài hơn 1 tuần**: Investment vào Phase -1 và Phase 2.5 giảm risk thất bại > 50%. Chấp nhận trade-off.

---

## Critical Success Factors (tóm tắt cuối)

🔴 **Must-have để tool không chết**:
1. Confirm tool maintainer **trước khi code dòng đầu tiên**
2. Phase -1 đo baseline metrics
3. PR bot launch sớm (Phase 2.5)
4. MD schema **optional** + linter **mandatory** cho component đã opt-in
5. VSCode snippet + auto-generation aggressive để giảm friction
6. Tech Lead backup khi enforce CI

🟡 **Important để tool tốt**:
7. Apply UX research vào renderer
8. Performance benchmark sớm
9. Versioning schema từ đầu
10. Quarterly audit job

🟢 **Nice để tool sustain**:
11. Angular upgrade buffer
12. Compatibility matrix documentation
13. Schema evolution policy

---

## Đề xuất bước tiếp theo

1. **Tuần này**: Present v2 plan cho Tech Lead, align trên Phase -1 + tool maintainer
2. **Tuần sau**: Start Phase -1 (interview + baseline)
3. **2 tuần sau**: Go/No-go decision dựa trên Phase -1 output
