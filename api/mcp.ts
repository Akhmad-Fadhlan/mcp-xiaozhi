import { handleMcpRequest } from "../src/http-handler.js";

const handler = (request: Request): Promise<Response> => handleMcpRequest(request, { env: process.env });

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
