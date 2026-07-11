import { NextResponse } from "next/server";
import { ZodError } from "zod";

export async function routeError(error: unknown) {
  if (error instanceof Response) {
    const message = (await error.text()).trim() || "Request failed";
    return NextResponse.json({ error: message }, { status: error.status || 500 });
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message || "Invalid request" }, { status: 400 });
  }

  if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
    return NextResponse.json({ error: "That record already exists" }, { status: 409 });
  }

  console.error(error);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export function ok<T>(payload: T) {
  return NextResponse.json(payload);
}
