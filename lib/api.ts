import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function routeError(error: unknown) {
  if (error instanceof Response) {
    return error;
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message || "Invalid request" }, { status: 400 });
  }

  console.error(error);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export function ok<T>(payload: T) {
  return NextResponse.json(payload);
}
