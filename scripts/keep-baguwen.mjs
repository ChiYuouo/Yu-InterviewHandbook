import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const srcFlag = process.argv.indexOf("--src");
if (srcFlag >= 0 && !process.argv[srcFlag + 1]) {
  console.error("Missing value for --src");
  process.exit(1);
}
const src =
  srcFlag >= 0 ? path.resolve(process.argv[srcFlag + 1]) : path.join(root, "src");
if (!fs.existsSync(src)) {
  console.error("Missing source directory", src);
  process.exit(1);
}

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

const summaryInsertions = [
  [
    "        - [⭐Java 基础常见面试题（下）](java/basis/java-basic-questions-03.md)\n        - [重要知识点]()",
    "        - [⭐Java 基础常见面试题（下）](java/basis/java-basic-questions-03.md)\n        - [重要知识点]()\n            - [Java 关键字总结](java/basis/java-keyword-summary.md)",
  ],
  [
    "            - [AQS 详解](java/concurrent/aqs.md)",
    "            - [AQS 详解](java/concurrent/aqs.md)\n            - [从 ReentrantLock 的实现看 AQS 的原理及应用](java/concurrent/reentrantlock.md)",
  ],
  [
    "    - [JVM]()\n        - [⭐JVM 常见面试题总结](java/jvm/jvm-interview-questions.md)",
    "    - [JVM]()\n        - [大白话带你认识 JVM](java/jvm/jvm-intro.md)\n        - [⭐JVM 常见面试题总结](java/jvm/jvm-interview-questions.md)",
  ],
  [
    "        - [Java 25 新特性概览](java/new-features/java25.md)",
    "        - [Java 25 新特性概览](java/new-features/java25.md)\n        - [Java 26 新特性概览](java/new-features/java26.md)",
  ],
  [
    "        - [⭐MySQL 常见面试题总结](database/mysql/mysql-questions-01.md)",
    "        - [⭐MySQL 常见面试题总结](database/mysql/mysql-questions-01.md)\n        - [一千行 MySQL 学习笔记](database/mysql/a-thousand-lines-of-mysql-study-notes.md)",
  ],
  [
    "        - [从输入 URL 到页面展示到底发生了什么？](cs-basics/network/the-whole-process-of-accessing-web-pages.md)",
    "        - [从输入 URL 到页面展示到底发生了什么？](cs-basics/network/the-whole-process-of-accessing-web-pages.md)\n        - [《计算机网络》（谢希仁）内容总结](cs-basics/network/computer-network-xiexiren-summary.md)",
  ],
  [
    "        - [单元测试指南](system-design/basis/unit-test.md)",
    "        - [单元测试指南](system-design/basis/unit-test.md)\n        - [J2EE 基础知识](system-design/J2EE基础知识.md)",
  ],
];

const linkRewrites = new Map([
  [
    "distributed-system/rpc/dubbo.md",
    [
      [
        "Dubbo 涉及注册中心、负载均衡、集群容错，这部分也可以和 [ZooKeeper 专题](../distributed-process-coordination/zookeeper/README.md) 放在一起看。",
        "Dubbo 涉及注册中心、负载均衡、集群容错，这部分也可以和 [ZooKeeper 入门指南](../distributed-process-coordination/zookeeper/zookeeper-intro.md) 放在一起看。",
      ],
    ],
  ],
  [
    "distributed-system/microservices-interview-questions.md",
    [
      [
        "相关内容：\n\n- [高可用系统知识体系](../high-availability/README.md)\n- [认证授权与数据安全专题](../system-design/security/README.md)\n- [API 网关基础知识总结](./api-gateway.md)",
        "相关内容：\n\n- [API 网关基础知识总结](./api-gateway.md)",
      ],
    ],
  ],
  [
    "distributed-system/distributed-configuration-center.md",
    [
      [
        "配置中心还经常和 [RPC](./rpc/README.md) 以及 [API 网关](./api-gateway.md) 一起出现",
        "配置中心还经常和 [RPC 基础知识总结](./rpc/rpc-intro.md) 以及 [API 网关](./api-gateway.md) 一起出现",
      ],
    ],
  ],
  [
    "distributed-system/api-gateway.md",
    [
      [
        "[RPC](./rpc/README.md) 主要讲服务之间怎么互相调用",
        "[RPC 基础知识总结](./rpc/rpc-intro.md) 主要讲服务之间怎么互相调用",
      ],
    ],
  ],
  [
    "ai/interview-questions/ai-interview-guide.md",
    [
      [
        `- Token、上下文窗口和采样参数可以回到 [大模型基础专题](../llm-basis/README.md)；
- Agent Loop、Memory、MCP 和 Skills 可以回到 [AI Agent 专题](../agent/README.md)；
- Chunk、向量检索、Rerank 和知识库更新可以回到 [RAG 专题](../rag/README.md)；
- 模型网关、实时语音和生产架构可以回到 [AI 系统设计专题](../system-design/README.md)。`,
        `- Token、上下文窗口和采样参数可以回到 [万字拆解 LLM 运行机制](../llm-basis/llm-operation-mechanism.md)；
- Agent Loop、Memory、MCP 和 Skills 可以回到 [AI Agent 核心概念详解](../agent/agent-basis.md)；
- Chunk、向量检索、Rerank 和知识库更新可以回到 [RAG 基础概念详解](../rag/rag-basis.md)；
- 模型网关、实时语音和生产架构可以回到 [AI 应用系统设计](../system-design/ai-application-architecture.md)。`,
      ],
    ],
  ],
]);

