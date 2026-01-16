"use client";

import { trpc } from "@/lib/trpc";
import { useState } from "react";

export default function TestTRPC() {
  const [title, setTitle] = useState("");
  const utils = trpc.useUtils();

  const { data: nodes, isLoading } = trpc.node.getAll.useQuery();
  const createNode = trpc.node.create.useMutation({
    onSuccess: () => {
      utils.node.getAll.invalidate();
      setTitle("");
    },
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test tRPC</h1>

      <div className="mb-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Node title"
          className="border p-2 rounded mr-2"
        />
        <button
          onClick={() => createNode.mutate({ title })}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Create Node
        </button>
      </div>

      <div>
        <h2 className="font-bold mb-2">Your Nodes:</h2>
        {nodes?.map((node) => (
          <div key={node.id} className="border p-2 mb-2">
            {node.title}
          </div>
        ))}
      </div>
    </div>
  );
}
