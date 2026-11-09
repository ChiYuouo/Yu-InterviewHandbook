import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");
const extractRoot = path.join(root, "_extract", "JavaGuide-main");
const docs = path.join(extractRoot, "docs");
const src = path.join(root, "src");
const sidebarDir = path.join(docs, ".vuepress", "sidebar");
const snippetsDir = path.join(docs, "snippets");

const CONTAINER_KINDS = new Set([
  "tip",
  "warning",
  "info",
  "note",
  "caution",
  "danger",
  "details",
  "important",
  "center",
]);

const CONTAINER_LABEL = {
  tip: "提示",
  warning: "注意",
  info: "说明",
  note: "说明",
  caution: "注意",
  danger: "警告",
  details: "详情",
  important: "重要",
};

function walkDir(dir, cb) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === ".vuepress" || ent.name === "node_modules") continue;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walkDir(abs, cb);
    else cb(abs);
  }
}

function toPosix(rel) {
  return rel.split(path.sep).join("/");
}

function relFromDocs(abs) {
  return toPosix(path.relative(docs, abs));
}

function stripFrontmatter(text) {
  if (!text.startsWith("---")) return { body: text, title: null };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { body: text, title: null };
  const fm = text.slice(3, end);
  const match = fm.match(/^title:\s*(.*)$/m);
  let title = match ? match[1].trim() : null;
  if (
    title &&
    ((title.startsWith('"') && title.endsWith('"')) ||
      (title.startsWith("'") && title.endsWith("'")))
  ) {
    title = title.slice(1, -1);
  }
  if (title === "" || title === "|" || title === ">") title = null;
  const body = text.slice(end + 4).replace(/^\r?\n/, "");
  return { body, title };
}

function expandIncludes(content, depth = 0) {
  if (depth > 8) return content;
  return content.replace(/<!--\s*@include:\s*(\S+)\s*-->/g, (full, inc) => {
    const target = inc.startsWith("@")
      ? path.join(snippetsDir, inc.slice(1))
      : null;
    if (!target || !fs.existsSync(target)) {
      missingIncludes.add(inc);
      return full;
    }
    const raw = fs.readFileSync(target, "utf8");
    const { body } = stripFrontmatter(raw);
    return expandIncludes(body.trim(), depth + 1);
  });
}

function convertContainers(md) {
  const lines = md.split("\n");
  const out = [];
  let inFence = false;
  let container = null;

  const flush = () => {
    while (container.lines.length && !container.lines[0].trim()) container.lines.shift();
    while (container.lines.length && !container.lines.at(-1).trim()) container.lines.pop();
    const label = CONTAINER_LABEL[container.kind] || "说明";
    if (container.kind === "center") {
      out.push("");
      out.push(...container.lines);
      out.push("");
    } else if (container.kind === "details") {
      out.push("<details>");
      out.push(`<summary>${container.title || label}</summary>`);
      out.push("");
      out.push(...container.lines);
      out.push("");
      out.push("</details>");
    } else {
      const head = container.title
        ? `**${label}：${container.title}**`
        : `**${label}**`;
      out.push("");
      out.push(`> ${head}`);
      out.push(">");
      for (const line of container.lines) {
        out.push(line.length ? `> ${line}` : ">");
      }
      out.push("");
    }
    container = null;
  };

  for (const line of lines) {
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      if (container) container.lines.push(line);
      else out.push(line);
      continue;
    }
    if (inFence) {
      if (container) container.lines.push(line);
      else out.push(line);
      continue;
    }
    const open = line.match(/^:::\s*([A-Za-z-]+)(?:\s+(.*))?$/);
    if (
      !container &&
      open &&
      CONTAINER_KINDS.has(open[1].toLowerCase())
    ) {
      container = {
        kind: open[1].toLowerCase(),
        title: (open[2] || "").trim(),
        lines: [],
      };
      continue;
    }
    if (container && line.trim() === ":::") {
      flush();
      continue;
    }
    if (container) container.lines.push(line);
    else out.push(line);
  }
  if (container) {
    out.push(`::: ${container.kind}${container.title ? " " + container.title : ""}`);
    out.push(...container.lines);
  }
  return out.join("\n");
}

