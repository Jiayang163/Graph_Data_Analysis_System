from flask import Flask, request, jsonify, send_from_directory, render_template, session, redirect, url_for, send_file
import os
import random
import networkx as nx
import io
import json
from sklearn.cluster import KMeans
import numpy as np
import time
import community.community_louvain as community
from flask_mysqldb import MySQL
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from MySQLdb.cursors import DictCursor
from sklearn.metrics import silhouette_score, davies_bouldin_score
from node2vec import Node2Vec
app = Flask(__name__)
CORS(app)
bcrypt = Bcrypt(app)

# 配置数据库
app.config['MYSQL_HOST'] = 'localhost'
app.config['MYSQL_USER'] = 'root'
app.config['MYSQL_PASSWORD'] = '123456'
app.config['MYSQL_DB'] = 'flask'
mysql = MySQL(app)

app.secret_key = 'a9f3b5c8e4d12f34567a8d9c0fab1234'

# 注册
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username, email, password, repassword = data['username'], data['email'], data['password'], data['repassword']
    cursor = mysql.connection.cursor()
    cursor.execute("SELECT * FROM users WHERE username=%s OR email=%s", (username, email))
    if cursor.fetchone():
        return jsonify({'status': 'fail', 'message': 'User already exists'})
    if password == repassword:
        hashed = bcrypt.generate_password_hash(password).decode('utf-8')
        cursor.execute("INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s)",
                       (username, email, hashed))
        mysql.connection.commit()
    return jsonify({'status': 'success', 'message': 'Registered successfully'})

# 登录
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username, password = data['username'], data['password']
    cursor = mysql.connection.cursor()
    cursor.execute("SELECT password_hash FROM users WHERE username=%s", (username,))
    user = cursor.fetchone()
    if not user or not bcrypt.check_password_hash(user[0], password):
        return jsonify({'status': 'fail', 'message': 'Invalid credentials'})
    session['username'] = username  # 存储到 session
    return jsonify({'status': 'success', 'message': 'Logged in successfully'})


@app.route('/api/save_record', methods=['POST'])
def save_record():
    if 'username' not in session:
        return jsonify({'status': 'not_logged_in', 'message': 'Please log in first and then save the image.'})

    data = request.json
    username = session['username']
    title = data.get('name')
    graph_json = data.get('graph')

    cursor = mysql.connection.cursor()

    # 1. 查 user_id
    cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
    user = cursor.fetchone()
    if not user:
        return jsonify({'status': 'fail', 'message': 'User does not exist'})

    user_id = user[0]

    # 2. 查重
    cursor.execute("SELECT id FROM graph_records WHERE user_id = %s AND title = %s", (user_id, title))
    if cursor.fetchone():
        return jsonify({'status': 'fail', 'message': '该名称已存在，请换一个'})

    # 3. 插入
    cursor.execute(
        "INSERT INTO graph_records (user_id, title, graph_json) VALUES (%s, %s, %s)",
        (user_id, title, json.dumps(graph_json))
    )
    mysql.connection.commit()

    # print('Received title:', title)
    # print('Received graph_json:', graph_json)

    return jsonify({'status': 'success', 'message': 'Saved successfully'})


@app.route('/api/get_records')
def get_records():
    if 'username' not in session:
        return jsonify({'status': 'fail', 'records': []})

    username = session['username']
    cursor = mysql.connection.cursor()
    cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
    user = cursor.fetchone()
    if not user:
        return jsonify({'status': 'fail', 'records': []})

    user_id = user[0]
    cursor.execute("SELECT id, title, created_at FROM graph_records WHERE user_id = %s", (user_id,))
    records = cursor.fetchall()
    return jsonify({'status': 'success', 'records': [
        {'id': r[0], 'title': r[1], 'created_at': str(r[2])} for r in records
    ]})


@app.route('/api/get_record/<int:record_id>')
def get_record(record_id):
    if 'username' not in session:
        return jsonify({'status': 'fail', 'message': '请先登录'})

    cursor = mysql.connection.cursor()
    cursor.execute(
        "SELECT graph_json FROM graph_records WHERE id = %s",
        (record_id,)
    )
    result = cursor.fetchone()

    if result:
        try:
            graph = json.loads(result[0])
            # print("获取图数据：", result[0])  #  debug 打印
            return jsonify({'status': 'success', 'graph': graph})
        except Exception as e:
            return jsonify({'status': 'fail', 'message': f'Failed to load the graph data.: {e}'})
    return jsonify({'status': 'fail', 'message': 'The record does not exist.'})



