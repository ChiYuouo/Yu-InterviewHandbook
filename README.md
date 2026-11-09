# JavaGuide（mdBook 版）

这个仓库是 [JavaGuide](https://github.com/Snailclimb/JavaGuide) 的 mdBook 阅读版，方便在本地按章节翻阅面试文章。

## 原作者

文章作者是 **Snailclimb（Guide）**。

- 原文仓库：<https://github.com/Snailclimb/JavaGuide>
- 在线阅读：<https://javaguide.cn/>
- 许可：Apache License 2.0，全文见 [LICENSE](LICENSE)

本仓库只做了阅读形态上的整理，文章版权仍归原作者：

- 从 VuePress 文档转成 mdBook
- 保留面试八股文，去掉关于作者、知识专栏、程序人生等非面试内容，以及文末推广
- 文中的本地图片改为 jsDelivr 上的原仓库地址
- 调整了左侧目录的样式

## 本地阅读

需要 [mdBook](https://rust-lang.github.io/mdBook/) 0.5。

```bash
mdbook serve --hostname 127.0.0.1 --port 3000
```

浏览器打开 <http://127.0.0.1:3000>。`mdbook build` 会把网页生成到 `book/`，这个目录不纳入版本库。

源文件在 `src/`，章节顺序由 `src/SUMMARY.md` 决定。