function resolveToSrc(sitePath) {
  let p = sitePath;
  try {
    p = decodeURIComponent(sitePath);
  } catch {
    p = sitePath;
  }
  if (p.startsWith("/")) p = p.slice(1);
  p = p.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (p === "" || p === "index.html" || p === "index.md") return "README.md";
  if (p.endsWith("/")) {
    if (mdFiles.has(p + "README.md")) return p + "README.md";
    return null;
  }
  if (p.endsWith(".html")) {
    const md = p.slice(0, -5) + ".md";
    if (mdFiles.has(md)) return md;
    if (md.endsWith("/index.md")) {
      const readme = md.slice(0, -"index.md".length) + "README.md";
      if (mdFiles.has(readme)) return readme;
    }
    const asDir = p.slice(0, -5) + "/README.md";
    if (mdFiles.has(asDir)) return asDir;
    return null;
  }
  if (p.endsWith(".md")) return mdFiles.has(p) ? p : null;
  if (mdFiles.has(p + ".md")) return p + ".md";
  if (mdFiles.has(p + "/README.md")) return p + "/README.md";
  if (assetFiles.has(p)) return p;
  return null;
}

function rewriteUrl(url, fromFile) {
  const trimmed = url.trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("data:")
  ) {
    return url;
  }
  let hash = "";
  let base = trimmed;
  const hashIdx = base.indexOf("#");
  if (hashIdx >= 0) {
    hash = base.slice(hashIdx);
    base = base.slice(0, hashIdx);
  }
  let query = "";
  const qIdx = base.indexOf("?");
  if (qIdx >= 0) {
    query = base.slice(qIdx);
    base = base.slice(0, qIdx);
  }
  if (!base) return url;

  let sitePath = null;
  if (/^https?:\/\/(www\.)?javaguide\.cn\//i.test(base)) {
    sitePath = base.replace(/^https?:\/\/(www\.)?javaguide\.cn/i, "");
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(base)) {
    return url;
  } else if (base.startsWith("/")) {
    sitePath = base;
  } else {
    const dir = path.posix.dirname(fromFile);
    sitePath = path.posix.normalize(path.posix.join("/", dir, base));
  }

  const target = resolveToSrc(sitePath);
  if (!target) return url;
  const fromDir = path.posix.dirname(fromFile);
  let rel = path.posix.relative(fromDir, target);
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel + query + hash;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;

function toOnlineImage(fromFile, url) {
  const trimmed = url.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith("//")) {
    return url;
  }
  let suffix = "";
  let base = trimmed;
  const cut = base.search(/[?#]/);
  if (cut >= 0) {
    suffix = base.slice(cut);
    base = base.slice(0, cut);
  }
  if (!IMAGE_EXT.test(base)) return url;
  const dir = path.posix.dirname(fromFile);
  const abs = path.posix.normalize(path.posix.join(dir, base));
  if (!abs || abs.startsWith("..") || abs.startsWith("/")) return url;
  const local = path.join(docs, abs);
  if (!fs.existsSync(local)) {
    missingImages.add(`${fromFile} -> ${url}`);
    return url;
  }
  const encoded = abs.split("/").map(encodeURIComponent).join("/");
  return `https://cdn.jsdelivr.net/gh/Snailclimb/JavaGuide@main/docs/${encoded}${suffix}`;
}

function onlineImages(md, fromFile) {
  const lines = md.split("\n");
  const chunks = [];
  let fence = false;
  let current = [];
  const push = (isFence) => {
    if (!current.length) return;
    const text = current.join("\n");
    chunks.push(
      isFence
        ? text
        : text.replace(
            /(!\[[^\]]*\])\(\s*([^)\s]+)(\s+(?:"[^"]*"|'[^']*'))?\s*\)/g,
            (full, bang, url, title) => {
              const next = toOnlineImage(fromFile, url);
              if (next === url) return full;
              onlineImageCount += 1;
              return `${bang}(${next}${title ? " " + title : ""})`;
            },
          ),
    );
    current = [];
  };
  for (const line of lines) {
    const isFence = /^(```|~~~)/.test(line);
    if (isFence && !fence) {
      push(false);
      fence = true;
      current.push(line);
    } else if (isFence && fence) {
      current.push(line);
      push(true);
      fence = false;
    } else {
      current.push(line);
    }
  }
  if (current.length) push(fence);
  return chunks.join("\n");
}

function rewriteLinks(md, fromFile) {
  const lines = md.split("\n");
  const chunks = [];
  let fence = false;
  let current = [];
  const push = (isFence) => {
    if (!current.length) return;
    const text = current.join("\n");
    chunks.push(isFence ? text : rewritePlain(text, fromFile));
    current = [];
  };
  for (const line of lines) {
    const isFence = /^(```|~~~)/.test(line);
    if (isFence && !fence) {
      push(false);
      fence = true;
      current.push(line);
    } else if (isFence && fence) {
      current.push(line);
      push(true);
      fence = false;
    } else {
      current.push(line);
    }
  }
  if (current.length) push(fence);
  return chunks.join("\n");
}

function rewritePlain(text, fromFile) {
  let next = text.replace(
    /(!?)\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+("[^"]*"|'[^']*'))?\s*\)/g,
    (full, bang, label, url, title) => {
      const rewritten = rewriteUrl(url, fromFile);
      if (rewritten === url) return full;
      return `${bang}[${label}](${rewritten}${title ? " " + title : ""})`;
    },
  );
  next = next.replace(
    /<(https?:\/\/(?:www\.)?javaguide\.cn\/[^>\s]+)>/gi,
    (full, url) => {
      const rewritten = rewriteUrl(url, fromFile);
      if (rewritten === url) return full;
      return `[${url}](${rewritten})`;
    },
  );
  next = next.replace(
    /\b(href|src)=("([^"]*)"|'([^']*)')/g,
    (full, attr, _quoted, dq, sq) => {
      const url = dq ?? sq;
      const quote = dq !== undefined ? '"' : "'";
      if (!url) return full;
      if (
        attr === "src" &&
        /^https?:/i.test(url) &&
        !/javaguide\.cn/i.test(url)
      ) {
        return full;
      }
      const rewritten = rewriteUrl(url, fromFile);
      if (rewritten === url) return full;
      return `${attr}=${quote}${rewritten}${quote}`;
    },
  );
  return next;
}