@app.route('/api/delete_record/<int:record_id>', methods=['DELETE'])
def delete_record(record_id):
    if 'username' not in session:
        return jsonify({'status': 'fail', 'message': 'Not logged in'})
    cursor = mysql.connection.cursor()
    cursor.execute("DELETE FROM graph_records WHERE id = %s", (record_id,))
    mysql.connection.commit()

    return jsonify({'status': 'success'})



@app.route('/')
def index():
    username = session.get('username')
    return render_template('index.html', username=username)

@app.route('/login', methods=['GET'])
def login_page():
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('username', None)
    return redirect(url_for('index'))



@app.route("/cluster/louvain", methods=["POST"])
def louvain_api():
    data = request.json
    G = nx.Graph()
    for node in data["nodes"]:
        G.add_node(node["id"])
    for edge in data["edges"]:
        G.add_edge(edge["source"], edge["target"])

    partition = community.best_partition(G)
    print('Running')
    return jsonify(partition)  # 返回 {node_id: cluster_id}


@app.route('/cluster/kmeans', methods=['POST'])
def kmeans_cluster():
    data = request.json
    nodes = data['nodes']
    edges = data['edges']
    k = data.get('k')
    n_init = data.get('n_init')

    print('kmeans 参数:', k, n_init)

    # === 构建图 G ===
    G = nx.Graph()
    for node in nodes:
        G.add_node(node['id'])
    for edge in edges:
        G.add_edge(edge['source'], edge['target'])

    node2vec = Node2Vec(G, dimensions=64, walk_length=30, num_walks=100, workers=1, seed=np.random.randint(10000))
    model = node2vec.fit(window=5, min_count=1)

    X = np.array([model.wv[str(n['id'])] for n in nodes])
    kmeans = KMeans(n_clusters=k, n_init=n_init, random_state=42).fit(X)

    # positions = np.array([[n['x'], n['y']] for n in nodes])
    # kmeans = KMeans(n_clusters=k, n_init=n_init, random_state=0).fit(positions)
    labels = kmeans.labels_

    # 聚类结果
    cluster_map = {nodes[i]['id']: int(labels[i]) for i in range(len(nodes))}

    # 内部评估指标
    sse = float(round(kmeans.inertia_, 2))
    silhouette = float(round(silhouette_score(X, labels), 4))
    db_index = float(round(davies_bouldin_score(X, labels), 4))

    return jsonify({
        "clusters": cluster_map,
        "kmeans_eval": {
            "sse": sse,
            "silhouette": silhouette,
            "db_index": db_index
        }
    })


@app.route("/cluster/chinese_whispers", methods=["POST"])
def chinese_whispers_api():
    data = request.json
    G = nx.Graph()
    for node in data["nodes"]:
        G.add_node(node["id"], label=node["id"])
    for edge in data["edges"]:
        G.add_edge(edge["source"], edge["target"])

    # 初始化标签
    for node in G.nodes():
        G.nodes[node]["label"] = node

    for _ in range(20):  # 迭代次数
        nodes = list(G.nodes())
        random.shuffle(nodes)
        for node in nodes:
            labels = [G.nodes[neighbor]["label"] for neighbor in G.neighbors(node)]
            if labels:
                G.nodes[node]["label"] = max(set(labels), key=labels.count)

    result = {}
    label_map = {}
    label_id = 0
    for node in G.nodes():
        label = G.nodes[node]["label"]
        if label not in label_map:
            label_map[label] = label_id
            label_id += 1
        result[node] = label_map[label]

    return jsonify(result)







def interpret_kmeans_eval(kmeans_eval):
    silhouette = kmeans_eval.get("silhouette", 0)
    db_index = kmeans_eval.get("db_index", 0)
    sse = kmeans_eval.get("sse", 0)

    if silhouette > 0.5:
        sil_text = "Good"
    elif silhouette > 0.25:
        sil_text = "Moderate"
    else:
        sil_text = "Poor"

    if db_index < 1:
        db_text = "Good"
    elif db_index < 2:
        db_text = "Acceptable"
    else:
        db_text = "Poor"

    # print("testtest", round(silhouette, 4), round(db_index, 4),round(sse, 2))


    return {
        "silhouette": round(silhouette, 4),
        "sil_text": sil_text,
        "db_index": round(db_index, 4),
        "db_text": db_text,
        "sse": round(sse, 2)
    }


