# 推送命令（复制粘贴到终端执行）

## 方式一：一条命令（推荐）

在 macOS 的「终端」里粘贴下面整段，回车：

```bash
cd ~/Desktop/LIZZREAD && git -c http.proxy=http://127.0.0.1:10808 -c http.version=HTTP/1.1 push -u origin main
```

会弹出一个窗口让你输入 GitHub 账号密码：

- **Username**：`hcc9886`
- **Password**：粘贴 **Personal Access Token**（不是登录密码，见下面方式二第 1 步生成）

成功后终端最后几行会显示：

```
To https://github.com/hcc9886/LIZZREAD.git
   5aa1bb1..92bbde3  main -> main
```

## 方式二：先生成 Token，再推送

1. 打开 https://github.com/settings/tokens/new
2. Note 填 `lizzread-push`，Expiration 选 `90 days`
3. 勾选 **repo**（全部子项）
4. 页面底部点 **Generate token**，复制那串 `ghp_` 开头的字符（只显示一次）
5. 终端执行：

```bash
cd ~/Desktop/LIZZREAD
git -c http.proxy=http://127.0.0.1:10808 -c http.version=HTTP/1.1 push -u origin main
```

6. Username 输入 `hcc9886`，Password 粘贴刚才的 token

## 方式三：用 gh 登录后再推

```bash
cd ~/Desktop/LIZZREAD
HTTPS_PROXY=http://127.0.0.1:10808 gh auth login -h github.com
# 选：GitHub.com → HTTPS → Login with a web browser → 浏览器里授权
HTTPS_PROXY=http://127.0.0.1:10808 gh auth setup-git
git -c http.proxy=http://127.0.0.1:10808 -c http.version=HTTP/1.1 push -u origin main
```

---

## 如果终端提示代理错误

先确认你的翻墙/代理软件开着，且本地端口是 10808：

```bash
curl -x http://127.0.0.1:10808 -sS -m 10 -o /dev/null -w "%{http_code}\n" https://github.com
```

返回 `200` 就说明代理正常。如果你的代理端口不是 10808（常见的是 7890 / 1087 / 10809），把上面命令里的
`10808` 换成你的端口，或者先跑：

```bash
scutil --proxy | grep -i port
```

## 推送成功后我会接手

推送完成后告诉我一声，我这边会：

1. 验证远端最新 commit
2. 帮你开启 GitHub Pages（所有人可访问的链接）
3. 继续部署云构建（不需要你电脑装 Xcode）
