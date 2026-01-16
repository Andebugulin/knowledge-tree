import { router } from "../trpc";
import { nodeRouter } from "./node";
import { edgeRouter } from "./edge";

export const appRouter = router({
  node: nodeRouter,
  edge: edgeRouter,
});

export type AppRouter = typeof appRouter;