@app.route('/api/cluster_analysis', methods=['POST'])
def cluster_analysis():
    from collections import defaultdict
    from networkx.algorithms.community.quality import modularity

    data = request.get_json()
    nodes = data.get("nodes", [])
    edges = data.get("links", [])
    algorithm = data.get("method", "").lower()

    if not nodes or not edges:
        return jsonify({"error": "Empty graph data"}), 400

    # 构建图
    G = nx.Graph()
    # 构建图：使用前端传入的值
    for n in nodes:
        G.add_node(n["id"],
                   cluster=n.get("cluster"),
                   pagerank=n.get("pagerank", 0),
                   closeness=n.get("closeness", 0),
                   betweenness=n.get("betweenness", 0))

    for e in edges:
        G.add_edge(e["source"], e["target"])

    # 聚类信息
    cluster_nodes = defaultdict(list)
    for nid, attr in G.nodes(data=True):
        cid = attr.get("cluster")
        if cid is not None:
            cluster_nodes[cid].append(nid)

    results = []
    for cid, members in cluster_nodes.items():
        avg_pr = sum(G.nodes[n]["pagerank"] for n in members) / len(members)
        avg_close = sum(G.nodes[n]["closeness"] for n in members) / len(members)
        avg_between = sum(G.nodes[n]["betweenness"] for n in members) / len(members)
        results.append({
            "cluster_id": cid,
            "node_count": len(members),
            "avg_pagerank": round(avg_pr, 4),
            "avg_closeness": round(avg_close, 4),
            "avg_betweenness": round(avg_between, 4)
        })

    # modularity（仅结构型算法）
    modularity_score = None
    if algorithm in ["louvain", "chinese_whispers"]:
        communities = [set(members) for members in cluster_nodes.values()]
        modularity_score = round(modularity(G, communities), 4)



    # Top-K 节点的聚类分布（PageRank）
    top_k = 10
    sorted_by_pr = sorted(G.nodes(data=True), key=lambda x: x[1]["pagerank"], reverse=True)[:top_k]
    cluster_distribution = defaultdict(int)
    for n, attr in sorted_by_pr:
        cid = attr.get("cluster")
        cluster_distribution[cid] += 1

    # 自动评价信息
    kmeans_eval = data.get("kmeans_eval", None)
    evaluation_msg = None

    # print("前端传进来的结果",kmeans_eval)

    eval_details = {}

    if algorithm == "louvain" and modularity_score:
        if modularity_score > 0.4:
            evaluation_msg = f"Louvain shows strong community structure (modularity = {modularity_score})."
        else:
            evaluation_msg = f"Louvain's modularity ({modularity_score}) indicates weak structure."
    elif algorithm == "chinese_whispers" and modularity_score:
        if modularity_score > 0.4:
            evaluation_msg = f"Chinese Whispers shows strong community structure (modularity = {modularity_score})."
        else:
            evaluation_msg = f"Chinese Whispers's modularity ({modularity_score}) indicates weak structure."
    elif algorithm == "kmeans" and kmeans_eval:
        eval_details = interpret_kmeans_eval(kmeans_eval)
        evaluation_msg = (
            f"KMeans Internal Evaluation → Silhouette: {eval_details['silhouette']} ({eval_details['sil_text']}), "
            f"DB Index: {eval_details['db_index']} ({eval_details['db_text']}), SSE: {eval_details['sse']}"
        )

    return jsonify({
        "method": algorithm,
        "cluster_summary": results,
        "top_k_distribution": dict(cluster_distribution),
        "modularity": modularity_score,
        'kmeans_eval': eval_details,
        "evaluation_msg": evaluation_msg
    })




@app.route('/api/get_templates', methods=['GET'])
def get_templates():
    cursor = mysql.connection.cursor(DictCursor)  # 用 DictCursor 返回字典列表
    cursor.execute("SELECT id, name, node_count, edge_count, description FROM graph_templates")
    records = cursor.fetchall()
    cursor.close()
    return jsonify(records)


@app.route('/api/get_templates_by_name/<string:name>')
def get_graph(name):
    cursor = mysql.connection.cursor()
    cursor.execute("SELECT graph_json FROM graph_templates WHERE name = %s", (name,))
    row = cursor.fetchone()
    cursor.close()
    if row:
        import json
        return jsonify(json.loads(row[0]))  # 转换为字典返回
    else:
        return jsonify({"error": "Not found"}), 404


@app.route('/export', methods=['POST'])
def export_graph():
    data = request.get_json()

    # 将数据写入内存中的 BytesIO
    json_str = json.dumps(data, indent=2)
    buffer = io.BytesIO()
    buffer.write(json_str.encode('utf-8'))
    buffer.seek(0)

    return send_file(
        buffer,
        as_attachment=True,
        download_name='graph_data.json',
        mimetype='application/json'
    )


if __name__ == '__main__':
    app.run(debug=True)
