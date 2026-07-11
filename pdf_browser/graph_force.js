(function (root, factory) {
  const api = factory(root.d3);
  root.PdfForceGraph = api;
  if (typeof window !== "undefined") {
    window.PdfForceGraph = api;
  }
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (d3) {
  function createForceGraph(container, callbacks = {}) {
    let simulation = null;
    let graph = { nodes: [], links: [] };
    let options = {};
    let clickTimer = null;

    function destroy() {
      if (simulation) simulation.stop();
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = null;
      simulation = null;
      container.innerHTML = "";
    }

    function render(nextGraph, nextOptions = {}) {
      if (!d3) {
        container.innerHTML = `<div class="graph-message">D3 indisponible.</div>`;
        return;
      }
      destroy();
      graph = {
        nodes: (nextGraph.nodes || []).map((node) => ({ ...node })),
        links: (nextGraph.links || []).map((link) => ({ ...link })),
      };
      options = { ...nextOptions };
      if (!graph.nodes.length) {
        container.innerHTML = `<div class="graph-message">Aucun noeud visible.</div>`;
        return;
      }
      draw();
    }

    function resize() {
      if (graph.nodes.length) render(graph, options);
    }

    function draw() {
      const width = Math.max(640, container.clientWidth || 900);
      const height = Math.max(520, container.clientHeight || 620);
      const svg = d3.select(container).append("svg")
        .attr("class", "force-graph")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", "Graph des dossiers et PDFs");
      const viewport = svg.append("g").attr("class", "force-viewport");
      svg.call(d3.zoom().scaleExtent([0.25, 5]).on("zoom", (event) => {
        viewport.attr("transform", event.transform);
      }));
      svg.on("dblclick.zoom", null);

      const links = viewport.append("g").attr("class", "force-links")
        .selectAll("line")
        .data(graph.links)
        .join("line");
      const node = viewport.append("g").attr("class", "force-nodes")
        .selectAll("g")
        .data(graph.nodes)
        .join("g")
        .attr("class", (item) => nodeClass(item, options))
        .attr("data-node-id", (item) => item.id)
        .call(dragBehavior());

      node.append("circle").attr("r", (item) => nodeRadius(item, options));
      node.append("text")
        .attr("class", "force-label")
        .classed("force-label-hidden", (item) => !shouldShowLabel(item, options))
        .attr("y", (item) => nodeRadius(item, options) + 10)
        .text((item) => nodeLabel(item));
      node.append("title").text((item) => item.path || item.name);
      node.on("click", (event, item) => {
        event.stopPropagation();
        const target = event.currentTarget;
        if (event.detail > 1) {
          if (clickTimer) clearTimeout(clickTimer);
          clickTimer = null;
          callbacks.onNodeDoubleClick?.(item, target);
          return;
        }
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          clickTimer = null;
          callbacks.onNodeClick?.(item, target);
        }, 180);
      });
      node.on("dblclick", (event, item) => {
        event.stopPropagation();
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = null;
        callbacks.onNodeDoubleClick?.(item, event.currentTarget);
      });

      function updatePositions() {
        links
          .attr("x1", (item) => item.source.x)
          .attr("y1", (item) => item.source.y)
          .attr("x2", (item) => item.target.x)
          .attr("y2", (item) => item.target.y)
          .attr("stroke-width", Number(options.linkThickness || 0.8));
        node.attr("transform", (item) => `translate(${item.x || width / 2},${item.y || height / 2})`);
      }

      simulation = d3.forceSimulation(graph.nodes)
        .force("link", d3.forceLink(graph.links)
          .id((item) => item.id)
          .distance(Number(options.linkDistance || 58))
          .strength(Number(options.linkForce || 0.7)))
        .force("charge", d3.forceManyBody().strength(-Number(options.repelForce || 90)))
        .force("center", d3.forceCenter(width / 2, height / 2).strength(Number(options.centerForce || 0.55)))
        .force("collision", d3.forceCollide().radius((item) => nodeRadius(item, options) + 5))
        .on("tick", updatePositions);
      simulation.tick(options.animate === false ? 90 : 30);
      updatePositions();
      if (options.animate === false) {
        simulation.stop();
      } else {
        simulation.alpha(0.8).restart();
      }
    }

    function dragBehavior() {
      return d3.drag()
        .on("start", (event, item) => {
          if (!event.active && simulation) simulation.alphaTarget(0.25).restart();
          item.fx = item.x;
          item.fy = item.y;
        })
        .on("drag", (event, item) => {
          item.fx = event.x;
          item.fy = event.y;
        })
        .on("end", (event, item) => {
          if (!event.active && simulation) simulation.alphaTarget(0);
          item.fx = null;
          item.fy = null;
        });
    }

    return { render, destroy, resize };
  }

  function nodeRadius(node, options = {}) {
    const scale = Number(options.nodeSize || 1);
    if (node.type === "root") return 12 * scale;
    if (node.type === "folder") return Math.max(6, Math.min(16, 7 + Math.sqrt(node.count || 0))) * scale;
    return (node.warnings?.length ? 4.8 : 3.6) * scale;
  }

  function nodeLabel(node) {
    if (node.type === "root") return "sorted_pdfs";
    return node.name || node.path;
  }

  function nodeClass(node, options = {}) {
    return [
      "force-node",
      `force-${node.type}`,
      node.path === "_Unsorted" ? "force-unsorted" : "",
      node.warnings?.length ? "force-warning" : "",
      node.path && node.path === options.focusPath ? "force-focused" : "",
      options.folderColors === false ? "force-monochrome" : "",
    ].filter(Boolean).join(" ");
  }

  function shouldShowLabel(node, options = {}) {
    if (options.showLabels === false) return false;
    if (node.type === "root" || node.type === "folder") return true;
    return Number(options.textThreshold || 0.7) <= 0.3;
  }

  return { createForceGraph };
});
