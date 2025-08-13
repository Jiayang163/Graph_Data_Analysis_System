  let cy = null;
  let rawData = null;
  let charts = {
      degreeChart: null,
      componentChart: null,
      clusterChart: null
 };


  function getColor(category) {
    const colors = [
      "#e41a1c", "#377eb8", "#4daf4a", "#984ea3",
      "#ff7f00", "#ffff33", "#a65628", "#f781bf", "#999999"
    ];
    return colors[category % colors.length];
  }

  function renderGraph(data, layoutName = 'circle', colorKey = 'cluster') {
    const elements = [];
    const scale = data.nodes.length > 1000 ? 5 : 10;
    data.nodes.forEach(n => {
      elements.push({
        data: {
          id: n.id,
          label: n.name || n.label || n.id,
          cluster: n.cluster || n.category,
          initial_cluster: n.cluster || n.category  // 保存原始 cluster

        },
        style: {
          'background-color': getColor(n.cluster || n.category),
          'width': scale,
          'height': scale,
        },
        position: { x: n.x, y: n.y }
      });
    });

    data.links.forEach(e => {
      elements.push({
        data: {
          id: `${e.source}-${e.target}`,
          source: e.source,
          target: e.target
        }
      });
    });

    const catSet = new Set(data.nodes.map(n => n.category ?? n.cluster));

    document.getElementById('nodeCount').textContent = data.nodes.length;
    document.getElementById('edgeCount').textContent = data.links.length;
    document.getElementById('categoryCount').textContent = catSet.size;

    // 构建入度出度统计
    const inMap = {};
    const outMap = {};
    data.links.forEach(e => {
      outMap[e.source] = (outMap[e.source] || 0) + 1;
      inMap[e.target] = (inMap[e.target] || 0) + 1;
    });

    // 在 cy 初始化之前补充 degree 信息
    elements.forEach(ele => {
      if (ele.data && ele.data.id) {
        ele.data.indegree = inMap[ele.data.id] || 0;
        ele.data.outdegree = outMap[ele.data.id] || 0;
        ele.data.degree = ele.data.indegree + ele.data.outdegree;  // ✅ 新增这行！

      }
    });


    if (cy) cy.destroy();
    cy = cytoscape({
      container: document.getElementById('cy'),
      elements: elements,
      wheelSensitivity: 0.2,
      boxSelectionEnabled: false,  // 禁止鼠标框选！
      selectionType: 'single',     // 只允许单选
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(style.background-color)',
            'width': 10,
            'height': 10,
            'label': 'data(label)',
            'font-size': 5,
            'color': '#333',
            'text-opacity': 0
          }
        },
        {
          selector: 'node:hover',
          style: {
            'text-opacity': 1,

          }
        },
        {
          selector: 'edge',
          style: {
            'width': 0.5,
            'line-color': '#ccc',
            'opacity': 0.5
          }
        },
        {
          selector: '.faded',
          style: {
            'opacity': 0.1,
            'text-opacity': 0
          }
        },
        {
          selector: '.hovered',
          style: {
            'background-color': '#f39c12',
            'line-color': '#f39c12',
            'width': 1,
            'text-opacity': 1,
            'font-size': 6,
            'color': '#f39c12',
            'border-width':1,
            'border-color':'#f39c12'
          }
        },
        {
          selector: '.highlighted-center',  // ✅ 新增
          style: {
            'background-color': 'data(style.background-color)',
            'border-width': 2,
            'border-color': '#000',
            'width': 14,
            'height': 14,
            'z-index': 9999
          }
        }


      ],
      layout: {
        name: layoutName === 'preset' ? 'preset' : layoutName,
        fit: true,
        padding: 30
      },
      userZoomingEnabled: true,
      userPanningEnabled: true
    });

    cy.on('tap', 'node', function(evt) {
      const node = evt.target;
      const neighborhood = node.closedNeighborhood();

      // 所有元素先淡出
      cy.elements().removeClass('highlighted').addClass('faded');

      // 点击的节点 + 邻居们高亮
      neighborhood.removeClass('faded').addClass('highlighted');
    });


    cy.on('tap', function(evt) {
      if (evt.target === cy) {
        cy.elements().removeClass('faded').removeClass('highlighted');
      }
    });


    //PageCount
    const pr = cy.elements().pageRank();
    cy.nodes().forEach(n => {
      n.data('pagerank', pr.rank(n));
    });

    cy.nodes().forEach(n => {
      let totalDist = 0;
      let sp = cy.elements().dijkstra(n).distanceTo;
      cy.nodes().forEach(m => {
        if (n.id() !== m.id()) {
          const dist = sp(m);
          totalDist += dist;
        }
      });
      const closeness = totalDist > 0 ? (cy.nodes().length - 1) / totalDist : 0;
      n.data('closeness', closeness);
    });

    const betMap = computeBetweenness(cy);
    cy.nodes().forEach(n => {
      const id = n.id();
      n.data('betweenness', betMap[id] || 0);
    });


    cy.on('mouseover', 'node', function(evt){
      const d = evt.target.data();
      document.getElementById('hoverInfo').innerHTML =
        `ID: ${d.id}<br>
        Label: ${d.label}<br>
        Cluster: ${d.cluster}<br>
        Degree: ${d.indegree + d.outdegree}<br>
        PageRank: ${d.pagerank.toFixed(4)}<br>
        Closeness: ${(d.closeness || 0).toFixed(4)}<br>
        Betweenness: ${d.betweenness.toFixed(4)}
        `;

      const node = evt.target;
      const connected = node.connectedEdges();

      node.addClass('hovered');
      connected.addClass('hovered');
    });

    cy.on('mouseout', 'node', function(evt){
      document.getElementById('hoverInfo').textContent = 'Hover over a node';
      const node = evt.target;
      const connected = node.connectedEdges();

      node.removeClass('hovered');
      connected.removeClass('hovered');
    });

    const stats = computeGraphStats(cy);
    document.getElementById('density').textContent = stats.density;
    document.getElementById('avgDegree').textContent = stats.avgDegree;
    document.getElementById('avgWeightedDegree').textContent = stats.avgWeightedDegree;
    document.getElementById('maxDegree').textContent = stats.maxDegree;
    document.getElementById('minDegree').textContent = stats.minDegree;
    document.getElementById('components').textContent = stats.components;
    document.getElementById('clustering').textContent = stats.clusteringCoefficient;
    document.getElementById('diameter').textContent = stats.diameter;
    document.getElementById('avgPathLength').textContent = stats.avgPathLength;
  }

  function computeBetweenness(cy) {
    const nodes = cy.nodes().map(n => n.id());
    const betweenness = {};
    nodes.forEach(id => betweenness[id] = 0);

    nodes.forEach(s => {
      const stack = [];
      const pred = {};
      const sigma = {};
      const dist = {};

      nodes.forEach(v => {
        pred[v] = [];
        sigma[v] = 0;
        dist[v] = -1;
      });

      sigma[s] = 1;
      dist[s] = 0;

      const queue = [s];

      while (queue.length > 0) {
        const v = queue.shift();
        stack.push(v);

        const neighbors = cy.getElementById(v).neighborhood('node').map(n => n.id());

        neighbors.forEach(w => {
          if (dist[w] < 0) {
            dist[w] = dist[v] + 1;
            queue.push(w);
          }
          if (dist[w] === dist[v] + 1) {
            sigma[w] += sigma[v];
            pred[w].push(v);
          }
        });
      }

      const delta = {};
      nodes.forEach(v => delta[v] = 0);

      while (stack.length > 0) {
        const w = stack.pop();
        pred[w].forEach(v => {
          delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
        });
        if (w !== s) betweenness[w] += delta[w];
      }
    });

    // normalize for undirected graph
    const factor = 1 / 2;
    Object.keys(betweenness).forEach(id => {
      betweenness[id] *= factor;
    });

    return betweenness;
  }

  function computeGraphStats(cy) {
    const nodes = cy.nodes();
    const edges = cy.edges();
    const V = nodes.length;
    const E = edges.length;

    const density = (2 * E) / (V * (V - 1));
    const avgDegree = (2 * E) / V;

    let totalWeightedDegree = 0;
    nodes.forEach(node => {
      const connected = node.connectedEdges();
      const weightedSum = connected.reduce((sum, edge) => {
        return sum + (edge.data('weight') || 1);
      }, 0);
      totalWeightedDegree += weightedSum;
    });

    const degrees = nodes.map(n => n.degree());
    const avgWeightedDegree = totalWeightedDegree / V;
    const maxDegree = Math.max(...degrees);
    const minDegree = Math.min(...degrees);

      // Clustering coefficient（全局）
    let triangleCount = 0;
    nodes.forEach(n => {
      const neighbors = n.neighborhood('node');
      const neighborCount = neighbors.length;
      if (neighborCount < 2) return;

      let connectedPairs = 0;
      for (let i = 0; i < neighborCount; i++) {
        for (let j = i + 1; j < neighborCount; j++) {
          if (cy.getElementById(neighbors[i].id()).edgesWith(neighbors[j]).length > 0) {
            connectedPairs++;
          }
        }
      }
      triangleCount += connectedPairs;
    });
    const clusteringCoefficient = triangleCount / V;

    // 连通分量数量
    const components = cy.elements().components().length;

    // 计算所有节点对之间的最短路径
    let totalLength = 0;
    let pairCount = 0;
    let maxShortest = 0;

    const dijkstra = cy.elements().dijkstra({ root: cy.nodes()[0], weight: () => 1 });

    nodes.forEach(source => {
      const dj = cy.elements().dijkstra({ root: source, weight: () => 1 });
      nodes.forEach(target => {
        if (source.id() !== target.id()) {
          const dist = dj.distanceTo(target);
          if (dist !== Infinity) {
            totalLength += dist;
            maxShortest = Math.max(maxShortest, dist);
            pairCount++;
          }
        }
      });
    });

    const avgPathLength = totalLength / pairCount;

    return {
      density: density.toFixed(6),
      avgDegree: avgDegree.toFixed(6),
      avgWeightedDegree: avgWeightedDegree.toFixed(6),
      clusteringCoefficient: clusteringCoefficient.toFixed(4),
      maxDegree,
      minDegree,
      components,
      diameter: maxShortest.toFixed(0),
      avgPathLength: avgPathLength.toFixed(2)
    };
  }

  function resetToInitialClustering() {
    cy.nodes().forEach(n => {
      const original = n.data('initial_cluster');
      n.data('cluster', original); // 恢复 cluster
      n.style('background-color', getColor(original)); // 着色
    });

    const clusterStatDiv = document.getElementById("clusteringStatus");
    if (clusterStatDiv) {
      clusterStatDiv.style.display = 'block';
      clusterStatDiv.innerText = `Clustering restored to original dataset labels.`;
    }
    setTimeout(() => clusterStatDiv.style.display = 'none', 1000);
  }

  function runClustering(method, options = {}) {
    const loadingDiv = document.getElementById("loading");
    if (loadingDiv) {
      loadingDiv.style.display = 'block';
      loadingDiv.innerText = `Running ${method} method...`;
    }

    const start = performance.now();
    const payload = {
      nodes: cy.nodes().map(n => {
        const pos = n.position();
        return { id: n.id(), x: pos.x, y: pos.y };
      }),
      edges: cy.edges().map(e => ({
        source: e.data("source"),
        target: e.data("target"),
      })),
      ...options

    };

    fetch(`/cluster/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => {
        const end = performance.now();

        if (!data || Object.keys(data).length === 0) {
          throw new Error("The returned data is empty, there may be an error in the backend.");
        }

        //  处理 KMeans 聚类
        if (method === 'kmeans' && data.clusters) {
          // 设置 cluster 值
          Object.entries(data.clusters).forEach(([id, cluster]) => {
            const node = cy.getElementById(id);
            node.data('cluster', cluster);
            node.style('background-color', getColor(cluster));
          });

          // 保存评估信息
          window.kmeansEvaluation = data.kmeans_eval || null;
        } else {
          //  其他方法的标准处理方式
          cy.nodes().forEach(n => {
            const cluster = data[n.id()];
            if (cluster !== undefined) {
              n.data('cluster', cluster);
              n.style('background-color', getColor(cluster));
            }
          });

          window.kmeansEvaluation = null;  // 清空旧的评估
        }


        const clusters = {};
        cy.nodes().forEach(n => {
          const c = n.data('cluster');
          if (!(c in clusters)) clusters[c] = [];
          clusters[c].push(n.id());
        });

        const clusterList = Object.values(clusters);

        loadingDiv.innerText = `${method} completed, took ${(end - start).toFixed(1)} ms`;
        setTimeout(() => loadingDiv.style.display = 'none', 1000);
        // ✅ 最后调用分析函数，确保 cluster & eval 都已更新

         runClusterAnalysis('kmeans', window.kmeansEvaluation);
      })
      .catch(err => {
        console.error("Failed to cluster: ", err);
        if (loadingDiv) {
          loadingDiv.innerText = `Clustering failed：${err.message}`;
          setTimeout(() => loadingDiv.style.display = 'none', 1000);

        }
      });


  }

  function switchLayout(type) {
    renderGraph(rawData, type);
  }

  function setColorBy(key) {
    renderGraph(rawData, 'preset', key);
  }


  fetch(`/api/get_templates_by_name/Les Miserables`)
    .then(res => res.json())
    .then(data => {
      rawData = data;
      renderGraph(data, 'cose', 'cluster');
    })
    .catch(err => {
      console.error("Failed to load graph:", err);
    });

  function showModal() {
    const modal = document.getElementById("datasetModal");
    modal.style.display = "grid";


    fetch('/api/get_templates')
      .then(res => res.json())
      .then(datasets => {
        const tbody = document.querySelector("#datasetTable tbody");
        tbody.innerHTML = "";

        datasets.forEach((d) => {
          const row = document.createElement("tr");
          row.innerHTML = `
            <td>${d.id}</td>
            <td style="cursor:pointer; color:blue;" onclick="loadDatasetByName('${d.name}')">${d.name}</td>
            <td>${d.node_count}</td>
            <td>${d.edge_count}</td>
            <td>${d.description}</td>
          `;
          tbody.appendChild(row);
        });
      })
      .catch(err => console.error("Failed to fetch templates:", err));


  }

  function hideModal() {
    document.getElementById("datasetModal").style.display = "none";
  }



  function loadDatasetByName(name) {
    hideModal();  // 隐藏弹窗等
    fetch(`/api/get_templates_by_name/${name}`)
      .then(res => res.json())
      .then(data => {
        rawData = data;
        renderGraph(data, 'cose');
      })
      .catch(err => {
        console.error("Failed to load graph:", err);
      });
  }


  function saveImage() {
    const pngData = cy.png({
      full: true,        // 导出整个图而不是可视区域
      scale: 6,          // 提高分辨率
      bg: 'white',       // 背景颜色，避免透明
      output: 'blob',    // 输出 blob 便于控制
      maxWidth: 3000,    // 可选限制大小
      maxHeight: 3000
    });

    const blobUrl = URL.createObjectURL(pngData);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = 'graph.png';
    link.click();
    URL.revokeObjectURL(blobUrl);
  }


  function exportGraph() {
    const graphData = {
      nodes: cy.nodes().map(n => ({
        id: n.id(),
        label: n.data('label'),
        cluster: n.data('cluster'),
        x: n.position().x,
        y: n.position().y
      })),
      links: cy.edges().map(e => ({
        source: e.source().id(),
        target: e.target().id()
      }))
    };

    fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(graphData)
    })
    .then(res => res.blob())
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'graph_data.json';
      a.click();
      window.URL.revokeObjectURL(url);
    });
  }


  function showKMeansModal() {
    document.getElementById("kmeansModal").style.display = "grid";
  }

  function hideKMeansModal() {
    document.getElementById("kmeansModal").style.display = "none";
  }

  function submitKMeans() {
    const iterations = parseInt(document.getElementById("kmeansIterations").value);
    const num_clusters = parseInt(document.getElementById("kmeansK").value);
    hideKMeansModal();
    runClustering('kmeans', { k: num_clusters, n_init: iterations });  // 默认聚类数 5，可调整
    setTimeout(() => {
      runClusterAnalysis("kmeans");
    }, 500); // 加延迟，确保前端更新完
  }

  function showJsonEditModal() {
    document.getElementById('jsonEditModal').style.display = 'grid';
    document.getElementById('jsonInput').value = `{
      "nodes": [
        { "id": "0", "label": "Node 0", "x": 0, "y": 0, "category": 0 }
      ],
      "links": [
        { "source": "0", "target": "0" }
      ]
    }`;

    // 预填当前图数据（可选）
    if (rawData) {
      document.getElementById('jsonInput').value = JSON.stringify(rawData, null, 2);
      document.getElementById('jsonPreview').textContent = JSON.stringify(rawData, null, 2);
    }
  }
  function hideJsonEditModal() {
    document.getElementById('jsonEditModal').style.display = 'none';
  }

  function formatJson() {
    const input = document.getElementById('jsonInput').value;
    try {
      const parsed = JSON.parse(input);
      document.getElementById('jsonPreview').textContent = JSON.stringify(parsed, null, 2);
    } catch (e) {
      alert('JSON 格式错误：' + e.message);
    }
  }

  function applyJsonGraph() {
    const input = document.getElementById('jsonInput').value;
    try {
      const parsed = JSON.parse(input);
      if (!parsed.nodes || !parsed.links) {
        alert('必须包含 nodes 和 links 字段');
        return;
      }
      hideJsonEditModal();
      rawData = parsed;
      renderGraph(parsed, 'cose');
    } catch (e) {
      alert('无法解析 JSON：' + e.message);
    }
  }

  // 打开保存窗口
  function showSaveModal() {
    document.getElementById('saveModal').style.display = 'grid';
  }

  // 关闭保存窗口
  function hideSaveModal() {
    document.getElementById('saveModal').style.display = 'none';
  }

  // 打开历史记录
  function showHistoryModal() {
    document.getElementById('historyPanel').style.display = 'grid';
  }

  // 关闭历史记录
  function hideHistoryModal() {
    document.getElementById('historyPanel').style.display = 'none';
  }

  async function saveGraph() {
    const name = document.getElementById('saveName').value;

    const res = await fetch('/api/save_record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        graph: getGraphJson()
      })
    });

    const data = await res.json();
    alert(data.message);

    if (data.status === 'not_logged_in') {
      hideSaveModal();
      window.location.href = "/login";  // 未登录跳转
    } else if (data.status === 'success') {
      hideSaveModal();
    }
  }


  // 获取图数据
  function getGraphJson() {
    const graph = {
      nodes: cy.nodes().map(n => ({
        id: n.id(),
        label: n.data('label'),
        cluster: n.data('cluster'),  // 或 cluster
        pagerank: n.data("pagerank"),
        degree: n.data("degree"),
        closeness: n.data("closeness"),
        betweenness: n.data("betweenness"),
        x: n.position().x,
        y: n.position().y
      })),
      links: cy.edges().map(e => ({
        source: e.data('source'),
        target: e.data('target')
      }))
    };
    const method = document.getElementById("clusterMethodSelect")?.value;
    graph.method = method;

    if (method === 'kmeans' && window.kmeansEvaluation) {
      graph.kmeans_eval = window.kmeansEvaluation;
    }

    return graph;
  }

  async function loadHistoryList() {
    showHistoryModal();
    const res = await fetch('/api/get_records');
    const data = await res.json();
    const list = document.getElementById('historyList');
    list.innerHTML = '';

    data.records.forEach(r => {
      const li = document.createElement('li');
      li.className = 'record-item';

      const label = document.createElement('span');
      label.textContent = `${r.title} \n ${r.created_at}`;
      label.style.whiteSpace = 'pre-line';

      label.style.cursor = 'pointer';
      label.onclick = () => {
        console.log('点击加载记录 ID:', r.id);
        loadGraphById(r.id);
      };

      const del = document.createElement('span');
      del.innerHTML = '&times;';
      del.className = 'record-close';
      del.onclick = async (e) => {
        e.stopPropagation(); // 防止点击触发加载图
        if (confirm(`Are you sure to delete the record ${r.title}?`)) {
          await fetch(`/api/delete_record/${r.id}`, { method: 'DELETE' });
          loadHistoryList(); // 刷新列表
        }
      };

      li.appendChild(label);
      li.appendChild(del);
      list.appendChild(li);
    });
  }



  // JS: 修复 loadGraphById 函数
  async function loadGraphById(id) {
    console.log("点击加载记录 ID:", id);  //  debug
    const res = await fetch(`/api/get_record/${id}`);
    const data = await res.json();
    console.log('后端返回数据:', data);

    if (data.status === 'success') {
      const graph = data.graph;  // 提取内部字段
      rawData = graph; // 也更新 rawData
      renderGraph(graph, layoutName = 'preset');  //  传递正确数据
    } else {
      alert(data.message || '加载失败');
    }
  }

  function showChart(chartName) {
    const all = ['degree', 'cluster', 'component'];
    all.forEach(name => {
      document.getElementById(name + 'ChartCanvas').style.display =
        name === chartName ? 'block' : 'none';
    });

    const canvasId = chartName + 'ChartCanvas';
    const chartKey = chartName + 'Chart';

    // 如果该图未渲染，调用渲染函数
    if (!charts[chartKey]) {
      if (chartName === 'degree') {
        const degrees = {};
        cy.nodes().forEach(n => {
          const d = n.degree();
          degrees[d] = (degrees[d] || 0) + 1;
        });
        renderBarChart(canvasId, 'Degree Distribution', degrees, true);
      } else if (chartName === 'cluster') {
        const clusterSizes = {};
        cy.nodes().forEach(n => {
          const c = n.data('cluster');
          if (c !== undefined) {
            clusterSizes[c] = (clusterSizes[c] || 0) + 1;
          }
        });
       renderPieChart(canvasId, 'Cluster Size Distribution', clusterSizes);  // 改这里
      } else if (chartName === 'component') {
        const componentSizes = {};
        const comps = cy.elements().components();
        comps.forEach(comp => {
          const size = comp.nodes().length;
          componentSizes[size] = (componentSizes[size] || 0) + 1;
        });
        renderBarChart(canvasId, 'Component Size Distribution', componentSizes);
      }
    }

  }


  // 打开 modal
  function showStatsModal() {
    document.getElementById("statsModal").style.display = "flex";
    showChart('degree');
  }


  function hideStatsModal() {
    document.getElementById("statsModal").style.display = "none";
  }

  function renderPieChart(canvasId, title, dataObj) {
    const ctx = document.getElementById(canvasId).getContext('2d');

    const labels = Object.keys(dataObj).map(k => `Cluster ${k}`);
    const values = Object.values(dataObj);

    // 自动生成颜色
    const backgroundColors = labels.map((_, i) => `hsl(${i * 360 / labels.length}, 60%, 60%)`);

    // 清理旧图表
    const chartKey = canvasId.replace('Canvas', 'Chart');
    if (charts[chartKey]) charts[chartKey].destroy();

    charts[chartKey] = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          label: title,
          data: values,
          backgroundColor: backgroundColors,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          tooltip: {
            callbacks: {
              label: function (context) {
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const value = context.parsed;
                const percent = ((value / total) * 100).toFixed(1);
                return `${value} (${percent}%)`;
              }
            }
          },
          legend: {
            position: 'right',
          },
          title: {
            display: true,
            text: title
          },
          layout: {
            padding: 20
          }
        }
      }
    });
  }


  function renderBarChart(canvasId, title, dataObj, logLog = false) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const labels = Object.keys(dataObj).sort((a, b) => +a - +b);
    const values = labels.map(k => dataObj[k]);


    let xLabel = 'Value';
    if (title.includes('Degree')) xLabel = logLog ? 'log(Degree)' : 'Degree';
    else if (title.includes('Cluster')) xLabel = 'Cluster ID';
    else if (title.includes('Component')) xLabel = 'Component Size';

    // 清理旧图表
    const chartKey = canvasId.replace('Canvas', 'Chart');
    if (charts[chartKey]) charts[chartKey].destroy();

     // 初始化数据集数组
    const datasets = [{
      label: title,
      data: values,
      backgroundColor: 'rgba(54, 162, 235, 0.6)'
    }];

    // ✅ 拟合线：仅在 log-log 并且是 Degree 时添加
    if (logLog && title === 'Degree Distribution') {
      const { slope, lineData } = computePowerLawFit(dataObj);
      datasets.push({
        type: 'line',
        label: `Power Law Fit (γ ≈ ${slope})`,
        data: lineData,
        borderColor: 'blue',
        borderWidth: 2,
        fill: false,
        pointRadius: 0,
        tension: 0,

      });
    }

    charts[chartKey]  = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        maintainAspectRatio: false,  // 关闭默认比例控制
        scales: {
          x: {
            type: logLog ? 'logarithmic' : 'linear',

            title: { display: true, text: xLabel }

          },
          y: {
            type: logLog ? 'logarithmic' : 'linear',

            title: { display: true, text: logLog ? 'log(Frequency)' : 'Frequency' }
          }
        }
      }
    });
  }


  document.getElementById('downloadBtn').onclick = function () {
    const visibleCanvas = document.querySelector('#statsModalContent canvas:not([style*="display: none"])')

    if (visibleCanvas) {
      const link = document.createElement('a');
      link.download = 'chart.png';
      link.href = visibleCanvas.toDataURL('image/png');
      link.click();
    } else {
      alert('没有可下载的图表');
    }
  };

  function computePowerLawFit(dataObj) {
    const logX = [];
    const logY = [];

    for (let k in dataObj) {
      const x = parseFloat(k);
      const y = dataObj[k];
      if (x > 0 && y > 0) {
        logX.push(Math.log(x));
        logY.push(Math.log(y));
      }
    }

    // 计算线性回归系数
    const n = logX.length;
    const sumX = logX.reduce((a, b) => a + b, 0);
    const sumY = logY.reduce((a, b) => a + b, 0);
    const sumXY = logX.reduce((sum, val, i) => sum + val * logY[i], 0);
    const sumXX = logX.reduce((sum, val) => sum + val * val, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // 构造拟合线数据
    const fitted = logX.map(x => ({
      x: Math.exp(x),
      y: Math.exp(slope * x + intercept)
    }));

    return { slope: -slope.toFixed(3), lineData: fitted };
  }

  // 显示/隐藏窗体
  function showfilterWindow(){
    document.getElementById('filterWindow').classList.toggle('hidden');
  };

  function hidefilterWindow(){
    document.getElementById('filterWindow').classList.add('hidden');
  };

  function makeDraggable(headerSelector, windowSelector) {
    let offsetX = 0, offsetY = 0, dragging = false;
    const header = document.querySelector(headerSelector);
    const win = document.querySelector(windowSelector);

    if (!header || !win) return;

    header.addEventListener('mousedown', (e) => {
      dragging = true;
      offsetX = e.clientX - win.offsetLeft;
      offsetY = e.clientY - win.offsetTop;
    });
    document.addEventListener('mouseup', () => dragging = false);
    document.addEventListener('mousemove', (e) => {
      if (dragging) {
        win.style.left = `${e.clientX - offsetX}px`;
        win.style.top = `${e.clientY - offsetY}px`;
      }
    });
  }
  makeDraggable('#filterWindow .header', '#filterWindow');
  makeDraggable('#pageRankWindow .header', '#pageRankWindow');
  makeDraggable('#clusterAnalysisWindow .header', '#clusterAnalysisWindow');


  function resetFilter() {
    // 恢复初始节点/边可视性
    cy.elements().show();
  };

  function applyNodeFilter() {
    const type = document.getElementById('nodeDegreeType').value;
    const compare = document.getElementById('nodeCompareType').value;
    const threshold = parseFloat(document.getElementById('nodeThreshold').value);

    cy.nodes().forEach(n => {
      let val = 0;
      if (type === 'degree') val = n.degree();
      else if (type === 'indegree') val = n.indegree();
      else if (type === 'outdegree') val = n.outdegree();

      let show = false;
      if (compare === 'gt') show = val > threshold;
      if (compare === 'lt') show = val < threshold;
      if (compare === 'eq') show = val === threshold;

      n.style('display', show ? 'element' : 'none');
    });
  }

  function applyEdgeFilter() {
    const compare = document.getElementById('edgeCompareType').value;
    const threshold = parseFloat(document.getElementById('edgeThreshold').value);

    cy.edges().forEach(e => {
      const weight = e.data('weight') || 1; // 默认边权重为1
      let show = false;

      if (compare === 'gt') show = weight > threshold;
      if (compare === 'lt') show = weight < threshold;
      if (compare === 'eq') show = weight === threshold;

      e.style('display', show ? 'element' : 'none');
    });
  }

  function showPageRankWindow() {
    document.getElementById('pageRankWindow').classList.remove('hidden');
  }

  function hidePageRankWindow() {
    document.getElementById('pageRankWindow').classList.add('hidden');
  }


  let currentSortKey = 'pagerank';
  let currentSortOrder = 'desc';
  let currentMetric = 'pagerank';

  function changeCentralityMetric() {
    currentMetric = document.getElementById("pageRankMetric").value;
    currentSortKey = currentMetric;
    updateMetricHeader();  // 更换表头文字
    renderPageRankTable();
  }

  function updateMetricHeader() {
    const label = {
      pagerank: 'PageRank',
      degree: 'Degree',
      closeness: 'Closeness',
      betweenness: 'Betweenness'
    }[currentMetric];
    document.getElementById("metricHeader").textContent = label;
  }

  function renderPageRankTable() {
    const topN = parseInt(document.getElementById("pageRankTopN").value) || 10;
    const metric = document.getElementById("pageRankMetric").value; // pagerank/degree/closeness/betweenness
    const tbody = document.querySelector("#pageRankTable tbody");
    tbody.innerHTML = "";

    let nodes = cy.nodes().toArray();

    nodes.sort((a, b) => b.data(metric) - a.data(metric));
    const topNodes = nodes.slice(0, topN);

    topNodes.forEach((n, i) => {
      const tr = document.createElement("tr");
      tr.style.cursor = "pointer";
      tr.onclick = () => {
        const neighborhood = n.closedNeighborhood();
        cy.elements().addClass('faded');
        neighborhood.removeClass('faded').addClass('highlighted');
        cy.center(n);
      };

      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${n.data("label")}</td>
        <td>${n.data("cluster")}</td>
        <td>${n.data(metric).toFixed(4)}</td>
      `;
      tbody.appendChild(tr);
    });

    // 更新排序配置
    currentSortKey = metric;
    currentSortOrder = 'desc';

    // 更新表头名称
    const header = document.getElementById("metricHeader");
    if (header) {
      header.textContent = metric.charAt(0).toUpperCase() + metric.slice(1);
      header.setAttribute("onclick", `sortPageRankTable('${metric}')`);
    }
    cy.elements().removeClass('highlighted-center');
    topNodes.forEach(n => n.addClass('highlighted-center'));
  }




  function sortTableByColumn(tableId, key) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    const rows = Array.from(tbody.querySelectorAll("tr"));

    // 不同表格的列位置可能不同，这里统一定义映射
    const keyToIndexMap = {
      'pageRankTable': {
        'rank': 0,
        'label': 1,
        'Cluster': 2,
        'pagerank': 3,
        'degree': 3,
        'closeness': 3,
        'betweenness': 3
      },
      'clusterStatsTable': {
        'cluster_id': 0,
        'node_count': 1,
        'modularity':2,
        'avg_pagerank': 3,
        'avg_closeness': 4,
        'avg_betweenness': 5
      }
    };

    const colIndex = keyToIndexMap[tableId][key];
    if (colIndex === undefined) return;

    // 状态记录（你也可以每个表格各自存一个 currentSortKey）
    if (window.currentSortKey === key) {
      window.currentSortOrder = window.currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      window.currentSortKey = key;
      window.currentSortOrder = 'desc';
    }

    rows.sort((a, b) => {
      const aVal = a.children[colIndex].textContent.trim();
      const bVal = b.children[colIndex].textContent.trim();

      const numA = parseFloat(aVal);
      const numB = parseFloat(bVal);
      const isNumber = !isNaN(numA) && !isNaN(numB);

      if (window.currentSortOrder === 'asc') {
        return isNumber ? numA - numB : aVal.localeCompare(bVal);
      } else {
        return isNumber ? numB - numA : bVal.localeCompare(aVal);
      }
    });

    tbody.innerHTML = "";
    rows.forEach(row => tbody.appendChild(row));
  }

  function showClusterWindow() {
    document.getElementById('clusterAnalysisWindow').classList.remove('hidden');
  }

  function hideClusterWindow() {
    document.getElementById('clusterAnalysisWindow').classList.add('hidden');
  }

 function showClusterAnalysis() {
    const method = document.getElementById("clusterMethodSelect").value;
    if (!method) {
      alert("Please select a clustering method.");
      return;
    }

    if (method === "kmeans") {
      showKMeansModal(); // 只弹窗，不做分析！
      return;
    }

    if (method === "initial") {
      resetToInitialClustering();

    }

    // 非KMeans聚类逻辑
    runClustering(method);
    setTimeout(() => {
      runClusterAnalysis(method); // 延迟执行分析逻辑
    }, 500); // 可按需调整延时
  }


  function runClusterAnalysis(method) {
    const graphData = getGraphJson();
    graphData.method = method;


    fetch('/api/cluster_analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(graphData)
    })
      .then(res => res.json())
      .then(data => {
        renderClusterStats(data, method);
        document.getElementById('clusterAnalysisWindow').classList.remove('hidden');
        renderPageRankTable();
      })
      .catch(err => {
        alert('Cluster Analysis failed: ' + err.message);
      });
  }

  function renderClusterStats(data, methodName = 'Unknown') {

    const tbody = document.querySelector("#clusterStatsTable tbody");
    tbody.innerHTML = "";


    // 统一展示说明信息
    const distEl = document.getElementById("topKClusterInfo");
    distEl.innerHTML = ""; // 防止残留或闪现


    data.cluster_summary.forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.cluster_id}</td>
        <td>${row.node_count}</td>
        <td>${row.avg_pagerank}</td>
        <td>${row.avg_closeness}</td>
        <td>${row.avg_betweenness}</td>
      `;
      tbody.appendChild(tr);
    });



    let infoHTML = "";

    if (data.modularity !== null && data.modularity !== undefined && methodName !== 'unknown') {
      infoHTML += `<b>Modularity:</b> ${data.modularity}<br>`;
    }

    if (methodName === 'kmeans' &&
      data.kmeans_eval &&
      typeof data.kmeans_eval.silhouette === 'number' &&
      typeof data.kmeans_eval.db_index === 'number' &&
      typeof data.kmeans_eval.sse === 'number') {
      infoHTML += `<b>KMeans Evaluation</b>
        <table id="kmeans_eval" style="width: 100%; font-size: 14px; color: black; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid #555;">
              <th style="padding: 6px; cursor: pointer;" >Silhouette ID</th>
              <th style="padding: 6px;">DB Index</th>
              <th style="padding: 6px; cursor: pointer;">SSE</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 6px;">${data.kmeans_eval.silhouette} (${data.kmeans_eval.sil_text})</td>
              <td style="padding: 6px;">${data.kmeans_eval.db_index} (${data.kmeans_eval.db_text})</td>
              <td style="padding: 6px;">${data.kmeans_eval.sse}</td>
            </tr>
          </tbody>
        </table>`
    }


    if (data.evaluation_msg) {
      infoHTML += `<i>${data.evaluation_msg}</i><br>`;
    }

    infoHTML += "<b>Top-10 PageRank Cluster Distribution</b><ul>" +
      Object.entries(data.top_k_distribution)
        .map(([cid, count]) => `<li>Cluster ${cid}: ${count} nodes</li>`)
        .join("") +
      "</ul>";

    distEl.innerHTML = infoHTML;
  }
