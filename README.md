# JavaGuide（mdBook 版）

这个仓库是 [JavaGuide](https://github.com/Snailclimb/JavaGuide) 的 mdBook 阅读版。

## 原作者

文章作者是 **Snailclimb（Guide）**。

- 原文仓库：<https://github.com/Snailclimb/JavaGuide>
- 在线阅读：<https://javaguide.cn/>
- 许可：Apache License 2.0，全文见 [LICENSE](LICENSE)

本仓库只做了阅读形态上的整理，文章版权仍归原作者

## 本地阅读

需要 [mdBook](https://rust-lang.github.io/mdBook/) 0.5。

```bash
mdbook serve --hostname 127.0.0.1 --port 3000
```

浏览器打开 <http://127.0.0.1:3000>。`mdbook build` 会把网页生成到 `book/`，这个目录不纳入版本库。

源文件在 `src/`，章节顺序由 `src/SUMMARY.md` 决定。

## 重新生成 src

把上游仓库放到 `_extract/JavaGuide-main` 后执行：

```bash
node scripts/import-javaguide.mjs
```

导入先写到临时目录，再筛成现在这份八股文：去掉作者介绍、专栏和推广，删掉各节 README 与首页，并补上因此从目录里消失的文章。这一步成功之后才替换 `src/`。已经导入过、只想再筛一遍时：

```bash
node scripts/keep-baguwen.mjs
```
