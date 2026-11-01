# 桂东一中计算机社团网站

静态页面托管在 Cloudflare Pages；公告和报名接口由 Pages Functions 提供，数据保存在 Cloudflare D1。

## 部署到 Cloudflare Pages

1. 将仓库连接到 Cloudflare Pages，设置：
   - Build command：`npm run build`
   - Build output directory：`dist`
2. 在 Cloudflare 控制台创建 D1 数据库 `guidong-computer-club`，或使用：

   ```sh
   npx --yes wrangler@4.50.0 d1 create guidong-computer-club
   ```

3. 把 Cloudflare 返回的数据库 ID 填入 `wrangler.toml` 的 `database_id`，并确认 Pages 项目中存在 D1 绑定：
   - Variable name：`CLUB_DB`
   - Database：刚创建的数据库
4. 初始化数据库表：

   ```sh
   npm run db:apply:remote
   ```

   新安装时会同时创建暗号配置表，并将初始社团暗号设为 `GDCSU2026`。已有部署请先应用迁移，再部署使用该表的 Functions。

5. 在 Cloudflare Pages 项目的 **Settings → Variables and Secrets** 中添加生产和 Preview Secrets：
   - `ADMIN_PASSWORD`：管理员密码，至少 12 位
   - `SESSION_SECRET`：随机会话密钥，至少 32 位。可用 `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` 生成。
6. 推送代码触发部署。管理员入口为 `/admin/`。

Cloudflare Pages Functions 使用 Cloudflare 的 JavaScript Workers 运行时，不是常驻 Node.js 服务器；`server.js` 仅用于本地 Node.js 预览。

## 本地预览

```sh
npm install
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，设置本地管理员密码和会话密钥
npm run db:apply:local
npm run dev
```

本地页面地址为 `http://localhost:8788`。本地 D1 与线上 D1 相互独立。

若使用 `node server.js` 进行本地预览，该独立 Node 服务将社团暗号保存在忽略提交的 `data/db.json` 中，不连接 Wrangler 的本地 D1；Wrangler 本地迁移仅用于 `npm run dev` 的 Pages Functions 预览。

## 日常管理

- 管理员在 `/admin/` 登录，可发布/删除社团动态、查看报名人数并导出 CSV。
- 管理员可按“待审核 / 已录取 / 未录取”筛选报名，修改审核状态，或确认后删除无效记录。新增报名默认待审核；CSV 导出包含审核状态，也会遵循当前筛选条件。
- 管理员可在后台“系统设置”中修改报名所需的社团暗号；暗号不区分大小写。
- 修改线上管理员密码时，在 Cloudflare Pages Secrets 中更新 `ADMIN_PASSWORD`。
- 报名数据包含姓名、班级及可选联系方式，请仅限负责招新的管理员访问，并按学校要求妥善保管、及时清理。
- 不要提交 `.dev.vars`、`data/` 或其他真实报名信息。
