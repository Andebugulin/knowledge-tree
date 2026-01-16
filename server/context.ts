import { auth } from "@/app/api/auth/[...nextauth]/route";

export async function createContext() {
  const session = await auth();
  return {
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