function insertOnce(summary, from, to) {
  if (summary.includes(to)) return summary;
  if (!summary.includes(from)) {
    throw new Error(`SUMMARY anchor missing:\n${from}`);
  }
  return summary.replace(from, to);
}

function stripIndexPages(summary) {
  return (
    summary
      .split("\n")
      .filter((line) => {
        const match = line.match(/\]\(([^)]*)\)/);
        if (!match) return true;
        const href = match[1].split("#")[0].split("?")[0];
        return !/(^|\/)README\.md$/i.test(href) && href !== "home.md";
      })
      .join("\n")
      .replace(/\n# 专题目录[\s\S]*$/, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}

const summaryPath = path.join(src, "SUMMARY.md");
let summary = pruneSummary(fs.readFileSync(summaryPath, "utf8").replace(/\r\n/g, "\n"));
for (const [from, to] of summaryInsertions) summary = insertOnce(summary, from, to);
summary = stripIndexPages(summary);
fs.writeFileSync(summaryPath, summary);

let removedIndexes = 0;
let retargeted = 0;
for (const abs of walk(src)) {
  if (!abs.endsWith(".md")) continue;
  const base = path.basename(abs);
  if (base === "README.md" || base === "home.md") {
    fs.unlinkSync(abs);
    removedIndexes += 1;
    continue;
  }
  if (base === "SUMMARY.md") continue;
  let text = fs.readFileSync(abs, "utf8");
  const original = text;
  for (const [from, to] of linkRewrites.get(rel(abs)) ?? []) {
    if (text.includes(from)) text = text.replace(from, to);
  }
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (full, label, url) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return full;
    const href = url.split("#")[0].split("?")[0];
    if (/(^|\/)README\.md$/i.test(href) || /(^|\/)home\.md$/i.test(href)) return label;
    return full;
  });
  text = text
    .replace(
      /\n## 复习路线入口\n\n这篇文章只保留经典题型和题单推荐，7 天速刷和 30 天系统路线统一维护在算法面试复习总览。后续如果调整复习节奏，只需要更新总览页，避免多个题单里的路线表互相漂移。\n?/,
      "\n",
    )
    .replace(
      /\n## 复习路线入口\n\n这篇文章只保留数据结构相关题单。7 天复习路线和 30 天复习路线统一维护在数据结构复习总览，避免题单文章和总览页重复维护同一套计划。\n?/,
      "\n",
    )
    .replace(
      /JavaGuide 相关阅读：\n\n- AI 应用开发知识体系：大模型、Agent、RAG、MCP、Prompt 工程与系统设计\n- AI 系统设计专题：生产级架构、模型网关、评测治理与语音 Agent\n- 大模型基础专题：运行机制、API 调用、结构化输出与评测\n- RAG 专题：文档处理、向量数据库、GraphRAG、检索优化与知识库更新\n- AI Agent 专题：Agent Loop、Memory、Prompt、Context、MCP 与 Skills\n\n/,
      "",
    );
  if (text !== original) {
    fs.writeFileSync(abs, text);
    retargeted += 1;
  }
}

const pages = walk(src).filter((file) => file.endsWith(".md") && path.basename(file) !== "SUMMARY.md");
console.log(
  JSON.stringify({ pages: pages.length, promoStripped: stripped, removedIndexes, retargeted }, null, 2),
);
