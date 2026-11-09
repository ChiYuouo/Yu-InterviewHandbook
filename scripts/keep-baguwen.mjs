import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");

const dropDirs = [
  "about-the-author",
  "high-quality-technical-articles",
  "zhuanlan",
  "open-source-project",
  "books",
  "roadmap",
  "ai-coding",
  "interview-preparation",
  "javaguide",
];

const dropFiles = [
  "java/collection/priorityqueue-source-code.md",
  "system-design/system-design-questions.md",
  "system-design/design-pattern.md",
  "system-design/framework/spring/springboot-source-code.md",
  "system-design/framework/spring/springboot-knowledge-and-questions-summary.md",
  "system-design/framework/netty.md",
  "database/redis/redis-cluster.md",
  "database/elasticsearch/elasticsearch-questions-01.md",
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

function rel(abs) {
  return path.relative(src, abs).split(path.sep).join("/");
}

for (const dir of dropDirs) {
  fs.rmSync(path.join(src, dir), { recursive: true, force: true });
}
for (const file of dropFiles) {
  fs.rmSync(path.join(src, file), { force: true });
}

function removeHeading(md, test) {
  const lines = md.split("\n");
  const out = [];
  let skip = false;
  let level = 0;
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const current = heading[1].length;
      if (skip && current <= level) skip = false;
      if (!skip && test(heading[2].trim())) {
        skip = true;
        level = current;
        continue;
      }
    }
    if (!skip) out.push(line);
  }
  return out.join("\n");
}

function stripPromo(md) {
  let text = md.replace(/<a\s+class="article-promo-image"[\s\S]*?<\/a>\s*/g, "");
  text = text.replace(
    /^[ \t]*!\[[^\]]*\]\(https?:\/\/[^)\s]*(?:gongzhonghao|gongzhonghaoxuanchuan|xingqiufuwu|xingqiuyouhuijuan|interview-guide-banner|praise-that-the-planet|praise-that-the-mianshizhibei|java-interview-guide-statistics)[^)\s]*\)\s*$/gim,
    "",
  );
  text = text.replace(
    /^[ \t]*\[[^\]]*\]\(https?:\/\/[^)\s]*(?:gongzhonghao|gongzhonghaoxuanchuan|xingqiufuwu|xingqiuyouhuijuan|interview-guide-banner)[^)\s]*\)\s*$/gim,
    "",
  );
  text = text.replace(
    /^[ \t]*\[!\[[^\]]*\]\([^)\]]+\)\]\([^)\s]*(?:zhuanlan|about-the-author|xingqiu)[^)\s]*\)\s*$/gim,
    "",
  );
  text = removeHeading(text, (title) => title === "写在最后" || title.includes("RAG 实战项目推荐"));
  const planet = text.search(/^这本\[《Java 面试指北》\]/m);
  if (planet >= 0) text = text.slice(0, planet);
  return text.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim() + "\n";
}

function fileExists(fromFile, url) {
  if (!url || url.startsWith("#")) return true;
  if (/interview\.javaguide\.cn|javaguide\.cn\/(?:zhuanlan|about-the-author)/i.test(url)) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return true;
  let base = url.split("#")[0].split("?")[0];
  if (!base) return true;
  const dir = path.posix.dirname(fromFile);
  let target = path.posix.normalize(path.posix.join("/", dir, base)).replace(/^\//, "");
  if (target.endsWith("/")) target += "README.md";
  const candidates = [target];
  if (!target.endsWith(".md")) {
    candidates.push(`${target}.md`, `${target}/README.md`);
  }
  return candidates.some((item) => fs.existsSync(path.join(src, item)));
}

function stripBrokenLinks(md, fromFile) {
  const lines = md.split("\n");
  const out = [];
  for (const line of lines) {
    const item = line.match(/^(\s*[-*]\s+)(.*)$/);
    if (item) {
      const urls = [...item[2].matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
      if (urls.some((url) => !fileExists(fromFile, url))) continue;
    }
    out.push(
      line.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (full, label, url) => {
        if (fileExists(fromFile, url)) return full;
        return label;
      }),
    );
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

let stripped = 0;
for (const abs of walk(src)) {
  if (!abs.endsWith(".md") || path.basename(abs) === "SUMMARY.md") continue;
  const original = fs.readFileSync(abs, "utf8");
  let next = stripPromo(original);
  next = stripBrokenLinks(next, rel(abs));
  if (rel(abs) === "home.md") {
    next = removeHeading(
      next,
      (title) =>
        ["延伸资料", "面试准备", "搜索引擎", "Star 趋势", "公众号", "PDF 版本 & 微信联系"].includes(
          title,
        ),
    );
    const java = next.indexOf("\n## Java\n");
    if (java >= 0) {
      next =
        "# Java 面试指南\n\n下面是 Java 后端面试八股文目录，按专题列出可以复习的文章。\n" +
        next.slice(java);
    }
    next = stripBrokenLinks(next, "home.md").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }
  if (next !== original) {
    fs.writeFileSync(abs, next);
    stripped += 1;
  }
}

function hasChild(items, index) {
  const indent = items[index].indent;
  for (let i = index + 1; i < items.length; i++) {
    const item = items[i];
    if (item.type === "blank") continue;
    if (item.type !== "item") return false;
    return item.indent > indent;
  }
  return false;
}

function pruneSummary(text) {
  let items = text.split("\n").map((line) => {
    if (!line.trim()) return { type: "blank", line };
    if (line.startsWith("# ") && line !== "# Summary") return { type: "part", line };
    const match = line.match(/^( *)- \[(.*)\]\(([^)]*)\)\s*$/);
    if (match) {
      return {
        type: "item",
        indent: match[1].length,
        href: match[3],
        raw: line,
      };
    }
    return { type: "other", line };
  });
  items = items.filter((item) => {
    if (item.type !== "item" || !item.href) return true;
    return fs.existsSync(path.join(src, item.href));
  });
  let changed = true;
  while (changed) {
    changed = false;
    const next = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type === "item" && !item.href && !hasChild(items, i)) {
        changed = true;
        continue;
      }
      next.push(item);
    }
    items = next;
  }
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === "part") {
      const title = item.line.replace(/^#\s+/, "");
      if (title === "未列入原目录的文章") item.line = "# 专题目录";
      let has = false;
      for (let j = i + 1; j < items.length; j++) {
        if (items[j].type === "part") break;
        if (items[j].type === "item") {
          has = true;
          break;
        }
      }
      if (!has) continue;
    }
    out.push(item.type === "item" ? item.raw : item.line);
  }
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

const summaryPath = path.join(src, "SUMMARY.md");
fs.writeFileSync(summaryPath, pruneSummary(fs.readFileSync(summaryPath, "utf8")));

const readme = `# JavaGuide

这份资料只保留面试八股文：Java、数据库、开发工具、系统设计、分布式、高性能、高可用、计算机基础，以及 AI 应用开发面试题。

## 从这里开始

- [Java 面试指南](./home.md)
- [计算机基础](./cs-basics/README.md)
- [AI 应用开发](./ai/README.md)
`;
fs.writeFileSync(path.join(src, "README.md"), readme);

const pages = walk(src).filter((file) => file.endsWith(".md") && path.basename(file) !== "SUMMARY.md");
console.log(JSON.stringify({ pages: pages.length, promoStripped: stripped }, null, 2));