function ensureHeading(body, title) {
  const trimmed = body.replace(/^\uFEFF/, "");
  if (!title) return trimmed;
  if (/^\s*#\s+\S/m.test(trimmed.split("\n").find((line) => line.trim()) || "")) {
    return trimmed;
  }
  return `# ${title}\n\n${trimmed.replace(/^\n+/, "")}`;
}

function loadSidebars() {
  const ICONS = new Proxy({}, { get: () => "" });
  const createImportantSection = (children) => ({
    text: "重要知识点",
    collapsible: true,
    children,
  });
  const createSourceCodeSection = (children) => ({
    text: "源码分析",
    collapsible: true,
    children,
  });
  const arraySidebar = (value) => value;
  const sidebar = (value) => value;
  const names = [
    "ICONS",
    "createImportantSection",
    "createSourceCodeSection",
    "arraySidebar",
    "sidebar",
  ];
  const files = [
    "about-the-author.ts",
    "ai.ts",
    "ai-coding.ts",
    "books.ts",
    "cs-basics.ts",
    "high-quality-technical-articles.ts",
    "open-source-project.ts",
    "roadmap.ts",
    "zhuanlan.ts",
    "index.ts",
  ];
  let source = "";
  for (const file of files) {
    let code = fs.readFileSync(path.join(sidebarDir, file), "utf8");
    code = code.replace(/import[\s\S]*?from\s+["'][^"']+["'];?/g, "");
    code = code.replace(/export\s+default\s+sidebar\s*\(/g, "var __sidebar = sidebar(");
    code = code.replace(/export\s+const\s+/g, "var ");
    source += `\n${code}\n`;
  }
  const fn = new Function(
    ...names,
    `${source}\nreturn { aboutTheAuthor, ai, aiCoding, books, csBasics, highQualityTechnicalArticles, openSourceProject, roadmap, zhuanlan, __sidebar };`,
  );
  return fn(
    ICONS,
    createImportantSection,
    createSourceCodeSection,
    arraySidebar,
    sidebar,
  );
}

function normalizePrefix(prefix) {
  let p = String(prefix || "");
  if (p.startsWith("/")) p = p.slice(1);
  if (p && !p.endsWith("/")) p += "/";
  return p;
}

function joinPrefix(parent, extra) {
  if (!extra) return parent || "";
  if (String(extra).startsWith("/")) return normalizePrefix(extra);
  return normalizePrefix((parent || "") + extra);
}

function linkToFile(link, parentPrefix) {
  if (!link || /^https?:/i.test(link)) return null;
  let site;
  if (link.startsWith("/")) site = link;
  else site = "/" + (parentPrefix || "") + link;
  return resolveToSrc(site);
}

function fallbackTitle(file) {
  const base = path.posix.basename(file, ".md");
  if (base.toLowerCase() === "readme") {
    const parent = path.posix.basename(path.posix.dirname(file));
    return parent && parent !== "." ? parent : "README";
  }
  return base;
}

function escTitle(title) {
  return String(title)
    .replace(/\[/g, "［")
    .replace(/\]/g, "］")
    .replace(/\s+/g, " ")
    .trim();
}

function walkNodes(nodes, parentPrefix, used) {
  const items = [];
  if (!Array.isArray(nodes)) return items;
  for (const node of nodes) {
    if (typeof node === "string") {
      if (/^https?:/i.test(node)) continue;
      const file = linkToFile(node, parentPrefix);
      if (!file) {
        unresolved.push(`${parentPrefix}${node}`);
        continue;
      }
      if (used.has(file)) continue;
      used.add(file);
      items.push({
        title: titles.get(file) || fallbackTitle(file),
        file,
        children: [],
      });
      continue;
    }
    if (!node || typeof node !== "object") continue;
    const childPrefix = node.prefix
      ? joinPrefix(parentPrefix, node.prefix)
      : parentPrefix;
    let file = null;
    if (node.link && !/^https?:/i.test(String(node.link))) {
      file = linkToFile(String(node.link), parentPrefix);
      if (!file) unresolved.push(String(node.link));
      else if (used.has(file)) file = null;
      else used.add(file);
    }
    const children = walkNodes(node.children || [], childPrefix, used);
    if (!file && children.length === 0) continue;
    items.push({
      title: node.text || (file ? titles.get(file) || fallbackTitle(file) : "未命名"),
      file,
      children,
    });
  }
  return items;
}

function renderItems(items, depth) {
  let out = "";
  const pad = "    ".repeat(depth);
  for (const item of items) {
    const title = escTitle(item.title || "未命名");
    out += item.file
      ? `${pad}- [${title}](${item.file})\n`
      : `${pad}- [${title}]()\n`;
    if (item.children?.length) out += renderItems(item.children, depth + 1);
  }
  return out;
}

function sectionBlock(title, items) {
  if (!items.length) return "";
  return `\n# ${title}\n\n${renderItems(items, 0)}`;
}

function withReadme(readme, readmeTitle, nodes, prefix, used) {
  const items = [];
  if (readme && mdFiles.has(readme) && !used.has(readme)) {
    used.add(readme);
    items.push({
      title: readmeTitle || titles.get(readme) || fallbackTitle(readme),
      file: readme,
      children: [],
    });
  }
  items.push(...walkNodes(nodes, prefix, used));
  return items;
}

const mdFiles = new Set();
const assetFiles = new Set();
const titles = new Map();
const missingIncludes = new Set();
const missingImages = new Set();
const unresolved = [];
let onlineImageCount = 0;

if (!fs.existsSync(docs)) {
  console.error("Missing extracted docs at", docs);
  process.exit(1);
}

const skipPage = (rel) =>
  rel.endsWith(".snippet.md") ||
  rel === "ai/TODO.md" ||
  rel.startsWith("snippets/");

walkDir(docs, (abs) => {
  const rel = relFromDocs(abs);
  if (rel.endsWith(".md")) {
    if (skipPage(rel)) return;
    mdFiles.add(rel);
    const { title } = stripFrontmatter(fs.readFileSync(abs, "utf8"));
    if (title) titles.set(rel, title);
  } else {
    assetFiles.add(rel);
  }
});

fs.rmSync(src, { recursive: true, force: true });
fs.mkdirSync(src, { recursive: true });

let rewrittenLinks = 0;
for (const rel of mdFiles) {
  const abs = path.join(docs, rel);
  const raw = fs.readFileSync(abs, "utf8");
  const { body, title } = stripFrontmatter(raw);
  const included = expandIncludes(body);
  const containers = convertContainers(included);
  const before = containers;
  const linked = onlineImages(rewriteLinks(containers, rel), rel);
  if (linked !== before) rewrittenLinks += 1;
  const finalBody = ensureHeading(linked, title).replace(/\s+$/, "") + "\n";
  const dest = path.join(src, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, finalBody);
}

for (const rel of assetFiles) {
  const dest = path.join(src, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(docs, rel), dest);
}

const logo = path.join(docs, ".vuepress", "public", "logo.png");
if (fs.existsSync(logo)) fs.copyFileSync(logo, path.join(src, "favicon.png"));

const sidebars = loadSidebars();
const used = new Set(["README.md"]);
const rootNodes = sidebars.__sidebar["/"] || [];

const parts = [
  [
    "后端开发",
    withReadme(
      "home.md",
      titles.get("home.md") || "Java 面试指南",
      rootNodes,
      "",
      used,
    ),
  ],
  [
    "计算机基础",
    withReadme(
      "cs-basics/README.md",
      titles.get("cs-basics/README.md") || "计算机基础",
      sidebars.csBasics,
      "cs-basics/",
      used,
    ),
  ],
  [
    "AI 应用开发",
    withReadme(
      "ai/README.md",
      titles.get("ai/README.md") || "AI 应用开发",
      sidebars.ai,
      "ai/",
      used,
    ),
  ],
  [
    "AI 编程",
    withReadme(
      "ai-coding/README.md",
      titles.get("ai-coding/README.md") || "AI 编程",
      sidebars.aiCoding,
      "ai-coding/",
      used,
    ),
  ],
  [
    "学习路线",
    withReadme(
      "roadmap/README.md",
      titles.get("roadmap/README.md") || "学习路线",
      sidebars.roadmap,
      "roadmap/",
      used,
    ),
  ],
  [
    "开源项目",
    withReadme(
      "open-source-project/README.md",
      titles.get("open-source-project/README.md") || "开源项目",
      sidebars.openSourceProject,
      "open-source-project/",
      used,
    ),
  ],
  [
    "技术书籍",
    withReadme(
      "books/README.md",
      titles.get("books/README.md") || "技术书籍",
      sidebars.books,
      "books/",
      used,
    ),
  ],
  [
    "程序人生",
    withReadme(
      "high-quality-technical-articles/README.md",
      titles.get("high-quality-technical-articles/README.md") || "程序人生",
      sidebars.highQualityTechnicalArticles,
      "high-quality-technical-articles/",
      used,
    ),
  ],
  [
    "关于作者",
    withReadme(
      "about-the-author/README.md",
      titles.get("about-the-author/README.md") || "关于作者",
      sidebars.aboutTheAuthor,
      "about-the-author/",
      used,
    ),
  ],
  [
    "知识专栏",
    withReadme(
      "zhuanlan/README.md",
      titles.get("zhuanlan/README.md") || "知识专栏",
      sidebars.zhuanlan,
      "zhuanlan/",
      used,
    ),
  ],
];

const orphans = [...mdFiles]
  .filter((file) => !used.has(file))
  .sort((a, b) => a.localeCompare(b, "zh"));
const orphanGroups = new Map();
for (const file of orphans) {
  const top = file.includes("/") ? file.slice(0, file.indexOf("/")) : "其他";
  if (!orphanGroups.has(top)) orphanGroups.set(top, []);
  orphanGroups.get(top).push({
    title: titles.get(file) || fallbackTitle(file),
    file,
    children: [],
  });
  used.add(file);
}
const orphanItems = [...orphanGroups.entries()].map(([name, children]) => ({
  title: name,
  file: null,
  children,
}));

let summary = "# Summary\n\n";
summary += `[${escTitle(titles.get("README.md") || "JavaGuide")}](README.md)\n`;
for (const [title, items] of parts) summary += sectionBlock(title, items);
if (orphanItems.length) summary += sectionBlock("未列入原目录的文章", orphanItems);
fs.writeFileSync(path.join(src, "SUMMARY.md"), summary);

const licenseSrc = path.join(extractRoot, "LICENSE");
if (fs.existsSync(licenseSrc)) {
  fs.copyFileSync(licenseSrc, path.join(root, "LICENSE"));
}

const linkedCount = (summary.match(/\]\([^)\n]+\)/g) || []).length;
console.log(
  JSON.stringify(
    {
      pages: mdFiles.size,
      assets: assetFiles.size,
      summaryLinks: linkedCount,
      filesWithRewrittenLinks: rewrittenLinks,
      unresolvedSidebarLinks: [...new Set(unresolved)],
      missingIncludes: [...missingIncludes],
      onlineImages: onlineImageCount,
      missingImages: [...missingImages],
      orphanPages: orphans.length,
    },
    null,
    2,
  ),
);
