import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import prisma from "@/lib/prisma";

export const nodeRouter = router({
  // Get all nodes for current user
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return prisma.node.findMany({
      where: { userId: ctx.session.user.id },
      include: {
        edgesFrom: true,
        edgesTo: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  // Get single node by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const node = await prisma.node.findFirst({
        where: {
          id: input.id,
          userId: ctx.session.user.id,
        },
        include: {
          edgesFrom: {
            include: {
              toNode: true,
            },
          },
          edgesTo: {
            include: {
              fromNode: true,
            },
          },
        },
      });

      if (!node) {
        throw new Error("Node not found");
      }

      return node;
    }),

  // Create new node
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        content: z.string().default(""),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return prisma.node.create({
        data: {
          title: input.title,
          content: input.content,
          userId: ctx.session.user.id!,
        },
      });
    }),

  // Update node
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        content: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;

      // Verify ownership of the Node; NOTE: done in all operations related to nodes
      const node = await prisma.node.findFirst({
        where: { id, userId: ctx.session.user.id },
      });

      if (!node) {
        throw new Error("Node not found or unauthorized");
      }

      return prisma.node.update({
        where: { id },
        data,
      });
    }),

  // Delete node
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Verify ownership of the Node
      const node = await prisma.node.findFirst({
        where: { id: input.id, userId: ctx.session.user.id },
      });

      if (!node) {
        throw new Error("Node not found or unauthorized");
      }

      return prisma.node.delete({
        where: { id: input.id },
      });
    }),
});
