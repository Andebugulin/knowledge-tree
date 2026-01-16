import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import prisma from "@/lib/prisma";

export const edgeRouter = router({
  // Create edge between two nodes
  create: protectedProcedure
    .input(
      z.object({
        fromNodeId: z.string(),
        toNodeId: z.string(),
        type: z
          .enum(["reference", "parent", "example", "contradiction"])
          .default("reference"),
        weight: z.number().default(1.0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify both nodes belong to user; NOTE: done in all operations
      const fromNode = await prisma.node.findFirst({
        where: { id: input.fromNodeId, userId: ctx.session.user.id },
      });
      const toNode = await prisma.node.findFirst({
        where: { id: input.toNodeId, userId: ctx.session.user.id },
      });

      if (!fromNode || !toNode) {
        throw new Error("One or both nodes not found");
      }

      return prisma.edge.create({
        data: {
          fromNodeId: input.fromNodeId,
          toNodeId: input.toNodeId,
          type: input.type,
          weight: input.weight,
        },
      });
    }),

  // Delete edge
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Verify edge belongs to user's nodes
      const edge = await prisma.edge.findFirst({
        where: {
          id: input.id,
          fromNode: { userId: ctx.session.user.id },
        },
      });

      if (!edge) {
        throw new Error("Edge not found or unauthorized");
      }

      return prisma.edge.delete({
        where: { id: input.id },
      });
    }),
});
