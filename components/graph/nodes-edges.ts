
import * as ko from 'knockout';
import * as moment from 'moment';
const GitNodeViewModel = require('./git-node');
const EdgeViewModel = require('./edge');

export class NodesEdges {
  graph: any
  _latestNodeVersion = Date.now();
  _markIdeologicalStamp = 0
  nodes = ko.observableArray<any>().extend({ rateLimit: 500 });
  edges = ko.observableArray<any>().extend({ rateLimit: 500 });
  nodesById: Record<string, any> = {}
  edgesById: Record<string, any> = {}
  heighstBranchOrder = 0

  constructor(graph: any) {
    this.graph = graph
  }

  processGitLog(log: any) {
    const edges = [];

    const nodes = this._computeNode(
      (log.nodes || []).map((logEntry) => {
        const node = this.getNode(logEntry.sha1); // convert to node object
        if (!node.isInited) {
          node.setData(logEntry);
        }
        node.version = this._latestNodeVersion;
        return node;
      })
    );

    // create edges
    nodes.forEach((node) => {
      node.parents().forEach((parentSha1) => {
        edges.push(this.getEdge(node.sha1, parentSha1));
      });
      node.render();
    });

    this.nodes(nodes);
    this.edges(edges);
  }

  getNode(sha1: string): any {
    let nodeViewModel = this.nodesById[sha1];
    if (!nodeViewModel) nodeViewModel = this.nodesById[sha1] = new GitNodeViewModel(this, sha1);
    return nodeViewModel;
  }

  _computeNode(nodes: any[] = this.nodes()) {
    this._markNodesIdeologicalBranches(this.graph.refs());

    const updateTimeStamp = moment().valueOf();
    if (this.graph.HEAD()) {
      this._traverseNodeLeftParents(this.graph.HEAD(), (node) => {
        node.ancestorOfHEADTimeStamp = updateTimeStamp;
      });
    }

    // Filter out nodes which doesn't have a branch (staging and orphaned nodes)
    nodes = nodes.filter(
      (node) =>
        (node.ideologicalBranch() && !node.ideologicalBranch().isStash) ||
        node.ancestorOfHEADTimeStamp == updateTimeStamp
    );

    let branchSlotCounter = this.graph.HEAD() ? 1 : 0;

    // Then iterate from the bottom to fix the orders of the branches
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (node.ancestorOfHEADTimeStamp == updateTimeStamp) continue;
      const ideologicalBranch = node.ideologicalBranch();

      // First occurrence of the branch, find an empty slot for the branch
      if (ideologicalBranch.lastSlottedTimeStamp != updateTimeStamp) {
        ideologicalBranch.lastSlottedTimeStamp = updateTimeStamp;
        ideologicalBranch.branchOrder = branchSlotCounter++;
      }

      node.branchOrder(ideologicalBranch.branchOrder);
    }

    this.heighstBranchOrder = branchSlotCounter - 1;
    let prevNode: any;
    nodes.forEach((node) => {
      node.ancestorOfHEAD(node.ancestorOfHEADTimeStamp == updateTimeStamp);
      if (node.ancestorOfHEAD()) node.branchOrder(0);
      node.aboveNode = prevNode;
      if (prevNode) prevNode.belowNode = node;
      prevNode = node;
    });

    return nodes;
  }

  _markNodesIdeologicalBranches(refs) {
    refs = refs.filter((r) => !!r.node());
    refs = refs.sort((a, b) => {
      if (a.isLocal && !b.isLocal) return -1;
      if (b.isLocal && !a.isLocal) return 1;
      if (a.isBranch && !b.isBranch) return -1;
      if (b.isBranch && !a.isBranch) return 1;
      if (a.isHEAD && !b.isHEAD) return 1;
      if (!a.isHEAD && b.isHEAD) return -1;
      if (a.isStash && !b.isStash) return 1;
      if (b.isStash && !a.isStash) return -1;
      if (a.node() && a.node().date && b.node() && b.node().date)
        return a.node().date - b.node().date;
      return a.refName < b.refName ? -1 : 1;
    });
    const stamp = this._markIdeologicalStamp++;
    refs.forEach((ref) => {
      this._traverseNodeParents(ref.node(), (node) => {
        if (node.stamp == stamp) return false;
        node.stamp = stamp;
        node.ideologicalBranch(ref);
        return true;
      });
    });
  }

  _traverseNodeParents(node, callback) {
    if (!callback(node)) return false;
    for (let i = 0; i < node.parents().length; i++) {
      // if parent, travers parent
      const parent = this.nodesById[node.parents()[i]];
      if (parent) {
        this._traverseNodeParents(parent, callback);
      }
    }
  }

  _traverseNodeLeftParents(node, callback) {
    callback(node);
    const parent = this.nodesById[node.parents()[0]];
    if (parent) {
      this._traverseNodeLeftParents(parent, callback);
    }
  }

  getEdge(nodeAsha1, nodeBsha1) {
    const id = `${nodeAsha1}-${nodeBsha1}`;
    let edge = this.edgesById[id];
    if (!edge) {
      edge = this.edgesById[id] = new EdgeViewModel(this.graph, nodeAsha1, nodeBsha1);
    }
    return edge;
  }

}