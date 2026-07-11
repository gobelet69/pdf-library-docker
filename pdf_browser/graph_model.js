(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PdfGraphModel = api;
  if (typeof window !== "undefined") {
    window.PdfGraphModel = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ROOT_ID = "root";

  function buildGraphModel(library) {
    const pdfs = library?.pdfs || [];
    const nodes = [{
      id: ROOT_ID,
      type: "root",
      name: "sorted_pdfs",
      path: "",
      parent: "",
      count: pdfs.length,
      warnings: [],
    }];
    const links = [];
    const folderPaths = new Set();

    (library?.folders || []).forEach((folder) => {
      folderPaths.add(folder.path);
    });
    pdfs.forEach((pdf) => {
      if (pdf.folder) folderPaths.add(pdf.folder);
    });

    [...folderPaths].sort(pathSort).forEach((path) => {
      if (!path) return;
      const parts = path.split("/");
      const name = parts[parts.length - 1];
      const parentPath = parts.slice(0, -1).join("/");
      nodes.push({
        id: folderId(path),
        type: "folder",
        name,
        path,
        parent: parentPath ? folderId(parentPath) : ROOT_ID,
        count: pdfCountInFolder(pdfs, path),
        warnings: path === "_Unsorted" ? ["unsorted"] : [],
      });
      links.push({
        source: parentPath ? folderId(parentPath) : ROOT_ID,
        target: folderId(path),
        type: "contains",
      });
    });

    pdfs.slice().sort((a, b) => pathSort(a.path, b.path)).forEach((pdf) => {
      const parent = pdf.folder ? folderId(pdf.folder) : ROOT_ID;
      nodes.push({
        id: pdfId(pdf.path),
        type: "pdf",
        name: pdf.name,
        path: pdf.path,
        parent,
        count: 1,
        warnings: pdfWarnings(pdf),
      });
      links.push({ source: parent, target: pdfId(pdf.path), type: "contains" });
    });

    return { nodes, links };
  }

  function visibleGraph(model, options = {}) {
    const focusPath = options.focusPath || "";
    const showPdfs = options.showPdfs !== false;
    const showFolders = options.showFolders !== false;
    const showUnsorted = options.showUnsorted !== false;
    const warningsOnly = Boolean(options.warningsOnly);
    const query = String(options.query || "").trim().toLowerCase();
    const nodeMap = new Map((model?.nodes || []).map((node) => [node.id, node]));
    let keep = new Set([ROOT_ID]);

    (model?.nodes || []).forEach((node) => {
      if (node.id === ROOT_ID) return;
      if (!showUnsorted && isUnsortedNode(node)) return;
      if (node.type === "folder" && showFolders) keep.add(node.id);
      if (node.type === "pdf" && showPdfs && matchesWarningFilter(node, warningsOnly)) keep.add(node.id);
      if (node.type === "pdf" && !showPdfs && isInFocus(node, focusPath) && matchesWarningFilter(node, warningsOnly)) keep.add(node.id);
    });

    if (focusPath) {
      const focusedFolder = folderId(focusPath);
      if (showFolders && (showUnsorted || focusPath !== "_Unsorted")) {
        keep.add(focusedFolder);
        addAncestors(focusedFolder, nodeMap, keep, { showFolders, showUnsorted });
      }
      (model?.nodes || []).forEach((node) => {
        if (!showUnsorted && isUnsortedNode(node)) return;
        if (node.type === "folder" && showFolders && (node.path === focusPath || node.path.startsWith(`${focusPath}/`))) keep.add(node.id);
        if (node.type === "pdf" && isInFocus(node, focusPath) && showPdfs && matchesWarningFilter(node, warningsOnly)) keep.add(node.id);
      });
    }

    if (query) {
      const matching = new Set([ROOT_ID]);
      (model?.nodes || []).forEach((node) => {
        if (!keep.has(node.id)) return;
        if (node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query)) {
          matching.add(node.id);
          addAncestors(node.id, nodeMap, matching, { showFolders, showUnsorted });
        }
      });
      keep = matching;
    }

    const nodes = (model?.nodes || []).filter((node) => keep.has(node.id));
    const links = (model?.links || []).filter((link) => keep.has(link.source) && keep.has(link.target));
    return { nodes, links };
  }

  function pdfCountInFolder(pdfs, folderPath) {
    return pdfs.filter((pdf) => pdf.folder === folderPath || pdf.folder?.startsWith(`${folderPath}/`)).length;
  }

  function layoutRadial(nodes, links, options = {}) {
    const width = Number(options.width || 900);
    const height = Number(options.height || 620);
    const centerX = Math.round(width / 2);
    const centerY = Math.round(height / 2);
    const children = new Map();
    links.forEach((link) => {
      if (!children.has(link.source)) children.set(link.source, []);
      children.get(link.source).push(link.target);
    });
    children.forEach((items) => items.sort(pathSort));

    const depth = new Map([[ROOT_ID, 0]]);
    const queue = [ROOT_ID];
    while (queue.length) {
      const id = queue.shift();
      (children.get(id) || []).forEach((child) => {
        depth.set(child, (depth.get(id) || 0) + 1);
        queue.push(child);
      });
    }

    const byDepth = new Map();
    nodes.forEach((node) => {
      const nodeDepth = depth.get(node.id) || 0;
      if (!byDepth.has(nodeDepth)) byDepth.set(nodeDepth, []);
      byDepth.get(nodeDepth).push(node);
    });
    byDepth.forEach((items) => items.sort((a, b) => pathSort(a.path || a.id, b.path || b.id)));

    const maxDepth = Math.max(1, ...byDepth.keys());
    const maxRadius = Math.max(120, Math.min(width, height) * 0.43);
    const positioned = nodes.map((node) => {
      const nodeDepth = depth.get(node.id) || 0;
      if (node.id === ROOT_ID) return { ...node, x: centerX, y: centerY, depth: 0 };
      const siblings = byDepth.get(nodeDepth) || [node];
      const index = siblings.findIndex((item) => item.id === node.id);
      const angle = (-Math.PI / 2) + ((Math.PI * 2) * index / siblings.length);
      const radius = maxRadius * (nodeDepth / maxDepth);
      return {
        ...node,
        depth: nodeDepth,
        x: Math.round(centerX + Math.cos(angle) * radius),
        y: Math.round(centerY + Math.sin(angle) * radius),
      };
    });
    return { nodes: positioned, links };
  }

  function addAncestors(id, nodeMap, keep, options = {}) {
    let current = nodeMap.get(id);
    while (current?.parent) {
      const parent = nodeMap.get(current.parent);
      if (!parent) break;
      if (parent.id === ROOT_ID || (options.showFolders !== false && (options.showUnsorted !== false || !isUnsortedNode(parent)))) {
        keep.add(parent.id);
      }
      current = nodeMap.get(current.parent);
    }
  }

  function isInFocus(node, focusPath) {
    if (!focusPath || node.type !== "pdf") return false;
    return node.path.startsWith(`${focusPath}/`);
  }

  function pdfWarnings(pdf) {
    const metadata = pdf.metadata || {};
    const warnings = [];
    if (!metadata.sourceUrl) warnings.push("missing_source");
    if (!(metadata.importedAt && metadata.importMethod && metadata.contentHash)) warnings.push("incomplete_passport");
    return warnings;
  }

  function isUnsortedNode(node) {
    return node.path === "_Unsorted" || Boolean(node.path?.startsWith("_Unsorted/"));
  }

  function matchesWarningFilter(node, warningsOnly) {
    return !warningsOnly || Boolean(node.warnings?.length);
  }

  function folderId(path) {
    return `folder:${path}`;
  }

  function pdfId(path) {
    return `pdf:${path}`;
  }

  function pathSort(a, b) {
    return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
  }

  return { buildGraphModel, visibleGraph, layoutRadial };
});
