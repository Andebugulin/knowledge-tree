"use client";

import { trpc } from "@/lib/trpc";
import { useState, useEffect, useRef } from "react";
import { signOut, useSession } from "next-auth/react";
import dynamic from "next/dynamic";

const GraphView = dynamic(() => import("@/components/GraphView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#0A0A0F] text-gray-500">
      Loading...
    </div>
  ),
});

type Node = {
  id: string;
  title: string;
  content: string;
  edgesFrom: Array<{
    id: string;
    type: string;
    fromNodeId: string;
    toNodeId: string;
  }>;
  edgesTo: Array<{
    id: string;
    type: string;
    fromNodeId: string;
    toNodeId: string;
  }>;
  createdAt: Date;
};

export default function Dashboard() {
  const { data: session } = useSession();

  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });

  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const [showCreatePopup, setShowCreatePopup] = useState(false);
  const [createPosition, setCreatePosition] = useState({ x: 0, y: 0 });
  const createPopupRef = useRef<HTMLDivElement>(null);

  const [isLinkMode, setIsLinkMode] = useState(false);
  const [linkTypeSelection, setLinkTypeSelection] = useState<
    "parent" | "child" | "reference" | "example" | "contradiction"
  >("parent");
  const [pendingLinkTarget, setPendingLinkTarget] = useState<string | null>(
    null
  );

  const [sidebarPosition, setSidebarPosition] = useState<"left" | "right">(
    "left"
  );
  const [legendOpen, setLegendOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Node[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const utils = trpc.useUtils();
  const { data: nodes, isLoading } = trpc.node.getAll.useQuery();

  const createNode = trpc.node.create.useMutation({
    onSuccess: (newNode) => {
      setTitle("");
      setContent("");
      setShowCreatePopup(false);
      setIsLinkMode(false);
      setPendingLinkTarget(null);
      setLinkTypeSelection("parent");

      setTimeout(() => {
        utils.node.getAll.invalidate();
        setEditNodeId(newNode.id);
        setEditTitle(newNode.title);
        setEditContent(newNode.content);
      }, 150);
    },
  });

  const updateNode = trpc.node.update.useMutation({
    onSuccess: () => {
      setTimeout(() => {
        utils.node.getAll.invalidate();
      }, 50);
    },
  });

  const deleteNode = trpc.node.delete.useMutation({
    onSuccess: () => {
      utils.node.getAll.invalidate();
      setEditNodeId(null);
      setIsLinkMode(false);
    },
  });

  const createEdge = trpc.edge.create.useMutation({
    onSuccess: () => {
      // Add delay to prevent rapid re-renders, NOTE: best practice for smoother experience!
      setTimeout(() => {
        utils.node.getAll.invalidate();
      }, 50);
      setPendingLinkTarget(null);
      setLinkTypeSelection("parent");
    },
  });

  const deleteEdge = trpc.edge.delete.useMutation({
    onSuccess: () => {
      setTimeout(() => {
        utils.node.getAll.invalidate();
      }, 50);
    },
  });

  const handleNodeHover = (nodeId: string | null, x: number, y: number) => {
    setHoverNodeId(nodeId);
    setHoverPosition({ x, y });
  };

  const handleNodeClick = (nodeId: string, x: number, y: number) => {
    const node = nodes?.find((n) => n.id === nodeId);
    if (!node) return;

    if (isLinkMode && editNodeId) {
      // In link mode, clicking selects target
      if (nodeId !== editNodeId) {
        setPendingLinkTarget(nodeId);
      }
    } else {
      // In edit mode, clicking opens node for editing
      setEditNodeId(nodeId);
      setEditTitle(node.title);
      setEditContent(node.content);
      setHoverNodeId(null);
      setPendingLinkTarget(null);
    }
  };

  const handleEmptyDoubleClick = (x: number, y: number) => {
    setShowCreatePopup(true);
    setCreatePosition({ x, y });
    setEditNodeId(null);
    setHoverNodeId(null);
    setIsLinkMode(false);
  };

  const handleUpdate = () => {
    if (!editNodeId || !editTitle.trim()) return;
    updateNode.mutate({
      id: editNodeId,
      title: editTitle,
      content: editContent,
    });
  };

  const handleLinkTargetClick = (targetNodeId: string) => {
    if (!isLinkMode || !editNodeId) return;
    if (targetNodeId === editNodeId) return;
    setPendingLinkTarget(targetNodeId);
  };

  const validateLinkCreation = () => {
    // REVIEW: not needed anymore, done with ANOTHER FUNCTION!
    if (!editNode || !nodes) return false;

    // Rule 1: Parent/Child - Node can only have ONE parent
    if (
      (linkTypeSelection === "parent" || linkTypeSelection === "child") &&
      editNode.edgesTo.length > 0
    ) {
      alert("This node already has a parent. A node can only have one parent.");
      return false;
    }

    // Rule 2: Example/Contradiction nodes cannot have parents or children
    if (
      linkTypeSelection === "example" ||
      linkTypeSelection === "contradiction"
    ) {
      const targetNode = nodes.find((n) => n.id === pendingLinkTarget);

      if (
        targetNode &&
        (targetNode.edgesFrom.length > 0 || targetNode.edgesTo.length > 0)
      ) {
        alert(
          "Example and Contradiction nodes cannot have parent/child relationships."
        );
        return false;
      }
    }

    // Rule 3: Prevent circular relationships for parent/child
    if (linkTypeSelection === "parent" || linkTypeSelection === "child") {
      if (
        editNodeId &&
        pendingLinkTarget &&
        wouldCreateCircle(editNodeId, pendingLinkTarget, nodes)
      ) {
        alert("This would create a circular relationship. Not allowed.");
        return false;
      }
    }

    return true;
  };

  function wouldCreateCircle(
    fromId: string,
    toId: string,
    nodes: Node[]
  ): boolean {
    const visited = new Set<string>();

    const traverse = (nodeId: string): boolean => {
      if (visited.has(nodeId)) return false;
      if (nodeId === fromId) return true;

      visited.add(nodeId);
      const node = nodes.find((n) => n.id === nodeId);

      if (node) {
        // Check all nodes that point TO this node (parents)
        for (const edge of node.edgesTo) {
          if (traverse(edge.fromNodeId)) return true;
        }
      }
      return false;
    };

    return traverse(toId);
  }

  const confirmLinkCreation = () => {
    if (!editNodeId || !pendingLinkTarget) return;

    const sourceNode = nodes?.find((n) => n.id === editNodeId);
    const targetNode = nodes?.find((n) => n.id === pendingLinkTarget);

    if (!sourceNode || !targetNode) return;

    //  Check if either node is already a special node
    const sourceIsSpecial = sourceNode.edgesTo.some(
      (e) =>
        e.type === "reference" ||
        e.type === "example" ||
        e.type === "contradiction"
    );
    const targetIsSpecial = targetNode.edgesTo.some(
      (e) =>
        e.type === "reference" ||
        e.type === "example" ||
        e.type === "contradiction"
    );

    if (sourceIsSpecial) {
      alert(
        "This node is already a reference/example/contradiction node and cannot have additional connections."
      );
      setPendingLinkTarget(null);
      return;
    }

    if (targetIsSpecial) {
      alert(
        "Target node is already a reference/example/contradiction node and cannot have additional connections."
      );
      setPendingLinkTarget(null);
      return;
    }

    // Check if nodes are isolated (no parent/child connections)
    const isSourceIsolated =
      sourceNode.edgesFrom.filter((e) => e.type === "parent").length === 0 &&
      sourceNode.edgesTo.filter((e) => e.type === "parent").length === 0;

    const isTargetIsolated =
      targetNode.edgesFrom.filter((e) => e.type === "parent").length === 0 &&
      targetNode.edgesTo.filter((e) => e.type === "parent").length === 0;

    let fromNode = editNodeId;
    let toNode = pendingLinkTarget;
    let edgeType: "parent" | "reference" | "example" | "contradiction" =
      "reference";

    // Handle parent/child relationships
    if (linkTypeSelection === "parent" || linkTypeSelection === "child") {
      // Check if target already has a parent
      const nodeToCheckForParent =
        linkTypeSelection === "parent" ? sourceNode : targetNode;

      if (nodeToCheckForParent.edgesTo.some((e) => e.type === "parent")) {
        alert(
          "This node already has a parent. A node can only have one parent."
        );
        setPendingLinkTarget(null);
        return;
      }

      if (linkTypeSelection === "parent") {
        [fromNode, toNode] = [toNode, fromNode]; // Reverse direction
      }
      edgeType = "parent";
    }
    // Handle special relationships (reference, example, contradiction) REVIEW: if in the future more connections are made
    else if (
      linkTypeSelection === "reference" ||
      linkTypeSelection === "example" ||
      linkTypeSelection === "contradiction"
    ) {
      // At least one node must be isolated
      if (!isSourceIsolated && !isTargetIsolated) {
        alert(
          `Cannot create ${linkTypeSelection} link: At least one node must be isolated (no parent/child relationships).`
        );
        setPendingLinkTarget(null);
        return;
      }

      // This makes the isolated node appear as edgesTo, which is what the graph layout expects
      if (isSourceIsolated && !isTargetIsolated) {
        // Source is isolated, target is hierarchy
        // We want: hierarchy -> isolated, so reverse
        [fromNode, toNode] = [toNode, fromNode];
      } else if (!isSourceIsolated && isTargetIsolated) {
        // Target is isolated, source is hierarchy
        // We want: hierarchy -> isolated, keep as is
        // fromNode stays as editNodeId (hierarchy)
        // toNode stays as pendingLinkTarget (isolated)
      }
      // If both are isolated, keep original direction
      // NOTE: done in order to simplify linking node from the edge with many connections to the isolated one, or vise versa!

      edgeType = linkTypeSelection as "reference" | "example" | "contradiction";
    }

    // Clear state before mutation
    setPendingLinkTarget(null);
    setLinkTypeSelection("parent");

    createEdge.mutate({
      fromNodeId: fromNode,
      toNodeId: toNode,
      type: edgeType,
    });
  };

  const getNodeTitle = (nodeId: string) => {
    return nodes?.find((n) => n.id === nodeId)?.title || "Unknown";
  };

  const hoverNode = hoverNodeId
    ? nodes?.find((n) => n.id === hoverNodeId)
    : null;
  const editNode = editNodeId ? nodes?.find((n) => n.id === editNodeId) : null;

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isLinkMode) {
          setIsLinkMode(false);
          setPendingLinkTarget(null);
        } else {
          setEditNodeId(null);
          setShowCreatePopup(false);
          setHoverNodeId(null);
          setShowSearchResults(false);
        }
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isLinkMode]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as HTMLElement)
      ) {
        setShowSearchResults(false);
      }
    };

    if (showSearchResults) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showSearchResults]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        createPopupRef.current &&
        !createPopupRef.current.contains(event.target as HTMLElement)
      ) {
        setShowCreatePopup(false);
        setTitle("");
        setContent("");
      }
    };

    if (showCreatePopup) {
      const timer = setTimeout(() => {
        document.addEventListener("mousedown", handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timer);
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showCreatePopup]);

  const renderMarkdown = (text: string) => {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("### "))
        return (
          <h3 key={i} className="text-base font-semibold text-white mt-3 mb-1">
            {line.slice(4)}
          </h3>
        );
      if (line.startsWith("## "))
        return (
          <h2 key={i} className="text-lg font-semibold text-white mt-4 mb-2">
            {line.slice(3)}
          </h2>
        );
      if (line.startsWith("# "))
        return (
          <h1 key={i} className="text-xl font-bold text-white mt-4 mb-2">
            {line.slice(2)}
          </h1>
        );
      if (line.trim().startsWith("- ") || line.trim().startsWith("* "))
        return (
          <li key={i} className="ml-4 text-gray-400">
            {line.trim().slice(2)}
          </li>
        );
      if (line.includes("**")) {
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <p key={i} className="text-gray-400 leading-relaxed">
            {parts.map((part, j) =>
              j % 2 === 1 ? (
                <strong key={j} className="text-white font-semibold">
                  {part}
                </strong>
              ) : (
                part
              )
            )}
          </p>
        );
      }
      if (line.includes("`")) {
        const parts = line.split("`");
        return (
          <p key={i} className="text-gray-400 leading-relaxed">
            {parts.map((part, j) =>
              j % 2 === 1 ? (
                <code
                  key={j}
                  className="bg-[#1A1A24] px-1.5 py-0.5 rounded text-sm text-[#FF204E]"
                >
                  {part}
                </code>
              ) : (
                part
              )
            )}
          </p>
        );
      }
      if (line.trim() === "") return <br key={i} />;
      return (
        <p key={i} className="text-gray-400 leading-relaxed">
          {line}
        </p>
      );
    });
  };

  const getPopupAnchorPosition = (
    x: number,
    y: number,
    popupWidth: number,
    popupHeight: number
  ) => {
    const margin = 16;
    const sideOffsetRight = 30;
    const sideOffsetLeft = -5;

    const placeRight =
      x + sideOffsetRight + popupWidth < window.innerWidth - margin;
    const left = placeRight
      ? x + sideOffsetRight
      : x - popupWidth - sideOffsetLeft;

    const hasSpaceBelow = y + 28 + popupHeight < window.innerHeight - margin;
    const top = hasSpaceBelow ? y + 28 : y - popupHeight - 28;

    return {
      left: Math.max(
        margin,
        Math.min(left, window.innerWidth - popupWidth - margin)
      ),
      top: Math.max(margin, top),
    };
  };

  const hoverPreviewPos =
    hoverNode && hoverPosition
      ? getPopupAnchorPosition(
          hoverPosition.x +
            (editNode && sidebarPosition === "left" ? 580 : -20),
          hoverPosition.y,
          420,
          250
        )
      : null;

  const createPopupPos = showCreatePopup // REVIEW: not needed anymore
    ? getPopupAnchorPosition(createPosition.x, createPosition.y, 500, 320)
    : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="text-gray-500 text-base">Loading...</div>
      </div>
    );
  }

  const sidebarWidth = "w-[600px]";

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0F]">
      <div className="bg-[#12121A] border-b border-[#1A1A24] flex-shrink-0">
        <div className="px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-light text-white tracking-wide">
              Knowledge Tree
            </h1>
            <div className="text-sm text-gray-500 font-light">
              {nodes?.length || 0} nodes
            </div>
            <button
              onClick={() => {
                setShowCreatePopup(true);
                setEditNodeId(null);
                setHoverNodeId(null);
                setIsLinkMode(false);
                setSidebarPosition("left");
              }}
              className="flex items-center gap-2 px-4 py-2 bg-[#5D0E41] hover:bg-[#A0153E] text-white rounded-lg transition-all duration-200 text-sm font-medium shadow-md hover:shadow-lg"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span>New Node</span>
            </button>
            <div className="relative" ref={searchRef}>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    const newQuery = e.target.value;
                    setSearchQuery(newQuery);

                    if (!newQuery.trim()) {
                      setSearchResults([]);
                      setShowSearchResults(false);
                      return;
                    }

                    const query = newQuery.toLowerCase();
                    const results = (nodes || []).filter(
                      (node) =>
                        node.title.toLowerCase().includes(query) ||
                        node.content.toLowerCase().includes(query)
                    );
                    setSearchResults(results);
                    setShowSearchResults(true);
                  }}
                  onFocus={() => searchQuery && setShowSearchResults(true)}
                  placeholder="Search nodes..."
                  className="w-96 px-4 py-2 pl-10 bg-[#0A0A0F] border border-[#1A1A24] rounded-md text-white text-sm placeholder-gray-600 focus:border-[#5D0E41] focus:ring-1 focus:ring-[#5D0E41] focus:outline-none transition-all duration-200"
                />
                <svg
                  className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 transform -translate-y-1/2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>

              {showSearchResults && searchResults.length > 0 && (
                <div className="absolute top-full mt-2 w-full bg-[#12121A] border border-[#1A1A24] rounded-lg shadow-2xl max-h-96 overflow-y-auto z-50 custom-scrollbar">
                  {searchResults.map((node) => {
                    // Determine node type and color
                    const isSpecial = node.edgesTo.some(
                      (e) =>
                        e.type === "reference" ||
                        e.type === "example" ||
                        e.type === "contradiction"
                    );
                    const specialEdge = node.edgesTo.find(
                      (e) =>
                        e.type === "reference" ||
                        e.type === "example" ||
                        e.type === "contradiction"
                    );

                    let nodeColor = "#5D0E41";
                    let nodeType = "Node";
                    if (isSpecial && specialEdge) {
                      if (specialEdge.type === "example") {
                        nodeColor = "#00D9FF";
                        nodeType = "Example";
                      } else if (specialEdge.type === "contradiction") {
                        nodeColor = "#FFB800";
                        nodeType = "Contradiction";
                      } else if (specialEdge.type === "reference") {
                        nodeColor = "#64F991";
                        nodeType = "Reference";
                      }
                    } else {
                      const connections =
                        node.edgesFrom.filter((e) => e.type === "parent")
                          .length +
                        node.edgesTo.filter((e) => e.type === "parent").length;
                      if (connections > 5) nodeColor = "#FF204E";
                      else if (connections > 2) nodeColor = "#A0153E";
                    }

                    // Get related special nodes
                    const relatedSpecialNodes = node.edgesFrom
                      .filter(
                        (e) =>
                          e.type === "reference" ||
                          e.type === "example" ||
                          e.type === "contradiction"
                      )
                      .map((e) => {
                        const relatedNode = nodes?.find(
                          (n) => n.id === e.toNodeId
                        );
                        return { node: relatedNode, type: e.type };
                      })
                      .filter((item) => item.node);

                    return (
                      <div
                        key={node.id}
                        className="border-b border-[#1A1A24] last:border-b-0"
                      >
                        <button
                          onClick={() => {
                            handleNodeClick(
                              node.id,
                              window.innerWidth / 2,
                              window.innerHeight / 2
                            );
                            setSearchQuery("");
                            setShowSearchResults(false);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-[#1A1A24] transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: nodeColor }}
                            ></div>
                            <div className="font-medium text-white text-sm truncate flex-1">
                              {node.title}
                            </div>
                            <span
                              className="text-xs px-2 py-0.5 rounded"
                              style={{
                                backgroundColor: `${nodeColor}20`,
                                color: nodeColor,
                              }}
                            >
                              {nodeType}
                            </span>
                          </div>
                          {node.content && (
                            <div className="text-xs text-gray-500 mt-1 ml-4 truncate">
                              {node.content.slice(0, 80)}...
                            </div>
                          )}
                        </button>

                        {/* Show related special nodes */}
                        {relatedSpecialNodes.length > 0 && (
                          <div className="px-4 pb-3 ml-4 space-y-1">
                            {relatedSpecialNodes.map((item, idx) => {
                              let typeColor = "#64F991";
                              let typeLabel = "Reference";
                              if (item.type === "example") {
                                typeColor = "#00D9FF";
                                typeLabel = "Example";
                              } else if (item.type === "contradiction") {
                                typeColor = "#FFB800";
                                typeLabel = "Contradiction";
                              }

                              return (
                                <button
                                  key={idx}
                                  onClick={() => {
                                    handleNodeClick(
                                      item.node!.id,
                                      window.innerWidth / 2,
                                      window.innerHeight / 2
                                    );
                                    setSearchQuery("");
                                    setShowSearchResults(false);
                                  }}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#1A1A24] transition-colors text-left"
                                >
                                  <div
                                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: typeColor }}
                                  ></div>
                                  <span
                                    className="text-xs"
                                    style={{ color: typeColor }}
                                  >
                                    {typeLabel}:
                                  </span>
                                  <span className="text-xs text-gray-400 truncate">
                                    {item.node!.title}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {showSearchResults &&
                searchResults.length === 0 &&
                searchQuery && (
                  <div className="absolute top-full mt-2 w-full bg-[#12121A] border border-[#1A1A24] rounded-lg shadow-2xl p-4 z-50">
                    <p className="text-sm text-gray-500 text-center">
                      No results found
                    </p>
                  </div>
                )}
            </div>

            {editNodeId && (
              <button
                onClick={() =>
                  setSidebarPosition(
                    sidebarPosition === "left" ? "right" : "left"
                  )
                }
                className="flex items-center gap-2 px-4 py-2.5 bg-[#5D0E41] hover:bg-[#A0153E] text-white rounded-lg transition-all duration-200 text-sm font-medium shadow-md hover:shadow-lg"
                title={`Move sidebar to ${
                  sidebarPosition === "left" ? "right" : "left"
                }`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 5l7 7m0 0l-7 7m7-7H5"
                  />
                </svg>
                <span>
                  {sidebarPosition === "left" ? "Move Right" : "Move Left"}
                </span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-6">
            <span className="text-sm text-gray-500 font-light">
              {session?.user?.email}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-gray-500 hover:text-gray-400 font-light transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden flex">
        {sidebarPosition === "left" && (editNode || showCreatePopup) && (
          <div
            className={`${sidebarWidth} h-full bg-[#12121A] border-r border-[#1A1A24] shadow-2xl flex flex-col overflow-hidden`}
          >
            <div className="p-6 flex-shrink-0 border-b border-[#1A1A24]">
              {showCreatePopup ? (
                // CREATE MODE
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-white">
                      Create New Node
                    </h3>
                    <button
                      onClick={() => {
                        setShowCreatePopup(false);
                        setTitle("");
                        setContent("");
                      }}
                      className="text-gray-500 hover:text-gray-400 text-xl w-8 h-8 flex items-center justify-center hover:bg-[#1A1A24] rounded transition-all duration-200"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                        Title
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Node title"
                        className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1A1A24] rounded-md text-white text-base focus:border-[#5D0E41] focus:ring-1 focus:ring-[#5D0E41] focus:outline-none font-light transition-all duration-200"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                        Content
                      </label>
                      <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Optional content"
                        rows={6}
                        className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1A1A24] rounded-md text-white text-sm focus:border-[#5D0E41] focus:ring-1 focus:ring-[#5D0E41] focus:outline-none resize-none font-light leading-relaxed transition-all duration-200"
                      />
                    </div>

                    <button
                      onClick={() => {
                        if (title.trim()) {
                          createNode.mutate({ title, content });
                        }
                      }}
                      disabled={!title.trim()}
                      className="w-full bg-[#5D0E41] hover:bg-[#A0153E] text-white px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Create Node
                    </button>
                  </div>
                </>
              ) : (
                // EDIT MODE
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-medium text-white">
                        {isLinkMode ? "Link Mode" : "Edit Mode"}
                      </h3>
                      <button
                        onClick={() => {
                          setIsLinkMode(!isLinkMode);
                          setPendingLinkTarget(null);
                        }}
                        className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                          isLinkMode
                            ? "bg-[#A0153E] text-white hover:bg-[#FF204E]"
                            : "bg-[#5D0E41] text-white hover:bg-[#A0153E]"
                        }`}
                      >
                        {isLinkMode ? "Switch to Edit" : "Switch to Link"}
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setEditNodeId(null);
                        setIsLinkMode(false);
                        setPendingLinkTarget(null);
                      }}
                      className="text-gray-500 hover:text-gray-400 text-xl w-8 h-8 flex items-center justify-center hover:bg-[#1A1A24] rounded transition-all duration-200"
                    >
                      ✕
                    </button>
                  </div>

                  {!isLinkMode && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                          Title
                        </label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1A1A24] rounded-md text-white text-base focus:border-[#5D0E41] focus:ring-1 focus:ring-[#5D0E41] focus:outline-none font-light transition-all duration-200"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                          Content
                        </label>
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={6}
                          className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1A1A24] rounded-md text-white text-sm focus:border-[#5D0E41] focus:ring-1 focus:ring-[#5D0E41] focus:outline-none resize-none font-light leading-relaxed transition-all duration-200"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleUpdate}
                          className="flex-1 bg-[#5D0E41] hover:bg-[#A0153E] text-white px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-200"
                        >
                          Save Changes
                        </button>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                "Delete this node and all its connections?"
                              )
                            ) {
                              if (editNode) {
                                deleteNode.mutate({ id: editNode.id });
                              }
                            }
                          }}
                          className="bg-[#1A1A24] hover:bg-[#FF204E] text-gray-400 hover:text-white px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-200"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* SCROLLABLE CONNECTIONS AND LINK MODE SECTION - Only show in edit mode */}
            {editNode && !showCreatePopup && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {" "}
                {(editNode.edgesFrom.length > 0 ||
                  editNode.edgesTo.length > 0) && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">
                      Current Connections
                    </label>
                    <div className="space-y-2">
                      {editNode.edgesFrom.map((edge) => (
                        <div
                          key={edge.id}
                          className="flex items-center justify-between bg-[#0A0A0F] px-3 py-2.5 rounded-md hover:bg-[#12121A] transition-colors"
                        >
                          <span className="text-sm text-gray-300 font-light truncate">
                            <span className="text-[#A0153E]">→</span>{" "}
                            {getNodeTitle(edge.toNodeId)}
                          </span>
                          <button
                            onClick={() => deleteEdge.mutate({ id: edge.id })}
                            className="text-gray-600 hover:text-[#FF204E] text-lg w-6 h-6 flex items-center justify-center transition-colors hover:bg-[#1A1A24] rounded flex-shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      {editNode.edgesTo.map((edge) => (
                        <div
                          key={edge.id}
                          className="flex items-center justify-between bg-[#0A0A0F] px-3 py-2.5 rounded-md hover:bg-[#12121A] transition-colors"
                        >
                          <span className="text-sm text-gray-300 font-light truncate">
                            <span className="text-[#A0153E]">←</span>{" "}
                            {getNodeTitle(edge.fromNodeId)}
                          </span>
                          <button
                            onClick={() => deleteEdge.mutate({ id: edge.id })}
                            className="text-gray-600 hover:text-[#FF204E] text-lg w-6 h-6 flex items-center justify-center transition-colors hover:bg-[#1A1A24] rounded flex-shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {isLinkMode && (
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">
                      Create New Link
                    </label>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <button
                          onClick={() => setLinkTypeSelection("child")}
                          className={`w-full p-3 rounded-md border-2 transition-all text-left text-sm ${
                            linkTypeSelection === "child"
                              ? "border-[#FFD700] bg-[#1A1A24]"
                              : "border-[#1A1A24] bg-[#0A0A0F] hover:bg-[#12121A]"
                          }`}
                        >
                          <div className="font-medium text-white">→ Child</div>
                          <div className="text-xs text-gray-500">
                            Target node becomes child; Only one parent allowed
                            per node
                          </div>
                        </button>

                        <button
                          onClick={() => setLinkTypeSelection("parent")}
                          className={`w-full p-3 rounded-md border-2 transition-all text-left text-sm ${
                            linkTypeSelection === "parent"
                              ? "border-[#FFD700] bg-[#1A1A24]"
                              : "border-[#1A1A24] bg-[#0A0A0F] hover:bg-[#12121A]"
                          }`}
                        >
                          <div className="font-medium text-white">← Parent</div>
                          <div className="text-xs text-gray-500">
                            Target node becomes parent; Only one parent allowed
                            per node
                          </div>
                        </button>

                        <button
                          onClick={() => setLinkTypeSelection("reference")}
                          className={`w-full p-3 rounded-md border-2 transition-all text-left text-sm ${
                            linkTypeSelection === "reference"
                              ? "border-[#FFD700] bg-[#1A1A24]"
                              : "border-[#1A1A24] bg-[#0A0A0F] hover:bg-[#12121A]"
                          }`}
                        >
                          <div className="font-medium text-white">
                            ↔ Reference
                          </div>
                          <div className="text-xs text-gray-500">
                            Related concepts; One node must be isolated
                          </div>
                        </button>

                        <button
                          onClick={() => setLinkTypeSelection("example")}
                          className={`w-full p-3 rounded-md border-2 transition-all text-left text-sm ${
                            linkTypeSelection === "example"
                              ? "border-[#FFD700] bg-[#1A1A24]"
                              : "border-[#1A1A24] bg-[#0A0A0F] hover:bg-[#12121A]"
                          }`}
                        >
                          <div className="font-medium text-white">
                            + Example
                          </div>
                          <div className="text-xs text-gray-500">
                            Example of concept; One node must be isolated
                          </div>
                        </button>

                        <button
                          onClick={() => setLinkTypeSelection("contradiction")}
                          className={`w-full p-3 rounded-md border-2 transition-all text-left text-sm ${
                            linkTypeSelection === "contradiction"
                              ? "border-[#FFD700] bg-[#1A1A24]"
                              : "border-[#1A1A24] bg-[#0A0A0F] hover:bg-[#12121A]"
                          }`}
                        >
                          <div className="font-medium text-white">
                            ⚠ Contradiction
                          </div>
                          <div className="text-xs text-gray-500">
                            Contradicting ideas; One node must be isolated
                          </div>
                        </button>
                      </div>

                      {pendingLinkTarget && (
                        <div className="bg-[#0A0A0F] border border-[#FFD700] rounded-md p-4">
                          <p className="text-xs text-gray-400 mb-2">
                            Selected target:
                          </p>
                          <p className="text-white font-medium text-sm mb-3">
                            {getNodeTitle(pendingLinkTarget)}
                          </p>
                          <button
                            onClick={confirmLinkCreation}
                            className="w-full bg-[#A0153E] hover:bg-[#FF204E] text-white px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-200"
                          >
                            Create Link
                          </button>
                        </div>
                      )}

                      {!pendingLinkTarget && (
                        <div className="bg-[#0A0A0F] border border-[#1A1A24] rounded-md p-4">
                          <p className="text-xs text-gray-400 text-center">
                            Click a node on the graph to select link target
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div
          className={`flex-1 relative ${
            editNode && sidebarPosition === "right" ? "mr-0" : ""
          } ${editNode && sidebarPosition === "left" ? "ml-0" : ""}`}
        >
          <GraphView
            key={`graph-${showCreatePopup || editNode ? "sidebar" : "full"}`}
            nodes={nodes || []}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onEmptyDoubleClick={handleEmptyDoubleClick}
            isLinkMode={isLinkMode}
            linkFromNodeId={editNodeId}
            onLinkTargetClick={handleLinkTargetClick}
          />

          <div className="absolute bottom-6 left-6 z-30">
            {legendOpen ? (
              <div className="bg-[#12121A]/95 backdrop-blur-md border border-[#1A1A24] rounded-lg p-4 shadow-2xl w-58">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-white uppercase tracking-wider">
                    Legend
                  </h3>
                  <button
                    onClick={() => setLegendOpen(false)}
                    className="text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-2 font-medium">
                      Node Colors
                    </p>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#5D0E41]"></div>
                        <span className="text-xs text-gray-300 font-light">
                          0-2 connections
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#A0153E]"></div>
                        <span className="text-xs text-gray-300 font-light">
                          3-5 connections
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#FF204E]"></div>
                        <span className="text-xs text-gray-300 font-light">
                          6+ connections
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#1A1A24]">
                    <p className="text-xs text-gray-400 mb-2 font-medium">
                      Edge Types
                    </p>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-0.5 bg-[#FF6B9D]"></div>
                        <span className="text-xs text-gray-300 font-light">
                          Parent/Child
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-0.5 bg-[#64F991]"></div>
                        <span className="text-xs text-gray-300 font-light">
                          Reference
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-0.5 bg-[#00D9FF]"></div>
                        <span className="text-xs text-gray-300 font-light">
                          Example
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-0.5 bg-[#FFB800]"></div>
                        <span className="text-xs text-gray-300 font-light">
                          Contradiction
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#1A1A24]">
                    <p className="text-xs text-gray-400 mb-2 font-medium">
                      Controls
                    </p>
                    <div className="space-y-1">
                      <p className="text-xs text-gray-300 font-light">
                        • Double-click: Create node
                      </p>
                      <p className="text-xs text-gray-300 font-light">
                        • Click node: Edit
                      </p>
                      <p className="text-xs text-gray-300 font-light">
                        • Link mode: Select target
                      </p>
                      <p className="text-xs text-gray-300 font-light">
                        • Esc: Close / Cancel
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setLegendOpen(true)}
                className="w-12 h-12 bg-[#12121A]/95 backdrop-blur-md border border-[#1A1A24] rounded-full shadow-2xl flex items-center justify-center hover:bg-[#1A1A24] transition-colors group"
              >
                <svg
                  className="w-5 h-5 text-gray-400 group-hover:text-gray-300 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>
            )}
          </div>

          {hoverNode && hoverPreviewPos && (
            <div
              className="fixed bg-[#0A0A0F]/98 backdrop-blur-md border border-[#2A2A34] rounded-lg shadow-2xl p-5 w-[420px] pointer-events-none z-40"
              style={{
                left: `${hoverPreviewPos.left}px`,
                top: `${hoverPreviewPos.top}px`,
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-base font-medium text-white leading-tight pr-3">
                  {hoverNode.title}
                </h3>
                <div className="flex-shrink-0 px-2 py-0.5 bg-[#1A1A24] rounded text-xs text-gray-400 font-medium">
                  {hoverNode.edgesFrom.length + hoverNode.edgesTo.length}
                </div>
              </div>

              {hoverNode.content && (
                <div className="mt-3 text-sm space-y-1 line-clamp-5">
                  {renderMarkdown(hoverNode.content)}
                </div>
              )}

              {(hoverNode.edgesFrom.length > 0 ||
                hoverNode.edgesTo.length > 0) && (
                <div className="mt-4 pt-3 border-t border-[#1A1A24] flex gap-4 text-xs text-gray-500">
                  {hoverNode.edgesFrom.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-gray-600">→</span>
                      <span className="font-medium text-gray-400">
                        {hoverNode.edgesFrom.length}
                      </span>
                      <span>out</span>
                    </div>
                  )}
                  {hoverNode.edgesTo.length > 0 && (
                    <div className="flex items-center gap-1">
                      <span className="text-gray-600">←</span>
                      <span className="font-medium text-gray-400">
                        {hoverNode.edgesTo.length}
                      </span>
                      <span>in</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {editNode && sidebarPosition === "right" && (
          <div
            className={`${sidebarWidth} h-full bg-[#12121A] border-l border-[#1A1A24] shadow-2xl flex flex-col overflow-hidden`}
          >
            <div className="p-6 flex-shrink-0 border-b border-[#1A1A24]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-medium text-white">
                    {isLinkMode ? "Link Mode" : "Edit Mode"}
                  </h3>
                  <button
                    onClick={() => {
                      setIsLinkMode(!isLinkMode);
                      setPendingLinkTarget(null);
                    }}
                    className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                      isLinkMode
                        ? "bg-[#A0153E] text-white hover:bg-[#FF204E]"
                        : "bg-[#5D0E41] text-white hover:bg-[#A0153E]"
                    }`}
                  >
                    {isLinkMode ? "Switch to Edit" : "Switch to Link"}
                  </button>
                </div>
                <button
                  onClick={() => {
                    setEditNodeId(null);
                    setIsLinkMode(false);
                    setPendingLinkTarget(null);
                  }}
                  className="text-gray-500 hover:text-gray-400 text-xl w-8 h-8 flex items-center justify-center hover:bg-[#1A1A24] rounded transition-all duration-200"
                >
                  ✕
                </button>
              </div>

              {!isLinkMode && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                      Title
                    </label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1A1A24] rounded-md text-white text-base focus:border-[#5D0E41] focus:ring-1 focus:ring-[#5D0E41] focus:outline-none font-light transition-all duration-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                      Content
                    </label>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={6}
                      className="w-full px-4 py-3 bg-[#0A0A0F] border border-[#1A1A24] rounded-md text-white text-sm focus:border-[#5D0E41] focus:ring-1 focus:ring-[#5D0E41] focus:outline-none resize-none font-light leading-relaxed transition-all duration-200"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleUpdate}
                      className="flex-1 bg-[#5D0E41] hover:bg-[#A0153E] text-white px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-200"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => {
                        if (
                          confirm("Delete this node and all its connections?")
                        ) {
                          deleteNode.mutate({ id: editNode.id });
                        }
                      }}
                      className="bg-[#1A1A24] hover:bg-[#FF204E] text-gray-400 hover:text-white px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {" "}
              {(editNode.edgesFrom.length > 0 ||
                editNode.edgesTo.length > 0) && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">
                    Current Connections
                  </label>
                  <div className="space-y-2">
                    {editNode.edgesFrom.map((edge) => (
                      <div
                        key={edge.id}
                        className="flex items-center justify-between bg-[#0A0A0F] px-3 py-2.5 rounded-md hover:bg-[#12121A] transition-colors"
                      >
                        <span className="text-sm text-gray-300 font-light truncate">
                          <span className="text-[#A0153E]">→</span>{" "}
                          {getNodeTitle(edge.toNodeId)}
                        </span>
                        <button
                          onClick={() => deleteEdge.mutate({ id: edge.id })}
                          className="text-gray-600 hover:text-[#FF204E] text-lg w-6 h-6 flex items-center justify-center transition-colors hover:bg-[#1A1A24] rounded flex-shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {editNode.edgesTo.map((edge) => (
                      <div
                        key={edge.id}
                        className="flex items-center justify-between bg-[#0A0A0F] px-3 py-2.5 rounded-md hover:bg-[#12121A] transition-colors"
                      >
                        <span className="text-sm text-gray-300 font-light truncate">
                          <span className="text-[#A0153E]">←</span>{" "}
                          {getNodeTitle(edge.fromNodeId)}
                        </span>
                        <button
                          onClick={() => deleteEdge.mutate({ id: edge.id })}
                          className="text-gray-600 hover:text-[#FF204E] text-lg w-6 h-6 flex items-center justify-center transition-colors hover:bg-[#1A1A24] rounded flex-shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {isLinkMode && (
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">
                    Create New Link
                  </label>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <button
                        onClick={() => setLinkTypeSelection("child")}
                        className={`w-full p-3 rounded-md border-2 transition-all text-left text-sm ${
                          linkTypeSelection === "child"
                            ? "border-[#FFD700] bg-[#1A1A24]"
                            : "border-[#1A1A24] bg-[#0A0A0F] hover:bg-[#12121A]"
                        }`}
                      >
                        <div className="font-medium text-white">→ Child</div>
                        <div className="text-xs text-gray-500">
                          Target node becomes the child
                        </div>
                      </button>

                      <button
                        onClick={() => setLinkTypeSelection("parent")}
                        className={`w-full p-3 rounded-md border-2 transition-all text-left text-sm ${
                          linkTypeSelection === "parent"
                            ? "border-[#FFD700] bg-[#1A1A24]"
                            : "border-[#1A1A24] bg-[#0A0A0F] hover:bg-[#12121A]"
                        }`}
                      >
                        <div className="font-medium text-white">← Parent</div>
                        <div className="text-xs text-gray-500">
                          Target node becomes main
                        </div>
                      </button>

                      <button
                        onClick={() => setLinkTypeSelection("reference")}
                        className={`w-full p-3 rounded-md border-2 transition-all text-left text-sm ${
                          linkTypeSelection === "reference"
                            ? "border-[#FFD700] bg-[#1A1A24]"
                            : "border-[#1A1A24] bg-[#0A0A0F] hover:bg-[#12121A]"
                        }`}
                      >
                        <div className="font-medium text-white">
                          ↔ Reference
                        </div>
                        <div className="text-xs text-gray-500">
                          Related concepts
                        </div>
                      </button>

                      <button
                        onClick={() => setLinkTypeSelection("contradiction")}
                        className={`w-full p-3 rounded-md border-2 transition-all text-left text-sm ${
                          linkTypeSelection === "contradiction"
                            ? "border-[#FFD700] bg-[#1A1A24]"
                            : "border-[#1A1A24] bg-[#0A0A0F] hover:bg-[#12121A]"
                        }`}
                      >
                        <div className="font-medium text-white">
                          ⚠ Contradiction
                        </div>
                        <div className="text-xs text-gray-500">
                          Conflicting ideas
                        </div>
                      </button>
                    </div>

                    {pendingLinkTarget && (
                      <div className="bg-[#0A0A0F] border border-[#FFD700] rounded-md p-4">
                        <p className="text-xs text-gray-400 mb-2">
                          Selected target:
                        </p>
                        <p className="text-white font-medium text-sm mb-3">
                          {getNodeTitle(pendingLinkTarget)}
                        </p>
                        <button
                          onClick={confirmLinkCreation}
                          className="w-full bg-[#A0153E] hover:bg-[#FF204E] text-white px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-200"
                        >
                          Create Link
                        </button>
                      </div>
                    )}

                    {!pendingLinkTarget && (
                      <div className="bg-[#0A0A0F] border border-[#1A1A24] rounded-md p-4">
                        <p className="text-xs text-gray-400 text-center">
                          Click a node on the graph to select link target
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
