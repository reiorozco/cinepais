import { NextResponse } from "next/server";
import type { ZodIssue } from "zod";

export const notFound = () =>
  NextResponse.json({ error: "not_found" }, { status: 404 });

export const validationError = (details: ZodIssue[]) =>
  NextResponse.json({ error: "validation_error", details }, { status: 400 });
